"""CPU-only conservative decimation of selected original HuBMAP chambers.
Input JSON is extracted by thorax-organ-source.mjs; original GLB is untouched.
"""
from pathlib import Path
import bpy,bmesh,json,hashlib
ROOT=Path(__file__).resolve().parent/'hubmap'
source=json.loads((ROOT/'heart-external-full.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
total=sum(len(p['indices'])//3 for p in source['parts'])
target=8000
parts=[]
for part in source['parts']:
    positions=part['positions'];indices=part['indices']
    mesh=bpy.data.meshes.new(part['name'])
    mesh.from_pydata([positions[i:i+3]for i in range(0,len(positions),3)],[],[indices[i:i+3]for i in range(0,len(indices),3)])
    mesh.update()
    obj=bpy.data.objects.new(part['name'],mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    modifier=obj.modifiers.new('Conservative chamber LOD','DECIMATE')
    modifier.ratio=min(1,target/total)
    modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    # The original right atrium contains tiny coincident-contact slivers and
    # zero-area facets. Repair only the derived LOD: remove surplus smallest
    # contact facets, fill resulting boundary loops, retain other geometry.
    bm=bmesh.new();bm.from_mesh(obj.data)
    tolerance=1e-5 if part['repair'].get('nonmanifoldContactEdges',0) else 1e-9
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=tolerance)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-7)
    removed=[]
    for edge in list(bm.edges):
        if edge.is_valid and len(edge.link_faces)>2:
            extra=sorted(edge.link_faces,key=lambda f:f.calc_area())[:len(edge.link_faces)-2]
            for face in extra:
                if face.is_valid:removed.append(face.calc_area());bm.faces.remove(face)
    boundary=[e for e in bm.edges if e.is_boundary]
    filled=bmesh.ops.holes_fill(bm,edges=boundary,sides=0).get('faces',[]) if boundary else []
    bmesh.ops.triangulate(bm,faces=list(bm.faces))
    # A second pass resolves tiny slits that become simple after the first
    # fill. Only the damaged atrium uses 10 micrometres (<0.6 mm at game fit).
    remaining=[e for e in bm.edges if e.is_boundary]
    if remaining:
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=tolerance)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=tolerance*.1)
        bmesh.ops.holes_fill(bm,edges=[e for e in bm.edges if e.is_boundary],sides=0)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    boundary_after=sum(e.is_boundary for e in bm.edges)
    nonmanifold_after=sum(len(e.link_faces)>2 for e in bm.edges)
    if boundary_after or nonmanifold_after:
        detail=[[[float(c)for c in v.co]for v in e.verts]for e in bm.edges if e.is_boundary]
        raise RuntimeError(f'{part["name"]}: LOD not closed ({boundary_after} boundaries / {nonmanifold_after} contacts): {detail[:8]}')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    obj.data.calc_loop_triangles()
    p=[float(c)for v in obj.data.vertices for c in v.co]
    ids=[int(i)for t in obj.data.loop_triangles for i in t.vertices]
    repair={**part['repair'],'lodRemovedContactFacets':len(removed),'lodRemovedContactAreaM2':sum(removed),
       'lodBoundaryEdgesFilled':len(boundary),'lodBoundaryEdgesAfter':boundary_after,'lodNonmanifoldEdgesAfter':nonmanifold_after,'lodSourceWeldToleranceM':tolerance}
    parts.append({'name':part['name'],'sourceMesh':part['sourceMesh'],'positions':p,'indices':ids,'repair':repair,
       'sourceTriangles':len(indices)//3,'lodTriangles':len(ids)//3})
    obj.select_set(False)
output={**source,'parts':parts,'lod':{'method':'Blender 4.5.3 background CPU DECIMATE collapse, independently per named chamber; no rendering',
    'blenderVersion':bpy.app.version_string,'sourceTriangles':total,'targetTriangles':target,'actualTriangles':sum(len(p['indices'])//3 for p in parts),
    'originalRetainedUnchanged':True,'proportionsPreserved':True,'rendered':False,
    'derivativeRepair':'Small pre-existing contact facets removed and boundary loops filled in LOD only; exact per-chamber counts retained.',
    'builderSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}}
temporary=ROOT/'heart-external-lod.json.tmp'
temporary.write_text(json.dumps(output,separators=(',',':'))+'\n')
temporary.replace(ROOT/'heart-external-lod.json')
print(json.dumps(output['lod']))
