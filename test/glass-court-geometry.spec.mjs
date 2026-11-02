import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {NodeIO} from '@gltf-transform/core';
import {Ray,Vector3,Triangle,Box3} from 'three';
import {GLASS_COURT} from '../src/data/glass-court.js';
import {GLASS_COURT_SIGHTLINES} from '../src/data/glass-court-sightlines.js';
import {GLASS_COURT_PRESENCES} from '../src/data/glass-court-presences.js';

const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const bytes=read('public/assets/glass-court.glb'),stats=JSON.parse(read('public/assets/glass-court.stats.json'));
const credits=JSON.parse(read('public/assets/glass-court.credits.json'));
const doc=await new NodeIO().readBinary(bytes),meshes=doc.getRoot().listMeshes(),byName=new Map(meshes.map(m=>[m.getName(),m]));
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((n,k)=>n-b[k]),dot=(a,b)=>a.reduce((s,n,k)=>s+n*b[k],0);
function meshEnvelope(name){
  const c=GLASS_COURT,b=c.roofBounds,p=c.plantingBands,changing=c.changing;
  const bounds=(min,max)=>({min,max});
  if(name==='glass_court_frame'){
    const pool=GLASS_COURT_SIGHTLINES.enclosures.find(r=>r.spaceId==='natatorium');
    return bounds([Math.min(pool.x0,c.elleryFace.x0)-c.origin.x,-.09,-.13],[c.elleryFace.x1-c.origin.x,c.elleryFace.height,b.z1+.13]);
  }
  if(name==='glass_court_glass')return bounds([b.x0-.005,0,b.z0-.005],[b.x1+.005,c.ridge,b.z1+.005]);
  if(['glass_court_beds','glass_court_nursery','glass_court_plants'].includes(name))return bounds(
    [Math.min(...p.map(q=>q.x0)),0,Math.min(...p.map(q=>q.z0))],
    [Math.max(...p.map(q=>q.x1)),name==='glass_court_beds'?Math.max(...p.map(q=>q.height)):name==='glass_court_nursery'?1.2:c.eaves-.3,Math.max(...p.map(q=>q.z1))]);
  if(name==='glass_court_vestibule')return bounds([changing.x0-.08,-.02,-.12],[changing.x1+.08,changing.ceiling+.44,changing.z1+.1]);
  if(name==='glass_court_upper_guards'){
    const points=[...c.upperGuards.academicPolygon,...c.upperGuards.roofPolygon];
    return bounds([Math.min(...points.map(p=>p[0]))-c.origin.x-.2,10-c.drawnFloor,Math.min(...points.map(p=>p[1]))-c.origin.z-.2],
      [Math.max(...points.map(p=>p[0]))-c.origin.x+.2,17+c.upperGuards.height-c.drawnFloor,Math.max(...points.map(p=>p[1]))-c.origin.z+.2]);
  }
  assert.equal(name,c.entranceFixtures.mesh,'every packed mesh has an accountable architectural envelope');
  const dx=c.entranceFixtures.origin.x-c.origin.x,dz=c.entranceFixtures.origin.z-c.origin.z;
  return bounds([changing.x0-dx,-.01,changing.z0-dz],[changing.x1-dx,2.3,changing.z1-dz]);
}
function partTriangles(mesh,part){
  const primitive=mesh.listPrimitives().find(p=>p.getMaterial().getName()===part.material),p=primitive.getAttribute('POSITION').getArray(),indices=primitive.getIndices().getArray(),out=[];
  for(let i=part.startTriangle*3;i<(part.startTriangle+part.triangles)*3;i+=3)
    out.push([0,1,2].map(n=>Array.from(p.slice(indices[i+n]*3,indices[i+n]*3+3))));
  return out;
}
function pngPixels(image){
  const data=Buffer.from(image),compressed=[];let width,height;
  assert.equal(data.subarray(1,4).toString(),'PNG');
  for(let at=8;at<data.length;){const length=data.readUInt32BE(at),type=data.subarray(at+4,at+8).toString(),body=data.subarray(at+8,at+8+length);
    if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);assert.equal(body[8],8);assert.equal(body[9],6);}
    if(type==='IDAT')compressed.push(body);at+=12+length;
  }
  const raw=zlib.inflateSync(Buffer.concat(compressed)),pixels=[];
  for(let y=0;y<height;y++){assert.equal(raw[y*(width*4+1)],0);for(let x=0;x<width;x++)pixels.push(Array.from(raw.subarray(y*(width*4+1)+1+x*4,y*(width*4+1)+5+x*4)));}
  return {width,height,pixels};
}

