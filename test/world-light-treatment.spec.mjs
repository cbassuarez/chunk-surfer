import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {WORLD_LIGHT_TREATMENT,normalizeWorldLightTreatment,worldLightTreatmentFrame,fineMarkFootprint,reflectedLightColor,weightedShadowCoverage,planLightVisibility} from '../src/render/world-light-treatment.js';
import {r3dSetWorldLightTreatment,r3dLightingDebug} from '../src/render/r3d.js';

const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const air={solid:false,floor:0,ceil:4};
const query=(from,to,cellAt=()=>air,other={})=>planLightVisibility({from,to,cellAt,...other});

test('review modes isolate marks and lighting without mutating emitter state',()=>{
  assert.deepEqual(WORLD_LIGHT_TREATMENT,{baseline:0,'marks-only':1,complete:2});
  const before=r3dLightingDebug();
  try{
    for(const[mode,level]of Object.entries(WORLD_LIGHT_TREATMENT)){
      const value=r3dSetWorldLightTreatment(mode);
      assert.deepEqual(value,{mode,level,marks:level>=1,lighting:level>=2});
      assert.deepEqual(r3dLightingDebug().lights,before.lights);
      assert.deepEqual(r3dLightingDebug().torch,before.torch);
      assert.equal(r3dLightingDebug().ambientIntensity,before.ambientIntensity);
      assert.equal(r3dLightingDebug().captureExposure,before.captureExposure);
      value.level=99;assert.equal(r3dLightingDebug().worldLightTreatment.level,level);
    }
    for(const bad of[null,NaN,Infinity,'invalid',{},3,-1])assert.equal(normalizeWorldLightTreatment(bad),'complete');
    assert.equal(normalizeWorldLightTreatment(1),'marks-only');
    assert.equal(worldLightTreatmentFrame().mode,'complete');
  }finally{r3dSetWorldLightTreatment('complete');}
});

test('fine acquisition footprint has an explicit sub-two-pixel bound',()=>{
  for(const size of[.25,1,2,3,5,8,16,100,NaN,Infinity,-4]){
    const px=fineMarkFootprint(size);assert.ok(Number.isFinite(px)&&px>=.85&&px<=1.65);
  }
  near(fineMarkFootprint(2),.9);near(fineMarkFootprint(3),1.35);
});

test('cold reflection preserves existing energy and cannot create light from zero',()=>{
  const luma=a=>a[0]*.2126+a[1]*.7152+a[2]*.0722;
  assert.deepEqual(reflectedLightColor([0,0,0]),[0,0,0]);
  for(const source of[[1,1,1],[.64,.65,.62],[1,.18,.01],[.01,.03,.2],[5,2,.4]]){
    const cold=reflectedLightColor(source);near(luma(cold),luma(source));
    assert.ok(cold.every(x=>x>=0&&Number.isFinite(x)));
    assert.ok(cold[2]/cold[0]>source[2]/source[0]);
    assert.deepEqual(reflectedLightColor(source,0),source);
  }
});

test('weighted shadow comparisons preserve endpoints and continuous edge coverage',()=>{
  for(const f of[[0,0],[.2,.7],[1,1]]){
    assert.equal(weightedShadowCoverage([0,0,0,0],f),0);
    assert.equal(weightedShadowCoverage([1,1,1,1],f),1);
  }
  let previous=-1;
  for(let i=0;i<=100;i++){
    const coverage=weightedShadowCoverage([0,1,0,1],[i/100,.37]);
    near(coverage,i/100);assert.ok(coverage>=previous);previous=coverage;
  }
  near(weightedShadowCoverage([1,0,0,0],[.5,.5]),.25);
});

test('plan light query catches a half-metre wall omitted by seven spaced probes',()=>{
  const from=[.1,1.5,.25],to=[10.1,1.5,.25],wall=x=>x===1?{...air,solid:true}:air;
  // Historical seven probes across ten metres all miss x=.5..1m.
  assert.ok(Array.from({length:7},(_,i)=>from[0]+(to[0]-from[0])*(i+1)/8).every(x=>Math.floor(x/.5)!==1));
  assert.equal(query(from,to,wall),0);
  assert.equal(query(from,to),1);
});

