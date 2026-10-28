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

const root=new URL('../',import.meta.url),read=file=>fs.readFileSync(new URL(file,root));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const bytes=read('public/assets/glass-court.glb'),stats=JSON.parse(read('public/assets/glass-court.stats.json'));
const credits=JSON.parse(read('public/assets/glass-court.credits.json'));
const doc=await new NodeIO().readBinary(bytes),meshes=doc.getRoot().listMeshes(),byName=new Map(meshes.map(m=>[m.getName(),m]));
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((n,k)=>n-b[k]),dot=(a,b)=>a.reduce((s,n,k)=>s+n*b[k],0);
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
  assert.equal(stats.facadeAdded,false);assert.equal(stats.rearDoorAdded,false);assert.equal(stats.apparitionsAdded,false);
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
  for(const part of parts){const q=part.bounds;
    const blocks=q.max[1]>.10&&q.min[1]<2.6&&q.max[0]>lane.x0+1e-6&&q.min[0]<lane.x1-1e-6&&q.max[2]>lane.z0+1e-6&&q.min[2]<lane.z1-1e-6;
    assert.equal(blocks,false,part.id+' must leave the physical walking band clear');
  }
  const south=parts.find(p=>p.id==='south-opaque-plinth');close(south.bounds.min[2],3.94);close(south.bounds.max[2],4.06);close(south.bounds.max[1],.18);
  const ceiling=parts.find(p=>p.id==='changing-ceiling');close(ceiling.bounds.min[1],3.4);close(ceiling.bounds.min[0],21);close(ceiling.bounds.max[0],25);
  for(const d of ['changing-west-north','changing-west-south','changing-south-west','changing-south-east'])assert.ok(parts.some(p=>p.id===d));
  for(const lamp of GLASS_COURT.lamps){assert.deepEqual(stats.lamps.find(l=>l.id===lamp.id),lamp);if(lamp.id.includes('light')||lamp.id.includes('fluorescent'))assert.equal(parts.filter(p=>p.id.startsWith('tube:'+lamp.id+':')).length,2);}
  const central=parts.filter(p=>p.role.startsWith('central-'));assert.ok(central.filter(p=>p.role==='central-broadleaf').length>300);
  for(const part of central){const q=part.bounds;assert.ok(GLASS_COURT.plantingBands.some(b=>q.min[0]>=b.x0-1e-6&&q.max[0]<=b.x1+1e-6&&q.min[2]>=b.z0-1e-6&&q.max[2]<=b.z1+1e-6&&q.max[1]<=3));}
});

