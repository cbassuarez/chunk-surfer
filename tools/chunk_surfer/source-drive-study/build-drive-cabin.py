"""One RHD forward-control cabin, isolated Source driving study.
Authored generic geometry; not a claim of a specific vehicle make/year.
Blender: game XYZ metres, forward -Z, converted to glTF Y-up.
Run /Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b --python tools/chunk_surfer/source-drive-study/build-drive-cabin.py
"""
import bpy,bmesh,math,json,os,hashlib,shutil,struct
import numpy as np
from mathutils import Vector,Matrix
from math import sin,cos,pi
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
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

# A complete double-skin lower cabin, with a formed firewall and the actual
# engine access cover between the two seat pedestals. All dimensions in metres.
box('cab floor',(0,.615,-.02),(1.81,.065,2.02),'rubber',.012)
formed('pressed sloping firewall',[(.64,-1.035),(.65,-1.075),(1.15,-1.195),(1.18,-1.155),(1.08,-1.06)],'x',[-.86,.86],'paint',.009)
formed('engine access doghouse',[(.66,-.61),(.77,-.60),(.865,-.40),(.88,.41),(.72,.57),(.65,.57)],'x',[-.19,.19],'dash',.028)
line('engine cover lid gasket',[(-.186,.873,-.36),(-.186,.878,.39),(.186,.878,.39),(.186,.873,-.36)],.005,'rubber',8)
for x in [-.18,.18]:
 box('engine cover captive latch',(x,.815,-.49),(.025,.065,.016),'metal',.006)
for side in [-1,1]:
 # The ribbed floor mat sits within a real pressed footwell, with an outer
 # step and a heel pad; it never extends into the pedal travel envelope.
 box('footwell heel mat',(side*.48,.657,-.34),(.47,.017,.60),'rubber',.021,3)
 for j in range(5):box('moulded footwell mat channel',(side*.48-.19+j*.095,.668,-.32),(.011,.004,.49),'dash',.002)
 box('door threshold step',(side*.835,.662,.10),(.12,.055,1.55),'paint',.014,3)
 box('threshold tread insert',(side*.827,.693,.10),(.083,.012,1.32),'rubber',.007)
 for z in [-.47,.65]:cyl('threshold fixing',(side*.827,.7,z),(side*.827,.704,z),.006,'metal',10)