test('the dedicated court binds current canonical inputs and stays within its finite asset budget',()=>{
  assert.deepEqual([...byName.keys()],[...GLASS_COURT.meshNames,GLASS_COURT.entranceFixtures.mesh]);assert.equal(stats.sha256,sha(bytes));assert.equal(credits.pack.sha256,sha(bytes));
  assert.equal(stats.bytes,bytes.length);assert.ok(stats.totalTriangles<43000);assert.ok(bytes.length<5*1024*1024);
  assert.deepEqual(stats.canonicalCourt,GLASS_COURT);
  for(const[file,hash]of Object.entries(stats.sourceSha256))assert.equal(sha(read(file)),hash,file);
  assert.ok(stats.sourceSha256['tools/chunk_surfer/lettering/fonts/NimbusSansNarrow-Bold.otf']);
  // The shared pack can legitimately be rebuilt by its owner. Its recorded
  // snapshot protects only the generator execution, never future freshness.
  assert.equal(stats.protectedAssetsUnchangedDuringBuild,true);
  assert.equal(stats.facadeAdded,true);assert.equal(stats.rearDoorAdded,true);assert.equal(stats.apparitionsAdded,false);
  for(const node of doc.getRoot().listNodes()){
    assert.deepEqual(node.getTranslation(),[0,0,0]);assert.deepEqual(node.getRotation(),[0,0,0,1]);assert.deepEqual(node.getScale(),[1,1,1]);
  }
});

test('roof and side glass use actual sparse MASK cutouts, with no opaque or unsupported blend panes',()=>{
  const glazing=byName.get('glass_court_glass');assert.equal(glazing.listPrimitives().length,1);
  const material=glazing.listPrimitives()[0].getMaterial();assert.equal(material.getAlphaMode(),'MASK');assert.equal(material.getAlphaCutoff(),.5);
  assert.equal(material.getBaseColorFactor()[3],1,'base alpha is not a fake transparency setting');
  const decoded=pngPixels(material.getBaseColorTexture().getImage());
  const covered=decoded.pixels.filter(p=>p[3]>=128).length/(decoded.width*decoded.height);
  close(covered,stats.textures.glass.coverage,1e-10);assert.ok(covered>.03&&covered<.20,'most pane pixels retain an actual view through the existing renderer');
  assert.ok(decoded.pixels.every(p=>p[3]===0||p[3]===255));
  assert.ok(doc.getRoot().listMaterials().every(m=>['OPAQUE','MASK'].includes(m.getAlphaMode())&&!m.getDoubleSided()));
  assert.ok(stats.meshes.glass_court_glass.parts.some(p=>p.role==='side-glazing'));
  assert.ok(stats.meshes.glass_court_glass.parts.some(p=>p.role==='roof-glazing'));
});

