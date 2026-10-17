"""Cut a separate, normally posed road handler from the retained CC0 anatomy.

The booth guard and its suit remain untouched. This copy removes the business
shirt/tie reading with a worn work-coat palette and gives skin, cloth and hair
different exposure under the single sodium practical in the Outskirts.
"""
import bpy
import hashlib
import json
import os
import struct
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
SOURCE = os.path.join(ROOT, 'assets/source/outskirts-characters.blend')
OUT_SOURCE = os.path.join(ROOT, 'assets/source/outskirts-dog-handler.blend')
ASSET = os.path.join(ROOT, 'public/assets/outskirts-dog-handler.glb')
META = os.path.join(ROOT, 'public/assets/outskirts-dog-handler')
PROOF = os.path.join(ROOT, 'artifacts/outskirts-man-dog-design/production')
for folder in (META, PROOF):
    os.makedirs(folder, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=SOURCE)
bpy.context.preferences.filepaths.save_version = 0
body = bpy.data.objects['outskirts_fold_guard']
rig = bpy.data.objects['outskirts_anatomy']
other = bpy.data.objects.get('outskirts_overprint_body')
if other:
    bpy.data.objects.remove(other, do_unlink=True)
body.name = 'outskirts_dog_handler'
body.data.name = 'outskirts_dog_handler'
body['authoring'] = 'CC0 anatomical guard source, adapted as an independent Outskirts road handler'


def flat(name, color, emission, roughness=.91):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Emission Color'].default_value = (*emission, 1)
    shader.inputs['Emission Strength'].default_value = 1
    return mat


def inherited(name, source_name, emission):
    # Keep the anatomical face and hair maps instead of flattening them to a
    # single tone. Only the clothing's business atlas is deliberately replaced.
    mat = bpy.data.materials[source_name].copy()
    mat.name = name
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = (*emission, 1)
    shader.inputs['Emission Strength'].default_value = 1
    return mat


coat = flat('handler worn road coat', (.046, .041, .036), (.067, .055, .040))
inner = flat('handler dark inner layer', (.031, .029, .026), (.038, .034, .028))
boot = flat('handler worn boots', (.050, .044, .036), (.054, .043, .030))
skin = inherited('handler skin exposure', 'skin_guard', (.16, .11, .070))
hair = inherited('handler dark hair exposure', 'short_hair', (.041, .033, .027))
eye = inherited('handler eyes', 'anatomical_eyes', (.045, .039, .031))

# All materials remain on one deformable mesh, so the original joint and idle
# performance survives. The source atlas gave this figure a striped tie and
# white shirt; material regions now read as an unmarked inner layer instead.
replacement = {
    'workcoat_guard': coat,
    'skin_guard': skin,
    'short_hair': hair,
    'anatomical_eyes': eye,
    'leather': boot,
    'sole': boot,
    'hair': hair,
    'sclera': eye,
    'iris': eye,
    'pupil': eye,
}
for slot in body.material_slots:
    if slot.material and slot.material.name in replacement:
        slot.material = replacement[slot.material.name]

# The source's short business jacket made the man look like an office extra.
# The coat is the mesh's largest connected island; lower only its torso hem,
# retaining sleeves, face, shoes, and all the original bone and morph data.
mesh = body.data
island_parent = list(range(len(mesh.vertices)))
def island_root(index):
    while island_parent[index] != index:
        island_parent[index] = island_parent[island_parent[index]]
        index = island_parent[index]
    return index
for edge in mesh.edges:
    a, b = map(island_root, edge.vertices)
    island_parent[b] = a
islands = {}
for index in range(len(mesh.vertices)):
    islands.setdefault(island_root(index), []).append(index)