for side in [-1,1]:
 x=side*.905
 box('outer pressed door shell',(x,.965,-.02),(.055,.65,1.85),'paint',.024,3)
 # The upholstered fibreboard card has a continuous backed edge. Raised
 # painted inner steel around it is visible as a real manufactured assembly.
 box('inner pressed door pan',(side*.865,.995,-.035),(.034,.47,1.61),'paint',.028,4)
 box('door card rolled border',(side*.842,1.007,-.025),(.024,.365,1.36),'dash',.027,4)
 box('door card woven inset',(side*.827,1.015,-.025),(.014,.31,1.28),'felt',.024,4)
 box('door lower kick plate',(side*.848,.79,-.05),(.022,.13,1.45),'rubber',.016,3)
 box('door upper bolster',(side*.857,1.235,-.10),(.072,.095,1.65),'dash',.022,3)
 for z in [-.68,.61]:
  for y in [.875,1.15]:cyl('recessed door card screw',(side*.812,y,z),(side*.807,y,z),.005,'metal',10)
 # Solid escutcheons back the pull and latch, instead of floating hardware.
 box('door pull escutcheon',(side*.814,1.046,-.10),(.018,.075,.31),'rubber',.017,3)
 line('door pull',[(side*.805,1.045,-.23),(side*.777,1.069,-.18),(side*.777,1.069,.00),(side*.805,1.045,.055)],.016,'dash',12)
 box('door latch recess',(side*.811,1.17,-.53),(.018,.062,.14),'rubber',.014,3)
 line('interior release lever',[(side*.796,1.17,-.575),(side*.783,1.175,-.49)],.009,'edge',12)
 cyl('window winder spindle',(side*.814,1.104,.27),(side*.779,1.104,.27),.024,'metal',20)
 line('window crank',[(side*.776,1.104,.27),(side*.770,1.153,.18)],.012,'edge',12)
 cyl('window crank grip',(side*.770,1.153,.18),(side*.745,1.153,.18),.019,'rubber',16)
 # The map pocket has an open mouth and an actual bottom, not a solid plaque.
 box('door pocket back',(side*.818,.897,.40),(.016,.15,.39),'dash',.012,3)
 box('door pocket front',(side*.763,.87,.40),(.018,.095,.39),'dash',.014,3)
 box('door pocket bottom',(side*.791,.825,.40),(.07,.012,.39),'rubber',.005)
 for z in [.207,.593]:box('door pocket end',(side*.791,.87,z),(.07,.095,.016),'dash',.006)
 box('rear pillar',(x,1.75,.79),(.085,1.03,.10),'paint',.018,3)
 line('front pillar',[(side*.83,1.26,-1.20),(side*.85,2.20,-.79)],.047,'paint',14)
 line('front glazing gasket',[(side*.79,1.30,-1.17),(side*.81,2.16,-.77)],.012,'rubber')
 line('front pillar inner trim',[(side*.852,1.29,-1.174),(side*.872,2.17,-.79)],.025,'dash',12)
 box('side window top',(x,2.205,.08),(.075,.07,1.74),'paint',.018,3)
 box('window sill',(x,1.285,-.10),(.085,.045,1.75),'rubber',.012)
 line('side window aperture seal',[(side*.862,1.313,-1.04),(side*.862,1.313,.725),(side*.862,2.16,.725),(side*.862,2.16,-.76)],.011,'rubber',10)
 line('rear door shut seal',[(side*.852,.72,.735),(side*.852,2.17,.735)],.009,'rubber',10)
 cyl('door lock pin',(side*.868,1.30,.58),(side*.868,1.337,.58),.006,'metal',10)
 cyl('door lock pin cap',(side*.868,1.327,.58),(side*.868,1.342,.58),.009,'rubber',12)
 # External mirrors retain the exact approved housing/face placements.
 line('mirror support',[(x,1.44,-1.05),(side*1.01,1.44,-1.16)],.012,'metal')
 box('mirror housing',(side*1.04,1.47,-1.17),(.16,.24,.10),'rubber',.026,3)
 box('mirror rolled rim',(side*1.04,1.47,-1.115),(.145,.219,.014),'edge',.018,3)
 formed('formed wheel arch interior',[(.64,-.16),(.75,-.16),(.85,.02),(.85,.45),(.74,.64),(.64,.64)],'x',[side*.72,side*.88],'dash',.025)

# Glazing aperture and the wiper plane remain unchanged. Rubber seal sections
# live outside the pane, with steel thickness behind each return.
box('windscreen lower steel',(0,1.245,-1.205),(1.72,.055,.10),'paint',.020,3)
box('windscreen top steel',(0,2.20,-.79),(1.76,.07,.09),'paint',.020,3)
line('windscreen lower gasket',[(-.79,1.287,-1.182),(.79,1.287,-1.182)],.010,'rubber',12)
line('windscreen header gasket',[(-.80,2.177,-.773),(.80,2.177,-.773)],.010,'rubber',12)
box('roof panel',(0,2.255,.09),(1.87,.065,1.80),'paint',.035,3)
formed('curved insulated headliner',[(-.862,2.168),(-.78,2.202),(-.48,2.218),(0,2.224),(.48,2.218),(.78,2.202),(.862,2.168),(.862,2.188),(.78,2.222),(.48,2.238),(0,2.244),(-.48,2.238),(-.78,2.222),(-.862,2.188)],'z',[-.725,.90],'felt',.007)
for side in [-1,1]:
 line('headliner edge binding',[(side*.856,2.171,-.71),(side*.856,2.171,.88)],.008,'rubber',10)
 box('padded sun visor',(side*.435,2.12,-.675),(.54,.10,.036),'felt',.017,4)
 line('visor hinge',[(side*.72,2.17,-.69),(side*.69,2.17,-.66),(side*.28,2.17,-.66)],.007,'metal',12)
 box('visor retaining clip',(side*.20,2.166,-.67),(.026,.028,.036),'ivory',.007,3)
 box('upper belt anchor',(side*.818,1.93,.705),(.052,.075,.025),'rubber',.014,3)
 box('belt inertia reel',(side*.795,.99,.71),(.065,.11,.075),'rubber',.014,3)
 box('parked seatbelt webbing',(side*.806,1.46,.705),(.040,.84,.008),'rubber',.002)
 cyl('belt anchor bolt',(side*.818,1.93,.72),(side*.818,1.93,.732),.009,'metal',12)
