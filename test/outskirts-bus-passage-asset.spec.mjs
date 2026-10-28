import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {OUTSKIRTS_BUS_PASSAGE as C,busPassageFloorAt} from '../src/data/outskirts-bus-passage.js';
import {parseGlb,meshFingerprint} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {readBusAccessor,buildOutskirtsBusPassage} from '../tools/chunk_surfer/build-outskirts-bus-passage.mjs';

const file=new URL('../public/assets/outskirts-bus-passage.glb',import.meta.url),bytes=fs.readFileSync(file),pack=parseGlb(bytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/outskirts-bus-passage.stats.json',import.meta.url))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const model=name=>pack.json.meshes.find(m=>m.name===name);
function triangles(mesh,transform=p=>p){return mesh.primitives.flatMap(p=>{const v=readBusAccessor(pack,p.attributes.POSITION),ix=readBusAccessor(pack,p.indices);return Array.from({length:ix.length/3},(_,k)=>({mat:p.material,p:[0,1,2].map(c=>transform(v.slice(ix[k*3+c]*3,ix[k*3+c]*3+3)))}));});}
const body=triangles(model(C.mesh));
function surfaces(x,z){
  const found=[];
  for(const t of body){const[a,b,c]=t.p,d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(d)<1e-10)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;
    if(u>=-1e-6&&v>=-1e-6&&w>=-1e-6){const y=u*a[1]+v*b[1]+w*c[1];if(y<=.501)found.push(y);}
  }
  return found;
}
function clipHeight(poly,edge,above){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],aIn=above?a[1]>=edge:a[1]<=edge,bIn=above?b[1]>=edge:b[1]<=edge;if(aIn)out.push(a);if(aIn!==bIn){const t=(edge-a[1])/(b[1]-a[1]);out.push(a.map((x,k)=>x+t*(b[k]-x)));}}return out;}
function distanceSegment(x,z,a,b){const dx=b[0]-a[0],dz=b[2]-a[2],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[2]-t*dz);}
function touches(x,z,floor,triangle,r=.25){
  if(Math.max(...triangle.p.map(p=>p[1]))<floor+.45||Math.min(...triangle.p.map(p=>p[1]))>floor+1.70)return false;
  let poly=clipHeight(triangle.p,floor+.45,true);if(poly.length<2)return false;poly=clipHeight(poly,floor+1.70,false);if(poly.length<2)return false;
  let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;}
  return inside||poly.some((p,i)=>distanceSegment(x,z,p,poly[(i+1)%poly.length])<r-1e-5);
}
const doorTriangles=(which,angle)=>triangles(model(which==='entry'?C.entryMesh:C.exitMesh),p=>{const d=C[which],c=Math.cos(angle),s=Math.sin(angle);return[d.hinge[0]+p[0]*c+p[2]*s,d.hinge[1]+p[1],d.hinge[2]-p[0]*s+p[2]*c];});
function walk(points,geometry=body){for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.10));for(let i=0;i<=n;i++){const x=a[0]+(b[0]-a[0])*i/n,z=a[1]+(b[1]-a[1])*i/n,floor=busPassageFloorAt(x,z),hit=geometry.find(t=>touches(x,z,floor,t));assert.equal(hit,undefined,`actual triangle obstructs body at ${x.toFixed(3)},${z.toFixed(3)} floor ${floor}: ${hit&&pack.json.materials[hit.mat].name}`);}}}

