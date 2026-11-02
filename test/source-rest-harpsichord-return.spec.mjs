import test from 'node:test';
import assert from 'node:assert/strict';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
import {sourceRestWeatherCue} from '../src/game/source-rest-weather-score.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {sourceRestReturnConfig,sourceRestReturnRoom,SOURCE_REST_RETURN} from '../src/render/source-rest-return.js';
import {portalClipPlanes,portalTransformPoint,portalInverse,portalMultiply,portalExcludeArray} from '../src/render/source-mesh-portals.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<2e-5,`${a} != ${b}`);
const inside=(planes,p)=>planes.every(v=>v[0]*p[0]+v[1]*p[1]+v[2]*p[2]+v[3]>=-1e-5);
const fixture=(seat,p=.3,t=160)=>{
  const s={...freshSourceContinuation({runId:'source-ii-harpsichord-regression'}),...seat.approach,status:'active',phase:seat.phase,chartId:seat.chartId,level:seat.level,feet:seat.feet};s.hush.active=false;
  s.sourceRestView={seatId:seat.id,progress:1,look:{...seat.view},mode:'seated',degradation:p,musicTime:t,audibleSeconds:t,musicSignal:.4,
    weatherCue:sourceRestWeatherCue({active:true,seated:true,progress:p,musicTime:t,audibleSeconds:t,stormAge:-1}),
    affliction:{...sourceRestAfflictionFrame({active:true,currentTime:t,playedSeconds:t,progress:p}),embodied:true,bodyProgress:1,canLeave:p<.56}};
  return s;
};
const render=s=>sourceContinuationRenderFrame(s,{reducedMotion:true,flashMode:'off'});

test('the approved seated body changes only body instances, retaining the Source II world, return and effects',()=>{
  // The old full-frame hashes included the intentionally replaced hands and
  // 1.04m eye. Verify the actual boundary instead of silently rebasing them.
  for(const [p,t]of[[.3,160],[.7,465]]){
    const s=fixture(SOURCE_REST_SEATS[0],p,t),f=render(s),off=sourceContinuationRenderFrame(s,{reducedMotion:true,flashMode:'off',restBodyReady:false});
    assert.equal(f.props.filter(p=>p.restBody).length,12);assert.ok(!off.props.some(p=>p.restBody));
    // Finite void images share a 760-instance budget with the twelve body
    // pieces. Compare the actual canonical world, not spare image slots that
    // legitimately become available when the body is hidden.
    assert.deepEqual(f.canonicalProps.filter(p=>!p.restBody),off.canonicalProps.filter(p=>!p.restBody));
    assert.ok(f.props.length<=760&&off.props.length<=760);
    for(const key of ['lights','eye','yaw','pitch','noteArchitecture','flood','sunset','restReturn'])assert.deepEqual(f[key],off[key],key);
  }
});

test('III destination lies behind both manuals and the same rigid mapping preserves a visible keyboard portion',()=>{
  const seat=SOURCE_REST_SEATS[1],c=sourceRestReturnConfig(seat),normal=c.sourceAperture.normal,right=c.sourceAperture.right,
    local=(x,y,z)=>[seat.x+right[0]*x+normal[0]*z,seat.feet+y,seat.z+right[2]*x+normal[2]*z],eye=[seat.x,seat.feet+1.04,seat.z],planes=portalClipPlanes(c.sourceAperture,eye);
  close((c.destinationAperture.x-seat.x)*normal[0]+(c.destinationAperture.z-seat.z)*normal[2],1.85);
  close((c.destinationAperture.x-seat.x)*right[0]+(c.destinationAperture.z-seat.z)*right[2],-.2);
  close(c.sourceAperture.halfWidth*2,2.2);
  assert.ok(inside(planes,portalTransformPoint(c.toCurrent,local(0,.65,0))),'the same bench centre must remain visible with the keyboard');
  for(const y of[.92,1.15]){
    let seen=0,total=0;
    for(const x of[-2.72,-2.2,-1.6,-1,-.52])for(const z of[.9,1.2,1.5]){
      total++;const key=local(x,y,z),q=portalTransformPoint(c.toCurrent,key);
      if(inside(planes,q))seen++;
      const restored=portalTransformPoint(portalInverse(c.toCurrent),q);restored.forEach((v,k)=>close(v,key[k]));
    }
    assert.ok(seen>=total*.5,`lost manual at ${y}: ${seen}/${total}`);
    assert.ok(inside(planes,portalTransformPoint(c.toCurrent,local(-1.6,y,1.2))),'manual centre must survive the finite aperture');
  }
  const product=portalMultiply(portalInverse(c.toCurrent),c.toCurrent);product.forEach((v,i)=>close(v,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1][i]));
});

