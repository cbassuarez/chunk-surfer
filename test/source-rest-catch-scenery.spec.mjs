import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestCatchScenery,sourceRestCatchWeather} from '../src/game/source-rest-catch-scenery.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {sourceRestWeather} from '../src/game/source-rest-weather.js';
import {sourceRestWeatherCue} from '../src/game/source-rest-weather-score.js';
import {sourceRestGeometryLibrary} from '../src/render/source-rest-models.js';
import {SOURCE_REST_HARPSICHORD,SOURCE_REST_HARPSICHORD_PARTS,sourceRestHarpsichordGeometryLibrary,sourceRestHarpsichordSeatGeometry} from '../src/render/source-rest-harpsichord-models.js';
import {sourceRestHarpsichordBoardGeometry,sourceRestHarpsichordBoardLocalToWorld} from '../src/render/source-rest-harpsichord-board.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceRestReturnConfig,sourceRestReturnRoom,SOURCE_REST_RETURN} from '../src/render/source-rest-return.js';
import {continuationSupportAt,continuationSolids,continuationSurfaces} from '../src/data/source-continuation.js';
import {portalTransformPoint} from '../src/render/source-mesh-portals.js';

const seat=SOURCE_REST_SEATS[1],first=SOURCE_REST_SEATS[0],models={...sourceRestGeometryLibrary(),...sourceRestHarpsichordGeometryLibrary(),
  'rest-harpsichord-soundboard':sourceRestHarpsichordBoardGeometry(),
  'rest-harpsichord-seat-upholstery':sourceRestHarpsichordSeatGeometry().upholstery};
const fixture=()=>({status:'active',phase:seat.phase,chartId:seat.chartId,level:seat.level,feet:seat.feet,...seat.approach,
  sourceRestView:{seatId:seat.id,mode:'seated',progress:1,degradation:.3,musicTime:12,audibleSeconds:12,musicSignal:.4,
    weatherCue:sourceRestWeatherCue({active:true,seated:true,progress:.3,musicTime:12,audibleSeconds:12,stormAge:-1})}});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function segmentHitsTriangle(a,b,triangle){
  const direction=sub(b,a),edge1=sub(triangle[1],triangle[0]),edge2=sub(triangle[2],triangle[0]),h=cross(direction,edge2),det=dot(edge1,h);
  if(Math.abs(det)<1e-9)return false;const inverse=1/det,s=sub(a,triangle[0]),u=inverse*dot(s,h);if(u<0||u>1)return false;
  const q=cross(s,edge1),v=inverse*dot(direction,q);if(v<0||u+v>1)return false;
  const time=inverse*dot(edge2,q);return time>1e-6&&time<1-1e-6;
}
function actualTriangles(v){return v.place.flatMap(part=>{
  const g=models[part.mesh.replace('source-continuation-','')],points=Array.from({length:g.p.length/3},(_,k)=>portalTransformPoint(part.matrix,g.p.slice(k*3,k*3+3)));
  return Array.from({length:g.i.length/3},(_,k)=>({id:part.id,triangle:g.i.slice(k*3,k*3+3).map(i=>points[i])}));
});}

test('the bounded real instrument and clipped soundboard use resident native meshes without new rooms or floors',()=>{
  const s=fixture(),v=sourceRestCatchScenery(s);
  assert.equal(v.treatment,'escherian-harpsichord-case');assert.equal(v.place.length,SOURCE_REST_HARPSICHORD_PARTS.length+2);
  assert.equal(SOURCE_REST_HARPSICHORD_PARTS.length,SOURCE_REST_HARPSICHORD.maxParts);
  assert.ok(v.place.length+v.lamps.length*2<=40);
  assert.equal(v.upholstery.enabled,false);assert.equal(v.carpet.existingFloor,true);
  assert.ok(v.place.every(p=>models[p.mesh.replace('source-continuation-','')]),'all parts use actual instrument or clipped-board geometry');
  assert.ok(v.place.every(p=>p.restPlace&&p.region==='catch'&&!p.structural&&!p.interactive&&p.decorative));
  assert.ok(v.place.every(p=>p.matrix?.length===16&&p.matrix.every(Number.isFinite)));
  assert.equal(v.place.filter(p=>p.casePart==='lid').length,3);assert.equal(v.place.filter(p=>p.casePart==='soundboard').length,1);
  assert.equal(v.harpsichord.manuals,2);assert.equal(v.harpsichord.strings,122);
  assert.equal(sourceRestReturnRoom(v.place,seat).length,v.place.length,'all dressing can share the actual reciprocal view');
  const actual={...freshSourceContinuation(),...s};actual.hush.active=false;
  const f=sourceContinuationRenderFrame(actual,{reducedMotion:true,flashMode:'off'});
  assert.ok(f.restReturn.projected);assert.ok(f.restReturn.projectedProps<=SOURCE_REST_RETURN.maxProjectedProps);
  assert.ok(f.props.some(p=>p.restReturnDestination&&p.restHarpsichordPart==='soundboard'));
});

