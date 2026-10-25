"""Local Standing Tear pigment; calls the Ear room's actual authoring functions.
Run python3 this-file. No Ear assets are written; no Blender process is needed.
"""
import ast
import types
import random
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/chunk_surfer/build-stop-listening.py'
# The actual wall builder only needs BMesh's vertex/quad collection and face
# reversal. This adapter retains its exact point geometry, without requiring a
# Blender UI/runtime just to produce these flat films.
class Vector:
    def __init__(self, xyz): self.x, self.y, self.z = xyz
class Vertex:
    def __init__(self, xyz, index): self.co, self.index = Vector(xyz), index
class Vertices(list):
    def new(self, xyz):
        vertex = Vertex(xyz, len(self)); self.append(vertex); return vertex
class Face(list):
    smooth = False
    @property
    def normal(self):
        a,b,c = [v.co for v in self[:3]]
        u,v = [b.x-a.x,b.y-a.y,b.z-a.z],[c.x-a.x,c.y-a.y,c.z-a.z]
        return Vector([u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]])
class Faces(list):
    def new(self, vertices):
        face=Face(vertices);self.append(face);return face
class Mesh:
    def calc_loop_triangles(self):
        self.loop_triangles=[types.SimpleNamespace(vertices=[f[0],f[i],f[i+1]]) for f in self.faces for i in range(1,len(f)-1)]
class BMesh:
    def __init__(self): self.verts,self.faces=Vertices(),Faces()
    def to_mesh(self, mesh): mesh.vertices=self.verts;mesh.faces=[[v.index for v in f] for f in self.faces]
    def free(self): pass
bmesh=types.SimpleNamespace(new=BMesh,ops=types.SimpleNamespace(
    recalc_face_normals=lambda *args,**kwargs:None,
    reverse_faces=lambda bm,faces:[face.reverse() for face in faces]))
bpy=types.SimpleNamespace(data=types.SimpleNamespace(meshes=types.SimpleNamespace(new=lambda name:Mesh())))
ear=types.SimpleNamespace(math=math,random=random,bmesh=bmesh,bpy=bpy)
selected={'GLYPHS','GAP','WRITING','resample','hand_strokes','build_writing','srgb_to_linear','hex_linear'}
parsed=ast.parse(SOURCE.read_text())
body=[node for node in parsed.body if isinstance(node,ast.FunctionDef) and node.name in selected or isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in selected for t in node.targets)]
exec(compile(ast.Module(body=body,type_ignores=[]),str(SOURCE),'exec'),ear.__dict__)
base = dict(ear.GLYPHS)
# Extend the same centreline hand where the Ear room's one sentence had no
# glyph. Existing glyphs, spacing, resampling, pressure, serration, dry trails,
# pooling, drips, film relief and envelope all remain the original functions.
p = base['P'][1][0]
e = base['E'][1]
n = base['N'][1][0]
m = base['M'][1][0]
ear.GLYPHS.update({
    'A': (.78, [[(.05, 0), (.39, 1), (.73, 0)], [(.18, .39), (.60, .39)]]),
    'B': (.68, [p, [(x, 1-y) for x, y in p[1:]]]),
    'C': (.78, [base['G'][1][0][:8]]),
    'D': (.73, [p[:2] + [(x, (y-.52)/.48) for x, y in p[2:]]]),
    'F': (.62, [e[0][:-1], e[1]]),
    'H': (.74, [n[:2], n[2:], [(.05, .52), (.68, .52)]]),
    'K': (.74, [base['I'][1][0], [(.68, 1), (.10, .50), (.68, 0)]]),
    'R': (.76, [p, [(.36, .52), (.72, 0)]]),
    'U': (.78, [[(.02, 1), (.02, .5)] + [(.39+.37*math.cos(math.pi+i*math.pi/12), .5+.5*math.sin(math.pi+i*math.pi/12)) for i in range(13)] + [(.76, 1)]]),
    'W': (.88, [[(x, 1-y) for x, y in m]]),
    'Y': (.88, [[(.05, 1), (.44, .5), (.83, 1)], [(.44, .5), (.44, 0)]]),
})
assert all(ear.GLYPHS[k] == v for k, v in base.items())
texts = ['THE REFERENCE IS NOT TO BE', 'STOPPED BETWEEN ATTEMPTS',
         'THEY ARE WAITING ON ME', 'AGAIN', 'PERFECT PRACTICE MAKES',
         'FOR A PROPER PERFORMANCE', 'CHUNK SURFER']
meshes=[]
for index, text in enumerate(texts):
    assert set(text) <= set(ear.GLYPHS), text
    # Calling with the original line name retains its real pressure seed and
    # physical wall allocation. Only the sentence changes.
    mesh = ear.build_writing('stop_listening_writing_line', dict(lines=[text], h=.30, pitch=0.0, brush=.022, drips=14))
    mesh.calc_loop_triangles()
    points=[]
    for v in mesh.vertices:
        # Blender x,z,-y is the exact runtime axis convention of the Ear pack.
        # XY is normalized only so each sentence keeps the authored wall size;
        # pigment depth remains real metres and is never scaled into a tube.
        points.extend([round(v.co.x/4.7078, 8), round(v.co.z/.5918-.5, 8), round(-v.co.y, 9)])
    indices=[i for triangle in mesh.loop_triangles for i in triangle.vertices]
    meshes.append(dict(id=f'ear-writing-{index}',text=text,p=points,i=indices))
source_text=SOURCE.read_text()
hand_source=source_text[source_text.index('# ── the hand'):source_text.index('# ── the take sheet')]
report=dict(author='Ear room hand',source='tools/chunk_surfer/build-stop-listening.py',
            sourceSHA256=hashlib.sha256(hand_source.encode()).hexdigest(),
            generator='tools/chunk_surfer/build-standing-tear-lettering.py',
            sharedFunctions=['hand_strokes','resample','build_writing'],
            preservedGlyphs=sorted(base),extendedGlyphs=sorted(set(ear.GLYPHS)-set(base)),
            material=dict(name='stop listening paint pale',base=list(ear.hex_linear('#674A3D')),roughness=.93,metallic=0),
            filmRelief=.0018,meshes=meshes)
out=ROOT/'src/render/generated/standing-tear-lettering.js'
out.write_text('// Generated with the actual Ear room pigment builder. See provenance below.\nexport const STANDING_TEAR_EAR_LETTERING='+json.dumps(report,separators=(',',':'))+';\n')
print('STANDING TEAR EAR PIGMENT',sum(len(m['i'])//3 for m in meshes),'triangles',out)