test('fixed glazing, the changing enclosure and the actual clear lane agree with the indoor route',()=>{
  const parts=Object.entries(stats.meshes).filter(([name])=>name!==GLASS_COURT.entranceFixtures.mesh).flatMap(([,m])=>m.parts);
  const beds=stats.meshes.glass_court_beds.parts.filter(p=>p.role==='solid-planting');
  for(const part of beds){const q=part.bounds;assert.ok(GLASS_COURT.plantingBands.some(b=>q.min[0]>=b.x0-1e-6&&q.max[0]<=b.x1+1e-6&&q.min[2]>=b.z0-1e-6&&q.max[2]<=b.z1+1e-6&&q.max[1]<=b.height+1e-6));}
  assert.ok(stats.clearLane.width>=2.5);
  const lane=stats.clearLane;
  // The planting aisle widens beyond the real two-metre end apertures.
  // Check both interior width and the usable body clearance at each jamb.
  const lanes=[{...lane,z0:.13,z1:11.87},
    {x0:GLASS_COURT.entryGap.x0+GLASS_COURT.bodyRadius,x1:GLASS_COURT.entryGap.x1-GLASS_COURT.bodyRadius,z0:-.13,z1:.13},
    {x0:GLASS_COURT.entryGap.x0+GLASS_COURT.bodyRadius,x1:GLASS_COURT.entryGap.x1-GLASS_COURT.bodyRadius,z0:11.87,z1:GLASS_COURT.changing.z1+.11}];
  for(const part of parts){const q=part.bounds;
    const blocks=q.max[1]>.10&&q.min[1]<2.6&&lanes.some(l=>q.max[0]>l.x0+1e-6&&q.min[0]<l.x1-1e-6&&q.max[2]>l.z0+1e-6&&q.min[2]<l.z1-1e-6);
    assert.equal(blocks,false,part.id+' must leave the physical walking band clear');
  }
  for(const x of[0,4]){const side=parts.find(p=>p.id==='side-plinth:'+x);close(side.bounds.min[0],x-.06);close(side.bounds.max[0],x+.06);close(side.bounds.min[2],0);close(side.bounds.max[2],12);close(side.bounds.max[1],.20);}
  const ceiling=parts.find(p=>p.id==='changing-ceiling');close(ceiling.bounds.min[1],GLASS_COURT.changing.ceiling);close(ceiling.bounds.min[0],GLASS_COURT.changing.x0);close(ceiling.bounds.max[0],GLASS_COURT.changing.x1);
  for(const d of GLASS_COURT.partitionSegments)assert.ok(parts.some(p=>p.id===d.id));
  for(const lamp of GLASS_COURT.lamps){assert.deepEqual(stats.lamps.find(l=>l.id===lamp.id),lamp);if(lamp.id.includes('light')||lamp.id.includes('fluorescent'))assert.equal(parts.filter(p=>p.id.startsWith('tube:'+lamp.id+':')).length,2);}
  const central=parts.filter(p=>p.role.startsWith('central-')),stems=central.filter(p=>p.role==='central-stem');assert.ok(stems.length>=30);assert.ok(central.filter(p=>p.role==='central-broadleaf').length>=stems.length*8);
  for(const part of central){const q=part.bounds;assert.ok(GLASS_COURT.plantingBands.some(b=>q.min[0]>=b.x0-1e-6&&q.max[0]<=b.x1+1e-6&&q.min[2]>=b.z0-1e-6&&q.max[2]<=b.z1+1e-6&&q.max[1]<=3));}
});

