"""The chapel's fixed congregation and traces; a bounded, original prop pack.

No shared pack is imported or rewritten. Human volumes use the same dimensions
as build-props.mjs's apparition family, posed as actual seated/kneeling anatomy.
The Ear Room's raw hand-stroke alphabet is reused, not its meshes or event.
"""
import argparse
import importlib.util
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ear_hand', Path(__file__).with_name('build-stop-listening.py'))
ear_hand = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ear_hand)
# The new sentence shares the same raw brush, with just the missing letters.
ear_hand.GLYPHS.update({
    'H': (.73, [[(.04, 0), (.04, 1)], [(.69, 0), (.69, 1)], [(.04, .52), (.69, .52)]]),
    'R': (.72, [[(.05, 0), (.05, 1), (.45, 1), (.65, .84), (.61, .60), (.05, .52)], [(.35, .52), (.72, 0)]]),
    'Y': (.72, [[(.02, 1), (.35, .5), (.70, 1)], [(.35, .5), (.35, 0)]]),
})


def rt(p):
    return Vector((p[0], -p[2], p[1]))


def mat(name, rgba, roughness=.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = roughness
    m.diffuse_color = rgba
    return m


def mesh(name, verts, faces, material, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata([rt(p) for p in verts], [], faces)
    data.update()
    data.materials.append(material)
    for face in data.polygons:
        face.use_smooth = smooth
    return data


def make_body(name, kind, material):
    bm = bmesh.new()

    def ellipsoid(c, radii, segments=10, rings=7):
        result = bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1)
        for v in result['verts']:
            # Work in runtime axes, then transform exactly once on completion.
            v.co = Vector(tuple(c[i] + v.co[i] * radii[i] for i in range(3)))

    def limb(a, b, ra, rb):
        a, b = Vector(a), Vector(b)
        axis = (b-a).normalized()
        ref = Vector((0, 1, 0)) if abs(axis.y) < .88 else Vector((1, 0, 0))
        side = axis.cross(ref).normalized()
        depth = axis.cross(side).normalized()
        rows = []
        for j in range(4):
            t = j/3
            radius = (ra+(rb-ra)*t)*(1+.12*math.sin(t*math.pi))
            rows.append([bm.verts.new(a.lerp(b, t) + radius * (side*math.cos(k*math.tau/8) + depth*math.sin(k*math.tau/8))) for k in range(8)])
        for j in range(3):
            for k in range(8):
                bm.faces.new((rows[j][k], rows[j+1][k], rows[j+1][(k+1)%8], rows[j][(k+1)%8]))
        bm.faces.new(tuple(reversed(rows[0])))
        bm.faces.new(tuple(rows[-1]))

    def drape(rings, sides=24, fold=.012):
        """Closed, weighted cloth surface, as (height, width, depth, centre-z).

        Vertical folds flow down from the shoulders and widen toward the hem;
        they are not ribs laid across a rectangular chest. A gently scalloped
        bottom holds a contact shadow without lifting the whole robe.
        """
        rows=[]
        for j,(y,rx,rz,cz) in enumerate(rings):
            row=[]
            for k in range(sides):
                angle=k*math.tau/sides
                wave=math.cos(angle*8+.3)*fold*(.35+.65*j/max(1,len(rings)-1))
                hem=(.010*math.cos(angle*8+.3) if j==len(rings)-1 else 0)
                row.append(bm.verts.new(((rx+wave)*math.cos(angle),y+hem,cz+(rz+wave*.7)*math.sin(angle))))
            rows.append(row)
        for j in range(len(rows)-1):
            for k in range(sides):
                bm.faces.new((rows[j][k],rows[j+1][k],rows[j+1][(k+1)%sides],rows[j][(k+1)%sides]))
        bm.faces.new(tuple(reversed(rows[0])))
        bm.faces.new(tuple(rows[-1]))

    celebrant = kind == 'celebrant'
    acolyte = kind == 'acolyte'
    kneel = kind in ['kneeling', 'acolyte']
    bowed = kind == 'bowed'
    prayer = not celebrant
    hip_y = .79 if celebrant else .51 if kneel else .57
    chest_y = hip_y + .39
    lean = -.17 if bowed else -.075 if kneel else -.045
    ellipsoid((0, chest_y-.04, lean*.5), (.235, .32, .13))
    ellipsoid((0, hip_y, .025), (.20, .14, .13))
    ellipsoid((0, chest_y+.27, lean), (.073, .105, .074), 8, 6)
    ellipsoid((.015 if acolyte else 0, chest_y+.40-(.095 if bowed else .025 if kneel else 0), lean-.055 if bowed else lean), (.142,.183,.125),12,8)
    for s in [-1, 1]:
        shoulder = (s*.235, chest_y+.18-(.025 if s==1 else 0), lean*.8)
        elbow = (s*.39,chest_y+.14,-.09) if celebrant else (s*.22,chest_y-.04,-.17)
        wrist = (s*.45,chest_y+.34,-.25) if celebrant else (s*.043,chest_y+.09,-.27 if bowed else -.235)
        ellipsoid(shoulder, (.11, .10, .11), 8, 6)
        limb(shoulder, elbow, .108 if celebrant or acolyte else .089, .084 if celebrant or acolyte else .065)
        ellipsoid(elbow, (.067, .067, .067), 8, 5)
        limb(elbow, wrist, .080 if celebrant or acolyte else .062, .054 if celebrant or acolyte else .042)
        # Joined vertical hands for the common prayer; open, inward-facing
        # hands for the celebrant. Finger direction is UP, not slack at a knee.
        palm = (wrist[0], wrist[1]+.045, wrist[2]-.018)
        ellipsoid(palm, (.055, .068, .035), 8, 5)
        for finger in range(4):
            x = palm[0] + (finger-1.5)*.021
            limb((x,palm[1]+.025,palm[2]),(x+.004*s,palm[1]+.09-(finger==0)*.014,palm[2]-.014),.013,.008)
        hip = (s*.125, hip_y-.025, .02)
        knee = (s*.15,.41,-.055) if celebrant else (s*.16,.13 if kneel else .52,-.33 if kneel else -.43)
        ankle = (s*.16,.09,.015 if celebrant else .19 if kneel else -.49)
        ellipsoid(hip, (.115, .12, .105), 8, 6)
        limb(hip, knee, .108, .080)
        ellipsoid(knee, (.080, .083, .080), 8, 6)
        limb(knee, ankle, .075, .049)
        ellipsoid((ankle[0], .048, ankle[2]-.06), (.076, .048, .14), 8, 5)
        # The same short charge run into the floor as the standing family.
        for direction in [-1, 1]:
            limb((ankle[0], .010, ankle[2]-.11), (ankle[0]+direction*.14, .006, ankle[2]-.18+direction*.035), .008, .0025)
    if celebrant:
        # Alb to the ankles, a clear collar, and a broad Gothic chasuble hanging
        # from the shoulders over it. Its front/back fall longer than its sides.
        drape([(1.49,.12,.10,0),(1.37,.275,.17,0),(1.13,.25,.155,0),(.78,.27,.16,0),(.39,.30,.19,0),(.055,.34,.225,.015)],24,.010)
        before=len(bm.verts)
        drape([(1.50,.11,.105,0),(1.37,.37,.19,0),(1.17,.47,.23,0),(.94,.49,.24,0),(.70,.455,.255,0),(.43,.38,.235,0)],28,.018)
        # The side hem gathers on the forearms; the long front and back make
        # the vestment read at 5–10m without a decorative texture or a face.
        for v in list(bm.verts)[before:]:
            if v.co.y<.73:
                v.co.y+=abs(v.co.x/.50)**2*.20
        ellipsoid((0,1.49,0),(.13,.045,.112),12,5)
    elif acolyte:
        # Kneeling alb/surplice mass. The hips and folded legs remain legible
        # through its bent outline rather than becoming a standing cone.
        drape([(1.20,.115,.10,-.035),(1.11,.265,.16,-.025),(.89,.255,.17,-.015),(.59,.25,.20,0),(.30,.275,.32,-.055),(.055,.315,.40,-.035)],24,.012)
        ellipsoid((0,1.20,-.035),(.12,.036,.105),10,5)
    for v in bm.verts:
        v.co = rt(v.co)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    data.materials.append(material)
    for p in data.polygons:
        p.use_smooth = True
    return data


def ribbon_mesh(name, strokes, radius, material, plane='wall'):
    verts, faces = [], []
    rnd = random.Random(name)
    for st in strokes:
        if len(st) < 2:
            continue
        base = len(verts)
        for j, p in enumerate(st):
            prev, after = st[max(0, j-1)], st[min(len(st)-1, j+1)]
            dx, dy = after[0]-prev[0], after[1]-prev[1]
            length = max(1e-5, math.hypot(dx, dy))
            # A flattened pressure-varying brush. The silhouette carries the
            # word, not a texture billboard, material text shader or UI layer.
            w = radius * (.78+rnd.random()*.36) * (.45+.55*math.sin(math.pi*(j+.5)/len(st))**.25)
            for sign in [-1, 1]:
                a, b = p[0]-sign*dy/length*w, p[1]+sign*dx/length*w
                verts.append((a, b, .0015) if plane == 'wall' else (a, .0035, b))
        for j in range(len(st)-1):
            q = base+j*2
            # Runtime wall outward is +Z, floor outward is +Y.
            face = (q, q+2, q+3, q+1)
            faces.append(face if plane == 'wall' else tuple(reversed(face)))
    return mesh(name, verts, faces, material)


def writing(name, lines, h, pitch, material):
    rnd = random.Random(name)
    strokes = []
    for index, text in enumerate(lines):
        line, width = ear_hand.hand_strokes(text, h, rnd, wobble=.024, size_jitter=.07, step=.23,
                                          slant=.10+index*.015, rotation=rnd.uniform(-.025, .025))
        strokes.extend([[(x-width/2, y-index*pitch) for x, y in st] for st in line])
    for st in rnd.sample(strokes, min(14, len(strokes))):
        x, y = min(st, key=lambda p:p[1])
        length = rnd.uniform(.06, .27)
        strokes.append([(x, y), (x+.002, y-length*.4), (x+.001, y-length)])
    min_y = min(p[1] for st in strokes for p in st)
    strokes = [[(x, y-min_y) for x, y in st] for st in strokes]
    return ribbon_mesh(name, strokes, h*.058, material)


def hand_traces(name, material):
    strokes, rnd = [], random.Random(27)
    for index in range(7):
        x, y = index*.14-.43, rnd.uniform(.06, .48)
        for finger in range(5):
            fx = x+(finger-2)*.026
            strokes.append([(fx, y+.17), (fx+.009, y+.10), (fx+.015, y), (fx+.025, y-.21-rnd.uniform(0, .28))])
        strokes.append([(x-.05, y+.07), (x-.03, y+.11), (x+.04, y+.09), (x+.055, y-.015), (x-.02, y-.03)])
    low = min(p[1] for st in strokes for p in st)
    return ribbon_mesh(name, [[(x,y-low) for x,y in st] for st in strokes], .012, material)


def floor_drag(name, material):
    rnd, strokes = random.Random(24), []
    for k in range(24):
        start = (k%6)*.13-.33
        length = rnd.uniform(.36, 1.15)
        z = (k//6)*.09-.22
        strokes.append([(start, z), (start+.025, z-length*.37), (start+.08, z-length*.74), (start+.065, z-length)])
    return ribbon_mesh(name, strokes, .0095, material, plane='floor')


def votive(name, wax, char):
    parts = []
    rnd = random.Random(82)
    for i in range(13):
        x, z = rnd.uniform(-.29, .29), rnd.uniform(-.25, .25)
        height = rnd.uniform(.055, .18)
        # A cooled puddle with a misshapen stump, not a lit candle or new lamp.
        bm = bmesh.new()
        for c, r in [((x,.015,z), (.11,.014,.085)), ((x,height*.48,z), (.034,height*.5,.031))]:
            result = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=1)
            for v in result['verts']:
                v.co=rt(tuple(c[k]+v.co[k]*r[k] for k in range(3)))
        data=bpy.data.meshes.new('wax-part'); bm.to_mesh(data); bm.free(); data.materials.append(wax)
        o=ear_hand.link(bpy.data.objects.new('wax-part',data)); parts.append(o)
    hair = []
    for i in range(35):
        x, z = rnd.uniform(-.33,.33), rnd.uniform(-.28,.28)
        hair.append([(x+math.sin(j*.74+i)*.022,z+j*.013) for j in range(rnd.randrange(5,15))])
    hair_mesh = ribbon_mesh('embedded-hair', hair, .0018, char, plane='floor')
    parts.append(ear_hand.link(bpy.data.objects.new('embedded-hair',hair_mesh)))
    # Blender join preserves the two actual materials.
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]
    bpy.ops.object.join()
    data=parts[0].data
    data.name=name
    parts[0].data=bpy.data.meshes.new('detach')
    ear_hand.remove(parts[0])
    return data


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True); parser.add_argument('--report',required=True); parser.add_argument('--blend',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    black=mat('chapel anonymous pressure',(.003,.004,.005,1),.95)
    paint=mat('chapel dried dark paint',(.115,.021,.014,1),.22)
    wet=mat('chapel hand residue',(.072,.014,.010,1),.17)
    wax=mat('chapel cold tallow',(.53,.44,.30,1),.46)
    char=mat('chapel embedded char and hair',(.009,.007,.005,1),.92)
    meshes={f'chapel_presence_{kind}':make_body(f'chapel_presence_{kind}',kind,black) for kind in ['seated','bowed','kneeling','celebrant','acolyte']}
    meshes['chapel_writing_stop']=writing('chapel_writing_stop',['STOP LISTENING TO ME'],.29,0,paint)
    meshes['chapel_writing_overwritten']=writing('chapel_writing_overwritten',['NO ONE IS LISTENING']*3,.135,.19,paint)
    meshes['chapel_writing_empty']=writing('chapel_writing_empty',['THE ROOM IS EMPTY','THE ROOM IS EMPTY'],.205,.28,paint)
    meshes['chapel_wall_hand_traces']=hand_traces('chapel_wall_hand_traces',wet)
    meshes['chapel_floor_drag']=floor_drag('chapel_floor_drag',wet)
    meshes['chapel_wax_hair_votive']=votive('chapel_wax_hair_votive',wax,char)
    objects=[]
    for name,data in meshes.items():
        data.name=name
        obj=ear_hand.link(bpy.data.objects.new(name,data)); objects.append(obj)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    report={'meshes':{name:{'triangles':ear_hand.tri_count(data),'bounds':ear_hand.runtime_bounds(data),'materials':[m.name for m in data.materials]} for name,data in meshes.items()}}
    report['triangles']=sum(m['triangles'] for m in report['meshes'].values())
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(args.blend).resolve()))
    bpy.ops.export_scene.gltf(filepath=str(Path(args.output).resolve()),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,
                              export_texcoords=True,export_normals=True,export_tangents=False,export_materials='EXPORT',
                              export_animations=False,export_skins=False,export_morph=False,export_lights=False,export_cameras=False,export_extras=False)
    Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
    print('CHAPEL DRESSING',report['triangles'],'triangles,',len(meshes),'meshes')


if __name__ == '__main__':
    main()