test('plan visibility respects actual floor, ceiling and vertical segment intervals',()=>{
  const ceiling=(x,z)=>x===3?{...air,ceil:1.25}:air;
  assert.equal(query([.1,1.5,.25],[4.1,1.5,.25],ceiling),0);
  assert.equal(query([.1,1,.25],[4.1,1,.25],ceiling),1);
  assert.equal(query([.1,1.5,.25],[4.1,1.5,.25],x=>x===3?{...air,floor:2}:air),0);
  assert.equal(query([.25,.2,.25],[.25,3.8,.25]),1);
  assert.equal(query([.25,.2,.25],[.25,5,.25]),0);
  assert.equal(query([.25,1.5,.25],[.25,1.5,.25]),1);
  assert.equal(query([.25,1.5,.25],[.255,1.5,.25]),1);
});

test('exact diagonal traversal avoids a spurious zero-length corner blocker',()=>{
  const cells=[];
  assert.equal(query([.1,1,.1],[3.1,1,3.1],(x,z)=>{cells.push([x,z]);return x!==z?{...air,solid:true}:air;}),1);
  assert.ok(cells.every(([x,z])=>x===z));
  assert.equal(query([.1,1,.1],[3.1,1,3.1],(x,z)=>x===3&&z===3?{...air,solid:true}:air),0);
});

test('visibility preserves reverse/negative coordinates and reports budget fallback explicitly',()=>{
  assert.equal(query([-3.1,1,-.25],[-.1,1,-.25]),1);
  assert.equal(query([4.1,1,.25],[.1,1,.25],x=>x===3?{...air,solid:true}:air),0);
  assert.equal(query([.1,1,.25],[80,1,.25]),null);
  assert.equal(query([.1,1,.25],[4,1,.25],()=>air,{maxSteps:1}),null);
});

test('malformed visibility input fails closed rather than throwing',()=>{
  for(const from of[null,{},[0,1],[NaN,1,0],[0,Infinity,0]])assert.equal(query(from,[1,1,1]),0);
  assert.equal(query([0,1,0],[1,1,1],null),0);
  assert.equal(query([0,1,0],[1,1,1],()=>air,{cellMeters:0}),0);
});

test('world pipeline binds both review stages without changing printed/light authority',()=>{
  const source=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  const shader=readFileSync(new URL('../src/render/pixel-mesh/shader.js',import.meta.url),'utf8');
  assert.match(source,/pixelMeshU\('uWorldLightTreatment'\),worldLightTreatment.level/);
  assert.match(source,/pixelMeshU\('uFineMarkPx'\),fineMarkFootprint\(resolvePixelMeshCellScenePx\(\)\)/);
  assert.match(source,/U\('uWorldLightTreatment'\),worldLightTreatment.level/);
  assert.match(source,/ordinaryLightTreatment=uWorldLightTreatment>1.5&&!sourceMaterial&&!sourceVoidMaterial&&surf!=4/);
  assert.match(source,/ordinaryLightTreatment&&emergency<.5/);
  assert.match(source,/uWorldLightTreatment>1.5&&uLocalShadowIndex<0/);
  assert.match(source,/spec=specStr\*pow\([^;]+\)\*lamp/);
  assert.match(shader,/blueNoise\(floor\(gl_FragCoord.xy\/max\(.85,uFineMarkPx\)\)\)/);
  const repairedStipple=shader.slice(shader.indexOf('if(uWorldLightTreatment>.5){',shader.indexOf('float formStipple')),shader.indexOf('// Aperiodic samples'));
  assert.doesNotMatch(repairedStipple,/uTime|recordingClock|uRecordingPatternScale/);
  assert.match(shader,/if\(uWorldLightTreatment<.5\)return recordingHash3\(floor\(worldMetres\*3.1\)\)/);
  assert.match(shader,/gCabinHatch&&uWorldLightTreatment>.5/);
  assert.match(shader,/period=cabin\?5.5:uScreenPeriodPx/);
  assert.match(shader,/printedAreaPigmentSample\(printed.y,areaThreshold\)/);
});