box('dome lamp plinth',(0,2.196,.36),(.17,.026,.10),'dash',.016,3)
box('unpowered dome lamp lens',(0,2.178,.36),(.13,.014,.073),'ivory',.014,3)
box('rear bulkhead',(0,1.43,.95),(1.82,1.63,.055),'paint',.020,3)
box('bulkhead lower kick shield',(0,.81,.91),(1.69,.26,.027),'dash',.014,3)
for x in [-.66,-.22,.22,.66]:
 box('bulkhead pressed panel surround',(x,1.53,.913),(.355,1.04,.028),'edge',.021,3)
 box('bulkhead recessed centre',(x,1.53,.892),(.314,.99,.018),'paint',.020,3)
for x in [-.70,.70]:
 box('bulkhead coat hook backing',(x,2.07,.878),(.06,.09,.012),'rubber',.012,3)
 line('folded utility hook',[(x,2.085,.87),(x,2.028,.85),(x,2.028,.81),(x,2.052,.80)],.006,'metal',12)
# A shallow empty document rack is part of the van, not a new story clue.
box('bulkhead document rack back',(-.44,1.19,.86),(.31,.23,.018),'dash',.013,3)
box('bulkhead document rack lip',(-.44,1.11,.80),(.31,.075,.022),'dash',.010,3)
for x in [-.59,-.29]:box('document rack end',(x,1.14,.83),(.015,.13,.08),'dash',.008)
box('document rack floor',(-.44,1.075,.83),(.31,.015,.08),'rubber',.005)

# A continuously formed dash/cowl creates a broad reading surface. The driver
# instruments are recessed into a hollow, deep-backed hood, not a solid block
# intersecting the gauge faces. Gauge centres and moving-needle axes stay fixed.
formed('dashboard upper moulding',[(1.08,-1.15),(1.20,-1.13),(1.23,-.98),(1.22,-.79),(1.17,-.635),(1.10,-.61),(1.06,-.64),(1.13,-.82),(1.12,-1.05)],'x',[-.85,.85],'dash',.012)
box('formed painted fascia',(0,1.045,-.675),(1.70,.255,.105),'paint',.018,3)
box('dashboard padded trailing lip',(0,1.164,-.624),(1.70,.036,.05),'dash',.014,4)
box('dashboard lower rolled return',(0,.918,-.66),(1.65,.042,.17),'dash',.014,3)
box('instrument deep backplate',(.48,1.22,-.659),(.59,.245,.025),'rubber',.024,3)
hood('open instrument hood',[(.166,1.102),(.166,1.274),(.183,1.32),(.222,1.351),(.268,1.36),(.692,1.36),(.738,1.351),(.777,1.32),(.794,1.274),(.794,1.102)],[(.192,1.102),(.192,1.266),(.207,1.299),(.236,1.325),(.271,1.334),(.689,1.334),(.724,1.325),(.753,1.299),(.768,1.266),(.768,1.102)],-.599,-.97,'dash')
box('instrument lower rolled lip',(.48,1.102,-.637),(.58,.025,.075),'dash',.010,3)
for x in [-.51,.46]:
 box('demister vent cartridge',(x,1.23,-1.053),(.49,.019,.057),'rubber',.011,3)
 for j in range(7):box('demister vane',(x-.205+j*.068,1.241,-1.053),(.047,.007,.036),'dash',.004)
for x in [-.75,.79]:
 box('fascia vent recess',(x,1.112,-.613),(.13,.067,.022),'rubber',.011,3)
 for j in range(3):box('fascia air vane',(x,1.092+j*.019,-.598),(.104,.005,.014),'dash',.002)