coat_island = max(islands.values(), key=len)
assert len(coat_island) > 5000
for index in coat_island:
    v = mesh.vertices[index].co
    across = max(0, min(1, (.42 - abs(v.x)) / .09))
    lower = max(0, min(1, (1.28 - v.z) / .38))
    amount = across * lower * lower
    if amount <= 0:
        continue
    dz = -.24 * amount
    dx = (1 if v.x > 0 else -1) * .026 * amount
    for key in mesh.shape_keys.key_blocks:
        key.data[index].co.z += dz
        key.data[index].co.x += dx
body.data.materials.append(inner)
inner_index = len(body.data.materials) - 1
coat_index = next(i for i, mat in enumerate(body.data.materials) if mat == coat)
uv = body.data.uv_layers.active
if uv:
    for face in body.data.polygons:
        if face.material_index != coat_index:
            continue
        u = sum(uv.data[i].uv.x for i in face.loop_indices) / len(face.loop_indices)
        v = sum(uv.data[i].uv.y for i in face.loop_indices) / len(face.loop_indices)
        if .33 < u < .50 and v > .78:
            face.material_index = inner_index

# Source actions/NLA and the named rig are retained, including the skinned
# upper-body look-back used by the encounter. Save before the inspection scene.
bpy.context.scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=OUT_SOURCE)
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=ASSET, export_format='GLB', use_selection=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT',
    export_animations=True, export_animation_mode='NLA_TRACKS',
    export_nla_strips=True, export_force_sampling=True, export_frame_range=False,
    export_skins=True, export_morph=True, export_morph_normal=True,
    export_try_sparse_sk=False,
    export_extras=True, export_def_bones=True,
)
with open(ASSET, 'rb') as stream:
    data = stream.read()
json_length = struct.unpack_from('<I', data, 12)[0]
head = json.loads(data[20:20 + json_length])
# The inherited hair atlas has alpha coverage. The base character build fixes
# Blender's BLEND export to a stable cutout; apply the same production contract
# here so this additional character enters the real opaque/depth/dither pass.
for mat in head.get('materials', []):
    if mat.get('name') == 'handler dark hair exposure':
        mat['alphaMode'] = 'MASK'
        mat['alphaCutoff'] = .45
        mat['doubleSided'] = True
packed_json = json.dumps(head, separators=(',', ':')).encode('utf8')
packed_json += b' ' * ((-len(packed_json)) % 4)
binary_chunk = data[20 + json_length:]
data = struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(packed_json) + len(binary_chunk))
data += struct.pack('<II', len(packed_json), 0x4e4f534a) + packed_json + binary_chunk
with open(ASSET, 'wb') as stream:
    stream.write(data)
stats = {
    'source': 'tools/chunk_surfer/characters/build-outskirts-dog-handler.py',
    'anatomicalSource': 'assets/source/outskirts-characters.blend',
    'mesh': body.name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
    'materials': [item['name'] for item in head.get('materials', [])],
    'clips': [item.get('name') for item in head.get('animations', [])],
}
with open(os.path.join(META, 'manifest.json'), 'w') as stream:
    json.dump(stats, stream, indent=2)
print('DOG_HANDLER', json.dumps(stats), flush=True)

# A neutral construction view catches the shape, pose and wardrobe independently
# of the game's one-bit acquisition. Lamps are inspection-only and not exported.
for name, point, energy, size in [
    ('proof sodium', (2.5, 3.4, 4.6), 900, 4.2),
    ('proof fill', (-3.0, 2.5, 2.2), 450, 4.5),
]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy
    light.shape = 'DISK'
    light.size = size
    light.color = (1, .72, .46) if name == 'proof sodium' else (.63, .72, .87)
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = point
camera_data = bpy.data.cameras.new('handler proof camera')
camera = bpy.data.objects.new('handler proof camera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (2.2, 2.7, 1.65)
camera.rotation_euler = (Vector((0, .0, .96)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.lens = 62
bpy.context.scene.camera = camera
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 900
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(PROOF, 'dog-handler-model-proof.png')
scene.view_settings.view_transform = 'AgX'
bpy.ops.render.render(write_still=True)
