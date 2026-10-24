"""One RHD Ford Transit Mk3 (VE6) panel van cabin for the Source drive, the opening
vehicle scene and the get-in teaser. Blender: game XYZ metres, forward -Z, converted to glTF Y-up.
The driver package (eye, wheel, receiver, DA-1000, seat cushions) is unchanged from
cabin v3; shell, dash, wheel spokes, body and tyres are the Mk3's. Sources and the
measured comparison: the Transit Cab Study (Commercial Motor 13 Dec 1986, 31 Mar 1988).
Run /Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b --python tools/chunk_surfer/source-drive-study/build-drive-cabin.py
"""
import bpy,bmesh,math,json,os,hashlib,shutil,struct
import numpy as np
from mathutils import Vector,Matrix
from math import sin,cos,pi
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
# The Mk3 package, measured from the 1988 Commercial Motor photographs and published
# dimensions. Cab-local metres; body-frame z = cab z + MOUNT.
V={'label': 'Ford Transit Mk3 (VE6) 100 SWB panel van, 2.0 OHC petrol (UK, 1987)', 'wheelbase': 2.835, 'front': 1.3, 'track': 1.66, 'tyreR': 0.33, 'studs': 5, 'hw': 0.97, 'card': 0.84, 'dashHW': 0.84, 'noseHW': 0.965, 'roofOut': 2.02, 'roofIn': 1.93, 'sb': (1.27, -0.98), 'st': (1.79, -0.36), 'swb': 0.87, 'swt': 0.81, 'doorF': -0.62, 'doorB': 0.38, 'bPost': 0.1, 'belt': 1.25, 'winTop': 1.79, 'door': 'hinged', 'fascia': -0.6, 'dashTop': 1.245, 'hood': (0.27, 0.73, 1.355), 'gauges': [('fuel', 0.385, 0.05), ('speed', 0.575, 0.062)], 'speedLabels': [0, 20, 40, 60, 80], 'bulkhead': 0.82, 'pedalZ': -0.66, 'toe': -0.8, 'gear': ((-0.1, 0.8, -0.03), (-0.12, 1.07, -0.13)), 'pedals': [(0.31, -0.6), (0.43, -0.62), (0.55, -0.66)], 'mirror': (1.07, 1.4, -0.7), 'mirrorL': (1.35, -0.65), 'aPost': 0.05, 'headliner': True, 'colours': {'body': (0.5, 0.49, 0.455), 'dash': (0.185, 0.19, 0.195), 'trim': (0.19, 0.195, 0.2), 'cloth': (0.18, 0.19, 0.2), 'felt': (0.25, 0.25, 0.24)}, 'length': 4.616, 'frontOverhang': 0.86, 'height': 2.02, 'bodyHW': 0.965, 'nose': [(0.4, -2.16), (0.9, -2.16), (0.97, -2.09), (1.27, -1.43)], 'lamps': 'flush', 'spokes': [-0.1, 3.241592653589793], 'dish': 0.026, 'hub': (0.14, 0.1)}
OUT=os.path.join(ROOT,'artifacts/source-drive-study')
GEO=os.path.join(OUT,'geometry');os.makedirs(GEO,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def B(p):return Vector((p[0],-p[2],p[1]))
def mat(name,c,metal=0,rough=.7,emit=0):
 m=bpy.data.materials.new(name);m['materialFactors']='gltf';m['studyLocalFinish']=True;m.diffuse_color=(*c,1);m.use_nodes=True;n=m.node_tree.nodes.get('Principled BSDF');n.inputs['Base Color'].default_value=(*c,1);n.inputs['Metallic'].default_value=metal;n.inputs['Roughness'].default_value=rough
 if emit:n.inputs['Emission Color'].default_value=(*c,1);n.inputs['Emission Strength'].default_value=emit
 return m
M={
 'paint':mat('warm grey enamel / formed metal',(.43,.415,.355),.18,.48),
 'edge':mat('worn formed edges / zinc',(.35,.35,.31),.65,.38),
 'dash':mat('textured warm charcoal ABS',(.055,.064,.060),0,.84),
 'rubber':mat('dense matte black rubber',(.018,.023,.020),0,.91),
 'seat':mat('oxblood worn vinyl',(.145,.061,.042),0,.68),
 'seam':mat('vinyl seam dark',(.063,.033,.024),0,.81),
 'ivory':mat('warm ivory paint',(.69,.66,.49),0,.64),
 'metal':mat('dark plated fasteners',(.13,.15,.14),.7,.32),
 'road':mat('damp road aggregate',(.065,.069,.064),0,.87),
 'grass':mat('dead grass and bank',(.105,.114,.070),0,1),
 'stone':mat('damp old concrete',(.18,.19,.166),0,.95),
 'amber':mat('radio dial warm paint',(.48,.30,.10),0,.62,.35),
 'red':mat('passive rear reflector red',(.42,.035,.016),.08,.42),
 'white':mat('passive roadside ivory reflector',(.62,.62,.47),0,.55),
 'headlamp':mat('powered headlamp diffuser',(.62,.62,.47),0,.55,.15),
}
# Physically broad material families; tiny grain sits below the authored panel masses.
# Embedded maps survive the final material/depth acquisition; no external texture fetch.
def surface_texture(key,seed,amount=.06,size=256):
 m=M[key];base=np.array(m.diffuse_color[:3]);rng=np.random.default_rng(seed);noise=rng.normal(0,1,(size,size));noise=(noise+np.roll(noise,1,0)+np.roll(noise,1,1))/3
 # Base colours are authored in linear light. PNG RGB stores sRGB display
 # samples; P3 uses SRGB8 and decodes exactly once on upload. Alpha stays linear.
 linear=np.clip(base[None,None,:]*(1+noise[:,:,None]*amount),0,1)
 pixels=np.ones((size,size,4),dtype=np.float32);pixels[:,:,:3]=np.where(linear<=.0031308,12.92*linear,1.055*np.power(linear,1/2.4)-.055)
 im=bpy.data.images.new('drive '+key+' physical stock',width=size,height=size,alpha=True);im.pixels.foreach_set(pixels.ravel());im.file_format='PNG';im.filepath_raw=os.path.join(GEO,'surface-'+key+'.png');im.save();im.pack()
 n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for key,seed,amount in [('paint',11,.04),('dash',12,.10),('seat',13,.05),('road',14,.20),('stone',15,.12),('grass',16,.16)]:surface_texture(key,seed,amount)
M['mirror']=mat('mirror silver / actual reflected image supplied by study adapter',(.55,.57,.52),.85,.12)
M['wood']=mat('weathered creosoted timber',(.11,.087,.057),0,.91)
M['felt']=mat('muted warm woven headlining',(.115,.102,.078),0,.98)
# The close cabin needs broad values in the acquired frame. This warm, faded
# stock is confined to interior mouldings; shared wheel/rubber/world stock is
# preserved. No emissive lift or extra post-dither screen layer is used.
M['cabin_dash']=mat('faded warm grey moulded cabin polymer',(.145,.133,.108),0,.77)
M['cabin_felt']=mat('fitted warm woven cabin trim',(.225,.193,.145),0,.96)
part=[];parts={};cabin_features=[];radio_features=[]
def add(o,m):
 o.data.materials.append(M[m]);part.append(o);return o
def box(name,c,size,m,bevel=.009,segments=2):
 bpy.ops.mesh.primitive_cube_add(size=1,location=B(c));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('formed radius','BEVEL');mod.width=min(bevel,min(size)*.35);mod.segments=segments;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('weighted normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 return add(o,m)
def mesh(name,verts,faces,m):
 me=bpy.data.meshes.new(name);me.from_pydata([B(p)for p in verts],[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);return add(o,m)
def cyl(name,a,b,r,m,verts=16):
 a,b=B(a),B(b);d=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=d.length,location=(a+b)/2);o=bpy.context.object;o.name=name;o.rotation_euler=d.to_track_quat('Z','Y').to_euler();bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 return add(o,m)
def line(name,points,r,m,verts=10):
 for a,b in zip(points,points[1:]):cyl(name,a,b,r,m,verts)
def join(name):
 global part
 if name in ['drive_cabin','drive_radio']:
  for piece in part:
   if name=='drive_cabin':
    key={'textured warm charcoal ABS':'cabin_dash','muted warm woven headlining':'cabin_felt'}.get(piece.data.materials[0].name)
    if key:piece.data.materials.clear();piece.data.materials.append(M[key])
   if not piece.data.uv_layers:
    uv=piece.data.uv_layers.new(name='UVMap')
    for face in piece.data.polygons:
     drop=max(range(3),key=lambda axis:abs(face.normal[axis]));axes=[axis for axis in range(3)if axis!=drop]
     for loop in face.loop_indices:
      co=piece.data.vertices[piece.data.loops[loop].vertex_index].co;uv.data[loop].uv=(co[axes[0]]/.4,co[axes[1]]/.4)
   piece.data.calc_loop_triangles();pts=[piece.matrix_world@v.co for v in piece.data.vertices];game=[(p.x,p.z,-p.y)for p in pts]
   (cabin_features if name=='drive_cabin' else radio_features).append({'name':piece.name,'material':piece.data.materials[0].name,'triangles':len(piece.data.loop_triangles),'bounds':{'min':[min(p[i]for p in game)for i in range(3)],'max':[max(p[i]for p in game)for i in range(3)]}})
 bpy.ops.object.select_all(action='DESELECT')
 for o in part:o.select_set(True)
 bpy.context.view_layer.objects.active=part[0];bpy.ops.object.join();o=part[0];o.name=name;o.data.name=name
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR');bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
 # One primitive/material per used physical material, no duplicate material slots.
 used=[];mapping={}
 for i,m in enumerate(o.data.materials):
  if m.name not in mapping:mapping[m.name]=len(used);used.append(m)
 indexes=[mapping[o.data.materials[p.material_index].name]for p in o.data.polygons]
 o.data.materials.clear()
 for m in used:o.data.materials.append(m)
 for p,i in zip(o.data.polygons,indexes):p.material_index=i
 parts[name]=o;part=[];return o
# Broad formed pieces are closed solids. Profiles describe their manufactured
# section; small bevels catch light without turning the cabin into noisy trim.
def formed(name,profile,axis,span,m,bevel=.006):
 axes={'x':lambda q,t:(t,q[0],q[1]),'z':lambda q,t:(q[0],q[1],t)}
 make=axes[axis];n=len(profile)
 o=mesh(name,[make(q,t)for t in span for q in profile],[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)],m)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 if bevel:
  mod=o.modifiers.new('formed section radii','BEVEL');mod.width=bevel;mod.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
  mod=o.modifiers.new('panel normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def hood(name,outer,inner,front,back,m):
 n=len(outer);verts=[(x,y,z)for z in [front,back]for row in [outer,inner]for x,y in row];faces=[]
 for i in range(n-1):
  j=i+1;faces.extend([(i,j,n+j,n+i),(2*n+i,3*n+i,3*n+j,2*n+j),(i,2*n+i,2*n+j,j),(n+i,n+j,3*n+j,3*n+i)])
 faces.extend([(0,n,3*n,2*n),(n-1,3*n-1,4*n-1,2*n-1)])
 o=mesh(name,verts,faces,m);bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 mod=o.modifiers.new('rolled hood edges','BEVEL');mod.width=.006;mod.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('hood normals','WEIGHTED_NORMAL');mod.keep_sharp=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def upholstered(sx,kind):
 # The centres sag within raised side bolsters. These are shaped volumes,
 # rather than stacked boxes or dark lines masquerading as upholstery depth.
 xs=[-1,-.94,-.8,-.65,-.45,0,.45,.65,.8,.94,1]
 rows=[0,.035,.12,.3,.55,.78,.93,.98,1];verts=[]
 for t in rows:
  for q in xs:
   if kind=='cushion':
    half=.277-.015*t-.018*max(0,1-t/.08)-.018*max(0,(t-.92)/.08);z=.035+.61*t;y=.981+.024*abs(q)**3-.012*sin(pi*t)+.006*cos(pi*2*t)
    verts.append((sx+q*half,y,z))
   else:
    half=.276-.014*t-.018*max(0,1-t/.06)-.023*max(0,(t-.94)/.06);y=1.002+.65*t;z=.565+.052*t-.035*abs(q)**3+.012*sin(pi*t)
    verts.append((sx+q*half,y,z))
 n=len(xs);count=len(verts);faces=[]
 for j in range(len(rows)-1):
  for i in range(n-1):faces.append((j*n+i,j*n+i+1,(j+1)*n+i+1,(j+1)*n+i))
 topfaces=len(faces)
 for x,y,z in list(verts):verts.append((x,.887 if kind=='cushion' else y,z if kind=='cushion' else z+.115))
 faces.extend([tuple(reversed([a+count for a in f]))for f in faces[:topfaces]])
 perimeter=list(range(n))+[j*n+n-1 for j in range(1,len(rows))]+list(range((len(rows)-1)*n+n-2,(len(rows)-1)*n-1,-1))+[j*n for j in range(len(rows)-2,0,-1)]
 for a,b in zip(perimeter,perimeter[1:]+perimeter[:1]):faces.append((a,b,b+count,a+count))
 o=mesh('shaped vinyl '+kind,verts,faces,'seat');bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free()
 for face in o.data.polygons:face.use_smooth=True
 mod=o.modifiers.new('rolled upholstered perimeter','BEVEL');mod.width=.018;mod.segments=4;mod.limit_method='ANGLE';mod.angle_limit=.65;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 for face in o.data.polygons:face.use_smooth=True
 # Broad sewn joins follow the actual drape, with sparse side piping.
 for q in [-.72,.72]:
  path=[]
  for t in np.linspace(.06,.94,12):
   if kind=='cushion':path.append((sx+q*(.277-.015*t),.982+.024*abs(q)**3-.012*sin(pi*t)+.006*cos(pi*2*t),.035+.61*t))
   else:path.append((sx+q*(.276-.014*t),1.002+.65*t,.564+.052*t-.035*abs(q)**3+.012*sin(pi*t)))
  line(kind+' sewn panel join',path,.0023,'seam',6)
 return o

# Transit cab shell, dash and fittings around the fixed driver package.
# Exec'd inside the drive-cabin builder: box/mesh/cyl/line/formed/hood/upholstered,
# M, mat and V (the selected variant) are in scope. Cab-local metres.
def slab(name,quad,t,m):
 a,b,c,d=[np.array(p,dtype=float)for p in quad];n=np.cross(b-a,d-a);n=n/np.linalg.norm(n)*t
 vs=[tuple(p)for p in(a,b,c,d)]+[tuple(p+n)for p in(a,b,c,d)]
 o=mesh(name,vs,[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],m)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();return o
def lerp(p,q,t):return tuple(p[i]+(q[i]-p[i])*t for i in range(3))
C=V['colours']
M['body']=mat('van body enamel / exposed painted steel',C['body'],.12,.52)
M['trim']=mat('grey moulded vinyl trim',C['trim'],0,.82)
M['seat']=mat('grey woven seat cloth',C['cloth'],0,.97)
M['seam']=mat('seat cloth seam',tuple(v*.55 for v in C['cloth']),0,.95)
M['cabin_dash']=mat('moulded dash polymer',C['dash'],0,.80)
M['cabin_felt']=mat('cab headlining',C['felt'],0,.97)
surface_texture('seat',13,.07)
# Painted steel and moulded vinyl carry their own grain, like every other cab stock.
surface_texture('body',17,.04);surface_texture('trim',18,.07)
hw,card,sb,st,swb,swt=V['hw'],V['card'],V['sb'],V['st'],V['swb'],V['swt']
dF,dB,belt,winTop,roofIn,roofOut=V['doorF'],V['doorB'],V['belt'],V['winTop'],V['roofIn'],V['roofOut']
rear=V['bulkhead'] if V['bulkhead'] is not None else .80
AXF=-.85;MOUNT=-V['front']-AXF;AXR=AXF+V['wheelbase'];LOAD_REAR=V['length']-V['frontOverhang']+AXF
def screen_at(y):t=(y-sb[0])/(st[0]-sb[0]);return sb[1]+t*(st[1]-sb[1])
# Floor, toe board and a gearbox tunnel. No engine doghouse: the Transit's engine
# lives under the bonnet; the cab floor carries a tunnel and an offset lever.
box('cab floor',(0,.615,(V['toe']+rear)/2),(2*card+.04,.065,rear-V['toe']+.04),'rubber',.012)
formed('pressed toe board',[(.60,V['toe']),(.66,V['toe']),(1.17,sb[1]+.02),(1.17,sb[1]-.06),(.60,sb[1]-.06)],'x',[-card,card],'body',.009)
formed('gearbox tunnel',[(.645,V['toe']-.02),(.80,V['toe']-.06),(.79,-.30),(.70,.05),(.645,.10)],'x',[-.16,.16],'rubber',.03)
for side in [-1,1]:
 box('footwell ribbed mat',(side*.48,.657,(V['toe']+.10)/2),(.44,.017,abs(V['toe'])+.06),'rubber',.02,3)
 for j in range(5):box('footwell mat rib',(side*.48-.18+j*.09,.668,(V['toe']+.10)/2),(.011,.004,abs(V['toe'])-.06),'trim',.002)
 # The inner front wheel housing intrudes beside the pedals: a Transit trait.
 formed('front wheel housing',[(.645,V['toe']-.02),(.645,dF+.01),(.80,dF+.01),(.92,(dF+V['toe'])/2),(.96,V['toe']-.02)],'x',sorted([side*(card-.13),side*card]),'body',.02)
 slab('footwell kick panel',[(side*card,.64,sb[1]+.02),(side*card,.64,dF),(side*card,1.12,dF),(side*card,1.12,sb[1]+.02)],.03*side,'trim')
 box('door threshold step',(side*(card+.03),.662,(dF+dB)/2),(.12,.055,dB-dF),'body',.014,3)
 box('threshold tread insert',(side*(card+.025),.693,(dF+dB)/2),(.083,.012,dB-dF-.12),'rubber',.007)
# Doors. Hinged steel doors with wind-down glass (Mk2/Mk3), or Bedwas sliding
# doors: a bare panel with an alloy-framed sliding window and bolt heads.
for side in [-1,1]:
 x=side*(hw-.0275)
 if V['door']=='hinged':
  box('outer pressed door shell',(x,(.38+belt)/2,(dF+dB)/2),(.055,belt-.38,dB-dF),'body',.022,3)
  box('inner pressed door pan',(side*(card+.045),(.72+belt)/2,(dF+dB)/2),(.034,belt-.72,dB-dF-.04),'body',.024,4)
  box('door card rolled border',(side*(card+.022),(.70+belt-.04)/2,(dF+dB)/2),(.024,belt-.04-.70,dB-dF-.10),'trim',.024,4)
  box('door card vinyl inset',(side*(card+.008),(.74+belt-.10)/2,(dF+dB)/2),(.014,belt-.10-.74,dB-dF-.20),'trim',.02,4)
  box('door lower kick plate',(side*(card+.018),.79,(dF+dB)/2),(.022,.13,dB-dF-.10),'rubber',.014,3)
  box('door upper capping',(side*(card+.03),belt-.02,(dF+dB)/2),(.07,.05,dB-dF-.02),'trim',.02,3)
  box('door pull escutcheon',(side*(card-.004),1.05,(dF+dB)/2-.05),(.018,.07,.28),'rubber',.016,3)
  line('door pull',[(side*(card-.012),1.045,(dF+dB)/2-.17),(side*(card-.04),1.07,(dF+dB)/2-.12),(side*(card-.04),1.07,(dF+dB)/2+.04),(side*(card-.012),1.045,(dF+dB)/2+.09)],.015,'trim',12)
  box('door latch recess',(side*(card-.006),1.17,dB-.12),(.018,.06,.13),'rubber',.013,3)
  line('interior release lever',[(side*(card-.02),1.17,dB-.17),(side*(card-.034),1.175,dB-.08)],.009,'edge',12)
  cyl('window winder spindle',(side*(card-.004),1.10,(dF+dB)/2+.20),(side*(card-.04),1.10,(dF+dB)/2+.20),.022,'metal',20)
  line('window crank',[(side*(card-.042),1.10,(dF+dB)/2+.20),(side*(card-.048),1.15,(dF+dB)/2+.11)],.011,'edge',12)
  cyl('window crank grip',(side*(card-.048),1.15,(dF+dB)/2+.11),(side*(card-.072),1.15,(dF+dB)/2+.11),.018,'rubber',16)
  box('door pocket front',(side*(card-.045),.87,(dF+dB)/2+.05),(.018,.09,.40),'trim',.013,3)
  box('door pocket bottom',(side*(card-.02),.825,(dF+dB)/2+.05),(.06,.012,.40),'rubber',.005)
  # Window frame: rear upright, top rail and the glass run along the A-pillar.
  top=[(side*(hw-.05),winTop+.02,screen_at(winTop)+.08),(side*(hw-.05),winTop+.02,dB)]
  box('door frame rear upright',(side*(hw-.05),(belt+winTop)/2,dB-.02),(.06,winTop-belt+.06,.045),'body',.012,3)
  line('door frame top rail',top,.022,'body',10)
  line('side window aperture seal',[(side*(hw-.065),belt+.02,max(screen_at(belt)+.20,dF+.04)),(side*(hw-.065),belt+.02,dB-.05),(side*(hw-.065),winTop-.01,dB-.05),(side*(hw-.065),winTop-.01,max(screen_at(winTop)+.10,dF+.04))],.010,'rubber',10)
  box('window sill',(side*(hw-.06),belt,(dF+dB)/2),(.075,.04,dB-dF-.04),'rubber',.012)
  cyl('door lock pin',(side*(card+.03),belt+.01,dB-.08),(side*(card+.03),belt+.045,dB-.08),.006,'metal',10)
 else:
  # Bedwas PV400: sliding door on open runners, untrimmed inner panel.
  # Outer skin framed round the window aperture, not a sheet across it.
  wz0,wz1,wy0,wy1=dF+.07,dB-.07,belt,winTop
  box('sliding door outer panel',(x,(.42+wy0)/2,(dF+dB)/2),(.04,wy0-.42,dB-dF),'body',.012,3)
  box('sliding door top rail panel',(x,(wy1+winTop+.10)/2,(dF+dB)/2),(.04,winTop+.10-wy1,dB-dF),'body',.008,2)
  for z0,z1 in [(dF,wz0),(wz1,dB)]:box('sliding door window stile',(x,(wy0+wy1)/2,(z0+z1)/2),(.04,wy1-wy0,z1-z0),'body',.008,2)
  box('sliding door bare inner skin',(side*(card+.03),(.62+belt)/2,(dF+dB)/2),(.025,belt-.62,dB-dF-.06),'body',.006,2)
  for z in np.linspace(dF+.10,dB-.10,4):box('sliding door inner stiffener',(side*(card+.012),(.62+belt)/2,z),(.02,belt-.66,.05),'body',.006,2)
  # Alloy-framed two-pane sliding window, door-bolt catch, bolt heads round it.
  for y in [wy0,wy1]:box('alloy window frame rail',(side*(hw-.06),y,(wz0+wz1)/2),(.045,.04,wz1-wz0+.04),'edge',.006,2)
  for z in [wz0,wz1,(wz0+wz1)/2]:box('alloy window frame upright',(side*(hw-.06),(wy0+wy1)/2,z),(.045,wy1-wy0,.035 if z!=(wz0+wz1)/2 else .045),'edge',.006,2)
  box('sliding window bolt catch',(side*(hw-.09),(wy0+wy1)/2,(wz0+wz1)/2+.03),(.02,.05,.03),'metal',.004)
  for z in np.linspace(wz0,wz1,7):
   for y in [wy0-.035,wy1+.035]:cyl('window frame bolt head',(side*(card+.045),y,z),(side*(card+.03),y,z),.007,'metal',8)
  box('sliding door pull channel',(side*(card+.02),1.05,dB-.10),(.03,.20,.04),'rubber',.008,2)
  for y in [.43,winTop+.12]:box('open door runner channel',(side*(hw+.01),y,(dF+dB)/2+.60),(.03,.04,dB-dF+1.20),'metal',.006,2)
# Pillars. The A-pillar follows the glass; the lower hinge pillar meets the floor.
for side in [-1,1]:
 a0=(side*(swb+V['aPost']+.012),sb[0]-.01,sb[1]-.012);a1=(side*(swt+V['aPost']+.008),st[0]+.01,st[1]-.004)
 line('front pillar',[a0,a1],V['aPost'],'trim' if V['door']=='hinged' else 'body',14)
 slab('A pillar side flange',[(side*(swb+.01),sb[0]-.01,sb[1]),(side*(hw-.03),sb[0]-.01,sb[1]+.12),(side*(hw-.05),st[0]+.01,st[1]+.07),(side*(swt+.01),st[0]+.01,st[1])],.035*side,'trim' if V['door']=='hinged' else 'body')
 line('front glazing gasket',[(side*(swb+.006),sb[0]+.01,sb[1]+.006),(side*(swt+.006),st[0]-.01,st[1]+.004)],.011,'rubber')
 if V['aPost']>.06:
  # Bedwas box-section A-post with the radio aerial lead taped up the offside one.
  slab('box section A post inner face',[(side*(swb+.02),sb[0],sb[1]+.07),(side*(card+.03),sb[0],sb[1]+.20),(side*(card+.03),st[0]+.02,st[1]+.16),(side*(swt+.02),st[0]+.02,st[1]+.06)],.03*side,'body')
  if side>0:
   line('radio aerial lead up offside A post',[(side*(swb+.03),1.05,sb[1]+.30),(side*(swb+.035),sb[0]+.05,sb[1]+.10),(side*(swt+.04),st[0]-.03,st[1]+.08),(side*.40,st[0]+.035,st[1]+.12)],.004,'rubber',6)
   box('interior aerial base',(.36,st[0]+.04,st[1]+.12),(.05,.02,.04),'rubber',.004)
 else:line('front pillar inner trim',[(side*(swb+.04),sb[0]+.02,sb[1]+.03),(side*(swt+.04),st[0]-.01,st[1]+.02)],.022,'trim',12)
 box('hinge pillar',(side*(hw-.05),(.64+sb[0])/2,dF-.035),(.09,sb[0]-.64,.07),'body',.014,3)
 box('B pillar',(side*(hw-.045),(.62+roofIn)/2,dB+V['bPost']/2),(.10,roofIn-.62,V['bPost']),'body',.016,3)
 box('B pillar trim',(side*(card+.01),(.70+belt)/2,dB+V['bPost']/2),(.03,belt-.70,V['bPost']-.03),'trim',.012,3)
 # Rear quarter between B pillar and the bulkhead line.
 slab('cab rear quarter panel',[(side*(hw-.01),.40,dB+V['bPost']),(side*(hw-.01),.40,rear+.04),(side*(hw-.01),roofOut-.03,rear+.04),(side*(hw-.01),roofOut-.03,dB+V['bPost'])],-.035*side,'body')
 box('upper belt anchor',(side*(card+.01),belt+.62,dB+V['bPost']/2),(.05,.075,.025),'rubber',.013,3)
 box('parked seatbelt webbing',(side*(card-.005),(belt+.60+.95)/2,dB+V['bPost']+.012),(.040,belt+.60-.95,.008),'rubber',.002)
# Windscreen surround.
box('windscreen lower steel',(0,sb[0]-.03,sb[1]-.025),(2*swb+.08,.05,.09),'body',.018,3)
box('windscreen header steel',(0,st[0]+.035,st[1]+.005),(2*swt+.12,.065,.085),'body',.018,3)
line('windscreen lower gasket',[(-swb,sb[0]+.006,sb[1]+.008),(swb,sb[0]+.006,sb[1]+.008)],.010,'rubber',12)
line('windscreen header gasket',[(-swt,st[0]-.008,st[1]+.006),(swt,st[0]-.008,st[1]+.006)],.010,'rubber',12)
# Roof. Trimmed vans carry a curved headlining; the Bedwas cab has none.
zr0=st[1]+.02;zr1=rear+.04 if V['bulkhead'] is not None else LOAD_REAR
if V['headliner']:box('roof panel',(0,roofOut-.025,(zr0+zr1)/2),(2*hw-.04,.05,zr1-zr0),'body',.03,3)
if V['headliner']:
 hl=[(-card-.04,roofIn-.05),(-card+.06,roofIn-.015),(-.45,roofIn+.005),(0,roofIn+.01),(.45,roofIn+.005),(card-.06,roofIn-.015),(card+.04,roofIn-.05)]
 formed('curved insulated headliner',hl+[(x,y+.02)for x,y in reversed(hl)],'z',[zr0+.06,zr1-.02],'felt',.006)
 # A header roll ties the headlining to the screen rail.
 slab('headliner front roll',[(-swt-.04,st[0]+.07,st[1]+.06),(swt+.04,st[0]+.07,st[1]+.06),(swt+.04,roofIn-.005,zr0+.08),(-swt-.04,roofIn-.005,zr0+.08)],-.02,'felt')
 for side in [-1,1]:
  slab('padded sun visor',[(side*.17,roofIn-.04,zr0+.10),(side*.66,roofIn-.04,zr0+.10),(side*.66,roofIn-.045,zr0+.26),(side*.17,roofIn-.045,zr0+.26)],-.03,'felt')
  line('visor hinge rod',[(side*.70,roofIn-.02,zr0+.12),(side*.66,roofIn-.04,zr0+.12),(side*.20,roofIn-.04,zr0+.12)],.006,'metal',10)
  box('visor retaining clip',(side*.12,roofIn-.03,zr0+.12),(.025,.026,.034),'ivory',.006,3)
 box('dome lamp plinth',(0,roofIn-.002,.30),(.17,.024,.10),'trim',.014,3)
 box('unpowered dome lamp lens',(0,roofIn-.016,.30),(.13,.012,.073),'ivory',.012)
else:
 # High box over the cab: bare front wall above the screen, ribbed bare roof,
 # the crude bolted header/cantrail/B-post join the 1988 test called ugly.
 slab('bare front wall above screen',[(-hw+.02,st[0]+.07,st[1]+.02),(hw-.02,st[0]+.07,st[1]+.02),(hw-.02,roofIn,st[1]-.05),(-hw+.02,roofIn,st[1]-.05)],.035,'body')
 for y in np.linspace(st[0]+.25,roofIn-.12,3):box('front wall horizontal stiffener',(0,y,st[1]-.01+(y-st[0])*-.08),(2*hw-.10,.05,.035),'body',.006,2)
 box('header rail',(0,st[0]+.10,st[1]+.08),(2*hw-.06,.09,.10),'body',.01,2)
 box('bare cab roof underside',(0,roofIn+.012,(zr0+zr1)/2),(2*hw-.06,.02,zr1-zr0),'body',.004,2)
 for z in np.arange(zr0+.18,zr1,.42):box('roof bow',(0,roofIn-.02,z),(2*hw-.08,.06,.045),'body',.006,2)
 for side in [-1,1]:
  box('cantrail',(side*(hw-.05),roofIn-.06,(zr0+zr1)/2),(.08,.09,zr1-zr0),'body',.008,2)
  slab('bare upper side panel',[(side*(hw-.02),winTop+.12,st[1]),(side*(hw-.02),winTop+.12,dB+V['bPost']),(side*(hw-.02),roofIn,dB+V['bPost']),(side*(hw-.02),roofIn,st[1])],-.03*side,'body')
  for i in range(4):cyl('bolted header join',(side*(hw-.09),roofIn-.04-i*.05,dB+V['bPost']/2),(side*(hw-.11),roofIn-.04-i*.05,dB+V['bPost']/2),.009,'metal',6)
  box('padded sun visor',(side*.42,st[0]+.13,st[1]+.16),(.48,.03,.15),'trim',.01,3)
# Close the roof shell: the front skin above the header rail and the cantrail
# panel above each door. Without them the header and door rails leave slits of sky.
slab('roof front closing skin',[(-hw+.005,st[0]+.05,st[1]-.03),(hw-.005,st[0]+.05,st[1]-.03),(hw-.005,roofOut+.004,st[1]-.03),(-hw+.005,roofOut+.004,st[1]-.03)],.07,'body')
for side in [-1,1]:
 zc0=screen_at(winTop)-.02;zc1=(rear+.05) if V['bulkhead'] is not None else LOAD_REAR
 slab('cantrail outer panel',[(side*(hw-.004),winTop+.015,zc0),(side*(hw-.004),winTop+.015,zc1),(side*(hw-.004),roofOut+.004,zc1),(side*(hw-.004),roofOut+.004,zc0)],-.05*side,'body')
# Rear: a full steel bulkhead (the 1988 test recommends one); the parcels body
# instead opens behind the seats into the load space, behind a mesh partition.
if V['bulkhead'] is not None:
 z=V['bulkhead']
 box('rear bulkhead',(0,(.62+roofIn)/2,z+.03),(2*card+.08,roofIn-.62,.05),'body',.02,3)
 box('bulkhead lower kick shield',(0,.80,z),(2*card-.10,.26,.027),'trim',.013,3)
 for x in [-.56,-.19,.19,.56]:
  box('bulkhead pressed panel surround',(x,1.40,z+.002),(.33,.90,.028),'edge',.02,3)
  box('bulkhead recessed centre',(x,1.40,z-.018),(.29,.85,.018),'body',.019,3)
 box('bulkhead document rack back',(-.44,1.19,z-.05),(.31,.23,.018),'trim',.012,3)
 box('bulkhead document rack lip',(-.44,1.11,z-.11),(.31,.075,.022),'trim',.010,3)
 for x in [-.59,-.29]:box('document rack end',(x,1.14,z-.08),(.015,.13,.08),'trim',.008)
 box('document rack floor',(-.44,1.075,z-.08),(.31,.015,.08),'rubber',.005)
else:
 z=.84
 for x in [-.88,.88]:box('partition frame post',(x,(.80+roofIn)/2,z),(.04,roofIn-.80,.04),'metal',.006,2)
 for y in [.84,1.55,roofIn-.04]:box('partition frame rail',(0,y,z),(1.80,.035,.035),'metal',.006,2)
 for x in np.arange(-.84,.86,.12):box('partition mesh bar',(x,(.84+roofIn)/2,z),(.008,roofIn-.84,.008),'metal',0)
 for y in np.arange(.90,roofIn-.05,.12):box('partition mesh wire',(0,y,z+.006),(1.76,.006,.006),'metal',0)
 # Load space (thin walls so it reads from the cab): raised deck, bare walls,
 # horizontal load rails, rear doors.
 L=LOAD_REAR
 box('load deck',(0,V['deck']-.02,(z+L)/2),(2*card+.06,.04,L-z),'rubber',.004,2)
 box('cab to deck step riser',(0,(.65+V['deck'])/2,z+.03),(2*card,V['deck']-.65,.03),'body',.004,2)
 for side in [-1,1]:
  slab('load space bare side wall',[(side*(hw-.02),V['deck'],z),(side*(hw-.02),V['deck'],L),(side*(hw-.02),roofOut-.01,L),(side*(hw-.02),roofOut-.01,z)],-.03*side,'body')
  for z0,z1 in [(z,AXR-V['tyreR']-.10),(AXR+V['tyreR']+.10,L)]:slab('load body lower skirt',[(side*(hw-.02),.55,z0),(side*(hw-.02),.55,z1),(side*(hw-.02),V['deck']+.01,z1),(side*(hw-.02),V['deck']+.01,z0)],-.03*side,'body')
  for y in [1.05,1.45,1.85,2.25]:box('load rail',(side*(hw-.06),y,(z+L)/2),(.025,.06,L-z-.10),'edge',.004,2)
 slab('rear doors inner skin',[(-hw+.02,.55,L),(hw-.02,.55,L),(hw-.02,roofOut-.01,L),(-hw+.02,roofOut-.01,L)],-.03,'body')
 box('parcels body roof panel',(0,roofOut-.025,(zr0+zr1)/2),(2*hw-.02,.05,zr1-zr0),'body',.02,2)
 box('translucent GRP roof section',(0,roofIn+.005,(z+L)/2+.2),(1.10,.012,L-z-.9),'ivory',.003,2)
# Dash. Upper moulding under the raked screen, fascia face, hooded binnacle.
y0=V['dashTop'];f=V['fascia']
dh=V['dashHW'];hx0,hx1,hy=V['hood'];hz0=(sb[1]+f)/2-.03
prof=[(sb[0]-.13,sb[1]+.01),(sb[0]-.005,sb[1]+.012),(y0+.02,(sb[1]+f)/2),(y0,f+.02),(y0-.04,f+.005),(y0-.10,f+.01),(y0-.10,sb[1]+.01)]
for span in [[-dh-.01,hx0],[hx1,dh+.01]]:formed('dashboard upper moulding',prof,'x',span,'dash',.01)
formed('binnacle dash span',[(sb[0]-.13,sb[1]+.01),(sb[0]-.005,sb[1]+.012),(y0+.02,(sb[1]+f)/2),(y0+.02,-.665),(1.10,-.665),(1.10,sb[1]+.01)],'x',[hx0,hx1],'dash',.008)
box('formed painted fascia',(0,1.04,f-.045),(2*dh,.21,.09),'trim',.016,3)
box('dashboard lower rolled return',(0,.925,f-.03),(2*dh-.06,.04,.14),'dash',.013,3)
if card>dh+.02:
 for side in [-1,1]:slab('coachbuilder dash end filler',[(side*dh,.64,sb[1]),(side*dh,.64,f),(side*dh,sb[0]-.02,f),(side*dh,sb[0]-.02,sb[1])],(card+.03-dh)*side,'body')
hood('open instrument hood',[(hx0,1.10),(hx0,hy-.04),(hx0+.015,hy-.01),(hx0+.045,hy),(hx1-.045,hy),(hx1-.015,hy-.01),(hx1,hy-.04),(hx1,1.10)],[(hx0+.025,1.10),(hx0+.025,hy-.05),(hx0+.035,hy-.032),(hx0+.055,hy-.025),(hx1-.055,hy-.025),(hx1-.035,hy-.032),(hx1-.025,hy-.05),(hx1-.025,1.10)],hz0,f+.045,'dash')
box('instrument deep backplate',((hx0+hx1)/2,1.215,-.652),(hx1-hx0-.03,.22,.022),'rubber',.02,3)
box('instrument lower rolled lip',((hx0+hx1)/2,1.10,f+.03),(hx1-hx0,.025,.07),'dash',.010,3)
for x in [-.46,.44]:
 box('demister vent cartridge',(x,sb[0]-.02,sb[1]+.06),(.46,.018,.055),'rubber',.010,3)
 for j in range(7):box('demister vane',(x-.19+j*.063,sb[0]-.008,sb[1]+.06),(.044,.007,.034),'dash',.004)
for x in [-dh+.07,dh-.07]:
 cyl('round fascia vent bezel',(x,1.09,f-.005),(x,1.09,f+.012),.045,'dash',24)
 cyl('round fascia vent throat',(x,1.09,f+.012),(x,1.09,f+.014),.034,'rubber',20)
 for j in range(3):box('fascia vent vane',(x,1.07+j*.02,f+.016),(.06,.005,.01),'trim',.001)
box('glovebox gasket',(-.50,1.045,f+.004),(.50,.16,.014),'rubber',.016,3)
box('pressed glovebox lid',(-.50,1.045,f+.016),(.48,.14,.016),'trim',.012,3)
box('glovebox finger latch',(-.50,1.09,f+.028),(.07,.012,.012),'edge',.004)
# The recordist's bolted equipment bridge carries the receiver and the DA-1000.
box('receiver rear mounting block',(.025,1.10,-.602),(.238,.105,.046),'rubber',.009,3)
box('equipment shelf',(-.11,1.009,-.462),(.47,.024,.33),'body',.010,3)
box('equipment shelf rubber liner',(-.11,1.023,-.455),(.435,.005,.285),'rubber',.007,3)
for x in [-.315,.095]:
 formed('folded equipment shelf bracket',[(.947,-.64),(1.00,-.64),(1.01,-.32),(.985,-.32)],'x',[x-.010,x+.010],'metal',.006)
 cyl('equipment shelf bolt',(x,1.023,-.585),(x,1.029,-.585),.006,'metal',12)
# Gauges face the driver; positions and radii from the period cluster.
for kind,cx,rad in V['gauges']:
 cyl('instrument plated bezel',(cx,1.207,-.649),(cx,1.207,-.635),rad,'metal',32)
 cyl('instrument dark dial',(cx,1.207,-.635),(cx,1.207,-.632),rad*.88,'rubber',32)
 n=13 if kind=='speed' else (12 if kind=='clock' else 5)
 for i in range(n):
  a=(i/12*2*pi) if kind=='clock' else (-.72+i/(n-1)*1.44)*pi;rr=rad*.76;x=cx+sin(a)*rr;y=1.207+cos(a)*rr
  cyl('dial painted tick',(x,y,-.629),(cx+sin(a)*(rr-.008),1.207+cos(a)*(rr-.008),-.629),.0018,'ivory',6)
 if kind!='speed':line('resting gauge needle',[(cx,1.207,-.626),(cx-rad*.48,1.207+rad*.32,-.626)],.0024,'amber',6)
 if kind=='clock':line('clock minute hand',[(cx,1.207,-.625),(cx+rad*.55,1.207+rad*.30,-.625)],.0018,'ivory',6)
 cyl('needle hub',(cx,1.207,-.629),(cx,1.207,-.623),.007,'metal',12)
# Seats on the same cushions and backs as the contract; grey cloth on risers.
for sx in [-.46,.48]:
 box('seat riser',(sx,.75,.39),(.54,.23,.63),'body' if V['door']=='hinged' else 'trim',.02,3)
 for dx in [-.19,.19]:box('seat sliding runner',(sx+dx,.876,.34),(.026,.039,.60),'metal',.008)
 upholstered(sx,'cushion');upholstered(sx,'back')
 line('seat adjustment handle',[(sx-.22,.877,.12),(sx-.22,.849,.06),(sx+.15,.849,.06)],.008,'metal',12)
 box('seatbelt buckle stalk',(sx+(.285 if sx<0 else -.285),.965,.43),(.026,.11,.025),'rubber',.008)
 box('seatbelt buckle',(sx+(.285 if sx<0 else -.285),1.022,.43),(.042,.052,.031),'rubber',.010,3)
# Column, three stalks behind the wheel (CM 1981), pendant pedals, offset lever.
cyl('steering column',(.48,.83,-.63),(.48,1.20,-.39),.027,'rubber',20)
cyl('column cast shroud',(.48,1.10,-.457),(.48,1.177,-.407),.049,'dash',24)
for y,dx in [(1.135,-1),(1.150,1),(1.118,1)]:
 line('column stalk',[(.48+dx*.035,y,-.473),(.48+dx*.135,y+.008,-.492)],.006,'metal',12)
 cyl('stalk grip',(.48+dx*.135,y+.008,-.492),(.48+dx*.162,y+.008,-.498),.012,'rubber',16)
pedals=V.get('pedals',[(x,V['pedalZ'])for x in(.34,.47,.64)])
for i,(x,pz) in enumerate(pedals):
 accel=i==len(pedals)-1
 line('pendant pedal arm',[(x,1.02,sb[1]+.10),(x,.86,pz-.06),(x,.77,pz)],.011,'metal',10)
 box('ribbed pedal',(x,.765,pz),(.05 if accel else .07,.022,.13 if accel else .10),'rubber',.008)
g0,g1=V['gear']
line('gear lever',[g0,lerp(g0,g1,.6),g1],.011,'metal',14)
for i in range(4):box('gear lever gaiter fold',(g0[0],g0[1]+.03+i*.012,g0[2]),(.10-i*.015,.012,.10-i*.015),'rubber',.008,3)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.034,location=B(g1));add(bpy.context.object,'rubber')
for face in bpy.context.object.data.polygons:face.use_smooth=True
line('handbrake lever',[(.0,.80,.42),(.0,.86,.24),(.0,.88,.15)],.014,'metal',12)
cyl('handbrake grip',(.0,.88,.15),(.0,.89,.08),.018,'rubber',14)
# Heater sliders under the glovebox; sparse contact wear on the shelf.
box('heater control cartridge',(-.49,.941,f+.01),(.35,.070,.064),'rubber',.009,3)
for row,y in enumerate([.951,.931]):
 box('heater lever slot',(-.49,y,f+.045),(.247,.008,.002),'rubber',.001,2)
 xx=[-.543,-.430][row]
 cyl('heater slide lever',(xx,y,f+.044),(xx,y,f+.07),.003,'edge',10)
 box('heater thumb pad',(xx,y,f+.075),(.026,.012,.012),'dash',.003,2)
# Mirror housings and arms around the contract mirror faces.
def mirror_at(side):
 mx,my,mz=V['mirror'];yl,zl=V.get('mirrorL',(my,mz));return (side*mx,my if side>0 else yl,mz if side>0 else zl)
for side in [-1,1]:
 mx,my,mz=mirror_at(side)
 line('mirror arm',[(side*(hw-.01),my-.17,max(dF+.02,mz+.02)),(mx-side*.02,my-.15,mz-.06),(mx,my-.11,mz-.06)],.012,'metal')
 box('mirror housing',(mx,my,mz-.05),(.15,.22,.08),'rubber',.022,3)
 box('mirror rolled rim',(mx,my,mz-.012),(.142,.212,.012),'edge',.016,3)

for x,z in [(-.261,-.405),(-.095,-.377),(.064,-.487)]:
 mesh('equipment tray contact paint loss',[(x-.018,1.026,z-.007),(x+.031,1.026,z-.005),(x+.019,1.026,z+.008),(x-.023,1.026,z+.005)],[(0,1,2,3)],'edge')
def lettering(value,p,size=.008,material='ivory',align='CENTER'):
 curve=bpy.data.curves.new('physical painted legend','FONT');curve.body=value;curve.size=size;curve.align_x=align;curve.align_y='CENTER';curve.extrude=.00012;curve.resolution_u=2
 font='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
 if os.path.exists(font):curve.font=bpy.data.fonts.load(font,check_existing=True)
 ob=bpy.data.objects.new('painted '+value,curve);bpy.context.collection.objects.link(ob);ob.location=B(p);ob.rotation_euler=(pi/2,0,0);bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob=bpy.context.object;ob.data.materials.append(M[material]);part.append(ob);ob.select_set(False);return ob
for kind,cx,rad in V['gauges']:
 if kind=='speed':
  for v in V['speedLabels']:
   a=(-.72+v/90*1.44)*pi;lettering(str(v),(cx+sin(a)*rad*.56,1.207+cos(a)*rad*.56,-.625),rad*.13)
  lettering('MPH',(cx,1.207-rad*.38,-.624),rad*.11)
 elif kind=='fuel':
  lettering('E',(cx-rad*.52,1.207+rad*.12,-.624),rad*.16);lettering('F',(cx+rad*.52,1.207+rad*.12,-.624),rad*.16)
lettering('HEAT',(-.624,.962,V['fascia']+.047),.0046,'ivory',align='LEFT')
lettering('SCREEN',(-.624,.923,V['fascia']+.047),.0038,'ivory',align='LEFT')
join('drive_cabin')
# Actual speed state belongs to a separate animated material needle. Local +Y at zero rotation.
line('speed pointer',[(0,-.011,0),(0,[r for k,x,r in V['gauges'] if k=='speed'][0]*.86,0)],.0024,'amber',8)
cyl('speed pointer cap',(0,0,-.003),(0,0,.003),.006,'metal',12)
join('drive_speed_needle')
# Ford two-spoke dished wheel. Same rim (r .195, tube .018) the hands are
# skinned to; spokes and the recessed hub pad follow the period wheel.
N=80;S=12;r=.195;tube=.018;vs=[];fs=[]
for i in range(N):
 a=i/N*2*pi
 for j in range(S):
  b=j/S*2*pi;vs.append(((r+tube*cos(b))*cos(a),(r+tube*cos(b))*sin(a),tube*sin(b)))
for i in range(N):
 for j in range(S):fs.append((i*S+j,((i+1)%N)*S+j,((i+1)%N)*S+(j+1)%S,i*S+(j+1)%S))
o=mesh('wheel formed rim',vs,fs,'rubber')
for p in o.data.polygons:p.use_smooth=True
dish=V['dish'];hx,hy=V['hub']
for a in V['spokes']:
 t=np.array([-sin(a),cos(a),0.])
 p0=np.array([cos(a)*hx*.42,sin(a)*hx*.42-.01,-dish]);p1=np.array([cos(a)*.182,sin(a)*.182,-.002])
 slab('broad dished spoke',[tuple(p0-t*.030),tuple(p1-t*.021),tuple(p1+t*.021),tuple(p0+t*.030)],.012,'dash')
box('dished hub pad',(0,-.012,-dish+.006),(hx,hy,.026),'dash',.018,4)
box('hub pad face',(0,-.012,-dish+.020),(hx-.012,hy-.012,.004),'rubber',.012,3)
cyl('oval badge',(0,-.004,-dish+.022),(0,-.004,-dish+.025),.014,'metal',20)
cyl('wheel boss',(0,0,-dish-.03),(0,0,-dish),.040,'dash',24)
for side in [-1,1]:
 line('rim mould parting seam',[(side*.195*cos(a),.195*sin(a),.0175)for a in np.linspace(-.40,.40,13)],.0007,'seam',6)
join('drive_wheel')

# Wiper local pivot, blade extends up localY with small leftward curve.
line('wiper sprung arm',[(0,0,0),(-.026,.23,.013),(-.03,.43,.013)],.007,'metal',10)
line('wiper blade',[(-.035,.31,.025),(-.035,.58,.025)],.009,'rubber',10)
join('drive_wiper')
# Physically sized receiver at the exact approved hand/control coordinates.
# A supported sleeve seats against the fascia. Broad enamel, a backed scale and
# deep knobs remain solids through final acquisition; no outlined screen decal.
box('receiver supported steel sleeve',(.025,1.10,-.506),(.224,.084,.158),'metal',.006,3)
box('receiver case seam',(.025,1.10,-.429),(.2268,.08848,.010),'rubber',.005,3)
box('receiver formed face rim',(.025,1.10,-.417),(.225,.087,.023),'edge',.005,3)
box('receiver solid enamel fascia',(.025,1.10,-.4075),(.214,.076,.008),'cabin_dash',.003,3)
box('receiver dial rolled surround',(.025,1.114,-.4024),(.153,.031,.003),'metal',.002,2)
box('receiver scale ivory enamel',(.025,1.114,-.4006),(.146,.025,.0016),'ivory',.001,2)
for i in range(13):
 x=-.0422+i*(.13552/12)
 box('receiver frequency scale solid tick',(x,1.1168,-.3990),(.0010,.0074 if i%3 else .011,.0012),'rubber',0)
for i,label in enumerate(['LW','MW','FM']):lettering(label,(-.022+i*.047,1.1068,-.3990),.0036,'rubber')
# Separate collars and sparse flutes provide grip. The central contact planes
# exactly match power z=-.360 and the tuning/preset z=-.379 reach targets.
for x in [-.065,.115]:
 cyl('receiver knob shaft',(x,1.10,-.404),(x,1.10,-.381),.007,'metal',16)
 cyl('receiver knob collar',(x,1.10,-.404),(x,1.10,-.386),.016,'edge',24)
 cyl('receiver ribbed knob grip',(x,1.10,-.386),(x,1.10,-.361),.013,'rubber',32)
 cyl('receiver knob solid contact face',(x,1.10,-.362),(x,1.10,-.360),.0115,'cabin_dash',24)
 for i in range(12):
  a=i/12*2*pi;cyl('receiver knob moulded flute',(x+.0128*cos(a),1.10+.0128*sin(a),-.382),(x+.0128*cos(a),1.10+.0128*sin(a),-.365),.00085,'cabin_dash',6)
 box('receiver knob painted index',(x,1.107,-.3589),(.0016,.0046,.0010),'ivory',0)
# Three actual stations, with a real 9 mm stem/travel envelope behind each cap.
for i,x in enumerate([-.0198,.025,.0698]):
 box('receiver preset aperture',(x,1.07592,-.399),(.034,.016,.008),'rubber',.002,2)
 box('receiver preset travel stem',(x,1.07592,-.390),(.024,.009,.018),'metal',.001,2)
 box('receiver preset solid cap',(x,1.07592,-.382),(.031,.012,.006),'ivory',.0018,3)
 lettering(str(i+1),(x,1.07592,-.3788),.0042,'rubber')
for x in [-.076,.126]:cyl('receiver mounting screw',(x,1.066,-.402),(x,1.066,-.400),.0024,'metal',12)
box('receiver lower identification strip',(.025,1.061,-.403),(.139,.004,.001),'metal',0)
lettering('SOLID STATE',(.025,1.061,-.4018),.0029,'ivory')
for x in [-.070,.102]:
 box('receiver shelf isolation foot',(x,1.034,-.497),(.022,.022,.143),'rubber',.003,2)
 box('receiver steel support cleat',(x,1.052,-.497),(.016,.022,.163),'metal',.003,2)
 cyl('receiver support captive bolt',(x,1.052,-.428),(x,1.052,-.419),.0035,'edge',12)
join('drive_radio')
box('moving tuning needle',(0,0,0),(.0018,.0185,.002),'amber',0)
join('drive_radio_needle')
# Road length is 1m with requested physicalwidth6.2m. Side repeat via instance transforms.
box('asphalt',(0,-.045,0),(6.5,.09,1),'road',.0)
for s in [-1,1]:box('edge paint',(s*2.90,.003,0),(.075,.004,1),'ivory',0)
box('central dash',(0,.004,0),(.065,.004,.36),'ivory',0)
join('drive_road')
box('embedded tar joint',(0,.002,0),(6.5,.014,.07),'rubber',.002)
for side in [-1,1]:box('joint worn concrete lip',(0,.001,side*.043),(6.5,.006,.016),'stone',.002)
join('drive_road_joint')
box('grass shoulder',(0,-.055,0),(1.6,.14,1),'grass',0)
for i in range(6):
 x=-.7+i*.26
 mesh('grass folded stalk',[(x,.01,-.4),(x+.035,.14,-.38),(x+.05,.01,-.32),(x,.01,-.4),(x-.04,.10,-.38),(x-.05,.01,-.32)],[(0,1,2),(3,4,5)],'grass')
join('drive_verge')
cyl('pole shaft',(0,0,0),(0,6.8,0),.075,'paint',14)
line('pole swan neck',[(0,6.8,0),(.10,7.0,0),(.62,7.03,0),(1.0,6.85,0)],.047,'paint',12)
box('pole lamp hood',(1.03,6.80,0),(.40,.12,.27),'metal',.045,3)
box('pole lamp diffuser',(1.03,6.737,0),(.31,.011,.20),'white',.02,3)
join('drive_pole')
box('reflector post',(0,.48,0),(.115,.96,.095),'ivory',.025,3)
box('post black patch',(0,.69,.049),(.112,.27,.006),'rubber',.008)
box('red reflector',(0,.72,.054),(.064,.075,.006),'red',.006)
join('drive_reflector')
# Concrete overpass at localcenter crossingroad x-axis; clearance4.7m.
box('bridge deck',(0,5.0,0),(14,.60,4.2),'stone',.04,3)
for x in [-4.45,4.45]:box('bridge pier',(x,2.35,0),(.75,4.7,2.8),'stone',.025,3)
for z in [-1.95,1.95]:box('bridge parapet',(0,5.62,z),(14,.65,.24),'stone',.025,3)
for x in [-5,-2.5,0,2.5,5]:box('bridge expansion scar',(x,4.69,0),(.018,.015,4.18),'rubber',0)
join('drive_bridge')
for s in [-1,1]:
 box('destination gate pier',(s*3.62,1.45,0),(.70,2.9,.75),'stone',.028,3)
 box('destination pier cap',(s*3.62,2.96,0),(.83,.12,.86),'stone',.025,3)
 # Gate is open along roadside, leaves never bisect driving surface.
 for y in [.60,1.65]:box('open gate rail',(s*3.28,y,1.45),(.045,.045,2.8),'metal',.007)
 for j in range(12):cyl('open gate bar',(s*3.28,.46,.10+j*.24),(s*3.28,1.91,.10+j*.24),.012,'metal',8)
box('recording access sign',(-3.62,1.36,.405),(.50,.36,.025),'ivory',.015,3)
lettering('STOP',(-3.62,1.425,.419),.064,'rubber')
lettering('RECORDING',(-3.62,1.325,.419),.028,'rubber')
lettering('ACCESS',(-3.62,1.275,.419),.028,'rubber')
join('drive_gate')
# Independent physical mirror faces: all vertices local, UV0 covers the camera texture.
def quad(name,w,h,matname):
 o=mesh(name,[(-w/2,-h/2,0),(w/2,-h/2,0),(w/2,h/2,0),(-w/2,h/2,0)],[(0,1,2,3)],matname)
 uv=o.data.uv_layers.new(name='UVMap')
 for loop,p in zip(o.data.loops,[(0,0),(1,0),(1,1),(0,1)]):uv.data[loop.index].uv=p
 return o
for side in ['left','right']:quad('actual rear view '+side,.127,.197,'mirror');join('drive_mirror_'+side)
# DA-1000 approved outer dimensions, made to support the actual readout canvas.
W=.274;H=W*405/736;D=.044;RECORDER_READOUT_Z=.0262 # 0.7 mm above opaque recess front (.0255 m)
box('recorder chassis',(0,0,0),(W,H,D),'paint',.0055,4)
box('recorder plated lip',(0,0,.022),(W-.002,H-.002,.0028),'edge',.003,3)
box('recorder display recess',(0,H/2-195.5*W/736,.024),(666*W/736+.005,239*W/736+.005,.003),'rubber',.002,3)
for x in [-W/2+.0094,W/2-.0094]:
 for y in [-H/2+.0104,H/2-.0104]:cyl('recorder screw',(x,y,.024),(x,y,.026),.003,'metal',12)
for i in range(3):
 x=(415+i*99+89/2-368)*W/736;y=(202.5-334-35/2)*W/736
 box('recorder key housing',(x,y,.026),(91*W/736,35*W/736,.002),'rubber',.001)
 box('recorder key cap',(x,y,.028),(83*W/736,27*W/736,.0038),'ivory'if i else'amber',.0012)
 lettering(['REC','PLAY','STOP'][i],(x,y,.03022),.0043,'rubber')
for x in [-.112,.112]:cyl('recorder socket',(x,.064,-.005),(x,.079,-.005),.0039,'metal',14)
lettering('DA-1000',(-.113,.064,.025),.0053,align='LEFT')
join('drive_recorder_body')
quad('approved live readout',666*W/736,239*W/736,'rubber');join('drive_recorder_readout')
box('recorder cradle back',(0,0,-.031),(.315,.18,.016),'metal',.008,3)
for side in [-1,1]:
 box('cradle cheek',(side*.151,-.015,-.004),(.013,.13,.07),'metal',.004,3)
 box('cradle rubber contact',(side*.142,-.015,.005),(.009,.09,.035),'rubber',.003)
box('cradle heel',(0,-.086,.003),(.29,.014,.066),'metal',.004,3)
box('cradle dash foot',(0,-.09,-.075),(.16,.025,.095),'rubber',.008,3)
join('drive_recorder_cradle')
# Reusable broad verge masses. No new rooms or routes; root places sparse clusters.
verts=[];faces=[]
for z in [-.5,.5]:
 for x,y in [(-2.0,-.05),(-1.4,.12),(-.5,.75),(.6,1.05),(1.6,.83),(2,.06)]:verts.append((x,y,z))
for i in range(5):faces.append((i,i+1,i+7,i+6))
faces.extend([(0,6,11,5),(0,1,2,3,4,5),(11,10,9,8,7,6)])
mesh('earth bank',verts,faces,'grass');join('drive_bank')
for i in range(5):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=B(((i%2-.5)*.17,.70+.07*sin(i*1.8),(i-2)*.62)));ob=bpy.context.object;ob.scale=(.64,.55,.78);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);add(ob,'grass')
join('drive_hedge')
line('bare trunk',[(0,0,0),(.05,1.6,-.04),(-.09,3.0,.02),(.05,4.7,-.02)],.10,'wood',12)
for a,b,c in [((.02,1.8,0),(-.75,3.0,.10),(-1.3,3.7,.17)),((-.06,2.7,0),(.72,3.6,-.22),(1.18,4.0,-.32)),((.02,3.6,0),(-.50,4.5,.35),(-.82,5.1,.50)),((.03,3.9,0),(.57,4.8,.12),(.70,5.5,.22))]:
 line('branch',[a,b,c],.040,'wood',10)
 d=(c[0]+.42,c[1]+.18,c[2]-.32);line('bare twig',[b,d],.018,'wood',8)
