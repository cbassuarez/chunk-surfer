import test from 'node:test';
import assert from 'node:assert/strict';
import {HORIZON_MIRROR as C,horizonMirrorBasis,horizonMirrorCaptureEye,horizonMirrorLocal,horizonMirrorPoint,horizonMirrorReflect,horizonMirrorReflectionMatrix,horizonMirrorWindow} from '../src/data/horizon-mirror.js';
import {horizonMirrorGeometry,HORIZON_MIRROR_MESHES} from '../src/render/horizon-mirror-models.js';
import {horizonMirrorStageProps,horizonMirrorWorldProps,horizonMirrorOccupantProps,HORIZON_MIRROR_CHURCH_MESH,HORIZON_MIRROR_ANT_MESH,HORIZON_MIRROR_FIGURES} from '../src/render/horizon-mirror-frame.js';
import {freshHorizonMirror,stepHorizonMirror,horizonMirrorBlocks,pluckHorizonMirrorPetal,HORIZON_MIRROR_EVENT} from '../src/game/horizon-mirror-scene.js';
import {readFileSync} from 'node:fs';

const close=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const headingTo=(from,to)=>Math.atan2(to.x-from.x,-(to.z-from.z));
function walkTo(state,to,{limit=40}={}){
  const events=[],heading=headingTo(state,to);
  for(let t=0;t<limit;t+=.05){const r=stepHorizonMirror({...state,yaw:heading},{dt:.05,forward:1});state=r.state;events.push(...r.events);if(Math.hypot(to.x-state.x,to.z-state.z)<.25||state.entered)break;}
  return{state,events};
}
const point=(along,out)=>{const p=horizonMirrorPoint(along,0,out);return{x:p[0],z:p[2]};};