box('glovebox gasket',(-.50,1.052,-.616),(.535,.174,.015),'rubber',.018,3)
box('pressed glovebox lid',(-.50,1.052,-.601),(.512,.15,.018),'paint',.014,3)
box('glovebox latch recess',(-.50,1.093,-.589),(.096,.031,.007),'rubber',.007)
box('glovebox finger latch',(-.50,1.096,-.582),(.073,.012,.014),'edge',.004)
for x in [-.70,-.30]:cyl('glovebox hinge',(x-.025,.971,-.602),(x+.025,.971,-.602),.006,'metal',12)
# A bolted folded-steel equipment bridge is tied into the fascia. Its tray
# supports the receiver sleeve and recorder cradle without moving a control.
box('receiver rear mounting block',(.025,1.10,-.602),(.238,.105,.046),'rubber',.009,3)
box('equipment shelf',(-.11,1.009,-.462),(.47,.024,.33),'paint',.010,3)
box('equipment shelf rubber liner',(-.11,1.023,-.455),(.435,.005,.285),'rubber',.007,3)
for x in [-.315,.095]:
 formed('folded equipment shelf bracket',[(.947,-.64),(1.00,-.64),(1.01,-.32),(.985,-.32)],'x',[x-.010,x+.010],'metal',.006)
 cyl('equipment shelf bolt',(x,1.023,-.585),(x,1.029,-.585),.006,'metal',12)
# Analog gauges physically face toward the driver (+Z), unchanged in position.
for cx,rad in [(.48,.091),(.66,.050),(.30,.050)]:
 cyl('instrument plated bezel',(cx,1.207,-.649),(cx,1.207,-.635),rad,'metal',32)
 cyl('instrument dark dial',(cx,1.207,-.635),(cx,1.207,-.632),rad*.88,'rubber',32)
 for i in range(13):
  a=(-.72+i/12*1.44)*pi;rr=rad*.76;x=cx+sin(a)*rr;y=1.207+cos(a)*rr
  cyl('dial painted tick',(x,y,-.629),(cx+sin(a)*(rr-.008),1.207+cos(a)*(rr-.008),-.629),.0018,'ivory',6)
 if rad<.08:line('fuel temperature resting needle',[(cx,1.207,-.626),(cx-rad*.48,1.207+rad*.32,-.626)],.0024,'amber',6)
 cyl('needle hub',(cx,1.207,-.629),(cx,1.207,-.623),.008,'metal',12)
# Proper cushions, reclining backs, exposed runners and belts retain the eye
# height and useful two-person passenger space. No dummy body fills the seat.
for sx in [-.46,.48]:
 box('seat pedestal',(sx,.75,.39),(.54,.23,.63),'paint',.025,3)
 for dx in [-.19,.19]:
  box('seat sliding runner',(sx+dx,.876,.34),(.026,.039,.60),'metal',.008)
 upholstered(sx,'cushion');upholstered(sx,'back')
 line('seat adjustment handle',[(sx-.22,.877,.12),(sx-.22,.849,.06),(sx+.15,.849,.06)],.008,'metal',12)
 box('seatbelt buckle stalk',(sx+(.285 if sx<0 else -.285),.965,.43),(.026,.11,.025),'rubber',.008)
 box('seatbelt buckle',(sx+(.285 if sx<0 else -.285),1.022,.43),(.042,.052,.031),'rubber',.010,3)
 box('buckle release pad',(sx+(.285 if sx<0 else -.285),1.047,.43),(.026,.005,.019),'amber',.004)
# Column, pedal pivots and gear control preserve original contact geometry.
cyl('steering column',(.48,.83,-.63),(.48,1.20,-.39),.027,'rubber',20)
cyl('column cast shroud',(.48,1.10,-.457),(.48,1.177,-.407),.049,'dash',24)
line('indicator stalk',[(.45,1.135,-.473),(.345,1.143,-.492)],.006,'metal',12)
cyl('indicator grip',(.345,1.143,-.492),(.318,1.143,-.498),.012,'rubber',16)
for x in [.34,.47,.67]:
 cyl('pedal stalk',(x,.68,-.57),(x,.76,-.76),.012,'metal',10)
 box('ribbed pedal',(x,.765,-.76),(.075,.026,.11),'rubber',.009)
 for j in range(3):box('pedal groove',(x-.024+j*.024,.78,-.76),(.003,.003,.085),'edge',.001)
line('gear lever',[(.02,.67,.03),(.02,.91,-.02),(-.02,1.00,-.06)],.012,'metal',14)
for i in range(4):box('gear lever gaiter fold',(.02,.885+i*.012,-.015),(.09-i*.014,.012,.085-i*.013),'rubber',.008,3)
bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=.038,location=B((-.02,1.00,-.06)));add(bpy.context.object,'rubber')
for face in bpy.context.object.data.polygons:face.use_smooth=True
for x in [-.73,-.10,.77]:cyl('fascia screw',(x,1.078,-.595),(x,1.078,-.581),.006,'metal',10)
# Backed heater cartridge below the glovebox: channels, lever shafts and solid
# thumb pads are separate physical pieces; no new interaction is introduced.
box('heater control cartridge',(-.49,.941,-.585),(.35,.070,.064),'rubber',.009,3)
for bottom,top in [(.9125,.927),(.935,.947),(.955,.9695)]:
 box('heater control stamped face web',(-.49,(bottom+top)/2,-.550),(.333,top-bottom,.010),'metal',.0015,2)