test('the entrance fixtures fit the independent changing buffer without screens or admission arms across its lane',()=>{
  const parts=stats.meshes.natatorium_entrance_fixtures.parts,offset=[GLASS_COURT.entranceFixtures.origin.x-GLASS_COURT.origin.x,0,GLASS_COURT.entranceFixtures.origin.z-GLASS_COURT.origin.z];
  assert.deepEqual(stats.fixtureOrigin,GLASS_COURT.entranceFixtures.origin);
  const top=parts.find(p=>p.id==='rehosted-attendant-worktop'),c=GLASS_COURT.counter;
  close(top.bounds.min[0]+offset[0],c.x-(c.width+.06)/2);close(top.bounds.max[0]+offset[0],c.x+(c.width+.06)/2);
  close(top.bounds.min[2]+offset[2],c.z-(c.depth+.08)/2);close(top.bounds.max[2]+offset[2],c.z+(c.depth+.08)/2);
  for(const part of parts){const q=part.bounds;
    assert.ok(q.min[0]+offset[0]>=GLASS_COURT.changing.x0-.01&&q.max[0]+offset[0]<=GLASS_COURT.changing.x1+.01,part.id+' stays inside changing');
    assert.ok(q.min[2]+offset[2]>=GLASS_COURT.changing.z0&&q.max[2]+offset[2]<=GLASS_COURT.changing.z1,part.id+' stays inside changing');
    const blocks=q.max[1]>.10&&q.min[1]<2.6&&q.max[0]+offset[0]>GLASS_COURT.bodyLane.x0&&q.min[0]+offset[0]<GLASS_COURT.bodyLane.x1;
    assert.equal(blocks,false,part.id+' leaves the actual central route clear');
  }
  for(const role of ['rehosted-admission-counter','rehosted-folded-turnstile','rehosted-service-hardware'])assert.ok(parts.some(p=>p.role===role));
  assert.equal(parts.filter(p=>p.id.startsWith('folded-turnstile-arm:')).length,3,'the folded gate retains all three physical arms');
});

test('opaque eye-height signs use pinned lettering with reader-right and reader-up matching each mounted face',()=>{
  assert.equal(stats.lettering.entries.length,3);
  for(const[n,s]of GLASS_COURT.signs.entries()){
    const entry=stats.lettering.entries.find(e=>e.id===s.id);assert.equal(entry.copy,s.copy.replaceAll(' / ','\n'));assert.ok(entry.metrics.fontSha256);assert.ok(entry.metrics.coverage>.02);
    const part=stats.meshes.glass_court_vestibule.parts.find(p=>p.id==='sign-face:'+s.id);assert.ok(part.bounds.min[1]>1.4&&part.bounds.max[1]<1.9);
    const primitive=byName.get('glass_court_vestibule').listPrimitives().find(p=>p.getMaterial().getName()==='court physical sign '+n),material=primitive.getMaterial();assert.equal(material.getAlphaMode(),'OPAQUE');assert.equal(material.getExtras().printedSurface.coverage,'baseColorAlpha');
    const pos=primitive.getAttribute('POSITION').getArray(),norm=primitive.getAttribute('NORMAL').getArray(),uv=primitive.getAttribute('TEXCOORD_0').getArray(),right=cross([0,1,0],s.normal),front=[];
    for(let i=0;i<pos.length/3;i++)if(dot(Array.from(norm.slice(i*3,i*3+3)),s.normal)>.999)front.push({r:dot(Array.from(pos.slice(i*3,i*3+3)),right),y:pos[i*3+1],u:uv[i*2],v:uv[i*2+1]});
    assert.ok(front.length>=6);front.sort((a,b)=>a.r-b.r);assert.ok(front.at(-1).u>front[0].u,'reader-right increases U');front.sort((a,b)=>a.y-b.y);assert.ok(front.at(-1).v<front[0].v,'the top of the readable face is the top of the image');
  }
});