test('the original entrance fixture is rehosted without leaving its old screens or admission arms across the lane',()=>{
  const fixture=stats.meshes.natatorium_entrance_fixtures,parts=fixture.parts;
  assert.deepEqual(stats.fixtureOrigin,{x:84,z:30});
  const header=parts.find(p=>p.id==='old-baths-header');close((header.bounds.min[0]+header.bounds.max[0])/2,0);close((header.bounds.min[2]+header.bounds.max[2])/2,-1.78);close((header.bounds.min[1]+header.bounds.max[1])/2,3.54);
  for(const part of parts.filter(p=>['rehosted-control-screen','rehosted-service-hardware'].includes(p.role)&&p.bounds.max[0]+13<21))assert.ok(part.bounds.max[2]+2<=1.1,part.id+' stays behind the planting face');
  const top=parts.find(p=>p.id==='attendant-counter-top');close(top.bounds.max[2]+30,28.88);close(top.bounds.min[0]+84,92.27);close(top.bounds.max[0]+84,95.73);
  for(const part of parts.filter(p=>p.role==='rehosted-folded-turnstile'))assert.ok(part.bounds.min[0]+84>95.48);
  for(const role of ['rehosted-grille','rehosted-control-screen','rehosted-folded-turnstile','rehosted-service-hardware'])assert.ok(parts.some(p=>p.role===role));
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
    const offset=name===GLASS_COURT.entranceFixtures.mesh?[13,0,2]:[0,0,0];
    for(const triangle of partTriangles(mesh,part))triangles.push(triangle.map(p=>new Vector3(...p.map((v,k)=>v+offset[k]))));
  }
  // Include retained original pool relief: its east pier at (95.5,32)
  // occluded the former east-jamb sign even though the new pack was clear.
  const main=await new NodeIO().readBinary(read('public/assets/conservatory-props.glb')),relief=main.getRoot().listMeshes().find(m=>m.getName()==='natatorium_perimeter_relief');
  const packedTriangles=(mesh,transform)=>mesh.listPrimitives().flatMap(primitive=>{const p=primitive.getAttribute('POSITION').getArray(),ids=primitive.getIndices().getArray(),out=[];for(let i=0;i<ids.length;i+=3)out.push([0,1,2].map(k=>transform(Array.from(p.slice(ids[i+k]*3,ids[i+k]*3+3)))));return out;});
  triangles.push(...packedTriangles(relief,p=>new Vector3(p[0]+12,p[1],p[2]+10.5)));
  FP.compile(conservatory.levels,{...conservatory,doors:conservatory.doors});
  const source=read('src/main.js').toString(),extract=name=>{const start=source.indexOf(`function ${name}(`);let at=source.indexOf('{',start),depth=1,end=at+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(start,end);},context=vm.createContext({CELL:.5});
  vm.runInContext(['doorTransform','doorMatMultiply','doorLeafMatrix'].map(extract).join('\n')+'\nthis.matrixFor=doorLeafMatrix;',context);
  const doors=await new NodeIO().readBinary(read('public/assets/conservatory-doors.glb')),frame=doors.getRoot().listMeshes().find(m=>m.getName()==='door_frame_pair'),leaf=doors.getRoot().listMeshes().find(m=>m.getName()==='door_leaf_pool_pair');
  for(const[id,x,z,yaw]of[['glasshouse-changing',21,2,Math.PI/2],['changing-pool',23,4,0]]){
    const cs=Math.cos(yaw),sn=Math.sin(yaw);triangles.push(...packedTriangles(frame,p=>new Vector3(x+cs*p[0]-sn*p[2],p[1],z+sn*p[0]+cs*p[2])));
  }
  const d=FP.doorState().find(d=>d.id==='glasshouse-changing'),leafStates=[];
  for(let step=0;step<=10;step++){const posed=[];for(let side=0;side<2;side++){const m=context.matrixFor(d,FP.logicalToPhysical(d.cx,d.cy),side,step/10);posed.push(...packedTriangles(leaf,p=>new Vector3(...[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]-[71,0,28][k]))));}leafStates.push(posed);}
  for(const[index,eye]of [[1,[19.25,1.62,2.25]],[2,[23.25,1.62,2.25]]]){
    const s=GLASS_COURT.signs[index],right=cross([0,1,0],s.normal),origin=new Vector3(...eye);
    for(const dx of [-.24,0,.24])for(const dy of[-.10,.10]){
      const target=new Vector3(s.x+right[0]*dx+s.normal[0]*.019,s.y+dy,s.z+right[2]*dx+s.normal[2]*.019),distance=origin.distanceTo(target),ray=new Ray(origin,target.clone().sub(origin).normalize());
      assert.equal(triangles.some(triangle=>ray.intersectTriangle(...triangle,false,point)&&point.distanceTo(origin)<distance-.001),false,s.id+' is readable from the actual approach, outside plants, grille, original piers and frames');
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
      const transformed=tri.map(p=>{const v=p.map((q,k)=>q-[71,0,28][k]-obb.center[k]);return new Vector3(...obb.basis.map(axis=>dot(axis,v)));});
      assert.equal(box.intersectsTriangle(new Triangle(...transformed)),false,part.id+' intersects an original pool roof member');
    }
    checked++;
  }
  assert.ok(checked>100);
  assert.deepEqual(stats.ventilation.termination,{axis:'x',coordinate:25,worldCoordinate:96});
  assert.equal(stats.meshes.glass_court_vestibule.parts.filter(p=>p.id.endsWith('east-flange')).length,3);
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
  for(const window of stats.figureWindows){
    for(const dx of[-.055,0,.055])assert.equal(hits([window.eye[0]+dx,window.eye[1],window.eye[2]],[window.target[0]+dx,window.target[1],window.target[2]]),false,window.id+' actual head slot');
    const offsets=[-2,-1,-.65,-.35,.35,.65,1,2];
    const hidden=offsets.filter(dx=>hits([window.eye[0]+dx,window.eye[1],window.eye[2]],window.target));
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
    assert.deepEqual(extent,stats.meshes[name].bounds);if(name!==GLASS_COURT.entranceFixtures.mesh)assert.ok(extent.min[0]>=-.04&&extent.max[0]<=25.01&&extent.min[2]>=-1.05&&extent.max[2]<=4.061&&extent.max[1]<=5.200001,name+' indoor bounds');
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