for x in [-.635,-.345]:box('heater control aperture end return',(x,.941,-.550),(.043,.057,.010),'metal',.002,2)
for row,y in enumerate([.951,.931]):
 box('heater lever slot',(-.49,y,-.551),(.247,.008,.002),'rubber',.001,2)
 x=[-.543,-.430][row]
 cyl('heater slide lever',(x,y,-.552),(x,y,-.526),.003,'edge',10)
 box('heater thumb pad',(x,y,-.521),(.026,.012,.012),'dash',.003,2)
 for tick in range(6):box('heater scale painted block',(-.609+tick*.047,y+.0068,-.544),(.010,.0022,.0012),'ivory',0)
for x in [-.643,-.337]:cyl('heater cartridge screw',(x,.941,-.544),(x,.941,-.541),.0032,'edge',10)
# Sparse filled contact wear follows handling and loading. Panel centres remain
# intact; these marks are substrate exposure, not an all-over grunge overlay.
for side in [-1,1]:
 box('polished armrest contact',(side*.819,1.266,-.12),(.018,.004,.23),'edge',.001,2)
 for i in range(3):
  z=-.12+i*.18
  mesh('threshold rubbed enamel',[(side*.850,.695,z-.042),(side*.805,.695,z-.024),(side*.815,.695,z+.035),(side*.851,.695,z+.021)],[(0,1,2,3)],'edge')
for x,z in [(-.261,-.405),(-.095,-.377),(.064,-.487)]:
 mesh('equipment tray contact paint loss',[(x-.018,1.026,z-.007),(x+.031,1.026,z-.005),(x+.019,1.026,z+.008),(x-.023,1.026,z+.005)],[(0,1,2,3)],'edge')
# Opaque painted numerals follow the gauge's actual circular construction.
def lettering(value,p,size=.008,material='ivory',align='CENTER'):
 curve=bpy.data.curves.new('physical painted legend','FONT');curve.body=value;curve.size=size;curve.align_x=align;curve.align_y='CENTER';curve.extrude=.00012;curve.resolution_u=2
 font='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
 if os.path.exists(font):curve.font=bpy.data.fonts.load(font,check_existing=True)
 ob=bpy.data.objects.new('painted '+value,curve);bpy.context.collection.objects.link(ob);ob.location=B(p);ob.rotation_euler=(pi/2,0,0);bpy.context.view_layer.objects.active=ob;ob.select_set(True);bpy.ops.object.convert(target='MESH');ob=bpy.context.object;ob.data.materials.append(M[material]);part.append(ob);ob.select_set(False);return ob
for i in range(7):
 a=(-.72+i/6*1.44)*pi;lettering(str(i*30),(.48+sin(a)*.056,1.207+cos(a)*.056,-.625),.0078)
lettering('km/h',(.48,1.176,-.624),.0067)
lettering('F',(.66,1.202,-.624),.006);lettering('TEMP',(.30,1.202,-.624),.0054)
lettering('HEAT',(-.624,.962,-.543),.0046,'ivory',align='LEFT')
lettering('SCREEN',(-.624,.923,-.543),.0038,'ivory',align='LEFT')
join('drive_cabin')
# Actual speed state belongs to a separate animated material needle. Local +Y at zero rotation.
line('speed pointer',[(0,-.011,0),(0,.068,0)],.0024,'amber',8)
cyl('speed pointer cap',(0,0,-.003),(0,0,.003),.006,'metal',12)
join('drive_speed_needle')
# Wheel local origin in XY plane: caller mounts at wheelCenter with tiltX −0.36.
N=80;S=12;r=.195;tube=.018;vs=[];fs=[]
for i in range(N):
 a=i/N*2*pi
 for j in range(S):
  b=j/S*2*pi;vs.append(((r+tube*cos(b))*cos(a),(r+tube*cos(b))*sin(a),tube*sin(b)))
