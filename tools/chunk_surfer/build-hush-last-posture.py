"""The Last Posture: CC0 anatomical topology, bespoke terminal pose and rig.

Background Blender CPU build. No unioned primitives, voxel remesh or borrowed
old Pressure sculpt. Visible body quads and authored anatomical envelopes come
from the retained MakeHuman hm08 source; local facial anonymization, pose,
compact hierarchy, clips and export are authored for this manifestation.
"""
import bpy,bmesh,math,os,json,struct,hashlib,sys,gzip
import subprocess
import numpy as np
from mathutils import Vector,Matrix,Quaternion
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'artifacts/hush-last-posture/candidate')
SOURCE=os.path.join(ROOT,'assets/source/hush-last-posture.blend')
INSTALL='--install'in sys.argv
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def B(p):return Vector((float(p[0]),-float(p[2]),float(p[1])))
def G(p):return np.array((p[0],p[2],-p[1]),float)
def smooth(x):
    t=max(0.,min(1.,float(x)));return t*t*(3-2*t)
def bump(t,a,b,c,d):return smooth((t-a)/max(1e-8,b-a))*(1-smooth((t-c)/max(1e-8,d-c)))
def active(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
def unit(v):
    v=np.array(v,float);return v/max(1e-12,np.linalg.norm(v))
def rz(a):return np.array([[math.cos(a),-math.sin(a),0],[math.sin(a),math.cos(a),0],[0,0,1]],float)
def rx(a):return np.array([[1,0,0],[0,math.cos(a),-math.sin(a)],[0,math.sin(a),math.cos(a)]],float)
def ry(a):return np.array([[math.cos(a),0,math.sin(a)],[0,1,0],[-math.sin(a),0,math.cos(a)]],float)
def turn(a,b):return np.array(Vector(a).rotation_difference(Vector(b)).to_matrix())
def mul(a,b):return np.einsum('ij,jk->ik',a,b)
def mv(a,v):return np.einsum('ij,j->i',a,v)

MH=os.path.join(ROOT,'tools/chunk_surfer/character-sources/makehuman')
V=[];F={};group=''
for line in open(os.path.join(MH,'base.obj')):
    row=line.split()
    if not row:continue
    if row[0]=='v':V.append(list(map(float,row[1:4])))
    elif row[0]=='g':group=row[1]
    elif row[0]=='f':F.setdefault(group,[]).append([int(p.split('/')[0])-1 for p in row[1:]])
V=np.array(V,float)
sources=['base.obj','default_weights.mhw','default.mhskel','LICENSE.ASSETS.md']
for age,weight in [('old',.32),('young',.68)]:
    for prefix in ['caucasian-male-','universal-male-']:
        file=prefix+age+('-averagemuscle-averageweight'if prefix.startswith('universal')else'')+'.target.gz';sources.append(file)
        for line in gzip.open(os.path.join(MH,file),'rt'):
            row=line.split()
            if len(row)==4:V[int(row[0])]+=np.array(list(map(float,row[1:])))*weight
ids=sorted({i for f in F['body']for i in f});old_to_new={old:i for i,old in enumerate(ids)}
low=V[ids,1].min();metres=1.90/(V[ids,1].max()-low)
V=np.column_stack((V[:,0]*metres,(V[:,1]-low)*metres,-V[:,2]*metres))
def joint(group):return V[list({i for f in F[group]for i in f})].mean(0)
SKEL=json.load(open(os.path.join(MH,'default.mhskel')))
def mh_bone(name):
    spec=SKEL['bones'][name]
    return tuple(V[SKEL['joints'][spec[k]]].mean(0)for k in ['head','tail'])
SOURCE_BIND={};PARENTS={}
def sb(name,a,b,parent):
    SOURCE_BIND[name]=(joint(a),joint(b));PARENTS[name]=parent
SOURCE_BIND['posture_root']=(np.zeros(3),np.array([0,.05,0]));PARENTS['posture_root']=None
sb('pelvis','joint-pelvis','joint-spine-4','posture_root')
sb('spine_low','joint-spine-4','joint-spine-3','pelvis')
sb('spine_mid','joint-spine-3','joint-spine-1','spine_low')
sb('chest','joint-spine-1','joint-neck','spine_mid')
sb('neck','joint-neck','joint-head','chest')
sb('head','joint-head','joint-head-2','neck')
for side,mh in [('L','r'),('R','l')]:
    sb('thigh_'+side,'joint-'+mh+'-upper-leg','joint-'+mh+'-knee','pelvis')
    sb('shin_'+side,'joint-'+mh+'-knee','joint-'+mh+'-ankle','thigh_'+side)
    sb('foot_'+side,'joint-'+mh+'-ankle','joint-'+mh+'-foot-1','shin_'+side)
    sb('toe_'+side,'joint-'+mh+'-foot-1','joint-'+mh+'-foot-2','foot_'+side)
for side,mh,suffix in [('L','r','R'),('R','l','L')]:
    sb('clavicle_'+side,'joint-spine-1','joint-'+mh+'-shoulder','chest')
    sb('upper_arm_'+side,'joint-'+mh+'-shoulder','joint-'+mh+'-elbow','clavicle_'+side)
    sb('forearm_'+side,'joint-'+mh+'-elbow','joint-'+mh+'-hand','upper_arm_'+side)
    sb('hand_'+side,'joint-'+mh+'-hand','joint-'+mh+'-hand-3','forearm_'+side)
    for number,finger in enumerate(['thumb','index','middle','ring','little'],1):
        a,b=mh_bone(f'finger{number}-1.{suffix}');c,d=mh_bone(f'finger{number}-3.{suffix}')
        SOURCE_BIND[finger+'_'+side+'_01']=(a,b);PARENTS[finger+'_'+side+'_01']='hand_'+side
        SOURCE_BIND[finger+'_'+side+'_02']=(b,d);PARENTS[finger+'_'+side+'_02']=finger+'_'+side+'_01'

def compact(name):
    if name in ['root','spine05']or name.startswith('pelvis.'):return'pelvis'
    if name.startswith('spine'):return {'spine04':'spine_low','spine03':'spine_mid','spine02':'spine_mid','spine01':'chest'}[name]
    if name.startswith('neck'):return'neck'
    if name.startswith('breast.'):return'chest'
    side='R'if name.endswith('.L')else'L';stem=name.split('.')[0]
    for prefix,target in [('clavicle','clavicle'),('shoulder','clavicle'),('upperarm','upper_arm'),('lowerarm','forearm'),('upperleg','thigh'),('lowerleg','shin'),('wrist','hand'),('metacarpal','hand'),('foot','foot'),('toe','toe')]:
        if stem.startswith(prefix):return target+'_'+side
    if stem.startswith('finger'):
        finger=['thumb','index','middle','ring','little'][int(stem[6])-1];segment='01'if stem.endswith('-1')else'02'
        return finger+'_'+side+'_'+segment
    return'head'
names=list(SOURCE_BIND);idx={n:i for i,n in enumerate(names)}
RAW_WEIGHTS=json.load(open(os.path.join(MH,'default_weights.mhw')))['weights']
W=np.zeros((len(ids),len(names)))
for source,rows in RAW_WEIGHTS.items():
    name=compact(source)
    for vertex,weight in rows:
        if vertex in old_to_new:W[old_to_new[vertex],idx[name]]+=weight
if np.any(W.sum(1)<=0):raise RuntimeError('Every visible anatomical vertex must retain its authored envelope')
W/=W.sum(1)[:,None]
J=np.argsort(-W,axis=1)[:,:4].astype(np.uint8);weights=np.take_along_axis(W,J,axis=1);weights=np.where(weights>=.002,weights,0);weights/=weights.sum(1)[:,None]

# Preserve the original forehead, mandible, temples, ears, occiput and
# neck insertion. Excise the identifying central face, including the inner
# eye and mouth surfaces. The patch follows the actual cut edge and keeps
# the source brow and chin profile.
NEUTRAL = V[ids].copy()
source_faces = [[old_to_new[i] for i in face] for face in F['body']]
face_center = np.array([0., 1.768])
face_radius = np.array([.063, .077])
face_position = (NEUTRAL[:, :2] - face_center) / face_radius
face_field = np.maximum(np.sum(face_position**2, axis=1) - 1, (NEUTRAL[:, 2] + .045) / .03)
neutral = list(NEUTRAL)
joint_rows = list(J)
weight_rows = list(weights)
cut_vertices = {}
retained_faces = []

def append_vertex(position, envelope):
    best = np.argsort(-envelope)[:4]
    selected = envelope[best]
    neutral.append(np.array(position))
    joint_rows.append(best.astype(np.uint8))
    weight_rows.append(selected / selected.sum())
    return len(neutral) - 1

def cut_vertex(a, b):
    key = tuple(sorted((a, b)))
    if key not in cut_vertices:
        amount = face_field[a] / (face_field[a] - face_field[b])
        position = (1 - amount) * NEUTRAL[a] + amount * NEUTRAL[b]
        cut_vertices[key] = append_vertex(position, (1 - amount) * W[a] + amount * W[b])
    return cut_vertices[key]

for face in source_faces:
    retained = []
    for a, b in zip(face, face[1:] + face[:1]):
        outside_a, outside_b = face_field[a] >= 0, face_field[b] >= 0
        if outside_a:
            retained.append(a)
        if outside_a != outside_b:
            retained.append(cut_vertex(a, b))
    if len(retained) >= 3:
        retained_faces.append(retained)

# The enclosed orbital and oral remnants are separate after the facial
# excision. Keep the connected exterior of the source body.
parents_face = list(range(len(neutral)))
def exterior_root(vertex):
    while parents_face[vertex] != vertex:
        parents_face[vertex] = parents_face[parents_face[vertex]]
        vertex = parents_face[vertex]
    return vertex

for face in retained_faces:
    for vertex in face[1:]:
        parents_face[exterior_root(vertex)] = exterior_root(face[0])
components = {}
for face in retained_faces:
    root = exterior_root(face[0])
    components.setdefault(root, []).append(face)
BODY_FACES = max(components.values(), key=len)

rim_next = {}
for face in BODY_FACES:
    for a, b in zip(face, face[1:] + face[:1]):
        if a >= len(NEUTRAL) and b >= len(NEUTRAL):
            if a in rim_next:
                raise RuntimeError('Facial patch has a branched exterior edge')
            rim_next[a] = b
first = min(rim_next)
rim = [first]
while rim_next[rim[-1]] != first:
    rim.append(rim_next[rim[-1]])
    if len(rim) > len(rim_next):
        raise RuntimeError('Facial patch could not follow its exterior rim')
if len(rim) != len(rim_next):
    raise RuntimeError('Facial patch needs one continuous exterior rim')

def face_depth(y):
    # A shallow facial plane recesses at the cheek and turns into the
    # original forehead and chin. Individual landmarks remain erased.
    return np.interp(y, [1.690, 1.713, 1.744, 1.770, 1.795, 1.824, 1.846],
                     [-.162, -.151, -.147, -.150, -.155, -.161, -.158])

rim_points = np.array([neutral[i] for i in rim])
rim_deviations = rim_points[:, 2] - np.array([face_depth(point[1]) for point in rim_points])
for _ in range(5):
    rim_deviations = .50 * rim_deviations + .25 * (np.roll(rim_deviations, 1) + np.roll(rim_deviations, -1))
rim_envelopes = []
for i in rim:
    envelope = np.zeros(len(names))
    envelope[joint_rows[i]] = weight_rows[i]
    rim_envelopes.append(envelope)
face_envelope = np.zeros(len(names))
face_envelope[idx['head']] = 1
previous = rim
patch_vertices = []
for radius in np.linspace(.90, .10, 9):
    ring = []
    for point, envelope, deviation in zip(rim_points, rim_envelopes, rim_deviations):
        x, y = face_center + (point[:2] - face_center) * radius
        depth = face_depth(y) + radius**5 * deviation
        depth += .006 * (x / face_radius[0])**2 * (1 - radius)
        edge_weight = smooth((radius - .65) / .35)
        ring.append(append_vertex((x, y, depth), edge_weight * envelope + (1 - edge_weight) * face_envelope))
    for k in range(len(rim)):
        n = (k + 1) % len(rim)
        BODY_FACES.append([previous[n], previous[k], ring[k], ring[n]])
    previous = ring
    patch_vertices.extend(ring)
center_index = append_vertex((*face_center, face_depth(face_center[1])), face_envelope)
for k in range(len(rim)):
    BODY_FACES.append([previous[(k + 1) % len(rim)], previous[k], center_index])
patch_vertices.append(center_index)

NEUTRAL = np.array(neutral)
J = np.array(joint_rows, np.uint8)
weights = np.array(weight_rows, float)
open(os.path.join(OUT, 'facial-patch.json'), 'w').write(json.dumps({
    'rimVertices': len(rim),
    'patchVertices': len(patch_vertices),
    'retainedSourceVertices': len({i for face in BODY_FACES for i in face if i < len(ids)}),
    'method': 'Central facial excision over original forehead, mandible, temples, ears, occiput and neck topology. Inherited boundary and shallow retopologized facial plane.',
}, indent=2) + '\n')
used = sorted({i for face in BODY_FACES for i in face})
reindex = {old: i for i, old in enumerate(used)}
NEUTRAL, J, weights = NEUTRAL[used], J[used], weights[used]
BODY_FACES = [[reindex[i] for i in face] for face in BODY_FACES]
facial_transition = set(reindex[i] for i in [*rim, *patch_vertices])

# Exact-length anatomical retarget. Major volumes are transformed together by
# authored weights; no part is rescaled into placeholder bone proportions.
H={};R={}
for name in ['posture_root','pelvis','spine_low','spine_mid','chest','neck','head']:
    parent=PARENTS[name];source=SOURCE_BIND[name][0]
    H[name]=np.zeros(3)if parent is None else np.array([-.025,.940,.055])if name=='pelvis'else H[parent]+mv(R[parent],source-SOURCE_BIND[parent][0])
    if name == 'head':
        H[name] += np.array([-.008, -.017, -.014])
    angle={'posture_root':0,'pelvis':.075,'spine_low':-.10,'spine_mid':-.38,'chest':-.55,'neck':-1.29,'head':-1.79}[name]
    depth_turn = .13 if name == 'neck' else .20 if name == 'head' else 0
    down_pitch = -.15 if name == 'neck' else -.53 if name == 'head' else 0
    R[name] = mul(rx(down_pitch), mul(ry(depth_turn), rz(angle)))
for side,s in [('L',-1),('R',1)]:
    for part in ['clavicle','upper_arm','forearm','hand']:
        name=part+'_'+side;parent=PARENTS[name];a,b=SOURCE_BIND[name]
        H[name]=H[parent]+mv(R[parent],a-SOURCE_BIND[parent][0])
        if part=='clavicle':R[name]=rz(-.55+(.025 if side=='L'else-.045))
        else:
            direction={'upper_arm':[s*.18,-.983,.015],'forearm':[s*.04,-.996,.065],'hand':[s*.02,-.999,.025]}[part]
            R[name]=turn(b-a,unit(direction))
    hand='hand_'+side
    across=unit(SOURCE_BIND['index_'+side+'_01'][0]-SOURCE_BIND['little_'+side+'_01'][0])
    long_axis=unit(SOURCE_BIND[hand][1]-SOURCE_BIND[hand][0]);palm_normal=unit(np.cross(across,long_axis))
    axis=unit(mv(R[hand],long_axis));normal=mv(R[hand],palm_normal);wanted=np.array([-s,0,0.])
    normal=unit(normal-axis*np.dot(normal,axis));wanted=unit(wanted-axis*np.dot(wanted,axis))
    wrist_twist=math.atan2(np.dot(axis,np.cross(normal,wanted)),np.dot(normal,wanted))
    R[hand]=mul(np.array(Quaternion(Vector(axis),wrist_twist).to_matrix()),R[hand])
    for finger in ['thumb','index','middle','ring','little']:
        for segment in ['01','02']:
            name=finger+'_'+side+'_'+segment;parent=PARENTS[name];a,b=SOURCE_BIND[name]
            H[name]=H[parent]+mv(R[parent],a-SOURCE_BIND[parent][0])
            R[name]=mul(R[hand],np.array(Quaternion(Vector(across),.10 if segment=='01'else.28).to_matrix()))
    thigh='thigh_'+side;shin='shin_'+side;foot='foot_'+side;toe='toe_'+side
    a,b=SOURCE_BIND[thigh];k,c=SOURCE_BIND[shin]
    hip=H['pelvis']+mv(R['pelvis'],a-SOURCE_BIND['pelvis'][0])
    ankle=np.array([-.180 if side=='L'else.130,SOURCE_BIND[foot][0][1],.055 if side=='L'else-.005])
    l1=np.linalg.norm(b-a);l2=np.linalg.norm(c-k);axis=unit(ankle-hip);distance=np.linalg.norm(ankle-hip)
    along=(l1*l1+distance*distance-l2*l2)/(2*distance);height=math.sqrt(max(0,l1*l1-along*along))
    pole=np.array([-.06 if side=='L'else-.30,0,-1.]);pole=unit(pole-axis*np.dot(pole,axis));knee=hip+axis*along+pole*height
    H[thigh]=hip;H[shin]=knee;H[foot]=ankle
    R[thigh]=turn(b-a,knee-hip);R[shin]=turn(c-k,ankle-knee)
    yaw=(-.16 if side=='L'else.20);R[foot]=np.array(Quaternion((0,1,0),yaw).to_matrix())
    H[toe]=ankle+mv(R[foot],SOURCE_BIND[toe][0]-SOURCE_BIND[foot][0]);R[toe]=R[foot].copy()
POSED=np.zeros_like(NEUTRAL)
for column in range(4):
    for bone in np.unique(J[:,column]):
        name=names[int(bone)];rows=J[:,column]==bone
        q=np.einsum('ij,kj->ik',NEUTRAL[rows]-SOURCE_BIND[name][0],R[name])+H[name]
        POSED[rows]+=q*weights[rows,column,None]

# Refine the baked collar where the steep bend compresses the neck. The
# surrounding anatomy anchors a local Taubin pass, including its transition
# below the new rings. It leaves the mandible, hands, torso and soles alone.
collar_influence = np.array([bump(y, 1.607, 1.623, 1.659, 1.704) for y in NEUTRAL[:, 1]])
collar_influence *= np.clip((.155 - np.abs(NEUTRAL[:, 0])) / .045, 0, 1)
collar_influence *= np.clip((NEUTRAL[:, 2] + .145) / .035, 0, 1)
collar_region = np.flatnonzero(collar_influence > 0)
neighbours = [set() for _ in NEUTRAL]
for face in BODY_FACES:
    for a, b in zip(face, face[1:] + face[:1]):
        neighbours[a].add(b)
        neighbours[b].add(a)
for _ in range(22):
    for strength in [.50, -.47]:
        adjustment = np.array([POSED[sorted(neighbours[i])].mean(0) - POSED[i] for i in collar_region])
        POSED[collar_region] += adjustment * (strength * collar_influence[collar_region, None])

# Take the sharp folds out of the blank facial patch and ear rims without
# touching the retained outer cranium, chin silhouette or neck base.
for _ in range(2):
    facial_transition |= {n for i in facial_transition for n in neighbours[i]
                          if 1.688 < NEUTRAL[n, 1] < 1.846 and abs(NEUTRAL[n, 0]) < .072}
facial_transition = sorted(facial_transition)
ear_region = np.flatnonzero((np.abs(NEUTRAL[:, 0]) > .078)
                            & (NEUTRAL[:, 1] > 1.716) & (NEUTRAL[:, 1] < 1.806))
for region, iterations in [(facial_transition, 32), (ear_region, 12)]:
    for _ in range(iterations):
        adjustment = np.array([POSED[sorted(neighbours[i])].mean(0) - POSED[i] for i in region])
        POSED[region] += .40 * adjustment

# One uniform body scale. A truthful measured envelope is reported; anatomy is
# never flattened to satisfy the old fold's depth or X-squeeze convention.
# Preserve the accepted body scale and sole datum from anatomy-review-1.
# A local head edit cannot alter hip/ankle coordinates or leg reach.
scale = 1.2799973341255821
support_center = (H['foot_L'] + H['foot_R']) / 2
center = np.array([support_center[0], 0, support_center[2]])
P=(POSED-center)*scale
bind={};endpoints={}
for name in names:
    bind[name]=(PARENTS[name],((H[name]-center)*scale).tolist()if name!='posture_root'else[0,0,0])
    endpoints[name]=((H[name]+mv(R[name],SOURCE_BIND[name][1]-SOURCE_BIND[name][0])-center)*scale)
endpoints['posture_root']=np.array([0,.05,0])
JP=np.array([bind[n][1]for n in names]);parents=[idx[PARENTS[n]]if PARENTS[n]else-1 for n in names]
children={name:[n for n in names if PARENTS[n]==name]for name in names}
finger_chains={n:endpoints[n].tolist()for n in names if n.endswith('_02')}
faces=[tuple(reversed(f))for f in BODY_FACES]
mesh=bpy.data.meshes.new('Last Posture — retained anatomical quad topology');mesh.from_pydata([B(p)for p in P],[],faces);mesh.update()
body=bpy.data.objects.new('Last Posture — posed anatomical skin',mesh);bpy.context.collection.objects.link(body)
bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();mesh.update()
for face in mesh.polygons:face.use_smooth=True
mesh.calc_loop_triangles();T=np.array([tuple(t.vertices)for t in mesh.loop_triangles],np.uint32)
normals=np.array([G(v.normal)for v in mesh.vertices]);normals/=np.maximum(1e-9,np.linalg.norm(normals,axis=1))[:,None]
construction=bpy.data.collections.new('SOURCE — retained CC0 anatomical quads and envelopes');bpy.context.scene.collection.children.link(construction)
neutral_mesh=bpy.data.meshes.new('CC0 MakeHuman — anatomical source quads');neutral_mesh.from_pydata([B(p)for p in NEUTRAL],[],faces);neutral_mesh.update()
neutral_obj=bpy.data.objects.new('CC0 source anatomy — unposed, face region anonymized',neutral_mesh);construction.objects.link(neutral_obj)
for i,name in enumerate(names):
    group=neutral_obj.vertex_groups.new(name=name)
    for column in range(4):
        for row in np.where((J[:,column]==i)&(weights[:,column]>.00001))[0]:group.add([int(row)],float(weights[row,column]),'REPLACE')
SOURCE_HASHES={f:hashlib.sha256(open(os.path.join(MH,f),'rb').read()).hexdigest()for f in sources}

DUR={'pressure_hold':1.,'pressure_idle':9.6,'pressure_approach':2.4,'pressure_limp':3.4,'pressure_listen':4.8,'pressure_load':.5,'pressure_advance':.72,'pressure_arrest':1.,'pressure_pivot':.72,'density_clamp':2.2,'density_retained':1.,'density_release':1.5,'density_reload':.5,'density_listen':4.8,'density_idle':6.4,'density_chase':2.4}
local_bind=np.array([JP[i]-(JP[parent]if parent>=0 else 0)for i,parent in enumerate(parents)])
def motion(name,t):
    # Columns are local translation and game-axis Euler rotation. All values
    # are deltas around the already terminal posture, never a neutral body.
    pose=np.zeros((len(names),6));u=max(0,min(1,t/DUR[name]))
    def setv(n,translation=(0,0,0),rotation=(0,0,0)):
        pose[idx[n],:3]+=translation;pose[idx[n],3:]+=rotation
    if name in ['pressure_approach','pressure_limp','density_chase','pressure_advance','pressure_pivot']:
        strong=1.25 if name=='density_chase' else 1
        lead=bump(u,0,.08,.28,.50);gather=bump(u,.08,.14,.34,.43);settle=bump(u,.58,.64,.84,.93)
        setv('spine_low',(0,-.007*lead,0),(.018*lead,0,-.020*lead))
        setv('spine_mid',(.008*lead,0,-.006*lead),(.026*lead*strong,0,.028*lead))
        setv('chest',(.006*lead,0,-.006*lead),(.015*lead,0,-.022*lead))
        setv('neck',rotation=(.012*lead,.018*lead,-.020*lead))
        setv('thigh_R',rotation=(-.065*gather,0,-.018*gather))
        setv('shin_R',rotation=(.125*gather,0,0))
        setv('foot_R',rotation=(-.060*gather,0,0))
        setv('thigh_L',rotation=(.030*settle,0,.012*settle))
        setv('shin_L',rotation=(-.045*settle,0,0))
        setv('hand_L',rotation=(.035*gather,0,-.018*gather))
        setv('hand_R',rotation=(.025*settle,0,.014*settle))
    elif name in ['pressure_load','density_reload']:
        pulse=math.sin(math.pi*u)**2
        setv('spine_mid',(.006*pulse,-.004*pulse,-.004*pulse),(.020*pulse,0,.022*pulse))
    elif name in ['density_listen','pressure_listen']:
        # One late bearing transfer, hesitation and resolution. No breathing.
        late=bump(u,.15,.34,.57,.92)
        setv('chest',rotation=(.006*late,.040*late,-.018*late))
        setv('neck',rotation=(0,.038*late,.022*late));setv('head',rotation=(.010*late,-.012*late,-.016*late))
    elif name in ['density_clamp','density_release','density_idle']:
        pulse=bump(u,.06,.22,.35,.80)
        setv('spine_low',(0,-.006*pulse,0),(.014*pulse,0,-.016*pulse))
        setv('chest',rotation=(-.016*pulse,0,.017*pulse))
        setv('neck',rotation=(.013*pulse,0,-.024*pulse))
    return pose

def quaternion(v):
    x,y,z=v;cx=math.cos(x/2);sx=math.sin(x/2);cy=math.cos(y/2);sy=math.sin(y/2);cz=math.cos(z/2);sz=math.sin(z/2)
    return np.array([sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz])
def world_matrices(pose):
    world=[]
    for i in range(len(names)):
        q=quaternion(pose[i,3:]);m=np.eye(4)
        x,y,z,w=q;m[:3,:3]=[[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
        m[:3,3]=local_bind[i]+pose[i,:3];world.append(np.einsum('ij,jk->ik',world[parents[i]],m)if parents[i]>=0 else m)
    return world
def deformed(pose):
    world=world_matrices(pose);Q=np.zeros_like(P)
    for column in range(4):
        selected=J[:,column]
        for bone in np.unique(selected):
            rows=selected==bone;m=world[int(bone)];q=np.einsum('ij,kj->ik',P[rows]-JP[int(bone)],m[:3,:3])+m[:3,3]
            Q[rows]+=q*weights[rows,column,None]
    return Q

# Real editable anatomical armature; correct tail/head relationships rather
# than the old fold controls. Game-space nodes are exported independently of
# Blender's bone rolls, while baked Blender actions use the exact same matrices.
armdata=bpy.data.armatures.new('Last Posture — anatomical hierarchy');arm=bpy.data.objects.new('Last Posture rig',armdata);bpy.context.collection.objects.link(arm);active(arm);bpy.ops.object.mode_set(mode='EDIT')
for i,name in enumerate(names):
    bone=armdata.edit_bones.new(name);bone.head=B(JP[i]);bone.tail=B(endpoints[name]);
    if (bone.tail-bone.head).length<.015:bone.tail=bone.head+Vector((0,0,.04))
    if parents[i]>=0:bone.parent=armdata.edit_bones[names[parents[i]]]
    bone.use_connect=False
bpy.ops.object.mode_set(mode='OBJECT');arm.show_in_front=True
arm['game_axes']='X lateral, Y up, Z depth, forward -Z; GLB joint bind rotations identity'
arm['contact_policy']='World-planted feet require accepted simulation support anchors; baked clips alone do not establish planting'
for i,name in enumerate(names):
    group=body.vertex_groups.new(name=name)
    for column in range(4):
        rows=np.where((J[:,column]==i)&(weights[:,column]>.00001))[0]
        for row in rows:group.add([int(row)],float(weights[row,column]),'REPLACE')
modifier=body.modifiers.new('Last Posture anatomical skin','ARMATURE');modifier.object=arm;body.parent=arm
mat=bpy.data.materials.new('Anonymous body — neutral authoring clay');mat.diffuse_color=(.16,.16,.16,1);body.data.materials.append(mat)
C=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));CI=C.inverted()
arm.animation_data_create()
for clip,duration in DUR.items():
    action=bpy.data.actions.new(clip);action.use_fake_user=True;arm.animation_data.action=action
    times=[0,duration]if clip in ['pressure_hold','pressure_idle','pressure_arrest','density_retained']else np.linspace(0,duration,round(duration*24)+1)
    for t in times:
        world=world_matrices(motion(clip,float(t)))
        for i,name in enumerate(names):
            inverse=np.eye(4);inverse[:3,3]=-JP[i]
            matrix=C@Matrix(world[i]@inverse)@CI@arm.data.bones[name].matrix_local
            pb=arm.pose.bones[name];pb.rotation_mode='QUATERNION';pb.matrix=matrix
            frame=1+float(t)*24
            pb.keyframe_insert('location',frame=frame,group=name);pb.keyframe_insert('rotation_quaternion',frame=frame,group=name)
    try:
        for curve in action.fcurves:
            for key in curve.keyframe_points:key.interpolation='LINEAR'
    except AttributeError:pass
arm.animation_data.action=bpy.data.actions['pressure_hold']
for pb in arm.pose.bones:pb.matrix_basis=Matrix.Identity(4)
construction.hide_render=True;construction.hide_viewport=True
bpy.context.preferences.filepaths.save_version = 0
bpy.context.scene.render.fps=24;bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=59
bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
bpy.context.scene['asset_identity']='The Last Posture';bpy.context.scene['production_renderer']='Core/return complementary surface, identical full volume; existing final dither'
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)