test('original support queries and the central approach remain intact rather than supporting an invented case floor',()=>{
  const s=fixture(),before=JSON.stringify({surfaces:continuationSurfaces(s),solids:continuationSolids(s)}),v=sourceRestCatchScenery(s);
  for(const x of[-.4,0,.4])for(const z of[-.3,.3,.9,1.7]){
    const q=sourceRestHarpsichordBoardLocalToWorld({x,z}),support=continuationSupportAt(q.x,q.z,s,{minY:seat.feet-.02,maxY:seat.feet+.02});
    assert.ok(support,`unsupported original approach at ${x},${z}`);close(support.y,seat.feet);
  }
  for(const p of v.lamps)for(const dx of[-.12,.12])for(const dz of[-.12,.12])assert.ok(continuationSupportAt(p.x+dx,p.z+dz,s));
  assert.equal(JSON.stringify({surfaces:continuationSurfaces(s),solids:continuationSolids(s)}),before);
  const triangles=actualTriangles({...v,place:v.place.filter(part=>part.casePart!=='seat-upholstery')});
  for(const x of[-.35,0,.35])for(const y of[.12,.95,1.85]){
    const a=sourceRestHarpsichordBoardLocalToWorld({x,y,z:1.8}),b=sourceRestHarpsichordBoardLocalToWorld({x,y,z:-.3});
    for(const t of triangles)assert.equal(segmentHitsTriangle(Object.values(a),Object.values(b),t.triangle),false,`${t.id} blocks sampled central approach`);
  }
});

test('representative inner Return rays clear actual curved and batched instrument triangles at modest parallax',()=>{
  const v=sourceRestCatchScenery(fixture()),aperture=sourceRestReturnConfig(seat).sourceAperture;
  const triangles=actualTriangles(v),centre=[aperture.x,aperture.y,aperture.z],targets=[centre,...[-1,1].map(sign=>centre.map((n,k)=>n+aperture.right[k]*aperture.halfWidth*.35*sign))];
  for(const side of[-.18,0,.18]){
    const eye=[seat.x+Math.cos(seat.view.yaw)*side,seat.feet+1.27,seat.z+Math.sin(seat.view.yaw)*side];
    for(const target of targets)for(const t of triangles)assert.equal(segmentHitsTriangle(eye,target,t.triangle),false,`${t.id} blocks inner Return view`);
  }
});

test('weather is the exact standard Source particle field rigidly placed around this radial refuge',()=>{
  const s=fixture();s.sourceRestView.weatherCue={...s.sourceRestView.weatherCue,rain:.8,drips:.7,wetness:.6,ripples:.5,windStrength:.6,clock:12,
    particles:[{kind:'rain',depth:.8,x:.41,y:.32,size:.035,vx:.2,vy:1.1,wind:.6,visibility:.8}]};
  const physicalYaw=Math.PI/2-seat.yaw;
  const before=JSON.stringify(s),source=sourceRestWeather({...s,phase:first.phase}),target=sourceRestCatchWeather(s),f=[Math.sin(physicalYaw),-Math.cos(physicalYaw)],r=[Math.cos(physicalYaw),Math.sin(physicalYaw)];
  assert.equal(target.streaks.length,source.streaks.length);assert.equal(target.roof.length,source.roof.length);assert.equal(target.wet.length,source.wet.length);
  const mapped=p=>{const forward=first.x-p[0],right=first.z-p[2];return[seat.x+f[0]*forward+r[0]*right,p[1]+seat.feet-first.feet,seat.z+f[1]*forward+r[1]*right];};
  for(const name of['streaks','roof'])for(let i=0;i<source[name].length;i++)for(const end of['a','b'])target[name][i][end].forEach((v,k)=>close(v,mapped(source[name][i][end])[k]));
  close(target.time,source.time);close(target.gust,source.gust);assert.deepEqual(target.cue,source.cue);
  assert.deepEqual(sourceRestCatchWeather({...s,sourceRestView:{...s.sourceRestView,look:{yaw:seat.view.yaw+.7,pitch:.3}}}),target,
    'turning the player\'s look cannot rotate the physical roof or weather');
  assert.ok(target.streaks.every(p=>Math.hypot(p.a[0]-seat.x,p.a[2]-seat.z)>2.5));
  assert.equal(JSON.stringify(s),before);
});

test('quiet weather stays quiet, supplied clocks are deterministic and reduced motion keeps the real place',()=>{
  const s=fixture(),v=sourceRestCatchScenery(s),reduced=sourceRestCatchScenery(s,{reducedMotion:true});
  for(const name of['streaks','roof','objects','wet','ripples'])assert.equal(v.weather[name].length,0);
  const staticParts=place=>place.filter(p=>!p.reactive);
  assert.deepEqual(staticParts(v.place),staticParts(reduced.place),'case/spine/manuals/board stay in the same place');
  const moving=v.place.filter(p=>p.reactive),quiet=reduced.place.filter(p=>p.reactive);
  assert.ok(moving.some(p=>p.response>0),'the fixture has a measured signal even without inferred notes');
  assert.ok(quiet.every(p=>p.response===0),'reduced motion removes string, bridge and lid displacement');
  assert.equal(reduced.weather.gust,0);
  assert.deepEqual(sourceRestCatchScenery(s),v);
  assert.equal(v.memories.drive.length+v.memories.ellery.length+v.memories.tableaux.length+v.noteArchitecture.parts.length,0);
  assert.equal(v.flood,null);
});

test('the instrument spans all Catch levels while its supported resting origin stays on the earned refuge',()=>{
  const s=fixture(),before=JSON.stringify(s);
  for(const patch of[{phase:'wrong-return'},{chartId:1}])assert.equal(sourceRestCatchScenery({...s,...patch}),null);
  for(const [level,feet]of[[0,8.4],[1,2.4],[2,-4.8],[3,-12.6]]){
    const view=sourceRestCatchScenery({...s,level,feet});assert.ok(view);assert.equal(view.harpsichord.seatLevel,seat.level);
    assert.equal(view.harpsichord.architecturalCourses,122);assert.ok(view.place.every(part=>part.level===seat.level));
    assert.ok(sourceRestCatchWeather({...s,level,feet}));assert.deepEqual(view.place.map(part=>part.matrix),sourceRestCatchScenery(s).place.map(part=>part.matrix));
  }
  sourceRestCatchScenery(s);assert.equal(JSON.stringify(s),before);
});
