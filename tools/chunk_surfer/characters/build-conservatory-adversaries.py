"""Build the two selected conservatory adversaries from the retained CC0 anatomy.

Run once for each --kind costume / held with Blender 4.5. The existing Wrong Fold
source supplies the detailed face, hands, clothing topology, UVs, rig and four
correctives. Everything added here is project-native geometry. The game owns
root movement and the precise live performance; the GLB owns skin deformation.
"""
import bpy
import hashlib
import json
import math
import os
import struct
import sys
import gzip
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KIND = ARGS[ARGS.index('--kind') + 1] if '--kind' in ARGS else 'costume'
if KIND not in ('costume', 'held'):
    raise ValueError('Expected --kind costume or held')
SOURCE = os.path.join(ROOT, 'assets/source/outskirts-characters.blend')
SLUG = 'costume-exchange' if KIND == 'costume' else 'held-note'
OUT = os.path.join(ROOT, 'public/assets', SLUG + '.glb')
BLEND = os.path.join(ROOT, 'assets/source', SLUG + '.blend')
META = os.path.join(ROOT, 'public/assets', SLUG)
os.makedirs(META, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=SOURCE)
arm = bpy.data.objects['outskirts_anatomy']
features = bpy.data.objects['outskirts_fold_guard']
features.name = 'costume_exchange_features' if KIND == 'costume' else 'held_note_features'
features.data.name = features.name
bpy.data.objects.remove(bpy.data.objects['outskirts_overprint_body'], do_unlink=True)
arm.name = SLUG.replace('-', '_') + '_anatomy'

# The Wrong Fold source is a full anatomical hm08 fit beneath a formal suit,
# with concealed skin faces removed by the suit mask. Rebuild that retained
# CC0 skin surface in the exact bind pose and keep only its sculpted eyes and
# hair from the old mesh. This avoids both a faceted proxy body and a visible
# office suit under the impossible costume/wing-root anatomy.
features.shape_key_clear()
import bmesh
bm=bmesh.new();bm.from_mesh(features.data)
keep={'anatomical_eyes','short_hair'} if KIND=='costume' else {'anatomical_eyes'}
removed=[face for face in bm.faces if features.data.materials[face.material_index].name not in keep]
bmesh.ops.delete(bm,geom=removed,context='FACES');bm.to_mesh(features.data);bm.free()

mh_dir=os.path.join(ROOT,'tools/chunk_surfer/character-sources/makehuman')
vertices=[];texcoords=[];body_faces=[];body_uv=[];group=''
for row in open(os.path.join(mh_dir,'base.obj')):
    tok=row.split()
    if not tok:continue
    if tok[0]=='v':vertices.append(list(map(float,tok[1:4])))
    elif tok[0]=='vt':texcoords.append(list(map(float,tok[1:3])))
    elif tok[0]=='g':group=tok[1]
    elif tok[0]=='f' and group=='body':
        body_faces.append([int(part.split('/')[0])-1 for part in tok[1:]])
        body_uv.append([int(part.split('/')[1])-1 for part in tok[1:]])
vertices=np.array(vertices,dtype=np.float64)
for age,weight in (('old',.52),('young',.48)):
    for prefix in ('caucasian-male-','universal-male-'):
        filename=prefix+age+('-averagemuscle-averageweight' if prefix.startswith('universal') else '')+'.target.gz'
        for row in gzip.open(os.path.join(mh_dir,filename),'rt'):
            tok=row.split()
            if len(tok)==4:vertices[int(tok[0])]+=np.array(list(map(float,tok[1:])))*weight
ids=sorted(set(index for face in body_faces for index in face))
low=vertices[ids,1].min();scale=1.82/(vertices[ids,1].max()-low)
fitted=np.stack((vertices[:,0]*scale,(vertices[:,1]-low)*scale,-vertices[:,2]*scale),axis=1)
remap={old:index for index,old in enumerate(ids)}
skin=bpy.data.meshes.new('retained hm08 full skin')
skin.from_pydata([Vector((fitted[i,0],-fitted[i,2],fitted[i,1])) for i in ids],[],[tuple(remap[i] for i in face) for face in body_faces])
skin.update()
skin.materials.append(bpy.data.materials['skin_guard'])
uv_layer=skin.uv_layers.new(name='UVMap')
for poly,face in zip(skin.polygons,body_uv):
    poly.use_smooth=True
    for loop_index,uv_index in zip(poly.loop_indices,face):uv_layer.data[loop_index].uv=texcoords[uv_index]
body=bpy.data.objects.new('costume_exchange_body' if KIND=='costume' else 'held_note_body',skin)
skin.name=body.name
bpy.context.collection.objects.link(body)