for i in range(N):
 for j in range(S):fs.append((i*S+j,((i+1)%N)*S+j,((i+1)%N)*S+(j+1)%S,i*S+(j+1)%S))
o=mesh('wheel formed rim',vs,fs,'rubber')
for p in o.data.polygons:p.use_smooth=True
for a in [pi/2,pi*7/6,pi*11/6]:
 line('steering spoke',[(cos(a)*.038,sin(a)*.038,0),(cos(a)*.165,sin(a)*.165,0)],.012,'dash',12)
cyl('wheel hub',(0,0,-.024),(0,0,.024),.050,'dash',32);cyl('horn cap',(0,0,.024),(0,0,.033),.033,'paint',24)
# Thumb saddles and subtle moulding seam are contact cues, not decorative rings.
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
# Coherent exterior at vehicle CG: the cabin mounts 1.6m forward.
cargo=box('cargo main shell',(0,1.46,1.0),(2.01,2.02,3.1),'paint',.10,5)
# Rear wheel opening is real silhouette depth, not a black circle on a solid side.
cut=cyl('rear wheel opening cutter',(-1.5,.34,1.75),(1.5,.34,1.75),.415,'metal',48)
part.remove(cut);bpy.context.view_layer.objects.active=cargo;mod=cargo.modifiers.new('formed rear wheel arch','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cut;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cut,do_unlink=True)
box('cargo high roof',(0,2.49,1.0),(2.04,.11,3.1),'paint',.07,4)
for side in [-1,1]:
 box('cargo belt pressing',(side*1.013,1.16,1.0),(.025,.065,2.95),'edge',.008)
 box('cargo recessed panel',(side*1.017,1.76,1.0),(.012,.99,2.65),'paint',.03,3)
box('pressed front nose',(0,.99,-2.96),(1.86,.65,.42),'paint',.065,5)
box('lower front bumper',(0,.51,-3.19),(2.08,.115,.13),'rubber',.028,3)
box('front grille',(0,.91,-3.177),(.75,.18,.02),'rubber',.018,3)
for side in [-1,1]:
 box('headlamp plated rim',(side*.66,1.02,-3.183),(.31,.20,.020),'edge',.022,3)
 box('headlamp face',(side*.66,1.02,-3.196),(.27,.16,.010),'headlamp',.015,3)
 box('rear lamp',(side*.88,1.04,2.56),(.13,.24,.02),'red',.018,3)
join('drive_vehicle_body')
cyl('tyre',(-.105,0,0),(.105,0,0),.34,'rubber',40)
for side in [-1,1]:
 cyl('wheel rim',(side*.105,0,0),(side*.113,0,0),.215,'edge',32)
 cyl('wheel hub',(side*.113,0,0),(side*.132,0,0),.089,'metal',24)
 for i in range(6):
  a=i/6*2*pi;cyl('wheel fixing',(side*.132,.129*sin(a),.129*cos(a)),(side*.138,.129*sin(a),.129*cos(a)),.010,'metal',10)
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
  if mesh['name'] in ['drive_cabin','drive_radio']:continue
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
receipt={'schema':1,'kind':'source-drive-isolated-geometry','units':'metres','forward':[0,0,-1],'vehicle':'generic RHD forward-control van proposal; make and year unspecified','cabinBodyMount':[0,0,-1.6],'body':{'width':2.08,'height':2.57,'length':5.75,'min':[-1.04,.0,-3.25],'max':[1.04,2.57,2.55],'frontAxleZ':-1.35,'rearAxleZ':1.75,'track':1.68,'wheelRadius':.34,'headlamps':[[-.66,1.02,-3.215],[.66,1.02,-3.215]]},'eye':[.48,1.65,.20],'eyePitch':-.04,'wheel':{'mesh':'drive_wheel','center':[.48,1.20,-.39],'tiltX':-.36,'radius':.195,'rimTubeRadius':.018},'wiper':{'mesh':'drive_wiper','pivot':[-.52,1.30,-1.17],'normal':[0,-sin(.435),cos(.435)],'tiltX':.435,'sweepRadians':[-.72,.72]},'speedNeedle':{'mesh':'drive_speed_needle','center':[.48,1.207,-.626],'normal':[0,0,1],'localPointerAxis':[0,1,0],'speedKmhRange':[0,180],'rotationZAtMin':.72*pi,'rotationZAtMax':-.72*pi},'radioNeedle':{'mesh':'drive_radio_needle','center':[.05468,1.11344,-.396],'translationAxis':[1,0,0],'xRange':[-.0422,.09332]},'radioFace':{'mesh':'drive_radio','center':[.025,1.10,-.395],'bounds':{'min':[-.08532,1.05632,-.40],'max':[.13532,1.14368,-.36]},'normal':[0,0,1]},'dashboard':{'topY':1.23,'frontZ':-.615},'windscreenOpening':{'left':-.79,'right':.79,'bottomY':1.30,'topY':2.16,'bottomZ':-1.17,'topZ':-.77},'road':{'mesh':'drive_road','length':1,'width':6.5,'shoulderWidth':1.6,'topY':0,'note':'Do not scale cabin or arbitrary world objects along with repeating unit road segment.'},'mirrors':[{'mesh':'drive_mirror_'+side,'center':[sign*1.04,1.47,-1.105],'normal':[0,0,1],'size':[.127,.197],'uv':[0,0,1,1],'rearLookDirection':[0,0,1]}for side,sign in [('left',-1),('right',1)]],'recorder':{'bodyMesh':'drive_recorder_body','cradleMesh':'drive_recorder_cradle','readoutMesh':'drive_recorder_readout','center':[-.18,1.115,-.34],'tiltX':-.55,'dimensions':[W,H,D],'readoutLocalCenter':[0,H/2-195.5*W/736,RECORDER_READOUT_Z],'readoutSize':[666*W/736,239*W/736],'uv':[0,0,1,1],'normal':[0,0,1],'artworkPixels':[666,239]},'parts':rows,'triangles':sum(r['triangles']for r in rows),'materials':len(M),'textures':6,'notes':['All materials opaque. Windscreen/side windows are genuine openings; glass response not proven.','No people or placeholder hands. Camera/seat/steering reach require native review.','Speed needle and radio needle are independent meshes for actual runtime state; fuel/temperature needles remain fixed inspection geometry.','Independent UV mirror faces need actual rearward rendering; silver material alone is not a reflection.'],'sha256':hashlib.sha256(open(path,'rb').read()).hexdigest()}
receipt['cabinRevision']='formed-working-van-v3'
receipt['preservedNonCabin']=preserved_non_cabin
receipt['cabinConstruction']={'units':'metres','shell':'double-skin lower doors, pressed firewall and threshold; open exact glazing aperture','dashboard':'closed formed upper shell, hollow backed instrument hood and bolted equipment shelf','trim':'backed fibreboard door cards, open pockets, curved insulated headliner, padded visors','seating':'shaped sagging vinyl cushions and reclining backs, separate runners and parked belt hardware','features':cabin_features,'pending':'Actual final-render cabin lighting, moving hand clearance and human material recognition require native inspection.'}
receipt['radioConstruction']={'units':'metres','case':'backed sleeve overlapping fascia mount, rubber isolation feet on existing equipment shelf, folded support cleats','face':'solid enamel fascia, ivory scale enamel behind independent moving pointer, solid metal perimeter','presets':'three spring sleeves and caps at the exact three operative reach coordinates; rest contact z=-.379, available stem depth .009','power':'solid central contact face at unchanged [-.065,1.10,-.360], shaft and collared grip','features':radio_features,'pending':'Actual moving hand contact, radio scale stability and recognition require native inspection.'}
receipt['notes']=['All built materials remain opaque; the shared runtime owns the preserved windscreen/side-glass and actual mirror reflection.','Eye, wheel/rim, wiper, speed and radio needle, recorder readout and control locations are unchanged.','All meshes except cabin and radio preserve exact accessor bytes and material channels from the saved before asset.','Broad opaque cabin-only material values establish the fascia and trim hierarchy without altering the final dither or world stocks.']
json.dump(receipt,open(os.path.join(GEO,'metrics.json'),'w'),indent=2)
canonical=os.path.join(ROOT,'public/assets/source-drive');os.makedirs(os.path.join(canonical,'geometry'),exist_ok=True)
shutil.copy2(path,os.path.join(canonical,'drive.glb'))
shutil.copy2(os.path.join(GEO,'metrics.json'),os.path.join(canonical,'geometry/metrics.json'))
print('DRIVE_GEOMETRY '+json.dumps({'path':path,'triangles':receipt['triangles'],'materials':len(M),'parts':len(rows),'sha256':receipt['sha256']}))