test('III case mouth uses actual bevelled wood and hinge meshes without aliasing goods doors, handles or lamps',()=>{
  const f=render(fixture(SOURCE_REST_SEATS[1])),mouth=f.props.filter(p=>p.restReturnMouth);
  assert.equal(f.restReturn.projected,true);assert.equal(mouth.length,7);
  assert.ok(mouth.every(p=>p.restHarpsichordPart&&p.interactive===false&&p.canonicalDoorId===`catch-return-${SOURCE_REST_SEATS[1].level}`));
  assert.deepEqual(new Set(mouth.map(p=>p.mesh)),new Set(['source-continuation-rest-oak','source-continuation-rest-copper']));
  assert.ok(mouth.every(p=>!p.doorId&&!p.portalClipPlanes&&!p.portalExcludePlanes));
  assert.ok(f.props.some(p=>p.doorId===`catch-return-${SOURCE_REST_SEATS[1].level}`&&!p.restReturnDestination),'real route door remains present');
  assert.ok(!f.props.some(p=>p.restReturnDestination&&p.doorId===`catch-return-${SOURCE_REST_SEATS[1].level}`),'no copied industrial door inside case');
  assert.ok(f.props.some(p=>p.restReturnDestination&&p.canonicalId==='source-continuation-prop-source-rest-iii'),'canonical occupied bench retained');
  assert.ok(f.restReturn.projectedProps<=SOURCE_REST_RETURN.maxProjectedProps);
  for(const p of f.props)if(p.portalExcludePlanes)assert.ok(portalExcludeArray(p.portalExcludePlanes).length<=40);
});

test('new case and separate board metadata are canonical targets without recursively cloning projected fragments',()=>{
  const seat=SOURCE_REST_SEATS[1],part=id=>({id,chartId:0,region:'catch',mesh:id,restHarpsichordPart:true});
  const casePart=part('case'),board=part('board'),fragment={...part('ghost'),portalDestination:true},goods={id:'goods',chartId:0,doorId:`catch-return-${SOURCE_REST_SEATS[1].level}`,restReturnCanonical:true};
  assert.deepEqual(sourceRestReturnRoom([casePart,board,fragment,goods],seat),[casePart,board]);
});

test('finite return omits bodily contact chips and whole-route inlays while retaining actual falling timber',()=>{
  const seat=SOURCE_REST_SEATS[0],base={chartId:0,region:seat.phase,restPlace:true};
  const chip={...base,id:'contact-chip',restMistakeChip:true},route={...base,id:'full-stair-inlay',restRouteComposition:true},
    wood={...base,id:'falling-window-timber',restFracture:true,fracturedFrom:'window-head'};
  assert.deepEqual(sourceRestReturnRoom([chip,route,wood],seat).map(p=>p.id),['falling-window-timber']);
});

test('case lid follows the existing narrative opening and remains frozen during a wall-clock hold',()=>{
  const seat=SOURCE_REST_SEATS[1],early=render(fixture(seat,.10)),halfState=fixture(seat,.16),half=render(halfState),open=render(fixture(seat,.3));
  const lid=f=>f.props.find(p=>p.casePart==='mouth-lid');
  assert.notDeepEqual(lid(early).matrix,lid(half).matrix);assert.notDeepEqual(lid(half).matrix,lid(open).matrix);
  halfState.elapsed=999;assert.deepEqual(lid(half).matrix,lid(render(halfState)).matrix);
  assert.equal(early.restReturn.projected,false);assert.equal(open.restReturn.projected,true);
});
