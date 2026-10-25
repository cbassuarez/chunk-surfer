import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import crypto from'node:crypto';
import{parseGlb}from'../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import{EXTERIOR_STATIONERS as S,STATIONERS_ZONE,STATIONERS_LEVELS,STATIONERS_DOORS,STATIONERS_PROPS,STATIONERS_PHYSICAL_COLLIDERS,STATIONERS_COLLIDERS,STATIONERS_LIGHTS,STATIONERS_LETTERING}from'../src/data/exterior-stationers.js';
import{subtractTriangleBox,stationersRoomGeometry}from'../tools/chunk_surfer/exterior-stationers-geometry.mjs';
import{districtLogicalAt}from'../src/data/exterior-district.js';import{conservatory}from'../src/data/floorplan/conservatory.js';import{F,ZONE,isOutdoorZone}from'../src/data/floorplan/legend.js';import*as FP from'../src/world/floorplan.js';import*as PROPS from'../src/game/props.js';
const currentBytes=fs.readFileSync(new URL('../public/assets/exterior-frontages.glb',import.meta.url)),current=parseGlb(currentBytes),bytes=fs.readFileSync(new URL('../public/assets/exterior-stationers.glb',import.meta.url)),pack=parseGlb(bytes),stats=JSON.parse(fs.readFileSync(new URL('../public/assets/exterior-stationers.stats.json',import.meta.url))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=(p,index)=>{const a=p.json.accessors[index],v=p.json.bufferViews[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3}[a.type],size={5126:4,5125:4,5123:2,5121:1}[a.componentType],method={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*size;return Array.from({length:a.count},(_,i)=>Array.from({length:n},(_,k)=>p.bin[method](off+i*stride+k*size)));};
const meshTris=(p,name)=>p.json.meshes.find(m=>m.name===name).primitives.flatMap(g=>{const pos=read(p,g.attributes.POSITION),idx=read(p,g.indices).flat(),out=[];for(let i=0;i<idx.length;i+=3)out.push(idx.slice(i,i+3).map(j=>pos[j]));return out;});
const variant=pack.json.meshes.find(m=>m.name===S.row.mesh),room=pack.json.meshes.find(m=>m.name===S.room.mesh),source=current.json.meshes.find(m=>m.name===S.row.sourceMesh);
const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
const hit=(a,b,t)=>{const direction=sub(b,a),[x,y,z]=t,e1=sub(y,x),e2=sub(z,x),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)return false;const s=sub(a,x),u=dot(s,h)/det;if(u<0||u>1)return false;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)return false;const d=dot(e2,q)/det;return d>1e-7&&d<1-1e-7;};
const levels=new Set(STATIONERS_LEVELS.map(l=>l.id)),doors=new Set(STATIONERS_DOORS.map(d=>d.id));
FP.compile([...conservatory.levels.filter(l=>!levels.has(l.id)),...STATIONERS_LEVELS],{...conservatory,doors:[...conservatory.doors.filter(d=>!doors.has(d.id)),...STATIONERS_DOORS]});PROPS.propsInit(FP);
const body=(x,z)=>{const p=districtLogicalAt(x-.25,z-.25);return{x:p.x*2,y:p.y*2};},world=p=>{const q=FP.logicalToPhysical(p.x,p.y);return{x:(q.x+.5)*.5,z:(q.z+.5)*.5};};

test('one existing row variant and one optional room, without replacing other street roles',()=>{
  assert.deepEqual(pack.json.meshes.map(m=>m.name),[S.row.mesh,S.room.mesh]);assert.ok(variant&&room);
  assert.equal(stats.sourceFacade.sha256,sha(currentBytes));assert.ok(stats.bytes<S.maximumBytes&&stats.triangles<S.maximumTriangles);
  assert.equal(S.row.id,'district-north-row-a');assert.equal(S.row.deed,3);
  assert.ok(STATIONERS_PROPS.every(p=>p.interactive===false&&p.blocks===false&&!p.action&&!p.key&&!p.item));
});

test('original material definitions, images and their embedded bytes are preserved exactly',()=>{
  assert.deepEqual(pack.json.materials.slice(0,current.json.materials.length),current.json.materials);
  assert.deepEqual(pack.json.images.slice(0,current.json.images.length),current.json.images);
  for(const image of current.json.images){const v=current.json.bufferViews[image.bufferView];assert.deepEqual(pack.bin.subarray(v.byteOffset,v.byteOffset+v.byteLength),current.bin.subarray(v.byteOffset,v.byteOffset+v.byteLength));}
  assert.deepEqual(pack.bin.subarray(0,current.bin.length),current.bin,'entire source binary remains an exact immutable prefix');
});