test('dedicated bus pack has its physical shell, leaves and independently switched practicals with production print/material data',()=>{
  assert.equal(sha(bytes),stats.sha256);assert.deepEqual(new Set(pack.json.meshes.map(m=>m.name)),new Set([C.mesh,C.entryMesh,C.exitMesh,C.frontLampMesh,C.rearLampMesh,...Array.from({length:4},(_,i)=>`outskirts_bus_strip_${i}`)]));
  assert.ok(stats.totalTriangles<8000);assert.ok(bytes.length<1500000);
  const original=parseGlb(fs.readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url))),old=original.json.meshes.find(m=>m.name==='outskirts_bus');
  assert.equal(meshFingerprint(original,old),stats.sourceBusFingerprint,'ordinary production bus was replaced while building the variant');
  const newPrinted=model(C.mesh).primitives.filter(p=>pack.json.materials[p.material].extras?.printedSurface),oldPrinted=old.primitives.filter(p=>original.json.materials[p.material].extras?.printedSurface);
  assert.equal(newPrinted.length,2);
  const textureHash=(p,mat,key)=>{const m=p.json.materials[mat],t=key==='normalTexture'?m.normalTexture:m.pbrMetallicRoughness[key],im=p.json.images[p.json.textures[t.index].source],v=p.json.bufferViews[im.bufferView];return sha(p.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));};
  for(let i=0;i<2;i++){
    const next=newPrinted[i],oldFace=oldPrinted[i];for(const attr of['POSITION','NORMAL','TEXCOORD_0'])assert.deepEqual(readBusAccessor(pack,next.attributes[attr]),readBusAccessor(original,oldFace.attributes[attr]));
    for(const role of['baseColorTexture','metallicRoughnessTexture','normalTexture'])assert.equal(textureHash(pack,next.material,role),textureHash(original,oldFace.material,role));
    assert.equal(pack.json.materials[next.material].alphaMode,'OPAQUE');
  }
  for(const name of['outskirts municipal enamel','outskirts ivory coachwork','outskirts green moquette','outskirts worn seat piping','outskirts joint oxidation'])assert.ok(pack.json.materials.some(m=>m.name===name));
});

test('all six rendered treads have their exact support tops and no deck covers either well',()=>{
  for(const step of C.treads)for(const u of[.12,.5,.88])for(const v of[.15,.5,.85]){
    const x=step.x0+(step.x1-step.x0)*u,z=step.z0+(step.z1-step.z0)*v,top=Math.max(...surfaces(x,z));
    assert.ok(Math.abs(top-step.top)<1e-6,`${step.id} surface ${top} != support ${step.top}`);assert.equal(busPassageFloorAt(x,z),step.top);
  }
  for(const[x,z]of[[0,0],[0,-3.15],[0,3.85],[-.30,2.9],[.30,-2.7]])assert.ok(Math.abs(Math.max(...surfaces(x,z))-C.floor)<1e-6);
});

test('actual packed triangles clear the stair-to-aisle-to-emergency-exit body route',()=>{
  const open=[...body,...doorTriangles('entry',C.entry.openYaw),...doorTriangles('exit',C.exit.openYaw)];
  const route=[[-2,-3.15],[-.25,-3.15],[-.25,-2.75],[0,-2.75],[0,3.85],[2,3.85]];
  walk(route,open);walk([...route].reverse(),open);
  // The half-metre movement grid can approach the centre with either phase.
  // Both extreme aisle phases retain a full .50 m body, not a zero-width ray.
  for(const phase of[-.25,.25])walk([[phase,-2.75],[phase,3.85]],open);
  // The cleared rear vestibule permits one full grid step toward the exit,
  // including phases whose nearest nonnegative centre lies beyond the aisle.
  for(const phase of[-.249,-.1945,-.125,-.055,-.001,0,.125,.249])for(const zp of[0,.125,.14,.15,.25,.375]){
    const chosen=phase<0?phase+.5:phase,turn=2+zp+(zp===0?.5:0),exit=3.5+zp+(3.5+zp<3.64?.5:0);
    walk([[phase,-2.5],[phase,turn],[chosen,turn],[chosen,exit],[2+phase,exit]],open);
  }
  for(const z of[-3.40,-3.15,-2.90])walk([[-1.75,z],[-.47,z]],open);
  for(const z of[3.60,3.85,4.10])walk([[.47,z],[1.75,z]],open);
});

test('the closed leaves occupy real openings and swing out to provide clearance',()=>{
  for(const which of['entry','exit']){
    const d=C[which],x=d.hinge[0],z=(d.fromZ+d.toZ)/2,floor=busPassageFloorAt(x,z);
    assert.ok(doorTriangles(which,0).some(t=>touches(x,z,floor,t)),`${which} leaf has no physical closed surface`);
    assert.ok(!doorTriangles(which,d.openYaw).some(t=>touches(x,z,floor,t)),`${which} open leaf still crosses the doorway`);
    const leaf=model(which==='entry'?C.entryMesh:C.exitMesh);assert.equal(leaf.extras.leafTop+d.hinge[1],2.5);assert.equal(leaf.extras.leafBottom+d.hinge[1],.125);
  }
  const labels=model(C.exitMesh).primitives.filter(p=>pack.json.materials[p.material].extras?.printedSurface);assert.equal(labels.length,2);
  assert.ok(labels.every(p=>pack.json.materials[p.material].alphaMode==='OPAQUE'));
});