test('both destination signs clear packed foliage, retained pool piers and the ordinary door swing from the approach',async()=>{
  const point=new Vector3();
  const triangles=[];
  for(const[name,mesh]of byName)for(const part of stats.meshes[name].parts){
    if(part.role==='physical-wayfinding'||part.material==='court sparse glazed reflection')continue;
    const offset=name===GLASS_COURT.entranceFixtures.mesh?[GLASS_COURT.entranceFixtures.origin.x-GLASS_COURT.origin.x,0,GLASS_COURT.entranceFixtures.origin.z-GLASS_COURT.origin.z]:[0,0,0];
    for(const triangle of partTriangles(mesh,part))triangles.push(Object.assign(triangle.map(p=>new Vector3(...p.map((v,k)=>v+offset[k]))),{owner:name+':'+part.id}));
  }
  // Include retained original pool relief: its east pier at (95.5,32)
  // occluded the former east-jamb sign even though the new pack was clear.
  const main=await new NodeIO().readBinary(read('public/assets/conservatory-props.glb')),relief=main.getRoot().listMeshes().find(m=>m.getName()==='natatorium_perimeter_relief');
  const packedTriangles=(mesh,transform)=>mesh.listPrimitives().flatMap(primitive=>{const p=primitive.getAttribute('POSITION').getArray(),ids=primitive.getIndices().getArray(),out=[];for(let i=0;i<ids.length;i+=3)out.push([0,1,2].map(k=>transform(Array.from(p.slice(ids[i+k]*3,ids[i+k]*3+3)))));return out;});
  triangles.push(...packedTriangles(relief,p=>new Vector3(p[0]+83-GLASS_COURT.origin.x,p[1],p[2]+38.5-GLASS_COURT.origin.z)));
  FP.compile(conservatory.levels,{...conservatory,doors:conservatory.doors});
  const source=read('src/main.js').toString(),extract=name=>{const start=source.indexOf(`function ${name}(`);let at=source.indexOf('{',start),depth=1,end=at+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(start,end);},context=vm.createContext({CELL:.5});
  vm.runInContext(['doorTransform','doorMatMultiply','doorLeafMatrix'].map(extract).join('\n')+'\nthis.matrixFor=doorLeafMatrix;',context);
  const doors=await new NodeIO().readBinary(read('public/assets/conservatory-doors.glb')),frame=doors.getRoot().listMeshes().find(m=>m.getName()==='door_frame_pair'),leaf=doors.getRoot().listMeshes().find(m=>m.getName()==='door_leaf_pool_pair');
  for(const[id,x,z,yaw]of[['glasshouse-changing',GLASS_COURT.doors.D1.x,GLASS_COURT.doors.D1.z,0],['changing-pool',GLASS_COURT.doors.D2.x,GLASS_COURT.doors.D2.z,0]]){
    const cs=Math.cos(yaw),sn=Math.sin(yaw);triangles.push(...packedTriangles(frame,p=>new Vector3(x+cs*p[0]-sn*p[2],p[1],z+sn*p[0]+cs*p[2])));
  }
  const d=FP.doorState().find(d=>d.id==='glasshouse-changing'),leafStates=[];
  for(let step=0;step<=10;step++){const posed=[];for(let side=0;side<2;side++){const m=context.matrixFor(d,FP.logicalToPhysical(d.cx,d.cy),side,step/10);posed.push(...packedTriangles(leaf,p=>new Vector3(...[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]-[GLASS_COURT.origin.x,0,GLASS_COURT.origin.z][k]))));}leafStates.push(posed);}
  for(const[index,eye]of [[1,[2,1.62,9.75]],[2,[2,1.62,(GLASS_COURT.changing.z0+GLASS_COURT.changing.z1)/2]]]){
    const s=GLASS_COURT.signs[index],right=cross([0,1,0],s.normal),origin=new Vector3(...eye);
    for(const dx of [-.24,0,.24])for(const dy of[-.10,.10]){
      const target=new Vector3(s.x+right[0]*dx+s.normal[0]*.019,s.y+dy,s.z+right[2]*dx+s.normal[2]*.019),distance=origin.distanceTo(target),ray=new Ray(origin,target.clone().sub(origin).normalize());
      const blocker=triangles.find(triangle=>ray.intersectTriangle(...triangle,false,point)&&point.distanceTo(origin)<distance-.001);
      assert.equal(Boolean(blocker),false,s.id+' is readable from the actual approach; blocker: '+blocker?.owner);
      if(index===2)for(const state of leafStates)assert.equal(state.some(triangle=>ray.intersectTriangle(...triangle,false,point)&&point.distanceTo(origin)<distance-.001),false,'D1 leaves throughout their swing keep the final pool sign readable from changing centre');
    }
  }
});