test('upper floors, roof and other deeds retain exact original vertex channels and triangles',()=>{
  for(const p of source.primitives){
    const target=variant.primitives.find(q=>q.material===p.material);assert.ok(target);
    for(const channel of['POSITION','NORMAL','TEXCOORD_0']){const original=read(current,p.attributes[channel]),changed=read(pack,target.attributes[channel]);assert.deepEqual(changed.slice(0,original.length),original);}
    const pos=read(current,p.attributes.POSITION),indices=read(current,p.indices).flat(),out=read(pack,target.indices).flat(),triples=new Set();for(let i=0;i<out.length;i+=3)triples.add(out.slice(i,i+3).join(','));
    for(let i=0;i<indices.length;i+=3){const ids=indices.slice(i,i+3),tri=ids.map(k=>pos[k]);const protectedTriangle=[0,1,2].some(k=>tri.every(v=>v[k]<S.carve.min[k]-1e-8)||tri.every(v=>v[k]>S.carve.max[k]+1e-8));if(protectedTriangle)assert.ok(triples.has(ids.join(',')),'all triangles wholly outside the one ground-floor carve retain exact source indices');}
  }
});

test('triangle subtraction interpolates the original texture coordinates and leaves distant stock intact',()=>{
  const v=(x,y,z)=>({position:[x,y,z],normal:[0,0,1],uv:[x*.4,y*.7]});
  const a=[v(-9,5,0),v(-8,5,0),v(-8,6,0)];assert.deepEqual(subtractTriangleBox(a),{changed:false,triangles:[a]});
  const t=[v(-6,1,-4),v(1,1,-4),v(1,4,-4)],out=subtractTriangleBox(t);assert.ok(out.changed&&out.triangles.length>0);
  for(const p of out.triangles.flat()){assert.ok(Math.abs(p.uv[0]-p.position[0]*.4)<1e-8);assert.ok(Math.abs(p.uv[1]-p.position[1]*.7)<1e-8);assert.deepEqual(p.normal,[0,0,1]);}
});

test('actual exported doorway and display are open sightlines through both former mass and new shell',()=>{
  const old=meshTris(current,S.row.sourceMesh),next=meshTris(pack,S.row.mesh),roomTris=meshTris(pack,S.room.mesh);
  const eyeY=S.floor+1.62,doorZ=18-S.door.x,sourceA=[.60,eyeY,doorZ],sourceB=[-1.60,eyeY,doorZ];
  assert.ok(old.some(t=>hit(sourceA,sourceB,t)),'original solid deed blocked the proposed entrance');assert.equal(next.some(t=>hit(sourceA,sourceB,t)),false,'the existing row is genuinely carved');
  const local=(x,y,z)=>[x-S.room.anchor.x,y-S.floor,z-S.room.anchor.z];
  assert.equal(roomTris.some(t=>hit(local(S.door.x,eyeY,-14.4),local(S.door.x,eyeY,-17.4),t)),false,'new room leaves the runtime leaf as the sole door');
  for(const x of[19.65,21.55])assert.equal(roomTris.some(t=>hit(local(x,eyeY,-14.4),local(x,eyeY,-16.35),t)),false,'ordinary opaque renderer receives real window voids');
  assert.ok(pack.json.materials.every(m=>!m.alphaMode||m.alphaMode==='OPAQUE'||m.alphaMode==='MASK'));
});

test('compiled door, frame and authored shell share the exact physical metre centre',()=>{
  const d=FP.doorState().find(d=>d.id===S.door.id);assert.ok(d);const p=FP.logicalToPhysical(d.cx,d.cy);assert.ok(Math.abs(p.x*.5-S.door.x)<1e-8&&Math.abs(p.z*.5-S.door.z)<1e-8);
  assert.equal(d.keyId,null);assert.equal(d.closer,'none');assert.equal(d.access,'both');assert.equal(d.archetype,'staff-half-glazed');assert.equal(d.insideSide,-1);assert.equal(d.aperture.width,1);
  assert.equal(FP.zoneAt(Math.floor(d.cx),Math.floor(d.cy)),STATIONERS_ZONE);
});

test('ordinary cardinal approach opens the door, reaches the counter aisle and returns without a connector',()=>{
  const approach=body(23.75,-14.25),start=body(23.75,-13.75);assert.ok(!FP.isSolid(start.x,start.y)&&!FP.isSolid(approach.x,approach.y),'outdoor doorstep fills the real prior half-metre gap');
  assert.equal(FP.zoneAt(approach.x,approach.y),ZONE.civicCourt);assert.ok(FP.canStep(start.x,start.y,approach.x,approach.y,{keys:new Set()}).ok);
  FP.setDoorOpen(S.door.id,false);assert.equal(FP.canStep(approach.x,approach.y,approach.x,approach.y-1,{keys:new Set()}).ok,false);
  const opened=FP.interactDoor(approach.x,approach.y,[0,-1],new Set());assert.equal(opened?.id,S.door.id);assert.equal(opened.opened,true);FP.tickDoors(1,{playerX:approach.x,playerY:approach.y});
  const route=[approach,...[-14.75,-15.25,-15.75,-16.25,-16.75,-17.25,-17.75,-18.25].map(z=>body(23.75,z)),body(23.25,-18.25),body(22.75,-18.25)];
  function walk(points){for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],m=FP.canStep(a.x,a.y,b.x,b.y,{keys:new Set()});assert.equal(m.ok,true,`ordinary FP step ${JSON.stringify(world(a))} -> ${JSON.stringify(world(b))}`);assert.equal(m.redirect,undefined);assert.equal(PROPS.propCanOccupy(b.x,b.y,{from:a}),true,'real structural/furniture collision preserves the aisle');}}
  walk(route);assert.equal(FP.zoneAt(route.at(-1).x,route.at(-1).y),STATIONERS_ZONE);walk([...route].reverse());
  assert.equal(FP.interactDoor(approach.x,approach.y,[0,-1],new Set()).closed,true,'same unkeyed door closes after leaving');FP.tickDoors(1,{playerX:approach.x,playerY:approach.y});
});