test('moved front tyres, enclosed wheel wells, seats and separate practical lamps match the shared section',()=>{
  const rubber=model(C.mesh).primitives.find(p=>pack.json.materials[p.material].name==='outskirts tyre and gasket'),positions=readBusAccessor(pack,rubber.attributes.POSITION);
  const tyre=[];for(let i=0;i<positions.length;i+=3)if(Math.abs(positions[i])>1.02&&positions[i+1]>.10&&positions[i+1]<.89)tyre.push(positions.slice(i,i+3));
  assert.ok(tyre.some(p=>Math.abs(p[2]-C.axle.frontZ)<.01));assert.ok(!tyre.some(p=>p[2]<C.entry.toZ&&p[2]>C.entry.fromZ),'a tyre still occupies the front stair');
  assert.deepEqual(model(C.mesh).extras.seatRows,C.seatRows);assert.deepEqual(model(C.mesh).extras.stanchionZ,C.aisle.stanchionZ);assert.ok(model(C.mesh).extras.aisleClearWidth>=1.12);
  assert.ok(body.some(t=>t.p.some(p=>Math.abs(Math.abs(p[0])-.995)<1e-6&&p[1]>.90)),'inner wheel housing is absent');
  for(const which of['front','rear']){const m=model(which==='front'?C.frontLampMesh:C.rearLampMesh);assert.ok(m.primitives.some(p=>pack.json.materials[p.material].emissiveFactor?.some(v=>v>0)));}
  assert.ok(!model(C.mesh).primitives.some(p=>pack.json.materials[p.material].emissiveFactor?.some(v=>v>0)),'a cabin diffuser remains permanently powered inside the body');
  let combinedTopArea=0;
  for(let bank=0;bank<4;bank++){
    const m=model(`outskirts_bus_strip_${bank}`),diffuser=m.primitives.find(p=>pack.json.materials[p.material].name==='outskirts opal strip');
    assert.ok(diffuser,`bank ${bank} contains no actual ceiling fluorescent`);
    const v=readBusAccessor(pack,diffuser.attributes.POSITION),normal=readBusAccessor(pack,diffuser.attributes.NORMAL),indices=readBusAccessor(pack,diffuser.indices),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<v.length;i++){min[i%3]=Math.min(min[i%3],v[i]);max[i%3]=Math.max(max[i%3],v[i]);}
    assert.ok(Math.abs(min[1]-2.7825)<1e-6&&Math.abs(max[1]-2.8175)<1e-6,'emissive geometry is not the existing ceiling diffuser');
    assert.ok(bank%2===0?max[0]<0&&min[0]<-.84:min[0]>0&&max[0]>.84,'bank is on the wrong side of the saloon');
    assert.ok(bank<2?min[2]<-3.89&&Math.abs(max[2])<1e-6:Math.abs(min[2])<1e-6&&max[2]>3.99,'powered banks do not divide the actual original strip at the saloon centre');
    for(let i=0;i<indices.length;i+=3){const[a,b,c]=[0,1,2].map(k=>indices[i+k]);if(normal[a*3+1]<.99)continue;const u=[0,1,2].map(k=>v[b*3+k]-v[a*3+k]),w=[0,1,2].map(k=>v[c*3+k]-v[a*3+k]);combinedTopArea+=Math.hypot(u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0])/2;}
  }
  assert.ok(Math.abs(combinedTopArea-2*.08*7.9)<1e-5,'splitting the powered halves changed the original fluorescent surface coverage');
});

