import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {tissueSurfaceDescriptor} from '../src/render/prop-material-contract.js';
import {busBodyPassageInstances} from '../src/render/bus-body-presentation.js';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../src/data/outskirts-bus-passage.js';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {BUS_BODY_THROAT_MESHES,BUS_BODY_THROAT_TARGETS,BUS_BODY_THROAT as T} from '../tools/chunk_surfer/build-bus-body-throat.mjs';

const load=name=>{const b=fs.readFileSync(new URL('../public/assets/'+name+'.glb',import.meta.url));return{bytes:b,raw:parseGlb(b),asset:parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))};};
const throat=load('bus-body-throat'),split=load('bus-body-passage');
function vertex(p,v,pose){
 const q=Array.from(p.positions.subarray(v*3,v*3+3));
 for(let k=0;k<p.targets.length;k++)for(let a=0;a<3;a++)q[a]+=p.targets[k].positions[v*3+a]*pose.morphs[k];
 const out=[0,0,0];for(let s=0;s<4;s++){const i=v*4+s,w=p.weights[i];if(!w)continue;const j=p.joints[i]*16;for(let a=0;a<3;a++)out[a]+=w*(pose.bones[j+a]*q[0]+pose.bones[j+4+a]*q[1]+pose.bones[j+8+a]*q[2]+pose.bones[j+12+a]);}return out;
}
function triangles(asset,names,morphs){
 const out=[];
 for(const e of asset.entries.filter(e=>names.includes(e.name))){
  const pose=sampleCharacterPose(asset,e,{time:0,loop:false,morphs});
  for(const p of e.primitives){const v=Array.from({length:p.vertexCount},(_,i)=>vertex(p,i,pose));for(let i=0;i<p.indices.length;i+=3)out.push([v[p.indices[i]],v[p.indices[i+1]],v[p.indices[i+2]]]);}
 }
 return out;
}
function points(asset,name,morphs){const e=asset.entries.find(e=>e.name===name),pose=sampleCharacterPose(asset,e,{time:0,loop:false,morphs});return e.primitives.flatMap(p=>Array.from({length:p.vertexCount},(_,i)=>vertex(p,i,pose)));}
// Möller–Trumbore; returns the ray parameter or Infinity.
function hit(o,d,[a,b,c]){
 const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
 const p=[d[1]*e2[2]-d[2]*e2[1],d[2]*e2[0]-d[0]*e2[2],d[0]*e2[1]-d[1]*e2[0]],det=e1[0]*p[0]+e1[1]*p[1]+e1[2]*p[2];
 if(Math.abs(det)<1e-12)return Infinity;const inv=1/det,t0=[o[0]-a[0],o[1]-a[1],o[2]-a[2]],u=(t0[0]*p[0]+t0[1]*p[1]+t0[2]*p[2])*inv;if(u<0||u>1)return Infinity;
 const q=[t0[1]*e1[2]-t0[2]*e1[1],t0[2]*e1[0]-t0[0]*e1[2],t0[0]*e1[1]-t0[1]*e1[0]],v=(d[0]*q[0]+d[1]*q[1]+d[2]*q[2])*inv;if(v<0||u+v>1)return Infinity;
 const t=(e2[0]*q[0]+e2[1]*q[1]+e2[2]*q[2])*inv;return t>1e-6?t:Infinity;
}

test('the throat is its own small tissue pack with named per-mesh morphs and no raster or glow',()=>{
 assert.deepEqual(throat.asset.entries.map(e=>e.name),BUS_BODY_THROAT_MESHES);
 for(const e of throat.asset.entries)assert.deepEqual(e.morphNames,BUS_BODY_THROAT_TARGETS[e.name]);
 assert.ok(throat.bytes.length<2*1024*1024);assert.equal(throat.raw.json.images?.length||0,0);
 for(const m of throat.raw.json.materials){
  assert.equal(m.emissiveFactor?.some(v=>v>0)||false,false,'tissue answers the real lamps, never glows');
  assert.equal(tissueSurfaceDescriptor(m.extras?.tissueSurface).profile,'bus-body-passage');
 }
});

test('closed, every throat vertex lies on her spine inside the closed body',()=>{
 for(const name of BUS_BODY_THROAT_MESHES)for(const p of points(throat.asset,name,{unfold:0,pulse:0,snap:0})){
  assert.ok(Math.abs(p[0]-C.woman.x)<1e-5&&Math.abs(p[2]-C.woman.z)<1e-5,`${name} starts outside her: ${p}`);
  assert.ok(p[1]>=C.woman.y&&p[1]<=C.woman.y+1.75);
 }
});