test('window sill and real furniture are body obstacles while the central aisle remains clear',()=>{
  const intersects=(x,z)=>STATIONERS_PHYSICAL_COLLIDERS.some(c=>S.floor>=c.minElevation-.05&&S.floor<=c.maxElevation+.05&&Math.abs(x-c.x)<=c.width/2+.20&&Math.abs(z-c.z)<=c.depth/2+.20);
  assert.ok(intersects(20.25,S.frontZ),'display is a window, not a second entrance');assert.ok(intersects(21.55,-19.2));assert.ok(intersects(18.93,-18.25));
  for(const z of[-15.75,-16.25,-16.75,-17.25,-17.75,-18.25])assert.equal(intersects(23.75,z),false,'entry aisle to counter stays physically clear');
  for(let i=0;i<STATIONERS_COLLIDERS.length;i++){const c=STATIONERS_PHYSICAL_COLLIDERS[i],l=STATIONERS_COLLIDERS[i],p=districtLogicalAt(c.x,c.z);assert.deepEqual([l.x,l.y],[p.x,p.y]);assert.ok(Math.abs(l.width-c.width-.5)<1e-9&&Math.abs(l.depth-c.depth-.5)<1e-9);}
});

test('room is ordinary indoor air, has motivated fittings and nonemissive solid lettering',()=>{
  assert.equal(STATIONERS_ZONE,23);assert.equal(isOutdoorZone(STATIONERS_ZONE),false);
  for(const[x,z]of[[23.75,-16.25],[22.75,-17.25],[22.75,-18.25]]){const p=body(x,z);assert.equal(FP.zoneAt(p.x,p.y),STATIONERS_ZONE);assert.equal(FP.flagsAt(p.x,p.y)&(F.SKY|F.WALLED),0);assert.ok(Math.abs(FP.floorAt(p.x,p.y)-S.floor)<1e-6&&Math.abs(FP.ceilAt(p.x,p.y)-S.ceiling)<1e-6);}
  assert.equal(STATIONERS_LIGHTS.length,2);assert.ok(STATIONERS_LIGHTS.every(l=>l.y>S.floor&&l.y<S.ceiling&&l.intensity<=1.1));
  const print=pack.json.materials.filter(m=>m.name.startsWith('physical print:')&&m.name.includes('stationers'));assert.equal(print.length,2);assert.ok(print.every(m=>m.extras.printedSurface.coverage==='baseColorAlpha'&&m.extras.printedSurface.emission==='none'&&!m.emissiveFactor));
  const baked=JSON.parse(fs.readFileSync(new URL('../public/assets/exterior-stationers-lettering/atlas-manifest.json',import.meta.url)));assert.ok(baked.entries.every(e=>e.metrics.fontSha256?.length===64));for(const spec of STATIONERS_LETTERING)assert.equal(baked.entries.find(e=>e.id===spec.id).copy,spec.text);
});

test('exported geometry is finite, nondegenerate and source-bound; perception stays pending',()=>{
  assert.equal(stats.sha256,sha(bytes));for(const[file,digest]of Object.entries(stats.sourceHashes))assert.equal(sha(fs.readFileSync(new URL('../'+file,import.meta.url))),digest,`rebuild ${file}`);
  for(const m of pack.json.meshes)for(const p of m.primitives){const pos=read(pack,p.attributes.POSITION),n=read(pack,p.attributes.NORMAL),uv=read(pack,p.attributes.TEXCOORD_0);assert.equal(pos.length,n.length);assert.equal(pos.length,uv.length);assert.ok([...pos.flat(),...n.flat(),...uv.flat()].every(Number.isFinite));for(const normal of n)assert.ok(Math.abs(Math.hypot(...normal)-1)<3e-6);}
  for(const name of[S.row.mesh,S.room.mesh])for(const t of meshTris(pack,name))assert.ok(Math.hypot(...cross(sub(t[1],t[0]),sub(t[2],t[0])))>1e-10,`${name}: exported triangle retains real area`);
  assert.deepEqual(stationersRoomGeometry(),stationersRoomGeometry());assert.ok(stats.pending.includes('uninterrupted ordinary entry and return'));
});