test('the rear face practical has a supported hooded housing and only its real opal lens is powered',()=>{
  const lamp=model(C.mesh).extras.facePractical,rear=model(C.rearLampMesh);
  assert.deepEqual(lamp,rear.extras.facePractical);
  assert.deepEqual(lamp.light,C.facePractical.light);
  assert.deepEqual(lamp.lens,C.facePractical.lens);
  assert.deepEqual(lamp.direction,C.facePractical.direction);
  assert.equal(lamp.poweredBy,'rear-lamps');
  const lensMaterial=pack.json.materials.findIndex(m=>m.extras?.practicalFixtureRole==='rear-bay-face-light');
  const lens=rear.primitives.find(p=>p.material===lensMaterial);
  assert.ok(lens,'the powered group has no actual opal glass');
  assert.ok(!model(C.mesh).primitives.some(p=>p.material===lensMaterial),'the static opaque body owns the glass emission');
  const v=readBusAccessor(pack,lens.attributes.POSITION),n=readBusAccessor(pack,lens.attributes.NORMAL);
  const min=[0,1,2].map(k=>Math.min(...v.filter((_,i)=>i%3===k))),max=[0,1,2].map(k=>Math.max(...v.filter((_,i)=>i%3===k)));
  assert.ok(Math.abs((min[0]+max[0])/2-lamp.lens[0])<1e-6);
  assert.ok(Math.abs((min[1]+max[1])/2-lamp.lens[1])<1e-6);
  assert.ok(Math.abs((min[2]+max[2])/2-lamp.lens[2])<1e-6);
  assert.ok(n.some((value,i)=>i%3===0&&value<-.99),'the diffuser has no inward-facing surface');
  const emissive=pack.json.materials[lensMaterial].emissiveFactor;
  assert.ok(emissive[0]>emissive[1]&&emissive[1]>emissive[2],'the opal light is no longer warm');
  assert.ok(lamp.light[0]<min[0]-.02,'the emitted-light anchor is buried behind the lens');
  assert.ok(max[2]<C.exit.fromZ-.1,'the glass extends into the emergency aperture');
  // The stile reaches two real load-bearing coachwork layers. The bracket
  // plate intersects it, so the practical is not a glowing point on open glass.
  const stile=body.filter(t=>t.p.every(p=>p[0]>=1.1324&&p[0]<=1.1876&&p[2]>=3.0199&&p[2]<=3.0801&&p[1]>=1.4899&&p[1]<=2.5501));
  assert.ok(stile.length>=12,'the glazed opening has no solid mounting stile');
  assert.ok(stile.some(t=>t.p.some(p=>p[1]<=1.4901))&&stile.some(t=>t.p.some(p=>p[1]>=2.5499)),'the stile does not connect waist to upper coachwork');
  const plate=body.filter(t=>t.p.every(p=>p[0]>=1.1139&&p[0]<=1.1381&&p[1]>=2.2049&&p[1]<=2.4351&&p[2]>=2.9249&&p[2]<=3.1751));
  assert.ok(plate.length>=12,'the lamp has no tangible backing plate');
  const minOf=(tris,k)=>Math.min(...tris.flatMap(t=>t.p.map(p=>p[k]))),maxOf=(tris,k)=>Math.max(...tris.flatMap(t=>t.p.map(p=>p[k])));
  assert.ok(maxOf(plate,0)>minOf(stile,0)&&minOf(plate,0)<maxOf(stile,0),'the backing plate misses its mounting stile');
  const hood=body.filter(t=>t.p.every(p=>p[0]>=.9899&&p[0]<=1.1501&&p[1]>=2.4239&&p[1]<=2.4461&&p[2]>=2.9049&&p[2]<=3.1951));
  assert.ok(hood.length>=12,'the upward spill has no physical folded hood');
  // Every assembly part other than the flush stile remains above the real
  // standing body's 2.20m top, and the existing packed-triangle route test
  // still exercises both extreme aisle phases and the rear emergency steps.
  assert.ok(minOf(plate,1)>C.floor+1.70&&minOf(hood,1)>C.floor+1.70);
  assert.ok(lamp.light.every(Number.isFinite)&&Math.hypot(...lamp.direction)>.99&&Math.hypot(...lamp.direction)<1.01);
});

test('the installed dedicated pack is reproducible from current contract and production factory',async()=>{
  const built=await buildOutskirtsBusPassage();assert.equal(sha(built.bytes),sha(bytes));
});