test('open, the wall and slit cover the rear wall from every saloon eye through the whole gap, slit shut or wide',t=>{
 const halves=['bus_body_passage_left','bus_body_passage_right'];let rays=0,worst=0;
 for(const[pulse,dilate]of[[0,0],[1,0],[0,1]]){
  const tris=[...triangles(throat.asset,['bus_body_throat_lining'],{unfold:1,pulse,dilate}),...triangles(split.asset,halves,{unfold:1,paper:0,paperUnfold:0,strain:0})];
  for(const eye of[[0,2.12,2.5],[.2,2.12,3.45],[-.25,2.12,1.9],[.3,1.6,3.6],[0,2.12,.5]])
   for(let i=0;i<=16;i++)for(let j=0;j<=20;j++){
    // Offset off the lattice: a ray exactly on a shared edge can miss both triangles.
    const target=[-.55+1.10*i/16+.0013*(i<16?1:-1),.55+2.05*j/20-.0011,C.bodyPassage.planeZ],d=target.map((v,k)=>v-eye[k]),len=Math.hypot(...d),dir=d.map(v=>v/len);
    let near=Infinity;for(const tri of tris)near=Math.min(near,hit(eye,dir,tri));
    // The wall's foot stands back from the walk, so a low ray can land on the coach floor first.
    if(dir[1]<0)near=Math.min(near,(C.floor-eye[1])/dir[1]);
    // Over the crown a ray meets the panel above the window (glazing tops out
    // near 2.5m). What may never be seen is the glazing, and the street through it.
    const wallT=(4.47-eye[2])/dir[2],atWall=eye[1]+dir[1]*wallT,overCrown=atWall>T.crown;
    const z=eye[2]+dir[2]*near;rays++;if(!overCrown)worst=Math.max(worst,z);
    assert.ok(overCrown||Number.isFinite(near)&&z<4.47,`ray from ${eye} through ${target.map(v=>v.toFixed(2))} reaches the rear glazing (dilate ${dilate})`);
   }
 }
 t.diagnostic(JSON.stringify({rays,deepestHitZ:worst,rearWallZ:4.47}));
});

test('the opening is a slit, not a door, and the wall stands clear behind the crossing',()=>{
 assert.ok(T.slit.closed*2<=.16,'shut, the slit is narrower than a hand is long');
 assert.ok(T.slit.open*2<=.62,'wide, the slit is still narrower than a shoulder span and a half');
 assert.ok((T.slit.up+T.slit.down)<=1.4,'the slit stops well short of filling the gap');
 const clear=C.bodyPassage.width/2-C.bodyRadius+.05;
 // Across the walked band the wall must sit behind the crossing plane: the
 // redirect fires at planeZ, and the eye's near plane is 5cm.
 for(const[pulse,dilate]of[[0,0],[1,0],[0,1]])for(const p of points(throat.asset,'bus_body_throat_lining',{unfold:1,pulse,dilate}))
  if(Math.abs(p[0])<clear)assert.ok(p[2]>C.bodyPassage.planeZ+.06,`wall in front of the crossing at ${p}`);
 // The crossing redirects at planeZ: a snapped strand hanging on her halves
 // is clear of the band; unsnapped, they really do cross the gap.
 for(const p of points(throat.asset,'bus_body_throat_strands',{unfold:1,snap:1}))assert.ok(Math.abs(p[0])>clear,`a snapped strand still crosses at ${p}`);
 assert.ok(points(throat.asset,'bus_body_throat_strands',{unfold:1,snap:0}).some(p=>Math.abs(p[0])<.05));
});

test('presentation: throat on the opening clock, mucus snapped before the gap is passable, still under reduced motion',()=>{
 const frame=(progress,elapsed)=>({bodyOpening:{active:true,elapsed,progress,paperReady:false},lighting:{origin:{x:0,y:0,z:0,yaw:0}}});
 const at=(f,o)=>Object.fromEntries(busBodyPassageInstances(f,o).map(i=>[i.id,i]));
 const open=at(frame(1,3.4));
 assert.deepEqual(Object.keys(open).sort(),['r7-bus-body:bag','r7-bus-body:left','r7-bus-body:mucus','r7-bus-body:right','r7-bus-body:throat']);
 assert.equal(open['r7-bus-body:mucus'].character.morphs.snap,1);assert.equal(open['r7-bus-body:throat'].character.morphs.unfold,1);
 assert.equal(at(frame(.5,1.6))['r7-bus-body:mucus'].character.morphs.snap,0,'mucus snaps late, not as she starts');
 const slitAt=z=>at({...frame(1,3.4),local:{x:0,z}})['r7-bus-body:throat'].character.morphs.dilate;
 assert.equal(slitAt(1.5),0,'from down the aisle the slit is shut');assert.equal(slitAt(3.9),1,'at the wall it has opened for you');
 const still=[3.4,5,9].map(e=>at(frame(1,e),{reducedMotion:true})['r7-bus-body:throat'].character.morphs.pulse);
 assert.ok(still.every(v=>v===still[0]));
 assert.deepEqual(busBodyPassageInstances({...frame(1,3.4),interior:{active:true}}),[]);
 assert.deepEqual(busBodyPassageInstances(frame(1,.31)),[]);
});