test('the greenhouse roof and independent ducts do not intersect the retained pool roof ribs',async()=>{
  const original=await new NodeIO().readBinary(read('public/assets/conservatory-props.glb')),roof=original.getRoot().listMeshes().find(m=>m.getName()==='natatorium_roof_structure');
  const triangles=[];
  for(const primitive of roof.listPrimitives()){
    const p=primitive.getAttribute('POSITION').getArray(),ids=primitive.getIndices().getArray();
    for(let i=0;i<ids.length;i+=3)triangles.push([0,1,2].map(k=>[0,1,2].map(a=>p[ids[i+k]*3+a]+[83,0,38.5][a])));
  }
  let checked=0;
  for(const part of Object.entries(stats.meshes).filter(([name])=>name!==GLASS_COURT.entranceFixtures.mesh).flatMap(([,m])=>m.parts).filter(p=>p.obb&&['overhead-frame','roof-glazing','ventilation'].includes(p.role))){
    const obb=part.obb,half=obb.size.map(v=>v/2),box=new Box3(new Vector3(...half.map(v=>-v)),new Vector3(...half));
    for(const tri of triangles){
      const transformed=tri.map(p=>{const v=p.map((q,k)=>q-[GLASS_COURT.origin.x,0,GLASS_COURT.origin.z][k]-obb.center[k]);return new Vector3(...obb.basis.map(axis=>dot(axis,v)));});
      assert.equal(box.intersectsTriangle(new Triangle(...transformed)),false,part.id+' intersects an original pool roof member');
    }
    checked++;
  }
  assert.equal(checked,Object.values(stats.meshes).flatMap(m=>m.parts).filter(p=>p.obb&&['overhead-frame','roof-glazing','ventilation'].includes(p.role)).length);assert.ok(checked>=60,'all real roof, support and independent ventilation members are checked');
  assert.deepEqual(stats.ventilation.termination,{axis:'x',coordinate:GLASS_COURT.changing.x1,worldCoordinate:GLASS_COURT.origin.x+GLASS_COURT.changing.x1});
  assert.equal(Object.values(stats.meshes).flatMap(m=>m.parts).filter(p=>p.id.endsWith('end-flange')||p.id.endsWith('exterior-flange')).length,3);
});