def compact_bone(name):
    if name in ('root','spine05') or name.startswith('pelvis.'):return 'pelvis'
    if name.startswith('spine'):return {'spine04':'spine_lower','spine03':'spine_mid','spine02':'spine_upper','spine01':'chest'}[name]
    if name.startswith('neck'):return 'neck'
    if name=='jaw' or name.startswith('tongue') or name in ('oris01','special04') or name.startswith('oris07.'):return 'jaw'
    if name.startswith('breast.'):return 'chest'
    side='R' if name.endswith('.L') else 'L'
    stem=name.split('.')[0]
    for prefix,target in (('clavicle','clavicle'),('shoulder','clavicle'),('upperarm','upperarm'),('lowerarm','forearm'),('upperleg','thigh'),('lowerleg','shin'),('wrist','hand'),('metacarpal','hand'),('foot','foot'),('toe','toe')):
        if stem.startswith(prefix):return target+'_'+side
    if stem.startswith('finger'):return ('thumb','index','middle','ring','little')[int(stem[6])-1]+'_'+side
    return 'head'
weights=json.load(open(os.path.join(mh_dir,'default_weights.mhw')))['weights']
rows=[{} for _ in vertices]
for source,entries in weights.items():
    target=compact_bone(source)
    for index,weight in entries:rows[index][target]=rows[index].get(target,0)+weight
groups={name:body.vertex_groups.new(name=name) for name in sorted({name for index in ids for name in rows[index]})}
for vertex_index,source_index in enumerate(ids):
    total=sum(rows[source_index].values()) or 1
    for name,weight in rows[source_index].items():groups[name].add([vertex_index],weight/total,'REPLACE')
for obj in (body,features):
    if not any(mod.type=='ARMATURE' for mod in obj.modifiers):
        mod=obj.modifiers.new('anatomical skin','ARMATURE');mod.object=arm
    obj.parent=arm
pieces = [body,features]

if KIND == 'costume':
    # The person's actual scalp divides along its sagittal line. Each hair-
    # bearing hemisphere remains joined to the face at a temple; neither half
    # is an upper lid or a box-shaped replacement for the skull.
    crown_seam = 1.735
    def crown_half(source, name, side):
        copy=source.copy()
        copy.data=source.data.copy()
        bpy.context.collection.objects.link(copy)
        copy.name=name;copy.data.name=name
        bm=bmesh.new();bm.from_mesh(copy.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(0,0,crown_seam),plane_no=(0,0,1),
            clear_inner=True,dist=1e-6)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(0,0,0),plane_no=(1,0,0),
            clear_inner=side>0,clear_outer=side<0,dist=1e-6)
        bm.to_mesh(copy.data);bm.free();copy.data.update()
        return copy
    def remove_crown(source):
        bm=bmesh.new();bm.from_mesh(source.data)
        bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),
            plane_co=(0,0,crown_seam),plane_no=(0,0,1),
            clear_outer=True,dist=1e-6)
        bm.to_mesh(source.data);bm.free();source.data.update()
    active_head_pieces=[features]
    for side,label in ((-1,'left'),(1,'right')):
        for source,surface_name in ((body,'skin'),(features,'hair')):
            cap=crown_half(source,f'exchange {label} cranial {surface_name}',side)
            for group in list(cap.vertex_groups):cap.vertex_groups.remove(group)
            group=cap.vertex_groups.new(name=f'crown_{label}')
            group.add(list(range(len(cap.data.vertices))),1.0,'REPLACE')
            pieces.append(cap);active_head_pieces.append(cap)
    remove_crown(body);remove_crown(features)
    bpy.context.view_layer.objects.active=arm
    bpy.ops.object.mode_set(mode='EDIT')
    for side,label in ((-1,'left'),(1,'right')):
        crown=arm.data.edit_bones.new(f'crown_{label}')
        crown.head=Vector((side*.076,-.048,1.735))
        crown.tail=Vector((side*.076,-.048,1.835))
        crown.parent=arm.data.edit_bones['head']
    bpy.ops.object.mode_set(mode='OBJECT')

def B(p):
    """Game metres (x, up, forward -z) to Blender metres (x, -z, up)."""
    return Vector((p[0], -p[2], p[1]))

