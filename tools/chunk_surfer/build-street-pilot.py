"""Editable, isolated Borough Passage street pilot. Execute only in the compute gate.

Runtime authoring axes: X right, Y up, front -Z. Blender receives (x,-z,y).
Every exported mesh is a root object with applied identity transforms. The static
prop loader does not accumulate parent transforms and rejects GLTF extensions.

The .blend is the editable source scene, not a screenshot/beauty-render proxy.
No shared generated prop pack, other car, building or Outskirts asset is changed.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh


CAR = {
    "lengthM": 4.358,
    "bodyWidthM": 1.823,
    "heightM": 1.484,
    "wheelbaseM": 2.648,
    "frontAxleZ": -1.330,
    "rearAxleZ": 1.318,
    "trackM": 1.550,
    "tyreWidthM": .205,
    "nominalUnloadedTyreRadiusM": .31595,
    "rollingRadiusM": .306,
    "wheelRadiusStatus": "Loaded radius is a stated engineering assumption, pending image/contact review; not a published measured deflection.",
    "rimRadiusM": .2032,
    "archRadiusM": .367,
    "reference": "Anonymous five-door compact; Ford Focus dimensional reference, model identity intentionally not copied.",
}

# Initial cross-section only. Root owns the physical floor/crossing agreement.
# Mesh is local to physical (78,-7.5), extends X +/-15, Z +/-7.
GROUND = {
    "lengthM": 30.0,
    "halfWidthM": 7.0,
    "carriagewayHalfWidthM": 3.0,
    "roadEdgeY": .012,
    "roadCrownY": .012,
    "settsOuterM": 5.0,
    "settsY": .025,
    "pavementY": .120,
    "kerbTopY": .120,
    "kerbWidthM": .150,
    "crossingX": 0.0,
    "crossingWidthM": 2.8,
    "stopOffsetM": 4.55,
    "crossingDropHalfLengthM": 2.0,
    "pavementRampOuterM": 6.5,
}

SIGNAL = {
    "widthM": .425,
    "heightM": 1.125,
    "aspectDiameterM": .210,
    "aspectPitchM": .350,
    "depthM": .235,
    "frontAxis": "-Z",
    "origin": "bottom centre of signal head, not pole base",
    "headBottomY": 2.45,
    "status": "Three separate lens meshes; runtime alone decides state/emission. Export does not place a crossing.",
}

# Palette RGB entries are LINEAR diffuse reflectances. The albedo PNG stores
# their sRGB transfer after variation; ORM and tangent normals are linear data.
# One shared albedo/ORM atlas, factor 1 for roughness and metallic. The runtime
# squares factors on untextured materials; the embedded map keeps this pilot's
# authored values truthful without changing unrelated shader behavior.
PALETTE = {
    "body": ((.165, .205, .205), .38, .12),
    "bodyEdge": ((.215, .255, .250), .34, .15),
    "bodyLow": ((.110, .140, .135), .54, .07),
    "glass": ((.035, .050, .060), .18, .05),
    "glassEdge": ((.095, .125, .130), .21, .08),
    "rubber": ((.022, .025, .026), .94, .00),
    "rubberEdge": ((.045, .050, .052), .86, .00),
    "silver": ((.280, .300, .285), .36, .76),
    "darkMetal": ((.055, .065, .065), .63, .55),
    "plateWhite": ((.710, .710, .650), .61, .00),
    "plateYellow": ((.640, .495, .125), .59, .00),
    "lampClear": ((.600, .610, .535), .25, .05),
    "lampRed": ((.260, .055, .045), .29, .03),
    "asphalt": ((.070, .080, .083), .77, .00),
    "asphaltRepair": ((.045, .054, .056), .86, .00),
    "gutter": ((.065, .075, .076), .88, .00),
    "kerb": ((.220, .230, .220), .91, .00),
    "paving": ((.155, .165, .160), .95, .00),
    "pavingEdge": ((.175, .180, .170), .96, .00),
    "roadPaint": ((.590, .590, .535), .81, .00),
    "yellowPaint": ((.510, .405, .135), .83, .00),
    "iron": ((.080, .088, .086), .72, .53),
    "signalShell": ((.035, .041, .041), .72, .03),
    "signalEdge": ((.080, .085, .080), .67, .03),
    "signalLens": ((.060, .068, .065), .28, .00),
    "seat": ((.070, .075, .072), .98, .00),
    "signalBacking": ((.310, .330, .315), .81, .00),
    "tactile": ((.390, .280, .200), .95, .00),
}

ATLAS_SIDE = 512
ATLAS_COLS = 8
ATLAS_ROWS = 4
ATLAS_KEYS = list(PALETTE)
MATERIALS = {}


def args():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--blend", required=True)
    parser.add_argument("--report", required=True)
    parser.add_argument("--config", help="Optional JSON overrides for CAR, GROUND, SIGNAL; no arbitrary code.")
    return parser.parse_args(raw)


def lerp(a, b, t):
    return a + (b-a)*t


def interpolate(points, value):
    if value <= points[0][0]:
        return points[0][1]
    for (x0, a), (x1, b) in zip(points, points[1:]):
        if value <= x1:
            return lerp(a, b, (value-x0)/(x1-x0))
    return points[-1][1]


def atlas_uv(key, uv):
    tile = ATLAS_KEYS.index(key)
    col, row = tile % ATLAS_COLS, tile // ATLAS_COLS
    # Two-pixel interior padding prevents material bleed at minification.
    u, v = uv
    return ((col + .035 + .93*u)/ATLAS_COLS, (row + .035 + .93*v)/ATLAS_ROWS)


class Mesh:
    def __init__(self, name):
        self.name = name
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.smooth = []
        self.slots = []
        self.material_names = ["streetPilot.surface"]

    def face(self, points, role="body", smooth=False, material="streetPilot.surface", uvs=None):
        start = len(self.vertices)
        self.vertices.extend((x, -z, y) for x, y, z in points)
        self.faces.append(list(range(start, start+len(points))))
        if uvs is None:
            if len(points) == 4:
                uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
            else:
                uvs = [(.5+.45*math.cos(i*math.tau/len(points)), .5+.45*math.sin(i*math.tau/len(points))) for i in range(len(points))]
        self.uvs.append([atlas_uv(role, uv) for uv in uvs])
        self.smooth.append(smooth)
        if material not in self.material_names:
            self.material_names.append(material)
        self.slots.append(self.material_names.index(material))

    def box(self, centre, size, role="body", material="streetPilot.surface"):
        x, y, z = centre
        a, b, c = [v*.5 for v in size]
        p = [(x-a,y-b,z-c), (x+a,y-b,z-c), (x+a,y+b,z-c), (x-a,y+b,z-c),
             (x-a,y-b,z+c), (x+a,y-b,z+c), (x+a,y+b,z+c), (x-a,y+b,z+c)]
        for face in [(0,1,2,3),(5,4,7,6),(4,0,3,7),(1,5,6,2),(3,2,6,7),(4,5,1,0)]:
            self.face([p[i] for i in face], role, material=material)

    def beam(self, a, b, radius, role="darkMetal", sides=8):
        direction = [b[i]-a[i] for i in range(3)]
        length = math.sqrt(sum(v*v for v in direction))
        direction = [v/max(length,1e-9) for v in direction]
        seed = (0,1,0) if abs(direction[1]) < .95 else (1,0,0)
        u = (direction[1]*seed[2]-direction[2]*seed[1], direction[2]*seed[0]-direction[0]*seed[2], direction[0]*seed[1]-direction[1]*seed[0])
        ul = math.sqrt(sum(v*v for v in u)); u = [v/ul for v in u]
        v = [direction[1]*u[2]-direction[2]*u[1], direction[2]*u[0]-direction[0]*u[2], direction[0]*u[1]-direction[1]*u[0]]
        rings = [[tuple(c[k]+radius*(u[k]*math.cos(i*math.tau/sides)+v[k]*math.sin(i*math.tau/sides)) for k in range(3)) for i in range(sides)] for c in (a,b)]
        for i in range(sides):
            j=(i+1)%sides; self.face([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],role,True)
        self.face(list(reversed(rings[0])),role)
        self.face(rings[1],role)

    def finish(self, metadata=None):
        data = bpy.data.meshes.new(self.name)
        data.from_pydata(self.vertices, [], self.faces)
        data.update()
        for name in self.material_names:
            data.materials.append(MATERIALS[name])
        uv_layer = data.uv_layers.new(name="UVMap")
        for polygon, uvs, smooth, slot in zip(data.polygons, self.uvs, self.smooth, self.slots):
            polygon.use_smooth = smooth
            polygon.material_index = slot
            for loop, uv in zip(polygon.loop_indices, uvs):
                uv_layer.data[loop].uv = uv
        # Shared positions let smooth loft panels share normals. Per-loop UVs
        # remain separate at atlas boundaries; no global smooth/flat operator.
        bm=bmesh.new(); bm.from_mesh(data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-7)
        bm.to_mesh(data); bm.free(); data.update()
        obj = bpy.data.objects.new(self.name, data)
        bpy.context.scene.collection.objects.link(obj)
        if metadata:
            obj["streetPilot"] = json.dumps(metadata, sort_keys=True)
        return obj

    def translate(self, offset):
        x,y,z=offset
        self.vertices=[(a+x,b-z,c+y) for a,b,c in self.vertices]
        return self

    def merge(self, other):
        start=len(self.vertices)
        self.vertices.extend(other.vertices)
        self.faces.extend([[index+start for index in face] for face in other.faces])
        self.uvs.extend(other.uvs); self.smooth.extend(other.smooth)
        for slot in other.slots:
            name=other.material_names[slot]
            if name not in self.material_names: self.material_names.append(name)
            self.slots.append(self.material_names.index(name))
        return self


def encode_srgb(value):
    value=max(0.0,min(1.0,value))
    return 12.92*value if value<=.0031308 else 1.055*value**(1/2.4)-.055


def atlas_images():
    albedo = bpy.data.images.new("street-pilot-albedo", width=ATLAS_SIDE, height=ATLAS_SIDE, alpha=True)
    orm = bpy.data.images.new("street-pilot-orm", width=ATLAS_SIDE, height=ATLAS_SIDE, alpha=True)
    normal = bpy.data.images.new("street-pilot-normal", width=ATLAS_SIDE, height=ATLAS_SIDE, alpha=True)
    albedo.colorspace_settings.name = "sRGB"
    orm.colorspace_settings.name = "Non-Color"
    normal.colorspace_settings.name = "Non-Color"
    pixels = [0.0]*(ATLAS_SIDE*ATLAS_SIDE*4)
    packed = [0.0]*len(pixels)
    normals = [0.0]*len(pixels)
    for py in range(ATLAS_SIDE):
        row = min(ATLAS_ROWS-1, py*ATLAS_ROWS//ATLAS_SIDE)
        v = (py % (ATLAS_SIDE//ATLAS_ROWS))/(ATLAS_SIDE//ATLAS_ROWS-1)
        for px in range(ATLAS_SIDE):
            col = min(ATLAS_COLS-1, px*ATLAS_COLS//ATLAS_SIDE)
            key = ATLAS_KEYS[min(len(ATLAS_KEYS)-1,row*ATLAS_COLS+col)]
            rgb, rough, metal = PALETTE[key]
            u = (px % (ATLAS_SIDE//ATLAS_COLS))/(ATLAS_SIDE//ATLAS_COLS-1)
            # Low-contrast broad process variation; no glitter/aggregate noise.
            variation = .988 + .012*math.sin(u*math.tau+v*1.4)
            if key in ("bodyLow", "gutter", "paving", "asphalt"):
                variation *= .955+.045*v
            at=(py*ATLAS_SIDE+px)*4
            # Palette values describe linear diffuse reflectance. Generated
            # byte-image pixels are packed verbatim into the GLB's sRGB PNG;
            # encode here so SRGB8_ALPHA8 restores the intended reflectance.
            # ORM and tangent normals remain linear data and are not encoded.
            pixels[at:at+4]=[encode_srgb(c*variation) for c in rgb]+[1.0]
            packed[at:at+4]=[1.0,rough,metal,1.0]
            nx,ny,nz=0.0,0.0,1.0
            if key=="tactile" and .035<u<.965 and .035<v<.965:
                #400mm tile,6x6 circular25mm blisters,5mm spherical cap.
                # Correct physical size encoded as tangent normals; no painted
                # bright dots, no coarse stand-in bumps, no added runtime draw.
                tu=(u-.035)/.93;tv=(v-.035)/.93
                dx=(tu-(math.floor(tu*6)+.5)/6)*.4
                dy=(tv-(math.floor(tv*6)+.5)/6)*.4
                cap_radius=.0125;cap_height=.005
                sphere=(cap_radius**2+cap_height**2)/(2*cap_height)
                if dx*dx+dy*dy<=cap_radius**2:
                    nx=dx/sphere;ny=dy/sphere;nz=math.sqrt(max(0,1-nx*nx-ny*ny))
            normals[at:at+4]=[nx*.5+.5,ny*.5+.5,nz*.5+.5,1.0]
    albedo.pixels.foreach_set(pixels); orm.pixels.foreach_set(packed);normal.pixels.foreach_set(normals)
    albedo.pack(); orm.pack();normal.pack()
    return albedo, orm, normal


def make_material(name, albedo, orm, normal, emissive=None):
    material=bpy.data.materials.new(name); material.use_nodes=True
    nodes=material.node_tree.nodes; nodes.clear()
    output=nodes.new("ShaderNodeOutputMaterial")
    shader=nodes.new("ShaderNodeBsdfPrincipled")
    shader.inputs["Metallic"].default_value=1.0
    shader.inputs["Roughness"].default_value=1.0
    material.node_tree.links.new(shader.outputs["BSDF"],output.inputs["Surface"])
    a=nodes.new("ShaderNodeTexImage"); a.image=albedo; a.interpolation="Linear"
    o=nodes.new("ShaderNodeTexImage"); o.image=orm; o.interpolation="Linear"
    separate=nodes.new("ShaderNodeSeparateColor")
    material.node_tree.links.new(a.outputs["Color"],shader.inputs["Base Color"])
    material.node_tree.links.new(o.outputs["Color"],separate.inputs["Color"])
    material.node_tree.links.new(separate.outputs["Green"],shader.inputs["Roughness"])
    material.node_tree.links.new(separate.outputs["Blue"],shader.inputs["Metallic"])
    n=nodes.new("ShaderNodeTexImage");n.image=normal;n.interpolation="Linear"
    nmap=nodes.new("ShaderNodeNormalMap");nmap.inputs["Strength"].default_value=1.0
    material.node_tree.links.new(n.outputs["Color"],nmap.inputs["Color"])
    material.node_tree.links.new(nmap.outputs["Normal"],shader.inputs["Normal"])
    if emissive:
        shader.inputs["Emission Color"].default_value=(*emissive,1)
        shader.inputs["Emission Strength"].default_value=1.0
    material["streetPilotMaterial"]="UV-mapped project-authored atlas; ORM scalar factors1"
    return material


def body_half_width(z):
    return interpolate([(-2.179,.690),(-2.080,.815),(-1.82,.875),(-1.35,.900),(-.80,.9115),(.75,.9115),(1.42,.899),(1.91,.857),(2.179,.735)],z)


def belt_height(z):
    return interpolate([(-2.179,.620),(-1.98,.735),(-1.35,.840),(-.95,.925),(.65,.970),(1.38,.985),(1.90,.935),(2.179,.790)],z)


def roof_profile(z):
    return interpolate([(-2.179,.660),(-1.98,.800),(-1.50,.850),(-1.03,.925),(-.91,1.025),(-.67,1.340),(-.45,1.435),(-.12,1.475),(.30,1.484),(.76,1.464),(1.02,1.405),(1.34,1.235),(1.73,1.040),(2.00,.965),(2.179,.815)],z)


def roof_half_width(z):
    return interpolate([(-2.179,.56),(-1.98,.72),(-1.03,.77),(-.67,.678),(-.25,.675),(.65,.680),(1.02,.675),(1.40,.710),(1.80,.765),(2.179,.615)],z)


def surface_ring(z):
    w=body_half_width(z); belt=belt_height(z); top=roof_profile(z); rw=roof_half_width(z)
    shoulder=max(belt,top-.105)
    return [(-w*.984,belt,z),(-rw,shoulder,z),(-rw*.86,top-.026,z),(-rw*.48,top-.005,z),
            (0,top,z),(rw*.48,top-.005,z),(rw*.86,top-.026,z),(rw,shoulder,z),(w*.984,belt,z)]


def station_list():
    values={-2.179+i*4.358/56 for i in range(57)}
    values.update([-1.03,-.91,-.82,-.67,-.51,-.48,-.12,.025,.100,.76,.98,1.055,1.34,1.51,1.73])
    for axle in (CAR["frontAxleZ"],CAR["rearAxleZ"]):
        for i in range(33):
            values.add(axle-CAR["archRadiusM"]*math.cos(i*math.pi/32))
    return sorted(values)


def arch_bottom(z):
    for axle in (CAR["frontAxleZ"],CAR["rearAxleZ"]):
        d=z-axle
        if abs(d)<CAR["archRadiusM"]+1e-8:
            return CAR["rollingRadiusM"]+math.sqrt(max(0,CAR["archRadiusM"]**2-d*d))
    return .225


def arch_role(z, strip):
    if strip in (0,7):
        if (-.82<z<.025) or (.100<z<.98) or (1.055<z<1.51):
            return "glass"
        return "bodyEdge"
    if (-.91<z<-.51) or (1.055<z<1.51):
        return "glass"
    return "body"


def add_arch(m, side, axle):
    radius=CAR["archRadiusM"]
    profiles=[(.000,-.004),(.013,.003),(.021,.016),(.019,.032),(.009,.041)]
    for i in range(48):
        a=i*math.pi/48; b=(i+1)*math.pi/48
        for p,q in zip(profiles,profiles[1:]):
            points=[]
            for angle,(out,radial) in [(a,p),(b,p),(b,q),(a,q)]:
                z=axle-(radius+radial)*math.cos(angle)
                y=CAR["rollingRadiusM"]+(radius+radial)*math.sin(angle)
                points.append((side*(body_half_width(z)+out),y,z))
            if side<0: points.reverse()
            m.face(points,"bodyEdge",True)
        a0=(side*body_half_width(axle-radius*math.cos(a)),CAR["rollingRadiusM"]+radius*math.sin(a),axle-radius*math.cos(a))
        b0=(side*body_half_width(axle-radius*math.cos(b)),CAR["rollingRadiusM"]+radius*math.sin(b),axle-radius*math.cos(b))
        m.face([a0,b0,(side*.665,b0[1],b0[2]),(side*.665,a0[1],a0[2])],"rubber",True)


def front_lamp(m, side):
    # Angular swept lamp, lens recessed inside a continuous perimeter rather
    # than another bright rectangular block. No subpixel reflector lattice.
    outer=[(side*.34,.715,-2.149),(side*.715,.730,-2.086),(side*.815,.840,-1.965),(side*.435,.815,-2.111)]
    inner=[]
    centre=[sum(p[k] for p in outer)/4 for k in range(3)]
    for p in outer:
        inner.append(tuple(lerp(centre[k],p[k],.88)+(0 if k!=2 else -.002) for k in range(3)))
    for i in range(4):
        j=(i+1)%4; m.face([outer[i],outer[j],inner[j],inner[i]],"darkMetal")
    m.face(inner,"lampClear",material="streetPilot.frontLamp")
    # Real lens cut and two large reflector facets remain readable in dither.
    p0,p1,p2,p3=inner
    for t in (.36,.72):
        a=tuple(lerp(p0[k],p1[k],t) for k in range(3))
        b=tuple(lerp(p3[k],p2[k],t) for k in range(3))
        m.beam(a,b,.008,"glassEdge",6)


def rear_lamp(m, side):
    p=[(side*.49,.820,2.150),(side*.79,.805,2.082),(side*.84,1.020,1.992),(side*.59,1.070,2.055)]
    m.face(p,"lampRed",material="streetPilot.rearLamp")
    m.beam(p[0],p[1],.012,"darkMetal",6)
    m.face([p[0],p[1],tuple(lerp(p[1][k],p[2][k],.25) for k in range(3)),tuple(lerp(p[0][k],p[3][k],.25) for k in range(3))],"lampClear")


def build_car():
    m=Mesh("street_pilot_car_body")
    stations=station_list()
    for z0,z1 in zip(stations,stations[1:]):
        r0,r1=surface_ring(z0),surface_ring(z1)
        for i in range(8):
            role=arch_role((z0+z1)*.5,i)
            m.face([r0[i],r1[i],r1[i+1],r0[i+1]],role,True)
        for side in (-1,1):
            ys0=[arch_bottom(z0),max(arch_bottom(z0),.39),belt_height(z0)-.11,belt_height(z0)]
            ys1=[arch_bottom(z1),max(arch_bottom(z1),.39),belt_height(z1)-.11,belt_height(z1)]
            for i in range(3):
                if ys0[i]>=ys0[i+1] and ys1[i]>=ys1[i+1]: continue
                points=[]
                for z,y,index in [(z0,ys0[i],i),(z1,ys1[i],i),(z1,ys1[i+1],i+1),(z0,ys0[i+1],i+1)]:
                    w=body_half_width(z)
                    x=side*w*(.984 if index==3 else interpolate([(.225,.92),(.39,.97),(.80,1.0),(.99,.984)],y))
                    points.append((x,y,z))
                if side>0: points.reverse()
                m.face(points,"bodyLow" if i==0 else "body",True)
    # Tapered nose/tail with genuine bumper mass and an inset grille/plates.
    for z in (-2.179,2.179):
        w=body_half_width(z)
        m.face([(-w*.92,.225,z),(w*.92,.225,z),(w*.984,belt_height(z),z),(-w*.984,belt_height(z),z)],"bodyLow")
        ring=surface_ring(z)
        m.face(list(reversed(ring)) if z<0 else ring,"body")
    m.box((0,.255,0),(1.32,.095,3.59),"rubber")
    for side in (-1,1):
        for axle in (CAR["frontAxleZ"],CAR["rearAxleZ"]): add_arch(m,side,axle)
        # Panel seams and handles have subordinate value and finite thickness.
        for z0,z1 in [(-.79,.025),(.10,1.08)]:
            m.beam((side*.916,.936,z0),(side*.916,.958,z1),.007,"rubber",6)
        for z in (.065,1.075):
            m.beam((side*.914,.48,z),(side*.915,.965,z),.006,"rubber",6)
        for z in (-.12,.92):
            m.box((side*.923,.888,z),(.025,.035,.16),"bodyEdge")
            m.box((side*.927,.875,z-.012),(.012,.008,.10),"rubber")
        # Mirrors have a stalk, tapering shell and physically recessed face.
        m.beam((side*.855,1.035,-.80),(side*.935,1.055,-.77),.025,"darkMetal",8)
        centre=(side*.941,1.080,-.755)
        m.box(centre,(.120,.105,.225),"body")
        m.box((side*1.003,1.080,-.748),(.004,.078,.157),"glassEdge")
        front_lamp(m,side); rear_lamp(m,side)
    # Front/rear number plates: British white front and yellow rear. No random
    # illegible pseudo-text; registration identity belongs to the final dossier.
    m.box((0,.484,-2.183),(.520,.111,.018),"darkMetal")
    m.box((0,.484,-2.194),(.500,.101,.004),"plateWhite")
    m.box((0,.609,2.182),(.520,.111,.018),"darkMetal")
    m.box((0,.609,2.193),(.500,.101,.004),"plateYellow")
    m.box((0,.348,-2.184),(1.10,.145,.020),"rubber")
    for y in (.300,.347,.394): m.box((0,y,-2.197),(1.04,.012,.012),"darkMetal")
    # Wipers and cowl: measured process details rather than bright decoration.
    m.beam((-.57,.978,-.948),(-.15,1.025,-.910),.009,"rubber",6)
    m.beam((.06,.978,-.948),(.49,1.025,-.910),.009,"rubber",6)
    m.box((0,.822,2.166),(.46,.025,.015),"darkMetal")
    obj=m.finish(CAR)
    return obj


def build_wheel():
    # Axle lies along local X; origin is hub centre. A round loaded rolling
    # radius avoids rotating a baked flat contact patch around the axle.
    m=Mesh("street_pilot_car_wheel")
    radius=CAR["rollingRadiusM"]
    profile=[(-.1025,.217),(-.100,.266),(-.086,radius*.985),(-.065,radius),(.065,radius),(.086,radius*.985),(.100,.266),(.1025,.217)]
    steps=16
    for (x0,r0),(x1,r1) in zip(profile,profile[1:]):
        for i in range(steps):
            a=i*math.tau/steps; b=(i+1)*math.tau/steps
            m.face([(x0,r0*math.sin(a),r0*math.cos(a)),(x0,r0*math.sin(b),r0*math.cos(b)),(x1,r1*math.sin(b),r1*math.cos(b)),(x1,r1*math.sin(a),r1*math.cos(a))],"rubberEdge" if abs(x0)>.085 else "rubber",True)
    for side in (-1,1):
        x=side*.104
        for r0,r1,role in [(0,.065,"darkMetal"),(.065,.174,"silver"),(.174,.2032,"darkMetal"),(.2032,.217,"silver")]:
            for i in range(steps):
                a=i*math.tau/steps; b=(i+1)*math.tau/steps
                points=[(x,r0*math.sin(a),r0*math.cos(a)),(x,r0*math.sin(b),r0*math.cos(b)),(x,r1*math.sin(b),r1*math.cos(b)),(x,r1*math.sin(a),r1*math.cos(a))]
                if side<0: points.reverse()
                if r0==0:
                    points=[points[0],points[2],points[3]]
                m.face(points,role,True)
        # Five broad recessed slots, visible while turning but not a flashing
        # spoke lattice. Each is within the wheel's physical face.
        for i in range(5):
            a=i*math.tau/5; da=.24
            m.face([(x+side*.001,r*math.sin(t),r*math.cos(t)) for r,t in [(.092,a-da),(.092,a+da),(.163,a+da*.65),(.163,a-da*.65)]],"rubber")
    return m.finish({"pivot":"hub centre, axle local X", "rollingRadiusM":radius,"widthM":CAR["tyreWidthM"],"runtime":"Four matrices; rotation angle = travelled distance / rolling radius."})


def ground_height(z):
    return GROUND["roadEdgeY"]


def smoothstep(a,b,x):
    t=max(0,min(1,(x-a)/(b-a)))
    return t*t*(3-2*t)


def pavement_height(x,z):
    # Shared exact contract: centre physical(78,-7.5), road|z|<=3, setts3..5,
    # pavement5..7. Only the crossing's inner kerb is dropped. Root samples
    # this function into floorplan cells; outer pavement remains unchanged.
    drop_x=1-smoothstep(GROUND["crossingWidthM"]*.5,GROUND["crossingDropHalfLengthM"],abs(x-GROUND["crossingX"]))
    drop_z=1-smoothstep(GROUND["settsOuterM"],GROUND["pavementRampOuterM"],abs(z))
    return GROUND["pavementY"]-(GROUND["pavementY"]-GROUND["settsY"])*drop_x*drop_z


def build_ground():
    m=Mesh("street_pilot_ground")
    half=GROUND["carriagewayHalfWidthM"]; xhalf=GROUND["lengthM"]*.5
    for z0,z1 in [(-half,0),(0,half)]:
        m.face([(-xhalf,ground_height(z0),z0),(-xhalf,ground_height(z1),z1),(xhalf,ground_height(z1),z1),(xhalf,ground_height(z0),z0)],"asphalt")
    return m.finish({"physicalAnchor":[78,-7.5],"surface":"road only, profile independent of comparison categories",**GROUND})


def build_pavement():
    m=Mesh("street_pilot_pavement")
    half=GROUND["settsOuterM"]; outer=GROUND["halfWidthM"]; xhalf=GROUND["lengthM"]*.5
    x_knots=[-xhalf,-2.0,-1.7,-1.4,0,1.4,1.7,2.0,xhalf]
    for side in (-1,1):
        z_knots=[side*value for value in [half,5.375,5.75,6.125,6.5,outer]]
        for x0,x1 in zip(x_knots,x_knots[1:]):
            for z0,z1 in zip(z_knots,z_knots[1:]):
                points=[(x0,pavement_height(x0,z0),z0),(x0,pavement_height(x0,z1),z1),(x1,pavement_height(x1,z1),z1),(x1,pavement_height(x1,z0),z0)]
                if side<0: points.reverse()
                m.face(points,"paving",True)
    return m.finish({"physicalAnchor":[78,-7.5],"heightFunction":".12-.095*(1-smoothstep(1.4,2,abs(x)))*(1-smoothstep(5,6.5,abs(z)))","crossingRamp":"continuous physical geometry, root floorplan samples match"})


def build_kerbs():
    m=Mesh("street_pilot_kerbs")
    half=GROUND["settsOuterM"]; xhalf=GROUND["lengthM"]*.5
    x_knots=[-xhalf,-2.0,-1.7,-1.4,0,1.4,1.7,2.0,xhalf]
    for side in (-1,1):
        z=side*half
        for x0,x1 in zip(x_knots,x_knots[1:]):
            y0=pavement_height(x0,z); y1=pavement_height(x1,z)
            # Four finite faces create the bevel. Top follows the same actual
            # drop, while its foot remains at the sett surface, never below0.
            m.face([(x0,GROUND["settsY"],z-side*.020),(x1,GROUND["settsY"],z-side*.020),(x1,max(GROUND["settsY"],y1-.012),z-side*.020),(x0,max(GROUND["settsY"],y0-.012),z-side*.020)],"kerb")
            m.face([(x0,max(GROUND["settsY"],y0-.012),z-side*.020),(x1,max(GROUND["settsY"],y1-.012),z-side*.020),(x1,y1,z+side*.070),(x0,y0,z+side*.070)],"kerb")
    return m.finish({"physicalAnchor":[78,-7.5],"kerbAtLocalAbsZ":half,"noInvisibleCollisionLedge":True})


def build_setts():
    m=Mesh("street_pilot_setts")
    xhalf=GROUND["lengthM"]*.5
    for side in (-1,1):
        z0=side*GROUND["carriagewayHalfWidthM"]; z1=side*GROUND["settsOuterM"]
        points=[(-xhalf,GROUND["settsY"],z0),(-xhalf,GROUND["settsY"],z1),(xhalf,GROUND["settsY"],z1),(xhalf,GROUND["settsY"],z0)]
        if side<0: points.reverse()
        m.face(points,"pavingEdge")
        # Sparse large joints only. No fine regular bright lattice at distance.
        for i in range(15):
            x=-14+i*2
            m.box((x,GROUND["settsY"]+.0015,(z0+z1)*.5),(.022,.003,abs(z1-z0)),"gutter")
    return m.finish({"physicalAnchor":[78,-7.5],"surface":"full parking/sett strips3..5m","topY":GROUND["settsY"],"maxDetailY":GROUND["settsY"]+.003})


def build_markings():
    m=Mesh("street_pilot_markings")
    # Controlled crossing studs, not a zebra. These are engineering draft
    # geometry until the original working drawing is visually checked.
    half=GROUND["settsOuterM"]
    for x in (-GROUND["crossingWidthM"]*.5,GROUND["crossingWidthM"]*.5):
        for i in range(21):
            z=-half+i*.5
            y=GROUND["roadEdgeY"]+.006 if abs(z)<3 else GROUND["settsY"]+.006
            m.box((x,y,z),(.100,.008,.100),"roadPaint")
    # A stop line extends to the kerb edge, not only across the moving lane.
    # 3m clear edge-to-edge separation to the crossing studs (TSM6 18.1.5).
    offset=GROUND["stopOffsetM"]
    for side in (-1,1):
        x=side*offset
        for z0,z1,y in [(0,3,.018),(3,half,.031)]:
            lo,hi=sorted((side*z0,side*z1))
            m.face([(x-.10,y,lo),(x-.10,y,hi),(x+.10,y,hi),(x+.10,y,lo)],"roadPaint")
    # True 2m-long,100mm-wide marks within 500mm guide lines;150mm clear
    # longitudinal gaps and600x200mm terminal bars. TSM6 15.8/Figure15-3.
    length,width,band,gap=2.0,.10,.50,.15
    angle=math.asin(band/math.hypot(length,width))-math.atan2(width,length)
    along=length*math.cos(angle)+width*math.sin(angle)
    for approach in (-1,1):
        for centre in (-4.5,0,4.5):
            inner=offset+.10+gap
            for i in range(8):
                cx=approach*(inner+i*(along+gap)+along*.5)
                theta=angle*(1 if i%2 else -1)
                ux=approach*math.cos(theta);uz=math.sin(theta)
                vx=-uz;vz=ux
                points=[(cx+u*ux*length*.5+v*vx*width*.5,.031 if abs(centre)>3 else .018,centre+u*uz*length*.5+v*vz*width*.5) for u,v in [(-1,-1),(1,-1),(1,1),(-1,1)]]
                m.face(list(reversed(points)),"roadPaint")
            terminal=approach*(inner+8*along+8*gap+.10)
            m.face([(terminal-.10,.031 if abs(centre)>3 else .018,centre-.30),(terminal-.10,.031 if abs(centre)>3 else .018,centre+.30),(terminal+.10,.031 if abs(centre)>3 else .018,centre+.30),(terminal+.10,.031 if abs(centre)>3 else .018,centre-.30)],"roadPaint")
    return m.finish({"physicalAnchor":[78,-7.5],"studRowCrossingWidthM":GROUND["crossingWidthM"],"studSizeM":.10,"studPitchM":.50,"traversalWidthM":half*2,"stopLinesLocalX":[-offset,offset],"stopLineFullHalfCarriagewayM":half,"stopToStudClearEdgeM":3.0,"zigzags":{"marksPerApproach":8,"markLengthM":length,"longitudinalExtentM":along,"gapM":gap,"strokeM":width,"bandM":band,"terminalSizeM":[.20,.60],"outerKerbGapM":.25},"status":"DfT visual dimensions source-tested; real highway approval and native perception not certified"})


def build_repairs():
    m=Mesh("street_pilot_repairs")
    # Utility work follows coherent cuts, with broad irregular sealant edges;
    # it does not decorate the street with arbitrary grunge or emissive flecks.
    for x,z,length,width in [(-9.0,-1.5,4.4,.8),(8.7,1.2,3.6,1.1)]:
        y=GROUND["roadEdgeY"]+.001
        m.face([(x-length*.5,y,z-width*.5),(x-length*.46,y,z+width*.5),(x+length*.5,y,z+width*.44),(x+length*.48,y,z-width*.46)],"asphaltRepair")
    return m.finish({"physicalAnchor":[78,-7.5],"materialHistory":"Two finite utility repairs, no procedural scatter"})


def build_tactile():
    m=Mesh("street_pilot_tactile")
    for side in (-1,1):
        for row in range(2):
            z0=side*(5+row*.4);z1=side*(5+(row+1)*.4)
            for col in range(7):
                x0=-1.4+col*.4;x1=x0+.4
                points=[(x0,pavement_height(x0,z0)+.002,z0),(x0,pavement_height(x0,z1)+.002,z1),(x1,pavement_height(x1,z1)+.002,z1),(x1,pavement_height(x1,z0)+.002,z0)]
                # Preserve tile-local UVs when reversing negative-side winding.
                uvs=[(0,0),(0,1),(1,1),(1,0)]
                if side<0:points.reverse();uvs.reverse()
                m.face(points,"tactile",uvs=uvs)
    # L-shaped tail locates the controlled crossing from the back of footway.
    # Its near edge is800mm deep; the stem is1200mm wide on the right.
    for side in (-1,1):
        for row in range(3):
            z0=side*(5.8+row*.4);z1=side*(6.2+row*.4)
            for col in range(3):
                x0=(-1.4 if side<0 else .2)+col*.4;x1=x0+.4
                points=[(x0,pavement_height(x0,z0)+.002,z0),(x0,pavement_height(x0,z1)+.002,z1),(x1,pavement_height(x1,z1)+.002,z1),(x1,pavement_height(x1,z0)+.002,z0)]
                uvs=[(0,0),(0,1),(1,1),(1,0)]
                if side<0:points.reverse();uvs.reverse()
                m.face(points,"tactile",uvs=uvs)
    return m.finish({"physicalAnchor":[78,-7.5],"controlledCrossing":"muted red blister paving, two400mm-deep rows per side across2.8m width","tileM":.4,"blistersPerTile":[6,6],"blisterDiameterM":.025,"blisterCapHeightM":.005,"treatment":"Tangent-space normal map at physical dimensions; no displaced silhouette or tactile physics claim","tileCount":46,"addedTriangles":92,"guidanceStemWidthM":1.2,"guidanceStemToBackOfFootway":True})


def merged_surface(objects):
    # Keep editable/category meshes for inspection, but default runtime uses
    # one mesh/material draw for all seven related street-surface categories.
    m=Mesh("street_pilot_surface")
    for obj in objects:
        data=obj.data;start=len(m.vertices)
        m.vertices.extend(tuple(v.co) for v in data.vertices)
        for polygon in data.polygons:
            m.faces.append([start+i for i in polygon.vertices])
            m.uvs.append([tuple(data.uv_layers.active.data[index].uv) for index in polygon.loop_indices])
            m.smooth.append(polygon.use_smooth)
            name=data.materials[polygon.material_index].name
            if name not in m.material_names:m.material_names.append(name)
            m.slots.append(m.material_names.index(name))
    return m.finish({"physicalAnchor":[78,-7.5],"runtime":"Default single surface draw; category meshes retained for isolated controls","categories":[obj.name for obj in objects]})


def build_signal_shell(name="street_pilot_signal_housing",with_pole=True):
    m=Mesh(name)
    h=SIGNAL["heightM"]; w=SIGNAL["widthM"]
    m.box((0,h*.5,.018),(w,h,.042),"signalBacking")
    m.box((0,h*.5,-.052),(.315,h-.058,.190),"signalShell")
    # Three finite hoods, open below; they shadow the lens rather than making a
    # black square with a glowing circle painted over it.
    centres=[h*.5+SIGNAL["aspectPitchM"],h*.5,h*.5-SIGNAL["aspectPitchM"]]
    r=SIGNAL["aspectDiameterM"]*.5
    for y in centres:
        # Raised broad circular rim independently surrounds the210mm optic.
        # Measured overall sheet proportions, finite readable depth; the hood
        # follows the outside of this rim rather than a bare glowing disc.
        profiles=[(.107,-.158),(.116,-.180),(.144,-.150),(.151,-.126)]
        for (ra,za),(rb,zb) in zip(profiles,profiles[1:]):
            for i in range(32):
                a=i*math.tau/32;b=(i+1)*math.tau/32
                m.face([(ra*math.cos(a),y+ra*math.sin(a),za),(ra*math.cos(b),y+ra*math.sin(b),za),(rb*math.cos(b),y+rb*math.sin(b),zb),(rb*math.cos(a),y+rb*math.sin(a),zb)],"signalEdge",True)
        for i in range(32):
            a=i*math.tau/32; b=(i+1)*math.tau/32
            m.face([(0,y,-.155),(r*math.cos(b),y+r*math.sin(b),-.145),(r*math.cos(a),y+r*math.sin(a),-.145)],"signalLens",True)
        for i in range(18):
            a=-.10+i*(math.pi+.20)/18; b=-.10+(i+1)*(math.pi+.20)/18
            hood=.151
            points=[(hood*math.cos(a),y+hood*math.sin(a),-.142),(hood*math.cos(b),y+hood*math.sin(b),-.142),(hood*1.02*math.cos(b),y+hood*1.02*math.sin(b),-.335),(hood*1.02*math.cos(a),y+hood*1.02*math.sin(a),-.335)]
            m.face(points,"signalShell",True)
            m.face(list(reversed(points)),"signalEdge",True)
    m.translate((0,SIGNAL["headBottomY"],0))
    if with_pole:
        m.merge(signal_pole_mesh("street_pilot_signal_pole_source"))
    return m.finish({**SIGNAL,"origin":"same pole ground datum for primary and secondary head","includesPole":with_pole,"lensCentresY":[value+SIGNAL["headBottomY"] for value in centres]})


def build_signal_lens(name,index):
    m=Mesh(name)
    y=SIGNAL["heightM"]*.5+(1-index)*SIGNAL["aspectPitchM"]+SIGNAL["headBottomY"]
    r=SIGNAL["aspectDiameterM"]*.5
    for i in range(32):
        a=i*math.tau/32; b=(i+1)*math.tau/32
        m.face([(0,y,-.165),(r*math.cos(b),y+r*math.sin(b),-.155),(r*math.cos(a),y+r*math.sin(a),-.155)],"lampClear",True)
    return m.finish({"aspect":["red","amber","green"][index],"runtimeEmissionOnly":True,"origin":"same as shell"})


def signal_pole_mesh(name,pedestrian=False):
    m=Mesh(name)
    m.beam((0,0,.08),(0,3.14 if pedestrian else 3.48,.08),.057,"darkMetal",16)
    m.beam((0,.02,.08),(0,.32,.08),.076,"signalShell",16)
    for y in ((2.54,3.13) if pedestrian else (2.68,3.30)): m.box((0,y,-.015),(.19,.05,.21),"darkMetal")
    return m


def build_ped_housing():
    m=signal_pole_mesh("street_pilot_ped_housing",pedestrian=True)
    top=SIGNAL["headBottomY"]+SIGNAL["heightM"]*.5
    low=top-SIGNAL["aspectPitchM"]
    m.box((0,(top+low)*.5,-.052),(.315,.720,.190),"signalShell")
    r=SIGNAL["aspectDiameterM"]*.5
    for y in (top,low):
        for i in range(32):
            a=i*math.tau/32; b=(i+1)*math.tau/32
            m.face([(0,y,-.155),(r*math.cos(b),y+r*math.sin(b),-.145),(r*math.cos(a),y+r*math.sin(a),-.145)],"signalLens",True)
        for i in range(18):
            a=-.10+i*(math.pi+.20)/18; b=-.10+(i+1)*(math.pi+.20)/18
            m.face([(r*math.cos(a),y+r*math.sin(a),-.150),(r*math.cos(b),y+r*math.sin(b),-.150),(r*math.cos(b),y+r*math.sin(b),-.290),(r*math.cos(a),y+r*math.sin(a),-.290)],"signalShell",True)
    return m.finish({"origin":"pole ground datum","type":"far-side two-aspect no pushbutton implied","redCentreY":top,"greenCentreY":low})


def build_ped_button():
    m=Mesh("street_pilot_ped_button")
    m.beam((0,0,.06),(0,1.38,.06),.057,"darkMetal",12)
    m.box((0,1.17,-.035),(.20,.37,.17),"signalShell")
    m.box((0,1.17,-.126),(.174,.342,.014),"roadPaint")
    # Button centre is1.05m from local footway; the cone is under the unit.
    m.beam((0,1.05,-.14),(0,1.05,-.157),.027,"signalEdge",24)
    m.beam((0,.966,-.055),(0,.946,-.055),.013,"signalEdge",12)
    m.box((0,1.27,-.139),(.144,.046,.008),"signalShell")
    def label(copy,y,size,role):
        curve=bpy.data.curves.new("button-label","FONT");curve.body=copy;curve.align_x="CENTER";curve.size=size;curve.resolution_u=2
        obj=bpy.data.objects.new("button-label",curve);bpy.context.collection.objects.link(obj)
        bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.convert(target="MESH")
        obj.data.calc_loop_triangles()
        for tri in obj.data.loop_triangles:
            m.face([(obj.data.vertices[i].co.x,y+obj.data.vertices[i].co.y,-.145) for i in reversed(tri.vertices)],role)
        bpy.data.objects.remove(obj,do_unlink=True)
    label("PEDESTRIANS",1.326,.018,"signalShell")
    label("WAIT",1.255,.030,"roadPaint")
    label("Push button",1.175,.015,"signalShell")
    label("Wait for signal",1.146,.014,"signalShell")
    label("opposite",1.121,.015,"signalShell")
    return m.finish({"type":"diagram4003far-sidepedestrianunit","buttonCentreHeightM":1.05,"modeledTactileCone":True,"interactive":False,"automaticGameDemand":True})


def icon_segment(m,a,b,width,centre):
    dx=b[0]-a[0];dy=b[1]-a[1];length=math.hypot(dx,dy)
    nx=-dy/length*width*.5;ny=dx/length*width*.5
    m.face([(a[0]+nx,centre+a[1]+ny,-.166),(a[0]-nx,centre+a[1]-ny,-.166),(b[0]-nx,centre+b[1]-ny,-.166),(b[0]+nx,centre+b[1]+ny,-.166)],"lampClear")


def build_ped_icon(name,walking):
    m=Mesh(name)
    centre=SIGNAL["headBottomY"]+SIGNAL["heightM"]*.5-(SIGNAL["aspectPitchM"] if walking else 0)
    hx=.016 if walking else 0;hy=.063
    m.face([(hx+.018*math.cos(i*math.tau/12),centre+hy+.018*math.sin(i*math.tau/12),-.166) for i in range(12)],"lampClear")
    if walking:
        segments=[((.008,.042),(-.014,-.006),.033),((-.008,.027),(-.049,.001),.018),((.002,.024),(.040,.006),.018),((-.014,-.006),(-.051,-.072),.021),((-.010,-.006),(.035,-.066),.021)]
    else:
        segments=[((0,.039),(0,-.014),.038),((-.021,.032),(-.028,-.023),.015),((.021,.032),(.028,-.023),.015),((-.011,-.008),(-.015,-.076),.018),((.011,-.008),(.015,-.076),.018)]
    for a,b,width in segments: icon_segment(m,a,b,width,centre)
    # Exact170mm figure, separately measured from its200/210mm dark optic.
    # Scaling is source geometry, not a runtime UI or sprite replacement.
    low=min(v[2] for v in m.vertices);high=max(v[2] for v in m.vertices)
    scale=.170/(high-low)
    m.vertices=[(x*scale*(.90 if walking else 1),z,centre+(y-centre)*scale) for x,z,y in m.vertices]
    return m.finish({"type":"green walking" if walking else "red standing","runtimeEmissionOnly":True,"blackout":"omit this entire mesh; housing remains opaque","frontAxis":"-Z"})


def triangle_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def main():
    options=args()
    if options.config:
        overrides=json.loads(Path(options.config).read_text())
        for key,target in [("car",CAR),("ground",GROUND),("signal",SIGNAL)]:
            if key in overrides:
                unknown=set(overrides[key])-set(target)
                if unknown: raise ValueError(f"Unknown {key} config: {sorted(unknown)}")
                target.update(overrides[key])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    albedo,orm,normal=atlas_images()
    MATERIALS["streetPilot.surface"]=make_material("streetPilot.surface",albedo,orm,normal)
    MATERIALS["streetPilot.frontLamp"]=make_material("streetPilot.frontLamp",albedo,orm,normal,(.20,.18,.12))
    MATERIALS["streetPilot.rearLamp"]=make_material("streetPilot.rearLamp",albedo,orm,normal,(.10,.012,.004))
    surfaces=[build_ground(),build_pavement(),build_kerbs(),build_setts(),build_markings(),build_repairs(),build_tactile()]
    objects=[build_car(),build_wheel(),*surfaces,merged_surface(surfaces),build_signal_shell(),build_signal_shell("street_pilot_signal_head",with_pole=False)]
    objects.extend(build_signal_lens(f"street_pilot_signal_{name}",index) for index,name in enumerate(("red","amber","green")))
    objects.extend([build_ped_housing(),build_ped_button(),build_ped_icon("street_pilot_ped_red",False),build_ped_icon("street_pilot_ped_green",True)])
    report={"version":2,"purpose":"Isolated Borough Passage street proof; no wider rollout", "car":CAR,"ground":GROUND,"signal":SIGNAL,"atlas":{"dimensions":[ATLAS_SIDE,ATLAS_SIDE],"maps":["albedo sRGB","ORM linear","normal linear;400mm6x6blister tiles25mmdia/5mmheight"],"estimatedMipmappedBytes":int(ATLAS_SIDE*ATLAS_SIDE*4*3*4/3)},"meshes":{obj.name:{"triangles":triangle_count(obj),"materials":len(obj.data.materials)} for obj in objects},"authorship":"Project-authored mesh/atlas; dimensions/reference provenance retained in street research dossier", "validation":{"visualReview":"pending","liveDither":"pending","participants":"pending"}}
    total=sum(item["triangles"] for item in report["meshes"].values())
    if report["meshes"]["street_pilot_car_body"]["triangles"]>10000: raise RuntimeError("Body triangle budget exceeded")
    if report["meshes"]["street_pilot_car_wheel"]["triangles"]*4>2000: raise RuntimeError("Four-wheel triangle budget exceeded")
    if report["atlas"]["estimatedMipmappedBytes"]>12*1024*1024: raise RuntimeError("Atlas memory budget exceeded")
    report["totalTrianglesCatalogue"]=total
    report["instancedCarTriangles"]=report["meshes"]["street_pilot_car_body"]["triangles"]+report["meshes"]["street_pilot_car_wheel"]["triangles"]*4
    for file in (options.output,options.blend,options.report): Path(file).parent.mkdir(parents=True,exist_ok=True)
    bpy.context.scene.unit_settings.system="METRIC"
    bpy.context.scene.unit_settings.scale_length=1.0
    bpy.context.scene["streetPilotContract"]=json.dumps(report,sort_keys=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(options.blend).resolve()))
    for obj in bpy.context.view_layer.objects: obj.select_set(False)
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.gltf(filepath=str(Path(options.output).resolve()),export_format="GLB",use_selection=True,export_apply=True,export_yup=True,export_texcoords=True,export_normals=True,export_tangents=False,export_materials="EXPORT",export_image_format="AUTO",export_animations=False,export_skins=False,export_morph=False,export_lights=False,export_cameras=False,export_extras=True)
    Path(options.report).write_text(json.dumps(report,indent=2)+"\n")
    print(f"STREET PILOT: {len(objects)} root meshes, {total} catalogue triangles; editable {options.blend}")


if __name__=="__main__": main()
