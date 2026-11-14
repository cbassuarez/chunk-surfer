import test from 'node:test';
import assert from 'node:assert/strict';
import {makePracticeMetronomeInspectionPlan as plan,practiceMetronomeInspectionCamera as frame,PRACTICE_METRONOME_INSPECTION as C} from '../src/game/practice-metronome-inspection.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} versus ${b}`);
test('a bounded physical lean uses an optical close-up without moving or copying the prop',()=>{
  const input={prop:{x:4,y:6.22,z:3,yaw:-Math.PI/2},originCamera:{eye:{x:1.7,y:6.42,z:3.5},yaw:1.22,pitch:.02,tanHalfFov:.95}};
  const p=plan(input),a=frame(p,0),b=frame(p,1);
  assert.deepEqual(a.eye,[1.7,6.42,3.5]);near(a.yaw,1.22);near(a.pitch,.02);near(24/(2*a.lens.focalLengthMm),.95);
  assert.ok(p.diagnostics.leanM<=C.maxLeanM+1e-8);assert.ok(p.diagnostics.frontFacing);
  assert.ok(p.diagnostics.predictedHeightFraction>.48);assert.ok(p.diagnostics.predictedHeightFraction<.8);
  assert.ok(b.lens.focalLengthMm>=20&&b.lens.focalLengthMm<=85);assert.ok(b.eye.every(Number.isFinite));
  assert.equal(input.prop.x,4);assert.equal(input.originCamera.eye.x,1.7);
});
test('the whole eye sweep respects measured clearance and falls back to a stationary framed view',()=>{
  const input={prop:{x:0,y:1.42,z:0},originCamera:{eye:{x:.2,y:1.62,z:-2},yaw:0,pitch:0,tanHalfFov:.95}};
  let samples=0;const p=plan({...input,canOccupyEye:eye=>{samples++;assert.equal(eye.radius,C.eyeRadiusM);return eye.z< -1.8;}});
  assert.ok(samples>1);assert.ok(p.diagnostics.blocked);assert.ok(p.eye[2]<-1.8);assert.ok(p.diagnostics.leanM<C.maxLeanM);
  const stopped=plan({...input,canOccupyEye:()=>false});assert.deepEqual(stopped.eye,[.2,1.62,-2]);assert.equal(stopped.diagnostics.leanM,0);
});
test('six authored-facing and elevated hosts produce continuous return frames with exact origin',()=>{
  for(const yaw of[-1.47,-1.55,1.45,-1.64,1.69,.04]){
    const prop={x:19,y:yaw===.04?5.97:6.22,z:37,yaw},front=[Math.sin(yaw),-Math.cos(yaw)];
    const originCamera={eye:{x:prop.x+front[0]*2,y:prop.y+.23,z:prop.z+front[1]*2},yaw:yaw+Math.PI,pitch:0,tanHalfFov:.95};
    const p=plan({prop,originCamera});let prior=frame(p,1);
    for(let i=9;i>=0;i--){const next=frame(p,i/10);assert.ok(Math.hypot(...next.eye.map((v,j)=>v-prior.eye[j]))<.15);prior=next;}
    assert.deepEqual(prior.eye,Object.values(originCamera.eye));near(prior.yaw,originCamera.yaw);near(prior.pitch,0);
  }
});

test('actual six-room approaches retain a clear eye path and readable section fit against the compiled school',async()=>{
  const [{readFileSync},{default:vm},FP,PROPS,{conservatory},{PRACTICE_METRONOMES},{CELL,EYE}]=await Promise.all([
    import('node:fs'),import('node:vm'),import('../src/world/floorplan.js'),import('../src/game/props.js'),
    import('../src/data/floorplan/conservatory.js'),import('../src/game/practice-metronomes.js'),import('../src/data/floorplan/legend.js')]);
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
  PROPS.propsInit(FP);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),start=main.indexOf('function practiceMetronomeEyeClearance(){'),end=main.indexOf('function openPracticeMetronome(id){',start);
  const receipts=[];
  for(const voice of PRACTICE_METRONOMES){
    const from=FP.toRuntimePoint({x:61,y:60}),path=PROPS.pathToProp(from.x,from.y,voice.id,new Set(['chapel']));
    assert.ok(path?.length,`${voice.id} has a real collision-clear approach`);
    const [px,py]=path.at(-1),physical=FP.logicalToPhysical(px,py),prop=PROPS.renderSelectedHosts({group:'upper',select:p=>p.id===voice.id})[0];
    const eye={x:(physical.x+.5)*CELL,y:physical.y+EYE,z:(physical.z+.5)*CELL};
    const originCamera={eye,yaw:Math.atan2(prop.x-eye.x,eye.z-prop.z),pitch:0,tanHalfFov:.95};
    const canOccupyEye=vm.runInNewContext(main.slice(start,end)+'\npracticeMetronomeEyeClearance();',{FP,PROPS,CELL,px,py});
    const p=plan({prop,originCamera,canOccupyEye});
    assert.ok(p.diagnostics.frontFacing,`${voice.id} presents its working face to the reachable approach`);
    assert.ok(p.diagnostics.predictedHeightFraction>=.4,`${voice.id} remains large enough to manipulate`);
    assert.ok(p.diagnostics.leanM<=C.maxLeanM+1e-8);
    for(let i=0;i<=20;i++){
      const c=frame(p,i/20);assert.ok(canOccupyEye({x:c.eye[0],y:c.eye[1],z:c.eye[2],radius:C.eyeRadiusM}),`${voice.id} camera does not enter an actual wall, lid or cello`);
    }
    receipts.push({id:voice.id,approach:[px,py],...p.diagnostics});
  }
  assert.equal(receipts.length,6);
});
