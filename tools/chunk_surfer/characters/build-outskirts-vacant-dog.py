"""Build the selected Vacant Dog as real open 3D anatomy, not a painted hole.

Run with Blender 4.5: Blender -b --factory-startup --python tools/chunk_surfer/characters/build-outskirts-vacant-dog.py
Game coordinates are metres, Y up, front -Z. The Blender source is retained.
"""
import bpy
import hashlib
import json
import math
import os
import random

import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
ASSET = os.path.join(ROOT, 'public/assets/outskirts-vacant-dog.glb')
SOURCE = os.path.join(ROOT, 'assets/source/outskirts-vacant-dog.blend')
META = os.path.join(ROOT, 'public/assets/outskirts-vacant-dog')
PROOF = os.path.join(ROOT, 'artifacts/outskirts-man-dog-design/production')
for folder in (META, PROOF, os.path.dirname(SOURCE)):
    os.makedirs(folder, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
random.seed(120515)


def B(point):
    return (point[0], -point[2], point[1])


def material(name, color, roughness=.82, mottled=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = 0
    shader.inputs['Base Color'].default_value = (*color, 1)
    if mottled:
        n = 384
        yy, xx = np.mgrid[:n, :n]
        rng = np.random.default_rng(925 + len(name) * 67)
        fine = rng.normal(0, .026, (n, n))
        broad = np.sin(xx * .027 + yy * .017) * np.sin(yy * .039 - xx * .014) * .038
        streak = np.sin(xx * .12 + np.sin(yy * .031) * 8) * .014
        stains = (np.maximum(0, np.sin(xx * .022 + yy * .029) * np.sin(yy * .021)) ** 3) * .09
        tone = fine + broad + streak - stains
        rgb = np.clip(np.array(color)[None, None, :] + tone[:, :, None], .008, .93)
        image = bpy.data.images.new(name + ' albedo', width=n, height=n, alpha=True)
        rgba = np.concatenate((rgb, np.ones((n, n, 1))), axis=2).astype(np.float32)
        image.pixels.foreach_set(rgba.ravel())
        image.filepath_raw = os.path.join(META, name.replace(' ', '-') + '.png')
        image.file_format = 'PNG'
        image.save()
        tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
    return mat


M = {
    'hide': material('vacant hide', (.18, .16, .145), .94, True),
    'head': material('hound face and neck', (.18, .16, .145), .94, True),
    'flesh': material('opened dark tissue', (.033, .018, .017), .86),
    'tendon': material('dry exposed tendon', (.27, .24, .21), .88, True),
    'eye': material('unanswering eye', (.019, .015, .013), .24),
    'nose': material('worn nose', (.045, .037, .034), .91, True),
    'nail': material('horn nail', (.16, .14, .12), .74),
    'collar': material('used leather', (.095, .066, .048), .69, True),
    'lead': material('worn slack lead', (.13, .085, .055), .82, True),
    'hardware': material('tarnished brass', (.38, .27, .12), .48),
}
# The street's void pool lights its ground, while the mesh pass retains only
# a low ambient field. Material-level exposure gives the hide, torn interior,
# and facial features distinct values in the *shared* final dither; a uniform
# instance glow had flattened the entire animal into one pale cardboard shape.
for key, light in {
    'hide': (.073, .055, .043), 'head': (.174, .127, .087),
    'flesh': (.006, .004, .003),
    'tendon': (.068, .049, .033), 'eye': (.028, .021, .015),
    'nose': (.042, .032, .024), 'nail': (.072, .050, .031),
    'collar': (.039, .031, .022), 'lead': (.115, .081, .052),
    'hardware': (.080, .060, .036),
}.items():
    shader = M[key].node_tree.nodes.get('Principled BSDF')
    shader.inputs['Emission Color'].default_value = (*light, 1)
    shader.inputs['Emission Strength'].default_value = 1

dog_parts = []
lead_parts = []


def mesh_object(name, vertices, faces, mat, target=dog_parts, uvs=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([B(v) for v in vertices], [], faces)
    mesh.update()
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if uvs:
        layer = mesh.uv_layers.new(name='surface')
        for polygon in mesh.polygons:
            for loop_index in polygon.loop_indices:
                layer.data[loop_index].uv = uvs[mesh.loops[loop_index].vertex_index]
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    target.append(ob)
    return ob


def ellipsoid(name, center, radii, mat, *, target=dog_parts, segments=24, rings=14):
    verts, faces, uv = [], [], []
    for row in range(rings + 1):
        lat = math.pi * row / rings
        for col in range(segments):
            lon = 2 * math.pi * col / segments
            wobble = 1 + .023 * math.sin(lon * 5 + row * 1.31) + .013 * math.sin(lon * 11 - row * .89)
            verts.append((center[0] + radii[0] * math.sin(lat) * math.cos(lon) * wobble,
                          center[1] + radii[1] * math.cos(lat),
                          center[2] + radii[2] * math.sin(lat) * math.sin(lon) * wobble))
            uv.append((col / segments, row / rings))
    for row in range(rings):
        for col in range(segments):
            nxt = (col + 1) % segments
            faces.append((row * segments + col, row * segments + nxt,
                          (row + 1) * segments + nxt, (row + 1) * segments + col))
    return mesh_object(name, verts, faces, mat, target, uv)


def smooth_path(points, steps=5):
    out = []
    for i in range(len(points) - 1):
        a = np.array(points[max(0, i - 1)], float)
        b = np.array(points[i], float)
        c = np.array(points[i + 1], float)
        d = np.array(points[min(len(points) - 1, i + 2)], float)
        for j in range(steps):
            t = j / steps
            out.append(.5 * ((2 * b) + (-a + c) * t +
                             (2 * a - 5 * b + 4 * c - d) * t * t +
                             (-a + 3 * b - 3 * c + d) * t * t * t))
    out.append(np.array(points[-1], float))
    return out


def tube(name, points, radii, mat, *, target=dog_parts, sides=12, steps=4, taper_ends=False):
    path = smooth_path(points, steps)
    verts, faces, uv = [], [], []
    for i, center in enumerate(path):
        tangent = path[min(len(path) - 1, i + 1)] - path[max(0, i - 1)]
        tangent /= np.linalg.norm(tangent)
        reference = np.array((0, 1, 0), float)
        if abs(np.dot(tangent, reference)) > .92:
            reference = np.array((1, 0, 0), float)
        axis = np.cross(tangent, reference)
        axis /= np.linalg.norm(axis)
        other = np.cross(tangent, axis)
        fraction = i / (len(path) - 1)
        scale_at = fraction * (len(radii) - 1)
        low = int(scale_at)
        radius = radii[low] * (1 - scale_at + low) + radii[min(low + 1, len(radii) - 1)] * (scale_at - low)
        if taper_ends:
            radius *= .42 + .58 * min(1, fraction * 8, (1 - fraction) * 8)
        for j in range(sides):
            angle = 2 * math.pi * j / sides
            grain = 1 + .045 * math.sin(i * .77 + j * 1.83) + .025 * math.sin(i * 1.43 - j * 2.49)
            p = center + radius * grain * (math.cos(angle) * axis + math.sin(angle) * other)
            verts.append(tuple(p))
            uv.append((j / sides, fraction))
    for i in range(len(path) - 1):
        for j in range(sides):
            nxt = (j + 1) % sides
            faces.append((i * sides + j, i * sides + nxt, (i + 1) * sides + nxt, (i + 1) * sides + j))
    faces.extend((tuple(reversed(tuple(range(sides)))), tuple((len(path) - 1) * sides + j for j in range(sides))))
    return mesh_object(name, verts, faces, mat, target, uv)


# The body is one weight-bearing hide, cut *through* twice. The openings are
# real voids, not planes/opacity or bright decorative hoops. The Boolean cut
# surfaces use a separate, dark tissue material; no rods float in the void.
ellipsoid('long greyhound trunk', (0, 2.02, .48), (.36, .50, 1.24), M['hide'], segments=52, rings=34)
tube('raised spine', [(0, 2.18, 1.52), (0, 2.43, 1.12), (0, 2.61, .57),
                      (0, 2.73, .08), (0, 2.49, -.29), (0, 2.27, -.54)],
     [.13, .12, .13, .18, .15, .16], M['hide'], sides=16, steps=6)
tube('drawn lower abdomen', [(0, 1.76, 1.36), (0, 1.60, .95), (0, 1.58, .48),
                             (0, 1.65, .03), (0, 1.81, -.48)],
     [.13, .09, .08, .10, .14], M['hide'], sides=14)

HOLES = ((.08, 2.09, .40, .43), (1.04, 1.98, .25, .26))

# Shoulder, hips and four planted, bent limbs keep the impossible trunk canine.
ellipsoid('front shoulder', (0, 2.00, -.58), (.31, .39, .38), M['hide'])
ellipsoid('hind pelvis', (0, 1.77, 1.49), (.30, .33, .33), M['hide'])
for side in (-1, 1):
    x = side * .34
    ellipsoid(f'front scapula {side}', (x, 1.95, -.58), (.11, .27, .17), M['hide'])
    tube(f'front limb {side}', [(x, 1.85, -.61), (x * 1.05, 1.31, -.75),
                                (x * 1.02, .75, -.67), (x * 1.12, .12, -.78)],
         [.13, .095, .072, .084], M['hide'], sides=16, steps=6)
    ellipsoid(f'front elbow {side}', (x * 1.05, 1.18, -.73), (.09, .095, .10), M['hide'])
    ellipsoid(f'front paw {side}', (x * 1.12, .10, -.91), (.135, .075, .17), M['hide'])
    tube(f'front tendon {side}', [(x + side * .07, 1.42, -.69), (x + side * .095, .82, -.65),
                                  (x + side * .09, .25, -.79)], [.026, .030, .024], M['tendon'], sides=8)
    tube(f'hind limb {side}', [(x * .82, 1.60, 1.43), (x * 1.07, 1.04, 1.65),
                               (x * 1.14, .63, 1.38), (x * 1.20, .12, 1.43)],
         [.16, .12, .080, .086], M['hide'], sides=16, steps=6)
    ellipsoid(f'hind paw {side}', (x * 1.20, .10, 1.24), (.13, .075, .18), M['hide'])
    for front, z in ((True, -.99), (False, 1.16)):
        cx = x * (1.12 if front else 1.20)
        for toe in (-1, 0, 1):
            ellipsoid(f'{"front" if front else "hind"} digit {side} {toe}',
                      (cx + toe * .062, .055, z - .10), (.038, .040, .10), M['hide'], segments=12, rings=8)
            ellipsoid(f'{"front" if front else "hind"} nail {side} {toe}',
                      (cx + toe * .062, .047, z - .18), (.027, .022, .046), M['nail'], segments=12, rings=8)

# Long, independently aimed head. Its long snout tapers from real canine
# cheeks and jaw rather than ending in a spherical toy nose.
tube('rising neck', [(0, 2.06, -.62), (0, 2.33, -.81), (0, 2.54, -1.07),
                      (0, 2.59, -1.25)], [.29, .26, .22, .23], M['hide'], sides=20, steps=6)
ellipsoid('hound cranium', (0, 2.61, -1.31), (.275, .215, .275), M['hide'], segments=32, rings=20)
tube('canine muzzle', [(0, 2.55, -1.43), (0, 2.53, -1.54),
                       (0, 2.49, -1.70), (0, 2.47, -1.82)],
     [.20, .18, .145, .115], M['hide'], sides=24, steps=8)
ellipsoid('nose leather', (0, 2.47, -1.815), (.102, .029, .053), M['nose'])
ellipsoid('lower jaw', (0, 2.395, -1.63), (.15, .050, .255), M['hide'])
for side in (-1, 1):
    ellipsoid(f'eye socket {side}', (side * .260, 2.63, -1.41), (.016, .040, .050), M['flesh'], segments=16, rings=10)
    ellipsoid(f'eye {side}', (side * .277, 2.63, -1.43), (.012, .022, .026), M['eye'], segments=14, rings=10)
    tube(f'brow {side}', [(side * .235, 2.71, -1.34), (side * .275, 2.68, -1.43),
                         (side * .245, 2.64, -1.53)], [.030, .026, .015], M['hide'], sides=10)
    tube(f'hanging hound ear {side}', [(side * .22, 2.70, -1.17),
                                      (side * .32, 2.60, -1.16),
                                      (side * .37, 2.40, -1.15),
                                      (side * .34, 2.33, -1.13)],
         [.057, .070, .042, .012], M['hide'], sides=14, steps=5)
tube('lower tail', [(0, 1.83, 1.73), (0, 1.52, 2.03), (.08, 1.39, 2.25),
                    (.12, 1.42, 2.43)], [.17, .11, .074, .035], M['hide'], sides=12)

# A collar at the root of the neck, legible from the handler's side; the lead
# carries its own true gravity belly and never acts as a barrier.
tube('collar', [(-.255, 2.27, -.78), (-.16, 2.41, -.79), (0, 2.45, -.79),
                (.16, 2.41, -.79), (.255, 2.27, -.78)], [.050] * 5, M['collar'], sides=12)
ellipsoid('collar ring', (.27, 2.29, -.81), (.075, .065, .035), M['hardware'], segments=14, rings=10)

# Lead coordinates are relative to the man's planted feet. The dog is staged
# 2m east, facing the verge; the lead hangs in a genuine U to its collar.
tube('slack leather lead', [(.46, .79, -.11), (.78, .51, -.17), (1.25, .21, -.12),
                            (1.72, .16, .03), (2.13, .47, .10), (2.35, .91, .14),
                            (2.47, 1.33, .157)],
     [.022, .024, .026, .026, .024, .022, .019], M['lead'], target=lead_parts, sides=10, steps=7)
ellipsoid('lead clasp', (2.47, 1.33, .157), (.042, .063, .041), M['hardware'], target=lead_parts)


def join(parts, name):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in parts:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = parts[0]
    ob.name = name
    ob.data.name = name
    return ob


# Merge only the hide into one continuous skin. This removes the toy-joint
# seams while leaving the exposed rings, tissue and tendons separately modeled.
hide_parts = [ob for ob in dog_parts if ob.data.materials[0] == M['hide']]
hide = join(hide_parts, 'continuous hide')
dog_parts = [ob for ob in dog_parts if ob not in hide_parts] + [hide]
bpy.ops.object.select_all(action='DESELECT')
hide.select_set(True)
bpy.context.view_layer.objects.active = hide
hide.data.remesh_voxel_size = .018
bpy.ops.object.voxel_remesh()
smooth = hide.modifiers.new('subtle smoothed tissue', 'SMOOTH')
smooth.factor = 1.2
smooth.iterations = 6
bpy.ops.object.modifier_apply(modifier=smooth.name)
for index, (z, cy, rz, ry) in enumerate(HOLES):
    # A sphere left a concave *back wall* in each opening. In the final dither
    # that wall filled the supposed void with grey stripes, so the injury read
    # as two painted disks. A closed cutter extruded all the way through the
    # animal leaves the far side of the road genuinely visible in each hole.
    vertices, faces = [], []
    sides = 72
    for x in (-1.5, 1.5):
        for step in range(sides):
            angle = 2 * math.pi * step / sides
            warp = 1 + .18 * math.sin(3 * angle + index) + .066 * math.sin(7 * angle - index * .9)
            vertices.append(B((x, cy + math.cos(angle) * ry * warp,
                               z + math.sin(angle) * rz * warp)))
    for step in range(sides):
        nxt = (step + 1) % sides
        faces.append((step, nxt, sides + nxt, sides + step))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple(sides + step for step in range(sides)))
    mesh = bpy.data.meshes.new(f'through cut {index}')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(M['flesh'])
    cutter = bpy.data.objects.new(f'cut away body {index}', mesh)
    bpy.context.collection.objects.link(cutter)
    bpy.context.view_layer.objects.active = hide
    cavity = hide.modifiers.new(f'through cavity {index}', 'BOOLEAN')
    cavity.operation = 'DIFFERENCE'
    cavity.solver = 'EXACT'
    cavity.material_mode = 'TRANSFER'
    cavity.object = cutter
    bpy.ops.object.modifier_apply(modifier=cavity.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

# Blender's Boolean material transfer leaves these side walls in the hide
# material. Classify the real new surface by its irregular cutter ellipse and
# wall-facing normal, then give the inner wall a raw dark value and its outer
# edge a thin fascia value. This does not add hoops or fill either opening.
if M['flesh'] not in list(hide.data.materials):
    hide.data.materials.append(M['flesh'])
flesh_index = list(hide.data.materials).index(M['flesh'])
if M['tendon'] not in list(hide.data.materials):
    hide.data.materials.append(M['tendon'])
fascia_index = list(hide.data.materials).index(M['tendon'])
for polygon in hide.data.polygons:
    if hide.data.materials[polygon.material_index] != M['hide']:
        continue
    for hole_index, (gz, cy, rz, ry) in enumerate(HOLES):
        q = ((-polygon.center.y - gz) / rz) ** 2 + ((polygon.center.z - cy) / ry) ** 2
        normal_x = abs(polygon.normal.x)
        inside = .17 if hole_index == 0 else .22
        outer = .26 if hole_index == 0 else .31
        if abs(q - 1) < .38 and abs(polygon.center.x) < inside and normal_x < .75:
            polygon.material_index = flesh_index
            break
        if abs(q - 1) < .24 and inside <= abs(polygon.center.x) < outer and normal_x < .92:
            polygon.material_index = fascia_index
            break

grain = bpy.data.textures.new('hide surface grain', type='CLOUDS')
grain.noise_scale = .105
texture = hide.modifiers.new('uneven hide', 'DISPLACE')
texture.texture = grain
texture.strength = .014
bpy.ops.object.modifier_apply(modifier=texture.name)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(island_margin=.01)
bpy.ops.object.mode_set(mode='OBJECT')
# The face must register before the pierced flank at road distance. It is one
# continuous hide with a different exposure in the head/neck, not a separate
# glowing head prop that would break the skin or dither integration.
hide.data.materials.append(M['head'])
head_material_index = len(hide.data.materials) - 1
for polygon in hide.data.polygons:
    if hide.data.materials[polygon.material_index] == M['hide'] and polygon.center.y > .95:
        polygon.material_index = head_material_index

dog = join(dog_parts, 'outskirts_vacant_dog')
lead = join(lead_parts, 'outskirts_slack_lead')
# The impossible span stays wide, but its shoulder and head meet the handler
# at a believable canine height. Local origin remains on the road surface.
for vertex in dog.data.vertices:
    vertex.co *= .58
bpy.ops.wm.save_as_mainfile(filepath=SOURCE)
bpy.ops.object.select_all(action='DESELECT')
dog.select_set(True)
lead.select_set(True)
bpy.context.view_layer.objects.active = dog
bpy.ops.export_scene.gltf(filepath=ASSET, export_format='GLB', use_selection=True,
                          export_apply=True, export_yup=True)

with open(ASSET, 'rb') as stream:
    data = stream.read()
mesh_names = [mesh.name for mesh in bpy.data.meshes if mesh.users]
stats = {
    'design': 'The Vacant Dog', 'coordinates': 'metres, Y up, front -Z',
    'source': 'tools/chunk_surfer/characters/build-outskirts-vacant-dog.py',
    'meshes': ['outskirts_vacant_dog', 'outskirts_slack_lead'],
    'dogVertices': len(dog.data.vertices), 'dogTriangles': sum(len(face.vertices) - 2 for face in dog.data.polygons),
    'leadVertices': len(lead.data.vertices), 'bytes': len(data),
    'sha256': hashlib.sha256(data).hexdigest(),
    'construction': 'two Boolean through-cavities in a continuous anatomical hide, with dark raw cut surfaces; no opacity holes',
    'anatomicalScale': .58,
}
with open(os.path.join(META, 'manifest.json'), 'w') as stream:
    json.dump(stats, stream, indent=2)
print('VACANT_DOG', json.dumps(stats))

# Neutral model proof. The temporary scale figure is not exported.
lead.hide_render = True
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.035))
floor = bpy.context.object
floor.name = 'proof road only'
floor.data.materials.append(material('wet road proof', (.006, .007, .006), .48))
for name, point, energy, size in [
    ('sodium', (3.2, -1.2, 6.1), 1250, 5.0),
    ('cold rim', (-4.0, 1.5, 4.0), 700, 5.0),
]:
    light = bpy.data.lights.new(name, 'AREA')
    light.energy = energy
    light.shape = 'DISK'
    light.size = size
    if name == 'sodium': light.color = (1, .70, .40)
    ob = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(ob)
    ob.location = point
camera_data = bpy.data.cameras.new('model proof camera')
camera = bpy.data.objects.new('model proof camera', camera_data)
bpy.context.collection.objects.link(camera)
camera.location = (4.15, 2.55, 1.53)
target = Vector((0, -.1, 1.04))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.lens = 50
bpy.context.scene.camera = camera
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = os.path.join(PROOF, 'vacant-dog-model-proof.png')
scene.view_settings.view_transform = 'AgX'
bpy.ops.render.render(write_still=True)