test('actual packed foliage hides the figures from most angles and retains two narrow head glimpses',()=>{
  const triangles=[];
  for(const primitive of byName.get('glass_court_plants').listPrimitives()){
    const p=primitive.getAttribute('POSITION').getArray(),ids=primitive.getIndices().getArray();
    for(let i=0;i<ids.length;i+=3)triangles.push([0,1,2].map(k=>new Vector3(...p.slice(ids[i+k]*3,ids[i+k]*3+3))));
  }
  const point=new Vector3(),hits=(from,to)=>{
    const origin=new Vector3(...from),end=new Vector3(...to),distance=origin.distanceTo(end),ray=new Ray(origin,end.clone().sub(origin).normalize());
    return triangles.some(tri=>ray.intersectTriangle(...tri,false,point)&&point.distanceTo(origin)<distance-.0001);
  };
  const plantParts=stats.meshes.glass_court_plants.parts;
  const contains=(part,p)=>p.every((v,k)=>v>=part.bounds.min[k]-1e-6&&v<=part.bounds.max[k]+1e-6);
  for(const[bi,window]of stats.figureWindows.entries()){
    const body=GLASS_COURT_PRESENCES[bi];close(body.x-GLASS_COURT.origin.x,window.target[0]);close(body.y-GLASS_COURT.origin.z,window.target[2]);
    for(const dx of[-.055,0,.055])assert.equal(hits([window.eye[0]+dx,window.eye[1],window.eye[2]],[window.target[0]+dx,window.target[1],window.target[2]]),false,window.id+' actual head slot');
    for(const dz of[-.025,0,.025])assert.equal(hits([window.eye[0],window.eye[1],window.eye[2]+dz],[window.target[0],window.target[1],window.target[2]+dz]),false,window.id+' retains an actual partial-head gap across the new corridor direction');
    const band=GLASS_COURT.plantingBands[bi],stemIndex=Math.round((window.target[2]-band.z0-.35)/.65),stemZ=band.z0+.35+stemIndex*.65;
    const stem=plantParts.find(p=>p.id===`stem:${bi}:${stemIndex}`),root=[(band.x0+band.x1)/2,1.12,stemZ];assert.ok(contains(stem,root));
    for(const side of[-1,1]){
      const petiole=plantParts.find(p=>p.id===`body-frond-petiole:${bi}:${side}`),leaf=plantParts.find(p=>p.id===`body-frond:${bi}:${side}`);
      const joint=[bi?band.x0+.04:band.x1-.04,1.18,window.target[2]+side*.20];
      assert.ok(contains(petiole,root)&&contains(petiole,joint)&&contains(leaf,joint),'folded foliage meets a petiole connected to an existing rooted stem');
    }
    const offsets=[-2,-1,-.65,-.35,.35,.65,1,2];
    const direction=sub(window.target,window.eye),length=Math.hypot(direction[0],direction[2]),lateral=[-direction[2]/length,0,direction[0]/length];
    const hidden=offsets.filter(offset=>hits(window.eye.map((v,k)=>v+lateral[k]*offset),window.target));
    assert.ok(hidden.length>=7,window.id+' is mostly occluded, rather than a person standing openly in a bed');
  }
});

test('every packed finite part is closed, coherently wound, nondegenerate and truthfully bounded',()=>{
  let total=0;
  for(const[name,mesh]of byName){
    const extent={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    for(const primitive of mesh.listPrimitives()){
      const p=primitive.getAttribute('POSITION').getArray(),n=primitive.getAttribute('NORMAL').getArray(),ids=primitive.getIndices().getArray();
      assert.equal(p.length,n.length);assert.ok([...p,...n].every(Number.isFinite));
      for(let i=0;i<p.length;i+=3){close(Math.hypot(n[i],n[i+1],n[i+2]),1);for(let k=0;k<3;k++){extent.min[k]=Math.min(extent.min[k],p[i+k]);extent.max[k]=Math.max(extent.max[k],p[i+k]);}}
      for(let i=0;i<ids.length;i+=3){const tri=[0,1,2].map(k=>Array.from(p.slice(ids[i+k]*3,ids[i+k]*3+3))),normal=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));
        assert.ok(Math.hypot(...normal)>1e-12);assert.ok(dot(normal,Array.from(n.slice(ids[i]*3,ids[i]*3+3)))>0);total++;}
    }
    assert.deepEqual(extent,stats.meshes[name].bounds);
    const envelope=meshEnvelope(name);for(let axis=0;axis<3;axis++)assert.ok(extent.min[axis]>=envelope.min[axis]-1e-6&&extent.max[axis]<=envelope.max[axis]+1e-6,name+' canonical envelope axis '+axis);
    for(const part of stats.meshes[name].parts){
      const edges=new Map(),key=p=>p.join(',');let volume=0;
      for(const[a,b,c]of partTriangles(mesh,part)){
        volume+=dot(a,cross(b,c))/6;
        for(const[u,v]of[[a,b],[b,c],[c,a]]){const x=key(u),y=key(v),id=[x,y].sort().join('|'),edge=edges.get(id)||{count:0,balance:0};edge.count++;edge.balance+=x<y?1:-1;edges.set(id,edge);}
      }
      assert.ok(volume>0,part.id+' outward finite solid');
      for(const edge of edges.values())assert.deepEqual(edge,{count:2,balance:0},part.id+' closed edges');
    }
  }
  assert.equal(total,stats.totalTriangles);
});