def material(name, color, roughness=.69, metal=.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    node = m.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, 1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metal
    return m

def textured(name, color, *, weave=False, wet=False):
    m=material(name,color,.88 if weave else .47)
    size=512
    y,x=np.mgrid[:size,:size]
    rng=np.random.default_rng(1015 if weave else 1411)
    grain=rng.normal(0,.023 if weave else .014,(size,size))
    pattern=(np.sin(x*math.pi*.64)*np.sin(y*math.pi*.67)*.026 if weave
             else np.sin(x*.048+y*.063)*np.sin(y*.11-x*.021)*.024)
    broad=np.sin(x*.019+y*.013)*np.sin(y*.037-x*.014)*(.045 if weave else .027)
    stains=np.maximum(0,np.sin(x*.035+y*.027)*np.sin(y*.031))**4*(.055 if weave else .04)
    rgb=np.clip(np.array(color)[None,None,:]+(grain+pattern+broad-stains)[:,:,None],.005,.91)
    rgba=np.concatenate((rgb,np.ones((size,size,1))),axis=2).astype(np.float32)
    image=bpy.data.images.new(name+' albedo',width=size,height=size,alpha=True)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw=os.path.join(META,name.replace(' ','-')+'.png')
    image.file_format='PNG';image.save()
    principled=m.node_tree.nodes.get('Principled BSDF')
    node=m.node_tree.nodes.new('ShaderNodeTexImage');node.image=image
    m.node_tree.links.new(node.outputs['Color'],principled.inputs['Base Color'])
    if wet:principled.inputs['Coat Weight'].default_value=.28
    return m

if KIND == 'costume':
    cloth = textured('exchange oxblood wool', (.23, .034, .038), weave=True)
    lining = textured('exchange stained lining', (.48, .095, .10), weave=True)
    tissue = textured('exchange fascia', (.33, .032, .039), wet=True)
    bone = material('exchange exposed suture', (.49, .37, .31), .73)
    mouth_dark = material('exchange cranial throat', (.055, .008, .012), .51)
    mouth_wet = textured('exchange cranial membrane', (.31, .026, .037), wet=True)
    tooth = material('exchange cranial enamel', (.69, .59, .47), .43)
else:
    feather = textured('held chalk feathers', (.68, .66, .57), weave=True)
    feather_dark = textured('held ash feathers', (.37, .37, .34), weave=True)
    tissue = textured('held opened fascia', (.37, .045, .048), wet=True)
    bone = material('held exposed ribs', (.77, .70, .60), .72)
    gold = material('held tarnished bronze', (.38, .25, .11), .37, .56)
    eye = material('held enamel sclera', (.70, .67, .56), .34)
    pupil = material('held inset pupils', (.023, .018, .016), .24)

def weighted_mesh(name, verts, faces, mat, groups, *, double=False):
    if double:
        faces = list(faces) + [tuple(reversed(face)) for face in faces]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([B(p) for p in verts], [], faces)
    mesh.update()
    mesh.materials.append(mat)
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    names = sorted(set(k for row in groups for k in row))
    vgroups = {name: obj.vertex_groups.new(name=name) for name in names}
    for i, row in enumerate(groups):
        total = sum(row.values()) or 1
        for key, weight in row.items():
            if weight > 0:
                vgroups[key].add([i], weight / total, 'REPLACE')
    mod = obj.modifiers.new('anatomical skin', 'ARMATURE')
    mod.object = arm
    obj.parent = arm
    pieces.append(obj)
    return obj

def tube(name, points, radii, mat, group, sides=9):
    verts, faces, groups = [], [], []
    for index, center in enumerate(points):
        c = Vector(center)
        before = Vector(points[max(0, index - 1)])
        after = Vector(points[min(len(points) - 1, index + 1)])
        tangent = (after - before).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < .91 else Vector((0, 1, 0))
        side = tangent.cross(reference).normalized()
        up = tangent.cross(side).normalized()
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            point = c + radii[index] * (math.cos(angle) * side + math.sin(angle) * up)
            verts.append(tuple(point))
            groups.append({group: 1})
        if index:
            first = (index - 1) * sides
            second = index * sides
            for k in range(sides):
                next_k = (k + 1) % sides
                faces.append((first+k, first+next_k, second+next_k, second+k))
    return weighted_mesh(name, verts, faces, mat, groups)

def surface(name, rows, cols, position, weights, mat, double=True):
    verts = [position(i/(cols-1), j/(rows-1)) for j in range(rows) for i in range(cols)]
    groups = [weights(i/(cols-1), j/(rows-1)) for j in range(rows) for i in range(cols)]
    faces = []
    for j in range(rows-1):
        for i in range(cols-1):
            a = j*cols+i
            faces.extend(((a,a+1,a+cols+1),(a,a+cols+1,a+cols)))
    obj=weighted_mesh(name, verts, faces, mat, groups, double=double)
    layer=obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        for loop_index in face.loop_indices:
            vertex_index=obj.data.loops[loop_index].vertex_index
            layer.data[loop_index].uv=(vertex_index%cols/(cols-1),vertex_index//cols/(rows-1))
    return obj

def sphere(name, center, scale, mat, group, rings=9, sides=14):
    verts, faces = [], []
    for j in range(rings+1):
        phi = math.pi*j/rings
        for k in range(sides):
            theta = 2*math.pi*k/sides
            verts.append((center[0]+scale[0]*math.sin(phi)*math.cos(theta),
                          center[1]+scale[1]*math.cos(phi),
                          center[2]+scale[2]*math.sin(phi)*math.sin(theta)))
    for j in range(rings):
        for k in range(sides):
            a=j*sides+k; b=j*sides+(k+1)%sides
            faces.append((a,b,b+sides,a+sides))
    return weighted_mesh(name, verts, faces, mat, [{group:1} for _ in verts])

if KIND == 'costume':
    # The mouth is a longitudinal fissure through the brain's two hemispheres.
    # Its dark bed remains in the lower head; wet inner surfaces, tissue folds
    # and enamel travel with the split scalp. The original face stays below it.
    def fissure_z(v):return -.156+.208*v
    def fissure_width(v):return .046*(.40+.60*math.sin(math.pi*v)**.65)
    def crown_height(v):return 1.773+.046*math.sin(math.pi*v)**.7
    active_head_pieces.append(surface('exchange sagittal cranial throat',31,19,
        lambda u,v:((u-.5)*2*fissure_width(v),
                    1.733-.078*(1-abs(2*u-1))**1.5-.006*math.sin(math.pi*v)**2,
                    fissure_z(v)),
        lambda u,v:{'head':1},mouth_dark,double=False))
    for side,label in ((-1,'left'),(1,'right')):
        group=f'crown_{label}'
        active_head_pieces.append(surface(f'exchange {label} subcortical cut wall',31,13,
            lambda u,v,s=side:(s*(.002+.004*u+.0035*u*math.sin(v*23+u*11)),
                                 1.738+u*(crown_height(v)-1.740)+.0025*u*math.sin(v*31+u*7),
                                 fissure_z(v)),
            lambda u,v,g=group:{g:1},mouth_wet,double=False))
        lip=[(side*.0045,crown_height(i/32)-.006+.002*math.sin(i*.74),fissure_z(i/32))
             for i in range(33)]
        active_head_pieces.append(tube(f'exchange {label} cranial lip',lip,
            [.0068]*len(lip),tissue,group,10))
        # Cut gyri climb each living fissure wall. Their irregular crosswise
        # folds make the inside read as a split brain, not a flat hinged plate.
        for fold in range(5):
            ridge=[(side*(.008+.003*math.sin(i*1.1+fold*1.8)),
                    1.744+(crown_height(i/18)-1.744)*(.16+.15*fold)
                    +.003*math.sin(i*.9+fold*2.1),
                    fissure_z(i/18)) for i in range(19)]
            active_head_pieces.append(tube(f'exchange {label} cranial fold {fold}',ridge,
                [.0038+.002*math.sin(math.pi*i/18) for i in range(19)],
                mouth_wet,group,8))
        for i,v in enumerate((.09,.17,.27,.39,.47,.62,.75,.84,.92)):
            if i==(3 if side<0 else 6):continue
            base=Vector((side*.0045,crown_height(v)-.005+.002*math.sin(i*2.2),fissure_z(v)))
            length=.010+.009*((i*3+1)%5)/4
            tip=base+Vector((-side*length,-.003 if i%3 else .002,
                             .004*math.sin(i*1.7)))
            active_head_pieces.append(tube(f'exchange {label} fissure tooth {i}',
                [tuple(base),tuple(base.lerp(tip,.55)),tuple(tip)],
                [.0058,.0046,.0005],tooth,group,8))
        for edge,z in enumerate((-.127,.026)):
            active_head_pieces.append(surface(f'exchange {label} cranial hinge {edge}',11,7,
                lambda u,v,s=side,z=z:(s*(.064+.010*v)+(u-.5)*.018,
                                      1.683+.104*v,z+.018*math.sin(v*math.pi)),
                lambda u,v,g=group:{'head':1-v,g:v},tissue,double=False))
    # Three long tailored panels: the top follows the ribcage; the hem resists
    # because its weights belong to the grounded pelvis. Fold volume comes from
    # actual changing surface normals rather than alpha cards.
    for panel in (0, 1, 2, 3, 4, 8):
        angle=2*math.pi*panel/9
        def drape(u,v,angle=angle,panel=panel):
            width = .18+.36*v
            radial = .245+.24*v+.010*math.sin(u*math.pi*6+panel)
            x = math.cos(angle)*radial + (u-.5)*width*math.cos(angle+math.pi/2)
            z = math.sin(angle)*radial + (u-.5)*width*math.sin(angle+math.pi/2)
            return (x, 1.53-1.49*v+.008*math.sin(u*math.pi*5+v*12), z)
        surface(f'exchange garment panel {panel+1}', 35, 21, drape,
                lambda u,v:{'chest':1-v,'pelvis':v}, lining if panel in (1,2) else cloth)
    surface('exchange bloodied hanging veil', 24, 16,
            lambda u,v:(-.43+(u-.5)*(.14+.09*v)+.018*math.sin(v*23+u*10),1.83-.77*v,
                        -.25-.10*v+.04*math.sin(u*17+v*12)),
            lambda u,v:{'head':1-v,'chest':v}, lining)
    surface('costume_exchange_cover',35,25,
            lambda u,v:((u-.5)*(.50+.75*v)+.012*math.sin(v*19+u*9),1.85-1.72*v,
                        -.30-.08*v+.025*math.sin(u*13+v*17)),
            lambda u,v:{'head':1-v,'chest':v},lining)
    # The old tailor's shoulder piece conceals one half of the adult torso;
    # its other seam is peeled back to reveal actual fascia and skin.
    surface('exchange torn shoulder mantle',24,23,
            lambda u,v:(-.31+(u-.5)*.43,1.54-.44*v,
                        -.20-.11*math.sin(math.pi*u)+.055*v+.02*math.sin(u*19+v*8)),
            lambda u,v:{'chest':1-v,'spine_mid':v},cloth)
    # Half a costume has tightened around the real body. Its open front is a
    # torn diagonal rather than a complete dress or a censoring cloak.
    surface('exchange garment half-front',39,19,
            lambda u,v:(.30+(.12+.23*v)*(u-.5)+.045*math.sin(v*11+u*7),
                        1.48-1.42*v+.028*math.sin(u*16+v*21)*v,
                        -.19-.025*math.sin(v*18+u*6)),
            lambda u,v:{'chest':max(0,1-v*2),'spine_mid':1-abs(v-.45)*2 if .05<v<.95 else 0,
                        'pelvis':max(0,v*2-1)},cloth)
    surface('exchange peeled thorax',27,17,
            lambda u,v:(-.19+.30*v+(u-.5)*(.13+.15*v),1.46-.64*v,
                        -.27-.085*math.sin(math.pi*u)+.012*math.sin(v*17+u*13)),
            lambda u,v:{'chest':1-v,'spine_mid':v},tissue)
    for side in (-1,1):
        for line in range(3):
            tube(f'exchange flank fascia {side} {line}',
                 [(side*(.20+line*.025),1.37,-.19),
                  (side*(.30+line*.025),1.14,-.26),
                  (side*(.27+line*.038),.88,-.30),
                  (side*(.31+line*.042),.58,-.23)],
                 [.018,.028,.021,.004],tissue,'spine_mid',9)
    for index, side in enumerate((-1,1)):
        tube(f'exchange opened shoulder {index}',
             [(side*.19,1.43,-.16),(side*.24,1.38,-.23),(side*.29,1.29,-.30),
              (side*.32,1.13,-.34),(side*.35,1.02,-.36)],
             [.032,.049,.042,.029,.006],tissue,'chest',12)
        for seam in range(3):
            tube(f'exchange fascia strand {index} {seam}',
                 [(side*(.25+seam*.03),1.42,-.14),
                  (side*(.33+seam*.045),1.29,-.22-seam*.025),
                  (side*(.43+seam*.06),1.11,-.29-seam*.035)],
                 [.012,.018,.005],lining,'chest',7)
    for k in range(5):
        tube(f'exchange stitches {k}',
             [(-.28+k*.13,1.32,-.32),(-.27+k*.13,1.28,-.365),(-.26+k*.13,1.24,-.32)],
             [.004,.005,.004],bone,'chest',6)
    body['characterBounds']={'min':[-1.1,-.03,-1.0],'max':[1.1,1.94,.9]}
else:
    # Four distinct faces emerge from one neck and open thorax. The side and
    # lower heads are actual skinned CC0 face surfaces with their own eyes;
    # collapsing them to the same centre read as a single ordinary head.
    head_source = body.data
    face_sites=((-0.72,0.06,0.00,-0.27),(.72,0.06,0.00,.27),(0.02,0.19,-.48,0.0))
    for face_index, (dx,dy,dz,angle) in enumerate(face_sites, start=2):
        duplicate = body.copy()
        duplicate.data = body.data.copy()
        bpy.context.collection.objects.link(duplicate)
        duplicate.name = f'held_note_face_{face_index}'
        duplicate.shape_key_clear()
        bm = bmesh.new(); bm.from_mesh(duplicate.data); bm.faces.ensure_lookup_table()
        keep_names={'skin_guard'}
        remove=[]
        for face in bm.faces:
            center=sum((v.co.z for v in face.verts))/len(face.verts)
            mat_name=duplicate.data.materials[face.material_index].name
            if center<1.50 or mat_name not in keep_names:
                remove.append(face)
        bmesh.ops.delete(bm, geom=remove, context='FACES')
        bm.to_mesh(duplicate.data); bm.free()
        pivot=Vector((0,.12,1.63))
        for vertex in duplicate.data.vertices:
            p=vertex.co-pivot
            x=.97*(p.x*math.cos(angle)-p.y*math.sin(angle))
            y=.97*(p.x*math.sin(angle)+p.y*math.cos(angle))
            vertex.co=pivot+Vector((x+dx,y+dy,.97*p.z+dz))
        duplicate['characterBounds']={'min':[-.5,1.4,-.5],'max':[.5,1.9,.5]}
        pieces.append(duplicate)
        feature_copy=features.copy();feature_copy.data=features.data.copy()
        bpy.context.collection.objects.link(feature_copy)
        feature_copy.name=f'held_note_face_detail_{face_index}'
        for vertex in feature_copy.data.vertices:
            p=vertex.co-pivot
            vertex.co=pivot+Vector((.97*(p.x*math.cos(angle)-p.y*math.sin(angle))+dx,
                                    .97*(p.x*math.sin(angle)+p.y*math.cos(angle))+dy,.97*p.z+dz))
        pieces.append(feature_copy)
    curl_sites=((0,1.76,-.12),(-.72,1.76,-.18),(.72,1.76,-.18),(.02,1.28,-.31))
    for face_index,(cx,cy,cz) in enumerate(curl_sites):
        for curl in range(17):
            angle=2*math.pi*curl/17
            sphere(f'held face {face_index} curl {curl}',
                   (cx+.13*math.cos(angle),cy+.12+.045*math.sin(curl*2.3),cz+.09*math.sin(angle)),
                   (.045,.052,.044),feather if curl%4 else feather_dark,'head',6,8)
    for side in (-1,1):
        for strand in range(4):
            tube(f'held head root fascia {side} {strand}',
                 [(side*(.12+strand*.026),1.40,-.15),
                  (side*(.40+strand*.019),1.58,-.21),
                  (side*(.64+strand*.014),1.70,-.24)],
                 [.027,.035,.007],tissue,'neck',9)
    for strand in range(3):
        tube(f'held lower face root {strand}',
             [(-.10+strand*.10,1.34,-.22),(-.08+strand*.08,1.26,-.31),
              (-.06+strand*.06,1.18,-.36)],
             [.022,.03,.005],tissue,'neck',9)
    # Rib hoops arch over a dark core. The old coat below them is largely
    # gone, while the CC0 hands, neck and faces survive at close range.
    for panel in range(7):
        angle=2*math.pi*panel/7
        surface(f'held lower shroud {panel}',24,15,
                lambda u,v,a=angle:((.22+.09*v)*math.cos(a)+(u-.5)*(.18+.18*v)*math.cos(a+math.pi/2),
                                 1.12-.37*v+.012*math.sin(u*9+v*17),
                                 (.22+.09*v)*math.sin(a)+(u-.5)*(.18+.18*v)*math.sin(a+math.pi/2)),
                lambda u,v:{'pelvis':1-v,'thigh_L':v*.5,'thigh_R':v*.5},feather_dark)
    surface('held open thorax', 24, 18,
            lambda u,v:((u-.5)*.51,1.17+.39*v,
                        -.255-.064*math.sin(u*math.pi)+.018*math.sin(v*33+u*12)),
            lambda u,v:{'spine_mid':1-v,'chest':v}, tissue)
    for rib in range(6):
        height=1.52-rib*.065
        for side in (-1,1):
            tube(f'held exposed rib {rib} {side}',
                 [(0,height,-.34),(side*.105,height-.014,-.365),
                  (side*.235,height-.039,-.29),(side*.34,height-.055,-.11)],
                 [.012,.016,.014,.006],bone,'chest',9)
    for side in (-1,1):
        for face_index in range(3):
            tube(f'held neck union {side} {face_index}',
                 [(side*.08,1.48,-.10),(side*(.11+face_index*.025),1.58,-.07),
                  (side*(.13+face_index*.038),1.71,-.06)],
                 [.035,.025,.007],tissue,'neck',9)
    # Each feather is a tapered double-sided anatomical leaf, never a flat
    # wing-shaped polygon. Four independently weighted wing roots keep the
    # directional handholds legible under torch shadow.
    bpy.context.view_layer.objects.active=arm
    bpy.ops.object.mode_set(mode='EDIT')
    for side, suffix in ((-1,'left'),(1,'right')):
        for level in ('upper','lower'):
            name=f'wing_{level}_{suffix}'
            bone_edit=arm.data.edit_bones.new(name)
            start=(side*.24,1.48,-.08)
            end=(side*(1.66 if level=='upper' else 1.41),
                 2.18 if level=='upper' else 1.05,-.15)
            bone_edit.head=B(start);bone_edit.tail=B(end)
            bone_edit.parent=arm.data.edit_bones['chest']
    wheel_bone=arm.data.edit_bones.new('wheel')
    wheel_bone.head=B((1.62,1.73,-.13));wheel_bone.tail=B((1.62,1.86,-.13))
    wheel_bone.parent=arm.data.edit_bones['pelvis']
    bpy.ops.object.mode_set(mode='OBJECT')
    for side,suffix in ((-1,'left'),(1,'right')):
        for level in ('upper','lower'):
            name=f'wing_{level}_{suffix}'
            direction=Vector((side*(1.43 if level=='upper' else 1.18),
                              .61 if level=='upper' else -.43,-.10))
            start=Vector((side*.24,1.48,-.08))
            for feather_index in range(24):
                frac=feather_index/23
                base=start+direction*(.10+.78*frac)
                length=.33+.28*math.sin(math.pi*frac)
                spread=Vector((side*(.08+.1*frac),-.23 if level=='upper' else -.31,-.045))
                direction_tip=(direction.normalized()*.34+spread.normalized()*.66).normalized()
                width=.065+.033*math.sin(math.pi*frac)
                def feather_point(u,v,base=base,length=length,direction_tip=direction_tip,width=width,frac=frac):
                    center=base+direction_tip*length*v
                    lateral=Vector((-direction_tip.y,direction_tip.x,0)).normalized()
                    return tuple(center+lateral*((u-.5)*2*width*(1-v)**.58)+Vector((0,0,.028*math.sin(v*math.pi+frac*7))))
                surface(f'held {level} {suffix} feather {feather_index}',
                        7,5,feather_point,lambda u,v,n=name:{n:1},
                        feather if feather_index%5 else feather_dark)
            tube(f'held {level} {suffix} bone',
                 [tuple(start),tuple(start+direction*.24),tuple(start+direction*.53),tuple(start+direction*.82),tuple(start+direction)],
                 [.058,.067,.052,.028,.004],bone,name,12)
            tube(f'held {level} {suffix} fascia',
                 [tuple(start+Vector((0,0,-.03))),tuple(start+direction*.11+Vector((0,0,-.045))),
                  tuple(start+direction*.28+Vector((0,0,-.035)))],
                 [.095,.081,.005],tissue,name,12)
    center=Vector((1.62,1.73,-.12))
    for ring_index, axis in enumerate((0,1,2)):
        points=[]
        radius=.54-.035*ring_index
        for i in range(65):
            angle=2*math.pi*i/64
            if axis==0:delta=Vector((radius*math.cos(angle),radius*math.sin(angle),0))
            elif axis==1:delta=Vector((radius*math.cos(angle),0,radius*math.sin(angle)))
            else:delta=Vector((0,radius*math.cos(angle),radius*math.sin(angle)))
            points.append(tuple(center+delta))
        tube(f'held eye wheel ring {ring_index}',points,[.023]*len(points),gold,'wheel',10)
    for index in range(18):
        angle=2*math.pi*index/18
        pos=(center.x+.52*math.cos(angle),center.y+.52*math.sin(angle),center.z-.018)
        sphere(f'held wheel eye {index}',pos,(.062,.044,.027),eye,'wheel',7,10)
        sphere(f'held wheel pupil {index}',(pos[0],pos[1],pos[2]-.029),(.019,.020,.008),pupil,'wheel',6,9)
    body['characterBounds']={'min':[-2.1,0,-.9],'max':[2.3,2.28,.9]}

for obj in pieces:
    obj.hide_render=False
    obj.hide_viewport=False
    if obj.type=='MESH' and obj!=body and not any(m.type=='ARMATURE' for m in obj.modifiers):
        mod=obj.modifiers.new('anatomical skin','ARMATURE');mod.object=arm

def join_group(objects, name):
    if len(objects)<2:return objects[0]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:obj.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    joined=objects[0]
    joined.name=name
    joined.data.name=name
    return joined

if KIND=='costume':
    cover=next(obj for obj in pieces if obj.name=='costume_exchange_cover')
    features=join_group(active_head_pieces,'costume_exchange_features')
    attachments=join_group([obj for obj in pieces if obj not in active_head_pieces and obj not in (body,cover)],'costume_exchange_attachments')
    pieces=[body,features,attachments,cover]
else:
    face_parts=[obj for obj in pieces if obj.name.startswith('held_note_face_')]
    anatomy_parts=[obj for obj in pieces if obj!=body and obj not in face_parts]
    faces=join_group(face_parts,'held_note_faces')
    attachments=join_group(anatomy_parts,'held_note_anatomy')
    pieces=[body,faces,attachments]

for obj in pieces:
    if obj.type=='MESH' and obj.data.validate(clean_customdata=False, verbose=False):
        print('REPAIRED SOURCE MESH',obj.name)

# Do not export source-file preview objects. All retained NLA tracks remain
# valid (idle/walk/turn/fold/writhe); authored runtime curves supplement them.
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for obj in pieces:obj.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=OUT,export_format='GLB',use_selection=True,
    export_yup=True,export_texcoords=True,export_normals=True,
    export_materials='EXPORT',export_image_format='AUTO',export_animations=True,
    export_animation_mode='NLA_TRACKS',export_nla_strips=True,
    export_force_sampling=True,export_frame_range=False,export_skins=True,
    export_morph=True,export_morph_normal=True,export_extras=True,
    export_def_bones=True)

# The existing textured human garment remains legible after a controlled PBR
# tint. Preserve its weave/skin maps; only material factors change.
raw=open(OUT,'rb').read()
json_len=struct.unpack_from('<I',raw,12)[0]
data=json.loads(raw[20:20+json_len])
binary=bytearray(raw[28+json_len:])
# Blender sparsifies the small corrective morphs; the runtime deliberately
# accepts only dense, bounded accessors. Expand sparse deltas without changing
# any vertex value, then remove orphaned sparse views.
widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
for accessor in data.get('accessors',[]):
    if 'sparse' not in accessor:continue
    stride=widths[accessor['type']]*sizes[accessor['componentType']]
    dense=bytearray(accessor['count']*stride)
    if 'bufferView' in accessor:
        view=data['bufferViews'][accessor['bufferView']]
        offset=view.get('byteOffset',0)+accessor.get('byteOffset',0)
        dense[:]=binary[offset:offset+len(dense)]
    sparse=accessor['sparse']
    index_view=data['bufferViews'][sparse['indices']['bufferView']]
    value_view=data['bufferViews'][sparse['values']['bufferView']]
    io=index_view.get('byteOffset',0)+sparse['indices'].get('byteOffset',0)
    vo=value_view.get('byteOffset',0)+sparse['values'].get('byteOffset',0)
    component=sparse['indices']['componentType']
    fmt={5121:'B',5123:'H',5125:'I'}[component]
    for k in range(sparse['count']):
        index=struct.unpack_from('<'+fmt,binary,io+k*sizes[component])[0]
        dense[index*stride:(index+1)*stride]=binary[vo+k*stride:vo+(k+1)*stride]
    binary.extend(b'\0'*((-len(binary))%4))
    offset=len(binary)
    binary.extend(dense)
    accessor['bufferView']=len(data['bufferViews'])
    accessor['byteOffset']=0
    accessor.pop('sparse')
    data['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(dense)})
for mat in data.get('materials',[]):
    name=mat.get('name','').lower()
    mat.pop('extensions',None)
    if 'cranial' in name:mat['doubleSided']=True
    if 'short_hair' in name:
        mat['alphaMode']='MASK';mat['alphaCutoff']=.45;mat['doubleSided']=True
    factor=None
    if KIND=='costume':
        if 'workcoat_guard' in name:factor=[.62,.20,.19,1]
        elif 'skin_guard' in name:factor=[.48,.40,.38,1]
    else:
        if 'workcoat_guard' in name:factor=[.86,.82,.72,1]
        elif 'skin_guard' in name:factor=[.91,.86,.77,1]
    if factor:mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=factor
data.pop('extensionsUsed',None)
data.pop('extensionsRequired',None)
# One named animation is the body plus all corrective streams. Blender emits
# them as separate NLA tracks; the parser needs the single merged clip.
merged={}
for animation in data.get('animations',[]):
    name=animation.get('name','')
    base=next((key for key in ('fold','writhe','idle','walk','turn') if key in name),name.split('.')[0])
    target=merged.setdefault(base,{'name':base,'samplers':[],'channels':[]})
    offset=len(target['samplers'])
    target['samplers'].extend(animation['samplers'])
    target['channels'].extend([{**channel,'sampler':channel['sampler']+offset} for channel in animation['channels']])
data['animations']=list(merged.values())
used={a['bufferView'] for a in data['accessors'] if 'bufferView' in a}
used.update(im['bufferView'] for im in data.get('images',[]) if 'bufferView' in im)
packed=bytearray();views=[];remap={}
for index,view in enumerate(data['bufferViews']):
    if index not in used:continue
    packed.extend(b'\0'*((-len(packed))%4))
    old=view.get('byteOffset',0)
    updated=dict(view);updated['byteOffset']=len(packed)
    packed.extend(binary[old:old+view['byteLength']])
    remap[index]=len(views);views.append(updated)
for accessor in data['accessors']:
    if 'bufferView' in accessor:accessor['bufferView']=remap[accessor['bufferView']]
for im in data.get('images',[]):
    if 'bufferView' in im:im['bufferView']=remap[im['bufferView']]
data['bufferViews']=views
binary=packed
data['buffers'][0]['byteLength']=len(binary)
payload=json.dumps(data,separators=(',',':')).encode()
payload+=b' '*((-len(payload))%4)
out=struct.pack('<III',0x46546c67,2,12+8+len(payload)+8+len(binary))
out+=struct.pack('<II',len(payload),0x4e4f534a)+payload
out+=struct.pack('<II',len(binary),0x004e4942)+binary
open(OUT,'wb').write(out)
stats={'source':'tools/chunk_surfer/characters/build-conservatory-adversaries.py',
       'kind':KIND,'blender':bpy.app.version_string,'base':'retained CC0 MakeHuman hm08 anatomy and source rig',
       'sha256':hashlib.sha256(out).hexdigest(),'bytes':len(out),
       'meshes':[m['name'] for m in data.get('meshes',[])],
       'clips':[a['name'] for a in data.get('animations',[])],
       'materials':[m['name'] for m in data.get('materials',[])],
       'vertices':sum(data['accessors'][p['attributes']['POSITION']]['count'] for m in data.get('meshes',[]) for p in m['primitives'])}
open(os.path.join(META,'stats.json'),'w').write(json.dumps(stats,indent=2)+'\n')
authored=('Tailored cloth, torn lining, exposed fascia and the articulated split-cranium mouth' if KIND=='costume'
          else 'Wings, four joined faces, fascia, exposed ribs and the eye wheel')
open(os.path.join(META,'CREDITS.md'),'w').write(
    '# '+SLUG+'\n\nRetained anatomical face, hands, body and rig derive from MakeHuman hm08 '
    '(CC0-1.0), with the same provenance as `public/assets/outskirts-characters/CREDITS.md`. '
    + authored + ' geometry and encounter motion '
    'are project-native. The concept images are reference, never projected textures. '
    'Rebuild with `tools/chunk_surfer/characters/build-conservatory-adversaries.py`.\n')
print('EXPORTED',json.dumps(stats),flush=True)