# Compact self-contained core/return/volume GLB. Surface zones are exact face
# partitions of one sculpt; full volume is an alternative pass, never a second
# body. The return zone is restrained and does not paint facial information.
chunks=[];views=[];access=[];length=0
def acc(data,kind,component=5126,**extra):
    global length
    widths={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16};data=np.asarray(data,dtype={5126:'<f4',5121:'u1',5125:'<u4'}[component]);raw=data.tobytes();pad=(-length)%4
    if pad:chunks.append(b'\0'*pad);length+=pad
    view=len(views);views.append({'buffer':0,'byteOffset':length,'byteLength':len(raw)});chunks.append(raw);length+=len(raw)
    n=len(access);access.append({'bufferView':view,'componentType':component,'count':data.size//widths[kind],'type':kind,**extra});return n
uv=np.column_stack((np.arctan2(P[:,2],P[:,0])/(2*math.pi)+.5,P[:,1]/2.05))
node_offset=1;nodes=[{'name':'last_posture_scene','children':[1]}]
for i,name in enumerate(names):
    node={'name':name,'translation':local_bind[i].tolist(),'extras':{'anatomicalJoint':True,'gameAxes':'XYZ'}}
    descendants=[idx[n]+node_offset for n in children[name]]
    if descendants:node['children']=descendants
    nodes.append(node)
inverse=[]
for p in JP:m=np.eye(4);m[:3,3]=-p;inverse.append(m.flatten(order='F'))
skin={'joints':list(range(node_offset,node_offset+len(names))),'skeleton':node_offset,'inverseBindMatrices':acc(np.array(inverse),'MAT4')}
face_normals=normals[T].mean(1);centers=P[T].mean(1)
eligible=(np.abs(face_normals[:,1])<.65)&(face_normals[:,2]>.25)&(centers[:,1]>.22)&(centers[:,1]<1.78)
candidate=np.where(eligible)[0];score=face_normals[candidate,2]-.18*np.abs(face_normals[candidate,0]);selected=candidate[np.argsort(-score)[:round(len(T)*.055)]]
mask=np.zeros(len(T),bool);mask[selected]=True
meshes=[];zones={};combined_vertices=0
for number,(name,triangles)in enumerate([('hush_density_core',T[~mask]),('hush_density_return',T[mask]),('hush_density_volume',T)]):
    used=np.unique(triangles);remapped=np.searchsorted(used,triangles).astype(np.uint32).ravel();combined_vertices+=len(used)
    attrs={'POSITION':acc(P[used],'VEC3',min=P[used].min(0).tolist(),max=P[used].max(0).tolist()),'NORMAL':acc(normals[used],'VEC3'),'TEXCOORD_0':acc(uv[used],'VEC2'),'JOINTS_0':acc(J[used],'VEC4',5121),'WEIGHTS_0':acc(weights[used],'VEC4')}
    meshes.append({'name':name,'primitives':[{'attributes':attrs,'indices':acc(remapped,'SCALAR',5125),'material':number}],'extras':{'identity':'The Last Posture','hushDensityZone':name.rsplit('_',1)[-1],'targetNames':[]}})
    nodes[0]['children'].append(len(nodes));nodes.append({'name':name,'mesh':number,'skin':0})
    zones[name]={'vertices':len(used),'triangles':len(triangles)}
animations=[]
for clip,duration in DUR.items():
    times=np.array([0,duration])if clip in ['pressure_hold','pressure_idle','pressure_arrest','density_retained']else np.linspace(0,duration,round(duration*40)+1)
    samples=np.array([motion(clip,float(t))for t in times]);input_acc=acc(times,'SCALAR',min=[0],max=[duration]);channels=[];samplers=[]
    animated_joints=[i for i in range(1,len(names))if np.max(np.abs(samples[:,i]))>1e-12]
    # A still compatibility clip carries a constant chest channel solely to
    # retain its authored duration; neither feet nor root receive idle curves.
    if not animated_joints:animated_joints=[idx['chest']]
    for i in animated_joints:
        for path,data,kind in [('translation',samples[:,i,:3]+local_bind[i],'VEC3'),('rotation',np.array([quaternion(v)for v in samples[:,i,3:]]),'VEC4')]:
            channels.append({'sampler':len(samplers),'target':{'node':i+node_offset,'path':path}});samplers.append({'input':input_acc,'output':acc(data,kind),'interpolation':'LINEAR'})
    animations.append({'name':clip,'channels':channels,'samplers':samplers})
materials=[{'name':name,'pbrMetallicRoughness':{'baseColorFactor':[0,0,0,1]if number!=1 else[.02,.02,.02,1],'metallicFactor':0,'roughnessFactor':.9},'alphaMode':'OPAQUE','extras':{'hushDensityZone':name.rsplit('_',1)[-1]}}for number,name in enumerate(['hush_density_core','hush_density_return','hush_density_volume'])]
native_height = float(P[:, 1].max() - P[:, 1].min())
doc={'asset':{'version':'2.0','generator':'Chunk Surfer / The Last Posture anatomical builder'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'skins':[skin],'meshes':meshes,'materials':materials,'animations':animations,'accessors':access,'bufferViews':views,'buffers':[{'byteLength':length}],'extras':{'identity':'The Last Posture','assetIdentity':'hush-density','modelRevision':'last-posture-anatomy-3','units':'metres','forward':'-Z','heightM':native_height,'noRootAnimation':True,'source':'tools/chunk_surfer/build-hush-last-posture.py','worldPlantingAuthority':'accepted simulation support, not clip-only assertion'}}
raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);binary=b''.join(chunks);binary+=b'\0'*((-len(binary))%4)
result=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(binary),0x004e4942)+binary
open(os.path.join(OUT,'hush-density.glb'),'wb').write(result)

bounds={};global_min=P.min(0);global_max=P.max(0)
for clip,duration in DUR.items():
    lo=P.min(0);hi=P.max(0)
    for t in np.linspace(0,duration,65):
        q=deformed(motion(clip,float(t)));lo=np.minimum(lo,q.min(0));hi=np.maximum(hi,q.max(0))
    bounds[clip]={'min':lo.tolist(),'max':hi.tolist(),'dimensions':(hi-lo).tolist()};global_min=np.minimum(global_min,lo);global_max=np.maximum(global_max,hi)
edge_counts={}
for tri in T:
    for a,b in zip(tri,np.roll(tri,-1)):
        key=tuple(sorted((int(a),int(b))));edge_counts[key]=edge_counts.get(key,0)+1
mesh_neighbours = [set() for _ in P]
for a, b in edge_counts:
    mesh_neighbours[a].add(b)
    mesh_neighbours[b].add(a)
remaining = set(range(len(P)))
connected_components = 0
while remaining:
    pending = [remaining.pop()]
    connected_components += 1
    while pending:
        connected = mesh_neighbours[pending.pop()] & remaining
        remaining.difference_update(connected)
        pending.extend(connected)
stats={'kind':'production-hush-last-posture','identity':'The Last Posture','modelRevision':'last-posture-anatomy-3','source':'tools/chunk_surfer/build-hush-last-posture.py','editableSource':'assets/source/hush-last-posture.blend','concept':'artifacts/route-completion-and-hush/hush-directions/last-posture-v2.png','blender':bpy.app.version_string,'globalReplacement':True,'asset':'public/assets/hush-density.glb','sha256':hashlib.sha256(result).hexdigest(),'bytes':len(result),'units':'metres','forward':'-Z','vertices':len(P),'triangles':len(T),'visibleTriangleBudget':44000,'meshes':zones,'combinedExportedVertices':combined_vertices,'joints':names,'jointBindPositions':JP.tolist(),'jointParents':{n:bind[n][0]for n in names},'jointAxes':'glTF nodes identity rotation in game X=lateral,Y=up,Z=depth; full anatomical parent hierarchy','morphs':0,'restBounds':{'min':P.min(0).tolist(),'max':P.max(0).tolist()},'nativeDimensionsM':dict(zip(['width','height','depth'],(P.max(0)-P.min(0)).tolist())),'sampledAnimatedBounds':{'min':global_min.tolist(),'max':global_max.tolist(),'dimensions':(global_max-global_min).tolist()},'clipBounds':bounds,'clips':DUR,'topology':{'boundaryEdges':sum(v==1 for v in edge_counts.values()),'nonManifoldEdges':sum(v>2 for v in edge_counts.values())},'construction':'Retained CC0 MakeHuman hm08 anatomical quad topology and authored envelopes; exact-length asymmetric skeletal retarget, retained skull and mandible with a shallow anonymized facial plane, terminal lateral head/shoulder collapse, actual hands/phalanges and uneven bent-knee support. No voxel remesh, capsule union, old pressure sculpt or costume.', 'sourceHashes':SOURCE_HASHES, 'retainedEditableQuads':len(mesh.polygons),'rootPolicy':'No root clip channels, root displacement or root yaw; simulation owns accepted movement/knowledge/contact.','supportContract':{'referenceClip':'pressure_hold','referenceTime':0,'chains':{s:['thigh_'+s,'shin_'+s,'foot_'+s]for s in ['L','R']},'rightGatherPhase':[.08,.43],'leftGatherPhase':[.58,.93],'cycleMetres':1.10,'soleBelowAnkleM':{s:float(JP[idx['foot_'+s],1])for s in ['L','R']},'worldPlantingClaim':False,'meaning':'Embedded weight transfer is not sufficient for world planting. Runtime must retain accepted-world support offsets and release each foot during its finite gather.'},'idlePolicy':'pressure_hold/idle/arrest/density_retained are the identical still terminal pose. Other responses finite, bounded and return to the same collapsed endpoint. No breathing loop.','returnSurfaceFraction':float(mask.mean()),'limits':['CPU geometry, rig, sampled deformation and loader checks do not establish final-dither appearance or human fear.','Runtime support anchoring and swept-world door clearance require separate integrated verification.','No proof of complete self-collision avoidance follows from manifold topology.'],'license':'Base anatomical topology and authored source envelopes CC0-1.0, MakeHuman Community. Bespoke pose/sculpt/rig/clips authored for Chunk Surfer.'}
stats['topology']['connectedComponents'] = connected_components
if connected_components != 1 or stats['topology']['boundaryEdges'] or stats['topology']['nonManifoldEdges']:
    raise RuntimeError('Last Posture needs one closed anatomical surface')
if len(T)>44000 or combined_vertices>50000 or len(names)>54:raise RuntimeError('Character renderer budget exceeded')
credits={'asset':'public/assets/hush-density.glb','identity':'The Last Posture','authoring':'tools/chunk_surfer/build-hush-last-posture.py','editableSource':'assets/source/hush-last-posture.blend','geometry':'MakeHuman hm08 CC0 anatomical topology and original envelopes, locally anonymized and posed/sculpted for The Last Posture. No old pressure fold/hood sculpt, capsule union or projected concept texture.', 'sources':SOURCE_HASHES, 'sourceLicense':'tools/chunk_surfer/character-sources/makehuman/LICENSE.ASSETS.md', 'sourceUrl':'https://github.com/makehumancommunity/mpfb2/tree/master/src/mpfb/data/3dobjs','rig':'Original hierarchical anatomical armature with articulated fingers and finite authored clips.','conceptReference':'User-selected generated image last-posture-v2.png, consulted as silhouette/weight reference, not projected as texture.','license':'CC0-1.0 anatomical base and source envelopes; bespoke adaptation, rig and clips authored for Chunk Surfer.','retainedPriorAsset':'Exact previous hush-density GLB/stats/credits retained under artifacts/hush-last-posture/baseline/.'}
for name,value in [('hush-density.stats.json',stats),('hush-density.credits.json',credits)]:open(os.path.join(OUT,name),'w').write(json.dumps(value,indent=2)+'\n')
legs={s:{'hip':JP[idx['thigh_'+s]].tolist(),'ankle':JP[idx['foot_'+s]].tolist(),'reach':float(np.linalg.norm(JP[idx['shin_'+s]]-JP[idx['thigh_'+s]])+np.linalg.norm(JP[idx['foot_'+s]]-JP[idx['shin_'+s]]))}for s in ['L','R']}
support_js='// Generated by tools/chunk_surfer/build-hush-last-posture.py; metres, actual anatomical rig.\n'
support_js+='export const HUSH_POSTURE_REVISION = '+json.dumps(stats['modelRevision'])+';\n'
support_js+='export const HUSH_POSTURE_NATIVE_HEIGHT_M = '+repr(native_height)+';\n'
support_js+='export const HUSH_POSTURE_ASSET_SHA256 = '+json.dumps(stats['sha256'])+';\n'
support_js+='export const HUSH_POSTURE_LEGS = Object.freeze({\n'
for s in ['L','R']:
    support_js+='  '+s+': Object.freeze({ hip: Object.freeze('+json.dumps(legs[s]['hip'])+'), ankle: Object.freeze('+json.dumps(legs[s]['ankle'])+'), reach: '+repr(legs[s]['reach'])+' }),\n'
support_js+='});\n'
open(os.path.join(OUT,'hush-last-posture-support.js'),'w').write(support_js)
if INSTALL:
    for name in ['hush-density.glb','hush-density.stats.json','hush-density.credits.json']:
        with open(os.path.join(OUT,name),'rb')as src:open(os.path.join(ROOT,'public/assets',name),'wb').write(src.read())
    canonical = os.path.join(ROOT, 'public/assets/hush-density')
    os.makedirs(canonical, exist_ok=True)
    for name, data in [('stats.json', stats), ('CREDITS.json', credits)]:
        with open(os.path.join(canonical, name), 'w') as destination:
            json.dump(data, destination, indent=2)
            destination.write('\n')
    generated=os.path.join(ROOT,'src/data/generated/hush-last-posture-support.js')
    os.makedirs(os.path.dirname(generated),exist_ok=True);open(generated,'w').write(support_js)
    for tool in ('build-hush-battle-fallback.mjs', 'validate-hush-density.mjs'):
        subprocess.run(['node', os.path.join(ROOT, 'tools/chunk_surfer', tool)], cwd=ROOT, check=True)
print(json.dumps({'identity':stats['identity'],'output':OUT,'installed':INSTALL,'vertices':len(P),'triangles':len(T),'joints':len(names),'dimensionsM':stats['nativeDimensionsM'],'animatedDimensionsM':stats['sampledAnimatedBounds']['dimensions'],'bytes':len(result),'sha256':stats['sha256'],'editableSource':SOURCE}))

if '--review' in sys.argv:
    # Neutral CPU-only review, independent of game shaders and dramatic light.
    # These are declared authoring views, never an in-game evidence substitute.
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=20
    scene.render.threads_mode='FIXED';scene.render.threads=2
    scene.render.resolution_x=640;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.world=bpy.data.worlds.new('Neutral CPU review world');scene.world.use_nodes=True
    background=scene.world.node_tree.nodes.get('Background');background.inputs['Color'].default_value=(.32,.32,.32,1);background.inputs['Strength'].default_value=.65
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
    mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.42,.42,.42,1);bsdf.inputs['Roughness'].default_value=.92
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.002));floor=bpy.context.object;floor.name='REVIEW ONLY — level ground'
    floor_mat=bpy.data.materials.new('Neutral ground');floor_mat.diffuse_color=(.26,.26,.26,1);floor.data.materials.append(floor_mat)
    def light(name,position,power,size):
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=B(position);obj.rotation_euler=(B([0,1,0])-obj.location).to_track_quat('-Z','Y').to_euler()
    light('REVIEW ONLY — broad neutral key',[-3,4,-3],400,4)
    light('REVIEW ONLY — neutral fill',[3,2.5,-1],150,3)
    arm.animation_data.action=bpy.data.actions['pressure_hold'];scene.frame_set(1)
    for label,position in [('front',[0,1.15,-5]),('profile',[5,1.15,0]),('three-quarter',[3.8,1.4,-5])]:
        data=bpy.data.cameras.new('REVIEW '+label);cam=bpy.data.objects.new('REVIEW '+label,data);scene.collection.objects.link(cam);cam.location=B(position);cam.rotation_euler=(B([0,1.025,0])-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.40;scene.camera=cam
        scene.render.filepath=os.path.join(OUT,'clay-'+label+'.png');bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