test('the glass has a proper frame of its own, and the capture looks into it from in front',()=>{
  const{n,t}=horizonMirrorBasis();
  assert.ok(close(Math.hypot(...n),1)&&close(Math.hypot(...t),1));
  assert.ok(close(n[0]*t[0]+n[2]*t[2],0),'along is square to out');
  const toSpawn=[C.spawn.x-C.mirror.x,C.spawn.z-C.mirror.z];
  assert.ok(toSpawn[0]*n[0]+toSpawn[1]*n[2]>0,'it faces the way he comes');
  const{eye,yaw}=horizonMirrorCaptureEye(),l=horizonMirrorLocal(eye[0],eye[2]);
  assert.ok(close(l.out,C.capture.distance)&&close(l.along,0));
  assert.ok(close(Math.sin(yaw),-n[0])&&close(-Math.cos(yaw),-n[2]),'and looks straight in');
  const win=horizonMirrorWindow();
  for(const c of win.corners)assert.ok(close(horizonMirrorLocal(c[0],c[2]).out,0),'the window is the glass');
  assert.deepEqual(win.forward.map(v=>+v.toFixed(9)),[-n[0],-n[2]].map(v=>+v.toFixed(9)));
});
test('behind the glass is this side, reflected',()=>{
  const p=[3,1.2,-4],q=horizonMirrorReflect(p),pl=horizonMirrorLocal(p[0],p[2]),ql=horizonMirrorLocal(q[0],q[2]);
  assert.ok(close(pl.out,-ql.out)&&close(pl.along,ql.along)&&q[1]===p[1]);
  assert.deepEqual(horizonMirrorReflect(q).map(v=>+v.toFixed(9)),p.map(v=>+v.toFixed(9)));
  const m=horizonMirrorReflectionMatrix(),x=m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],z=m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14];
  assert.ok(close(x,q[0])&&close(z,q[2]),'the matrix and the point agree');
  assert.ok(close(m[0]*m[10]-m[8]*m[2],-1),'a reflection, not a turn');
});
test('St Brendan\'s stands only in the mirror',()=>{
  const here=horizonMirrorStageProps().map(p=>p.mesh);
  assert.equal(here.includes(HORIZON_MIRROR_CHURCH_MESH),false);
  for(const occupant of C.occupants){
    const there=horizonMirrorWorldProps(occupant);
    const church=there.find(p=>p.mesh===HORIZON_MIRROR_CHURCH_MESH);assert.ok(church,occupant);
    assert.ok(horizonMirrorLocal(church.x,church.z).out<-20,'well back behind the glass');
    for(const p of there.filter(p=>p.id.endsWith(':reflected')&&p.mesh!=='hm_floor'))assert.ok(horizonMirrorLocal(p.x,p.z).out<=1e-6||p.mesh.startsWith('hm_rind'),p.id+' is behind the glass');
  }
});
test('the mirror has mirrors in it, each smaller, each with the occupant again',()=>{
  const there=horizonMirrorWorldProps('lyle'),frames=there.filter(p=>p.mesh==='hm_mirror_frame');
  assert.equal(frames.length,C.nest.levels);
  const scales=frames.map(p=>Math.hypot(p.matrix[0],p.matrix[2]));
  for(let k=1;k<scales.length;k++)assert.ok(scales[k]<scales[k-1]);
  const lyles=there.filter(p=>p.mesh===HORIZON_MIRROR_FIGURES.lyle.mesh);assert.equal(lyles.length,C.nest.levels+1);
});
test('each of the four is someone, or something, in the glass',()=>{
  assert.ok(horizonMirrorOccupantProps('sarah').some(p=>p.mesh===HORIZON_MIRROR_FIGURES.sarah.mesh&&p.apparitionVariant===15));
  assert.ok(horizonMirrorOccupantProps('lyle').some(p=>p.mesh===HORIZON_MIRROR_FIGURES.lyle.mesh));
  assert.ok(horizonMirrorOccupantProps('ant').some(p=>p.mesh===HORIZON_MIRROR_ANT_MESH));
  const petals=n=>horizonMirrorOccupantProps('daisy',{petalsPlucked:n}).filter(p=>p.mesh==='hm_daisy_petal').length;
  assert.equal(petals(0),C.daisy.petals);assert.equal(petals(5),C.daisy.petals-5);assert.equal(petals(C.daisy.petals),0);
  assert.equal(C.daisy.petals%2,1,'odd, so counting from "loves me" the last one is "loves me"');
  for(const o of C.occupants)for(const p of horizonMirrorOccupantProps(o))assert.ok(horizonMirrorLocal(p.x,p.z).out<0,`${o} is behind the glass`);
  assert.deepEqual([...C.occupants],['sarah','lyle','daisy','ant']);
});
test('every mesh is real and the set is cheap',()=>{
  let tris=0;for(const row of horizonMirrorGeometry()){assert.equal(row.i.length%3,0,row.name);assert.ok(row.i.length>0,row.name);tris+=row.i.length/3;}
  assert.ok(tris<20000,`${tris}`);assert.equal(new Set(HORIZON_MIRROR_MESHES).size,HORIZON_MIRROR_MESHES.length);
});
test('walking straight into the glass is going into the mirror',()=>{
  const{state,events}=walkTo(freshHorizonMirror({occupant:'sarah'}),point(0,-2));
  assert.equal(state.entered,true);
  assert.deepEqual(events.filter(e=>e.type===HORIZON_MIRROR_EVENT.ENTERED).map(e=>e.occupant),['sarah']);
  const after=stepHorizonMirror(state,{dt:.05,forward:1}).state;assert.deepEqual([after.x,after.z],[state.x,state.z],'and then nothing moves here');
});
test('walking on down the road past it is the other answer',()=>{
  const{state,events}=walkTo(freshHorizonMirror(),{x:0,z:C.mirror.z-C.passed-2},{limit:60});
  assert.equal(state.entered,false);assert.equal(state.walkedOn,true);
  assert.equal(events.filter(e=>e.type===HORIZON_MIRROR_EVENT.WALKED_ON).length,1);
});
test('the frame and the board behind it are solid; round the ends is open',()=>{
  assert.equal(horizonMirrorBlocks(point(0,1),point(0,-.1)),false,'through the glass from the front');
  assert.equal(horizonMirrorBlocks(point(0,-1),point(0,.1)),true,'not back out through the board');
  assert.equal(horizonMirrorBlocks(point(C.mirror.width/2+.15,1),point(C.mirror.width/2+.15,-.1)),true,'not through the batten');
  assert.equal(horizonMirrorBlocks(point(C.mirror.width/2+1.2,1),point(C.mirror.width/2+1.2,-1)),false,'round the end');
});
test('the daisy\'s petals come off one at a time, at the glass',()=>{
  const far=freshHorizonMirror({occupant:'daisy'});assert.equal(pluckHorizonMirrorPetal(far),null,'not from the road');
  let s={...far,...point(0,2)};for(let k=0;k<C.daisy.petals+3;k++)s=pluckHorizonMirrorPetal(s)||s;
  assert.equal(s.petalsPlucked,C.daisy.petals);
  assert.equal(pluckHorizonMirrorPetal({...freshHorizonMirror({occupant:'lyle'}),...point(0,2)}),null,'only the daisy has petals');
});
test('the copy says no hold and no held',()=>{
  for(const f of['src/data/horizon-mirror.js','src/game/horizon-mirror-scene.js','src/render/horizon-mirror-frame.js','src/render/horizon-mirror-models.js','src/render/horizon-mirror-renderer.js'])
    assert.doesNotMatch(readFileSync(new URL('../'+f,import.meta.url),'utf8'),/\bhold\b|\bheld\b/i,f);
});