join('drive_tree')
for x in [-1.5,0,1.5]:
 box('fence post',(x,.62,0),(.115,1.24,.11),'wood',.008)
for y in [.38,.88]:box('fence rail',(0,y,.02),(3.15,.09,.065),'wood',.006)
join('drive_fence')
# Finite route construction kit. These pieces have a physical job: retaining an
# uphill edge, taking drainage and supporting the already-authored overpass.
# All use the same correctly encoded material stock; no new texture channels.
wall=mesh('retaining wall unit', [(-.22,0,-.5),(.34,0,-.5),(.24,1.35,-.5),(-.12,1.35,-.5),(-.22,0,.5),(.34,0,.5),(.24,1.35,.5),(-.12,1.35,.5)], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(0,4,7,3),(1,2,6,5)], 'stone')
join('drive_retaining_wall')
# U-shaped drain: top shoulders at road level, actual .22 m recess in section.
section=[(-.35,0),(-.24,-.025),(-.18,-.20),(.18,-.20),(.24,-.025),(.35,0),(.35,-.24),(-.35,-.24)]
verts=[(x,y,z)for z in[-.5,.5]for x,y in section];n=len(section)
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
mesh('formed drain channel',verts,faces,'stone');join('drive_drain_channel')
def terrain(name,profile,zwidth,material='grass'):
 verts=[]
 for zfactor in[-1,0,1]:
  for i,(x,y)in enumerate(profile):
   yy=y*(.78 if zfactor else 1)+(0 if i in[0,len(profile)-1]else .32*sin(i*1.71+zfactor))
   verts.append((x+(1.7*sin(i*.8)if zfactor else 0),yy,zfactor*zwidth))
 n=len(profile);faces=[]
 for j in range(2):
  for i in range(n-1):faces.extend([(j*n+i,j*n+i+1,(j+1)*n+i+1), (j*n+i,(j+1)*n+i+1,(j+1)*n+i)])
 smooth_faces=len(faces);base=len(verts);floor=min(y for x,y in profile)-.2
 for j in range(3):
  for i in[0,n-1]:verts.append((verts[j*n+i][0],floor,verts[j*n+i][2]))
 faces.extend([tuple(list(range(n))+[base+1,base]),tuple(list(range(2*n,3*n))+[base+5,base+4])])
 for j in range(2):
  faces.extend([(j*n,(j+1)*n,base+(j+1)*2,base+j*2),(j*n+n-1,(j+1)*n+n-1,base+(j+1)*2+1,base+j*2+1),(base+j*2,base+j*2+1,base+(j+1)*2+1,base+(j+1)*2)])
 o=mesh(name,verts,faces,material)
 for f in o.data.polygons:f.use_smooth=f.index<smooth_faces
 return join(name)
terrain('drive_terrain_ridge',[(-46,-.2),(-34,2.2),(-22,8.5),(-6,12.0),(9,10.4),(27,4.2),(46,-.2)],22)
terrain('drive_terrain_slope',[(-24,-.25),(-12,.1),(0,2.0),(12,4.6),(24,5.0),(36,3.0),(48,-.25)],21)
# Bridge earthwork axis +X extends outward from the end of the overhead deck.
# Its inner shoulder seats the deck underside at 4.7 m and reaches 5.3 m above.
profile=[(0,4.7),(1.3,5.3),(8,5.3),(19,2.8),(30,-.10)]
verts=[]
for x,y in profile:verts.extend([(x,-.18,-11),(x,y,-2.0),(x,y,2.0),(x,-.18,11)])
faces=[]
for i in range(len(profile)-1):
 for j in range(3):faces.append((i*4+j,(i+1)*4+j,(i+1)*4+j+1,i*4+j+1))
faces.extend([(0,1,2,3),tuple(range(len(verts)-4,len(verts)))[::-1],tuple([i*4 for i in range(len(profile))]+[i*4+3 for i in range(len(profile)-1,-1,-1)])])
mesh('supported upper crossing earth',verts,faces,'grass');join('drive_bridge_earthwork')
# Recalculate consistent outward normals on closed landform/construction stock.
# The older bank's longitudinal strips were wound downwards even though its
# endcaps faced outward; retaining that defect would falsely blacken the terrain.
for name in ['drive_bank','drive_retaining_wall','drive_drain_channel','drive_terrain_ridge','drive_terrain_slope','drive_bridge_earthwork']:
 bm=bmesh.new();bm.from_mesh(parts[name].data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(parts[name].data);bm.free();parts[name].data.update()
# Exterior in the BODY frame (origin at the CG between the axles; dynamics own it).
FA=-V['front'];RA=V['wheelbase']-V['front'];R=V['tyreR'];zf=FA-V['frontOverhang'];zr=zf+V['length']
hwB=V['bodyHW'];nhw=V['noseHW'];dh=V['dashHW'];sbz=V['sb'][1]+MOUNT;fw=V['sb'][1]-.06+MOUNT;dFb=V['doorF']+MOUNT
rearCab=(V['bulkhead'] if V['bulkhead'] is not None else .80)+.04+MOUNT
def arch_cut(o,z,xs):
 cut=cyl('wheel opening cutter',(xs[0],R,z),(xs[1],R,z),R+.075,'metal',48);part.remove(cut)
 bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
nose=V['nose']
centre=formed('bonnet and front panel',nose+[(1.17,sbz),(1.17,fw),(.40,fw)],'x',[-dh,dh],'body',.03)
arch_cut(centre,FA,(.55,1.2));arch_cut(centre,FA,(-1.2,-.55))
for side in [-1,1]:
 wing=formed('front wing',nose+[(nose[-1][0],dFb),(.40,dFb)],'x',sorted([side*dh,side*nhw]),'body',.03)
 arch_cut(wing,FA,sorted([side*.5,side*1.2]))
 line('wing top crease',[(side*(nhw-.03),nose[2][0],nose[2][1]+.02),(side*(nhw-.03),nose[-1][0]-.01,nose[-1][1])],.006,'edge',6)
line('bonnet shut line',[(-dh+.03,nose[-1][0]+.004,sbz-.05),(dh-.03,nose[-1][0]+.004,sbz-.05)],.004,'rubber',6)
for side in [-1,1]:line('bonnet shut line',[(side*(dh-.03),nose[-1][0]+.004,sbz-.05),(side*(dh-.03),nose[1][0]+.02,zf+.06)],.004,'rubber',6)
box('scuttle panel',(0,nose[-1][0]-.005,sbz+.025),(2*dh-.04,.02,.06),'rubber',.006)
# Front face: slatted grille, lamps, wrap bumper, plate.
gw=.52 if V['lamps']=='rect' else .48
box('grille panel',(0,.80,zf-.004),(2*gw,.24,.02),'rubber',.012,3)
for j in range(5):box('grille slat',(0,.70+j*.048,zf-.016),(2*gw-.03,.012,.012),'edge',.003)
cyl('grille badge',(0,.80,zf-.026),(0,.80,zf-.032),.035,'metal',20)
for side in [-1,1]:
 lx=side*(gw+.15)
 box('headlamp plated rim',(lx,.84,zf-.010),(.27,.17,.02),'edge',.016,3)
 box('headlamp face',(lx,.84,zf-.022),(.235,.135,.008),'headlamp',.012,3)
 box('front indicator',(side*(nhw-.05),.84,zf+.01),(.07,.11,.05),'amber',.01,2)
 box('rear lamp cluster',(side*(hwB-.05),.72,zr+.012),(.09,.36,.02),'red',.012,3)
box('front bumper',(0,.42,zf-.045),(2*nhw+.04,.19,.12),'rubber',.03,3)
box('front number plate',(0,.42,zf-.108),(.52,.11,.008),'ivory',.004)
box('cab underframe',(0,.47,(fw+rearCab)/2),(2*dh,.30,rearCab-fw),'rubber',.01)
for side in [-1,1]:box('cab door sill',(side*(V['hw']-.06),.38,(dFb+rearCab)/2),(.12,.10,rearCab-dFb),'body',.02,3)
if V['bulkhead'] is not None:
 cargo=box('cargo main shell',(0,(.30+V['height'])/2,(rearCab+zr)/2),(2*hwB,V['height']-.30,zr-rearCab),'body',.07,4)
 arch_cut(cargo,RA,(-1.2,1.2))
 for side in [-1,1]:
  for y in [V['belt'],.80]:box('cargo belt pressing',(side*(hwB+.004),y,(rearCab+zr)/2),(.02,.05,zr-rearCab-.10),'edge',.006)
 line('rear door centre seam',[(0,.34,zr+.003),(0,V['height']-.06,zr+.003)],.005,'rubber',6)
 for side in [-1,1]:box('rear door window',(side*.42,V['height']-.38,zr+.004),(.66,.40,.01),'rubber',.02,3)
 box('rear bumper',(0,.40,zr+.04),(2*hwB+.02,.16,.10),'rubber',.025,3)
else:
 # Parcels body sits on the chassis: rails, rear step-bumper at 428 mm.
 for side in [-1,1]:box('chassis rail',(side*.42,.52,(rearCab+zr)/2),(.08,.16,zr-rearCab),'rubber',.01)
 box('combined rear step and bumper',(0,.39,zr+.06),(2*hwB-.04,.08,.18),'rubber',.02,3)
 for side in [-1,1]:box('rear wheel inner box',(side*(V['hw']-.24),.68,RA),(.40,.22,2*R+.30),'rubber',.02,3)
 # Coachbuilt side rub rails: the outermost hull of the parcels body, so the
 # body mesh (and the contact footprint taken from it) spans the box.
 for side in [-1,1]:box('parcels body side rub rail',(side*(V['hw']+.012),.92,(dFb+zr)/2),(.024,.07,zr-dFb),'rubber',.008,2)
join('drive_vehicle_body')
cyl('tyre',(-.098,0,0),(.098,0,0),R,'rubber',40)
for side in [-1,1]:
 cyl('wheel rim',(side*.098,0,0),(side*.106,0,0),.19,'edge',32)
 cyl('wheel hub',(side*.106,0,0),(side*.124,0,0),.075,'metal',24)
 for i in range(V['studs']):
  a=i/V['studs']*2*pi;cyl('wheel fixing',(side*.124,.105*sin(a),.105*cos(a)),(side*.130,.105*sin(a),.105*cos(a)),.010,'metal',10)
join('drive_tyre')

# Retain exact approved payloads for every non-cabin mesh. Blender may change
# bevel UV roundoff or equivalent triangle diagonals on an untouched rebuild;
# this pass copies accessor data, not newly authored cabin geometry. Existing
# shipped geometry is the fallback when no study before-snapshot is available.
def preserve_non_cabin_accessors(path):
 baseline=os.path.join(GEO,'cabin-v3/before-drive.glb')
 if not os.path.exists(baseline):baseline=os.path.join(ROOT,'public/assets/source-drive/drive.glb')
 if not os.path.exists(baseline):return None
 source=open(baseline,'rb').read();target=bytearray(open(path,'rb').read())
 def document(blob):
  length=struct.unpack_from('<I',blob,12)[0];return json.loads(blob[20:20+length]),28+length
 old,old_bin=document(source);new,new_bin=document(target)
 widths={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};sizes={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
 def copy_accessor(old_index,new_index):
  a=old['accessors'][old_index];b=new['accessors'][new_index]
  if any(a.get(key)!=b.get(key)for key in ['type','componentType','count']):raise RuntimeError('Non-cabin accessor changed shape')
  av=old['bufferViews'][a['bufferView']];bv=new['bufferViews'][b['bufferView']];width=widths[a['componentType']]*sizes[a['type']]
  for row in range(a['count']):
   start=old_bin+av.get('byteOffset',0)+a.get('byteOffset',0)+row*av.get('byteStride',width)
   dest=new_bin+bv.get('byteOffset',0)+b.get('byteOffset',0)+row*bv.get('byteStride',width)
   target[dest:dest+width]=source[start:start+width]
 preserved=[]
 for mesh in new['meshes']:
  if mesh['name'] in ['drive_cabin','drive_radio','drive_wheel','drive_vehicle_body','drive_tyre','drive_speed_needle']:continue
  previous=next((m for m in old['meshes']if m['name']==mesh['name']),None)
  if previous is None or len(previous['primitives'])!=len(mesh['primitives']):raise RuntimeError('Non-cabin mesh contract changed: '+mesh['name'])
  for a,b in zip(previous['primitives'],mesh['primitives']):
   if old['materials'][a['material']]['name']!=new['materials'][b['material']]['name']:raise RuntimeError('Non-cabin material order changed')
   if set(a['attributes'])!=set(b['attributes']):raise RuntimeError('Non-cabin vertex channels changed')
   copy_accessor(a['indices'],b['indices'])
   for key in a['attributes']:copy_accessor(a['attributes'][key],b['attributes'][key])
  preserved.append(mesh['name'])
 open(path,'wb').write(target)
 return {'baselineSha256':hashlib.sha256(source).hexdigest(),'meshes':preserved,'method':'exact accessor copy after validating shape, channels and material names'}

# Export only task-owned names. Geometry remains at their intended local origins.
bpy.ops.object.select_all(action='DESELECT')
for o in parts.values():o.select_set(True)
path=os.path.join(OUT,'drive.glb')
bpy.ops.export_scene.gltf(filepath=path,export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_yup=True,export_materials='EXPORT',export_extras=True)
preserved_non_cabin=preserve_non_cabin_accessors(path)
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(GEO,'drive-cabin.blend'))
# Triangle / bounds receipt in gamecoordinates, as assembled in authored mesh.
rows=[]
for name,o in parts.items():
 o.data.calc_loop_triangles();pts=[(o.matrix_world@v.co)for v in o.data.vertices];g=[(p.x,p.z,-p.y)for p in pts]
 rows.append({'mesh':name,'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'materialCount':len(o.data.materials),'bounds':{'min':[min(p[i]for p in g)for i in range(3)],'max':[max(p[i]for p in g)for i in range(3)]}})
# Triangle / bounds receipt in game coordinates, per variant.
rows=[]
for name,o in parts.items():
 o.data.calc_loop_triangles();pts=[(o.matrix_world@v.co)for v in o.data.vertices];g=[(p.x,p.z,-p.y)for p in pts]
 rows.append({'mesh':name,'triangles':len(o.data.loop_triangles),'vertices':len(o.data.vertices),'materialCount':len(o.data.materials),'bounds':{'min':[min(p[i]for p in g)for i in range(3)],'max':[max(p[i]for p in g)for i in range(3)]}})
bodyRow=next(r for r in rows if r['mesh']=='drive_vehicle_body');cabRow=next(r for r in rows if r['mesh']=='drive_cabin')
bmin=[min(bodyRow['bounds']['min'][i],cabRow['bounds']['min'][i]+(MOUNT if i==2 else 0))for i in range(3)]
bmax=[max(bodyRow['bounds']['max'][i],cabRow['bounds']['max'][i]+(MOUNT if i==2 else 0))for i in range(3)]
# Mirrors stand proud of the body; the contact footprint is the body itself.
hwFoot=max(abs(bodyRow['bounds']['min'][0]),abs(bodyRow['bounds']['max'][0]),V['hw'])
sbY,sbZ=V['sb'];stY,stZ=V['st'];tilt=math.atan2(stZ-sbZ,stY-sbY)
speed=[(x,r)for k,x,r in V['gauges'] if k=='speed'][0];gw=.52 if V['lamps']=='rect' else .48
receipt={'schema':1,'kind':'source-drive-isolated-geometry','units':'metres','forward':[0,0,-1],'vehicle':V['label'],'variant':'mk3',
 'cabinBodyMount':[0,0,round(MOUNT,4)],
 'body':{'width':round(2*hwFoot,4),'height':round(bmax[1],4),'length':round(bmax[2]-bmin[2],4),'min':[round(-hwFoot,4),0,round(bmin[2],4)],'max':[round(hwFoot,4),round(bmax[1],4),round(bmax[2],4)],
  'frontAxleZ':-V['front'],'rearAxleZ':round(V['wheelbase']-V['front'],4),'track':V['track'],'wheelRadius':V['tyreR'],'headlamps':[[-(gw+.15),.84,round(FA-V['frontOverhang']-.03,4)],[gw+.15,.84,round(FA-V['frontOverhang']-.03,4)]]},
 'dynamics':{'wheelbase':V['wheelbase'],'frontDistance':V['front'],'rearDistance':round(V['wheelbase']-V['front'],4),'track':V['track']},
 'eye':[.48,1.65,.20],'eyePitch':-.04,'wheel':{'mesh':'drive_wheel','center':[.48,1.20,-.39],'tiltX':-.36,'radius':.195,'rimTubeRadius':.018},
 'wiper':{'mesh':'drive_wiper','pivot':[-.52,round(sbY-.015,4),round(sbZ-.035,4)],'normal':[0,-sin(tilt),cos(tilt)],'tiltX':tilt,'sweepRadians':[-.72,.72]},
 'speedNeedle':{'mesh':'drive_speed_needle','center':[speed[0],1.207,-.626],'normal':[0,0,1],'localPointerAxis':[0,1,0],'speedKmhRange':[0,144.84],'dialUnits':'mph 0-90','rotationZAtMin':.72*pi,'rotationZAtMax':-.72*pi},
 'radioNeedle':{'mesh':'drive_radio_needle','center':[.05468,1.11344,-.396],'translationAxis':[1,0,0],'xRange':[-.0422,.09332]},
 'radioFace':{'mesh':'drive_radio','center':[.025,1.10,-.395],'bounds':{'min':[-.08532,1.05632,-.40],'max':[.13532,1.14368,-.36]},'normal':[0,0,1]},
 'dashboard':{'topY':V['dashTop'],'frontZ':V['fascia']},
 'windscreenOpening':{'left':round(-(V['swb']-.03),4),'right':round(V['swb']-.03,4),'bottomY':sbY,'topY':stY,'bottomZ':sbZ,'topZ':stZ},
 'cabinExit':{'min':[round(-(V['hw']-.02),4),.60,round(sbZ-.10,4)],'max':[round(V['hw']-.02,4),round(V['roofOut']-.02,4),round((V['bulkhead']+.08)if V['bulkhead'] is not None else LOAD_REAR,4)]},
 'gauges':[{'kind':k,'center':[x,1.207,-.623],'radius':r}for k,x,r in V['gauges']],
 'road':{'mesh':'drive_road','length':1,'width':6.5,'shoulderWidth':1.6,'topY':0,'note':'Do not scale cabin or arbitrary world objects along with repeating unit road segment.'},
 'mirrors':[{'mesh':'drive_mirror_'+side,'center':list(mirror_at(sign)),'normal':[0,0,1],'size':[.127,.197],'uv':[0,0,1,1],'rearLookDirection':[0,0,1]}for side,sign in [('left',-1),('right',1)]],
 'recorder':{'bodyMesh':'drive_recorder_body','cradleMesh':'drive_recorder_cradle','readoutMesh':'drive_recorder_readout','center':[-.18,1.115,-.34],'tiltX':-.55,'dimensions':[W,H,D],'readoutLocalCenter':[0,H/2-195.5*W/736,RECORDER_READOUT_Z],'readoutSize':[666*W/736,239*W/736],'uv':[0,0,1,1],'normal':[0,0,1],'artworkPixels':[666,239]},
 'parts':rows,'triangles':sum(r['triangles']for r in rows),'materials':len(M),'textures':7,
 'sha256':hashlib.sha256(open(path,'rb').read()).hexdigest()}
receipt['cabinRevision']='transit-'+'mk3'
receipt['preservedNonCabin']=preserved_non_cabin
receipt['cabinConstruction']={'units':'metres','features':cabin_features}
receipt['radioConstruction']={'units':'metres','features':radio_features}
json.dump(receipt,open(os.path.join(GEO,'metrics.json'),'w'),indent=2)
canonical=os.path.join(ROOT,'public/assets/source-drive');os.makedirs(os.path.join(canonical,'geometry'),exist_ok=True)
shutil.copy2(path,os.path.join(canonical,'drive.glb'))
shutil.copy2(os.path.join(GEO,'metrics.json'),os.path.join(canonical,'geometry/metrics.json'))
print('DRIVE_GEOMETRY '+json.dumps({'variant':'mk3','path':path,'triangles':receipt['triangles'],'cabinTriangles':cabRow['triangles'],'materials':len(M),'sha256':receipt['sha256'],'mount':MOUNT,'body':receipt['body']}))

