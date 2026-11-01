import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SOURCE_REST_SEATS,sourceRestBenchProps} from '../src/game/source-rest-seat.js';
import {SOURCE_REST_ALCOVE,SOURCE_REST_ALCOVE_SOLIDS} from '../src/data/source-rest-alcove.js';
import {SOURCE_CONTINUATION,continuationDoors,continuationSupportAt,continuationFolds} from '../src/data/source-continuation.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
import {sourceRestWeatherCue} from '../src/game/source-rest-weather-score.js';
import {parseSourceRestNoteScore} from '../src/game/source-rest-note-score.js';
import {sourceContinuationRenderFrame,SOURCE_CONTINUATION_ARCHITECTURE} from '../src/render/source-continuation-renderer.js';
import {sourceRestCubeGeometryLibrary} from '../src/render/source-rest-cube-models.js';
import {SOURCE_REST_RETURN,sourceRestReturnConfig,sourceRestReturnFrame,sourceRestReturnRoom,applySourceRestReturn} from '../src/render/source-rest-return.js';
import {portalCorners,portalTransformPoint,portalInverse,portalMultiply,portalExcludeArray,portalClipPlanes} from '../src/render/source-mesh-portals.js';

const noteScore=parseSourceRestNoteScore(JSON.parse(readFileSync(new URL('../public/audio/source-rest/seb-bach-chaconne-notes.json',import.meta.url),'utf8')));
const close=(a,b,epsilon=2e-5)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
const pointClose=(a,b)=>a.forEach((v,k)=>close(v,b[k]));
const centre=p=>[p.x,p.y,p.z];
const inside=(planes,p)=>planes.every(v=>v[0]*p[0]+v[1]*p[1]+v[2]*p[2]+v[3]>=-1e-5);
const fixture=(seat=SOURCE_REST_SEATS[0],p=.3,mode='seated')=>{
  const s={...freshSourceContinuation({runId:'production-return-contract'}),...seat.approach,status:'active',phase:seat.phase,chartId:seat.chartId,level:seat.level,feet:seat.feet};
  s.hush.active=false;
  s.sourceRestView={seatId:seat.id,progress:1,look:{...seat.view},mode,degradation:p,musicTime:0,audibleSeconds:0,musicSignal:.4,
    weatherCue:sourceRestWeatherCue({active:true,seated:true,progress:p,musicTime:0,audibleSeconds:0,stormAge:-1}),
    affliction:{...sourceRestAfflictionFrame({active:true,currentTime:0,playedSeconds:0,progress:p}),embodied:true,bodyProgress:1,canLeave:true}};
  return s;
};
const render=(s,options={})=>sourceContinuationRenderFrame(s,{noteScore,reducedMotion:true,flashMode:'off',...options});
const noReturn=s=>({...s,sourceRestView:{...s.sourceRestView,mode:'standing'}});
function segmentHits(a,b,box){
  let enter=0,leave=1;
  for(const[k,lo,hi]of[[0,box.minX,box.maxX],[1,box.minY,box.maxY],[2,box.minZ,box.maxZ]]){
    const d=b[k]-a[k];if(Math.abs(d)<1e-10){if(a[k]<lo||a[k]>hi)return false;continue;}
    let x=(lo-a[k])/d,y=(hi-a[k])/d;if(x>y)[x,y]=[y,x];enter=Math.max(enter,x);leave=Math.min(leave,y);if(enter>leave)return false;
  }
  return leave>1e-6&&enter<1-1e-6;
}

test('II uses its genuine door opening and III its authored case opening on the existing supported floors',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const s=fixture(seat),c=sourceRestReturnConfig(seat),door=continuationDoors().find(d=>d.id===c.doorId);
    assert.equal(c.sourceAperture.halfWidth*2,seat.phase==='catch'?2.2:door.width);assert.equal(c.sourceAperture.halfHeight*2,door.height);
    if(seat.phase==='catch')assert.equal(door.width,1.8,'the physical goods door remains unchanged');
    assert.equal(c.toCurrent.length,16);assert.equal(c.toCurrent[15],1);
    for(const corner of portalCorners(c.sourceAperture)){
      const support=continuationSupportAt(corner[0],corner[2],s,{minY:seat.feet-.02,maxY:seat.feet+.02});
      assert.ok(support,`unsupported ${seat.id} mouth corner ${corner}`);close(support.y,seat.feet);
      assert.equal(support.id,seat.phase==='catch'?'catch-0-case-crescent':'wrong-upper-west');
    }
    pointClose(portalTransformPoint(c.toCurrent,centre(c.destinationAperture)),centre(c.sourceAperture));
    // Pure translation preserves handedness and scale; this is never a mirror.
    c.toCurrent.slice(0,12).forEach((v,k)=>close(v,[1,0,0,0,0,1,0,0,0,0,1,0][k]));
  }
});

test('Source II finite mouth clears the actual near window including lateral free-look study positions',()=>{
  const seat=SOURCE_REST_SEATS[0],c=sourceRestReturnConfig(seat),w=SOURCE_REST_ALCOVE.window;
  for(const lateral of[-.18,0,.18]){
    const eye=[seat.x,seat.feet+1.04,seat.z-lateral];
    for(const corner of portalCorners(c.sourceAperture)){
      const t=(w.x-eye[0])/(corner[0]-eye[0]),hit=eye.map((v,k)=>v+(corner[k]-v)*t);
      assert.ok(t>0&&t<1);assert.ok(hit[1]>w.minY&&hit[1]<w.maxY);assert.ok(hit[2]>w.minZ&&hit[2]<w.maxZ);
      assert.ok(!SOURCE_REST_ALCOVE_SOLIDS.some(box=>segmentHits(eye,corner,box)));
    }
  }
});

test('ordinary play, standing, other charts, lower Catch levels and existing black cannot own Return',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const s=fixture(seat),eye=[seat.x,seat.feet+1.04,seat.z];
    for(const patch of[
      {sourceRestView:undefined},{status:'completed'},{chartId:1},
      {sourceRestView:{...s.sourceRestView,mode:'standing'}},
      {sourceRestView:{...s.sourceRestView,degradation:.96}},
      ...(seat.phase==='catch'?[{level:1}]:[]),
    ])assert.equal(sourceRestReturnFrame({...s,...patch},{eye}).active,false,JSON.stringify(patch));
    assert.equal(sourceRestReturnFrame(s,{eye}).active,true);
  }
});

test('existing narrative progress stages physical standard-hinge opening without inventing another clock',()=>{
  const seat=SOURCE_REST_SEATS[0],early=render(fixture(seat,.1)),opening=render(fixture(seat,.16)),open=render(fixture(seat,.3));
  assert.equal(early.restReturn.stage,'establish');assert.equal(early.restReturn.projected,false);
  assert.equal(opening.restReturn.stage,'opening');close(opening.restReturn.opening,.5);
  assert.equal(open.restReturn.stage,'return');assert.equal(open.restReturn.opening,1);
  const leaf=f=>f.props.find(p=>p.restReturnMouth&&p.id.includes('-leaf-0:'));
  assert.notDeepEqual(leaf(early).matrix,leaf(opening).matrix);assert.notDeepEqual(leaf(opening).matrix,leaf(open).matrix);
  const held=render({...fixture(seat,.16),elapsed:2000});
  assert.deepEqual(leaf(opening).matrix,leaf(held).matrix,'game wall time cannot advance the authored opening');
  assert.equal(SOURCE_REST_RETURN.openStart,.12);
});

test('production Source II projects the same 51 shelter instances and preserves every other scene layer',()=>{
  const s=fixture(),before=render(noReturn(s)),after=render(s),current=new Map(after.props.filter(p=>!p.restReturnDestination&&!p.restReturnMouth).map(p=>[p.id,p]));
  assert.equal(after.restReturn.projected,true);assert.equal(after.restReturn.projectedProps,51);
  assert.equal(current.size,before.props.length);
  assert.ok(before.props.some(p=>p.angelAssemblyId));assert.ok(before.props.some(p=>p.restNoteArchitecture));
  assert.ok(before.props.some(p=>p.restBody));assert.ok(before.props.some(p=>p.restVista));
  for(const original of before.props){
    const p=current.get(original.id);assert.ok(p,`removed live scene layer ${original.id}`);
    assert.deepEqual(p.matrix,original.matrix,`moved live scene layer ${original.id}`);
    assert.equal(p.mesh,original.mesh);
  }
  assert.deepEqual(after.noteArchitecture,before.noteArchitecture);assert.deepEqual(after.sunset,before.sunset);assert.deepEqual(after.flood,before.flood);
  pointClose(after.eye,before.eye);assert.equal(after.yaw,before.yaw);assert.equal(after.pitch,before.pitch);
  assert.equal(after.props.some(p=>p.restReturnDestination&&(p.restBody||p.playerBody||p.angelAssemblyId||p.restNoteArchitecture)),false);
  assert.equal(after.lights.length,8);assert.ok(after.props.length<SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
});

test('Source III returns the actual occupied bench while retaining its real seat beneath the corrected eye',()=>{
  const seat=SOURCE_REST_SEATS[1],s=fixture(seat),f=render(s),bench=sourceRestBenchProps().find(p=>p.id===seat.id);
  assert.equal(f.restReturn.projected,true);assert.equal(f.restReturn.canonicalDoorId,'catch-return-0');
  assert.equal(f.restReturn.portalSlots,f.portals.length+1,'one Return aperture adds to the existing view-dependent journey apertures');
  assert.ok(f.restReturn.portalSlots<=2);
  const returned=f.props.find(p=>p.restReturnDestination&&p.canonicalId==='source-continuation-prop-source-rest-iii');
  assert.ok(returned);assert.equal(returned.mesh,bench.mesh);
  assert.equal(f.props.some(p=>!p.portalDestination&&p.id==='source-continuation-prop-source-rest-iii'),true);
  const c=sourceRestReturnConfig(seat);
  pointClose(centre(returned),portalTransformPoint(c.toCurrent,[bench.x,bench.y,bench.z]));
  for(const p of f.props.filter(p=>p.restReturnDestination))assert.ok(p.portalClipPlanes?.length===5);
  assert.ok(f.props.some(p=>p.restReturnDestination&&p.descriptorId==='catch-0-case-crescent'));
  assert.equal(f.lights.length,8);assert.ok(f.props.length<SOURCE_CONTINUATION_ARCHITECTURE.maxInstances);
});

test('Source III return clears the genuine near counterweight without moving its path or inventing new support',()=>{
  const seat=SOURCE_REST_SEATS[1],s=fixture(seat),config=sourceRestReturnConfig(seat),barrel=s.counterweight,radius=SOURCE_CONTINUATION.catch.counterweightRadius,
    right=[Math.cos(.92-Math.PI/2),0,Math.sin(.92-Math.PI/2)],normal=[Math.cos(.92),0,Math.sin(.92)],eye=[seat.x,seat.feet+1.04,seat.z];
  const distanceToRay=target=>{
    const d=[target[0]-eye[0],target[2]-eye[2]],r=[barrel.x-eye[0],barrel.z-eye[2]],t=Math.max(0,Math.min(1,(r[0]*d[0]+r[1]*d[1])/(d[0]*d[0]+d[1]*d[1])));
    return Math.hypot(r[0]-d[0]*t,r[1]-d[1]*t);
  };
  for(const point of[...portalCorners(config.sourceAperture),centre(config.sourceAperture)])assert.ok(distanceToRay(point)>radius+.35,'the actual barrel must not mask the finite return aperture');
  const destination=config.destinationAperture,relative=[destination.x-SOURCE_CONTINUATION.catch.center.x,0,destination.z-SOURCE_CONTINUATION.catch.center.z];
  close(relative.reduce((sum,v,k)=>sum+v*normal[k],0),15.2);
  close(relative.reduce((sum,v,k)=>sum+v*right[k],0),-.2);
  const before=JSON.stringify(s.counterweight),f=render(s);
  assert.equal(f.restReturn.projected,true);assert.ok(f.restReturn.portalSlots<=2);assert.equal(JSON.stringify(s.counterweight),before);
});

test('genuine doors, support, progression and free look remain authoritative through open, leave and return',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const s=fixture(seat),snapshot=JSON.stringify(s),doors=JSON.stringify(continuationDoors()),folds=JSON.stringify(continuationFolds()),open=render(s),standing=render(noReturn(s));
    assert.equal(open.restReturn.physicalExit,false);assert.equal(open.restReturn.collisionChanged,false);
    assert.deepEqual(open.geometry,standing.geometry);
    assert.ok(open.props.filter(p=>p.restReturnMouth).every(p=>!p.doorId&&!p.interactive&&!p.structural));
    assert.equal(standing.props.some(p=>p.restReturnDestination||p.restReturnMouth),false);
    assert.equal(render(s).restReturn.projected,true);
    assert.equal(JSON.stringify(s),snapshot);assert.equal(JSON.stringify(continuationDoors()),doors);assert.equal(JSON.stringify(continuationFolds()),folds);
  }
});

test('actual model transforms, canonical metadata and lights remain one-way rigid instances under nonzero anchor',()=>{
  const seat=SOURCE_REST_SEATS[0],s=fixture(seat),anchor={x:26,y:12,z:-13},baseline=render(noReturn(s),{anchor}),f=render(s,{anchor}),canonical=new Map(baseline.props.map(p=>[p.id,p]));
  const transform=sourceRestReturnConfig(seat,{origin:anchor}).toCurrent;
  for(const q of f.props.filter(p=>p.restReturnDestination)){
    const p=canonical.get(q.canonicalId);assert.ok(p,`missing source ${q.canonicalId}`);
    assert.equal(q.mesh,p.mesh);assert.equal(q.restPlace,p.restPlace);assert.equal(q.descriptorId,p.descriptorId);assert.equal(q.role,p.role);
    assert.deepEqual(q.physicalBounds,p.physicalBounds,'logical canonical bounds remain owned by original controller');
    const m=portalMultiply(transform,p.matrix);Array.from(q.matrix).forEach((v,k)=>close(v,m[k]));
  }
  const c=sourceRestReturnConfig(seat,{origin:anchor});pointClose(f.restReturn.virtualEye,portalTransformPoint(portalInverse(c.toCurrent),f.eye));
  close(f.restReturn.sourceAperture.x,anchor.x-15.4);close(f.restReturn.sourceAperture.y,anchor.y+9.925);
});

test('Return respects existing clipping capacity and fails closed rather than cutting an unsupported hole',()=>{
  const s=fixture(),baseline=render(noReturn(s)),args={props:baseline.props,lights:baseline.lights,state:s,eye:baseline.eye};
  for(const patch of[{portalCount:2},{maxInstances:baseline.props.length+1}]){
    const result=applySourceRestReturn({...args,...patch});assert.equal(result.diagnostics.projected,false);
    assert.equal(result.planes,null);
    for(const p of baseline.props)assert.deepEqual(result.props.find(q=>q.id===p.id).portalExcludePlanes,p.portalExcludePlanes);
  }
  const third=fixture(SOURCE_REST_SEATS[1]),f=render(third);
  for(const p of f.props)if(p.portalExcludePlanes)assert.ok(portalExcludeArray(p.portalExcludePlanes).length<=40);
  assert.deepEqual(f.portals,render(noReturn(third)).portals,'Return never registers a physical journey edge');
});

test('canonical support and near frame survive the finite mask while the back wall really is cut',()=>{
  const f=render(fixture()),targets=f.props.filter(p=>p.restReturnDestination);
  assert.ok(targets.some(p=>p.descriptorId==='wrong-upper-refuge'&&p.physicalKind==='surface'));
  assert.ok(targets.some(p=>p.descriptorId==='wrong-upper-refuge'&&p.id.includes('cut-bearing')));
  const q=targets.find(p=>p.id.includes('window-sill:through:')),planes=q.portalClipPlanes;
  assert.ok(inside(planes,centre(q)));
  const real=f.props.find(p=>p.id==='source-continuation-window-sill');assert.equal(inside(planes,centre(real)),false);
  const config=sourceRestReturnConfig(),wall=SOURCE_REST_ALCOVE_SOLIDS.find(p=>p.id.endsWith('east-back'));
  for(const x of[wall.minX,wall.maxX])assert.equal(inside(planes,portalTransformPoint(config.toCurrent,[x,9.7,-21.2])),false);
});

test('the supported upper-west return and primary semiangel remain simultaneously visible through the near window',()=>{
  const s=fixture();s.sourceRestView.musicTime=150;s.sourceRestView.audibleSeconds=150;
  const f=render(s),parts=f.props.filter(p=>p.angelAssemblyId&&!p.portalDestination),models=sourceRestCubeGeometryLibrary(),aperture=f.restReturn.sourceAperture,
    planes=portalClipPlanes(aperture,f.eye),anchor=parts[0].cubePivot,points=[];
  assert.equal(f.restReturn.projected,true);assert.ok(parts.length>0);
  assert.equal(inside(planes,anchor),false,'the return must not replace the semiangel centre');
  for(const p of parts){
    const mesh=models[p.mesh.replace('source-continuation-','')];assert.ok(mesh);
    for(let k=0;k<mesh.p.length;k+=3)points.push(portalTransformPoint(p.matrix,mesh.p.slice(k,k+3)));
  }
  const hidden=points.filter(p=>inside(planes,p)).length/points.length;
  assert.ok(hidden<.10,`Return masks ${(hidden*100).toFixed(1)}% of actual semiangel mesh vertices`);
  // Verify both the live pivot and complete mouth clear the actual foreground
  // enclosure. Metadata alone would not demonstrate a visible composition.
  for(const point of[anchor,...portalCorners(aperture)])assert.equal(SOURCE_REST_ALCOVE_SOLIDS.some(box=>segmentHits(f.eye,point,box)),false);
  const angles=portalCorners(aperture).map(p=>Math.atan2(-(p[2]-f.eye[2]),f.eye[0]-p[0]));
  assert.ok((Math.max(...angles)-Math.min(...angles))*180/Math.PI>9,'the finite doorway must retain a meaningful apparent width');
});

test('live structural damage and drift are shared by returned instances rather than an intact frozen duplicate',()=>{
  const s=fixture(SOURCE_REST_SEATS[0],.78);s.sourceRestView.musicTime=467;s.sourceRestView.audibleSeconds=467;
  s.sourceRestView.affliction={...sourceRestAfflictionFrame({active:true,currentTime:467,playedSeconds:467,progress:.78}),embodied:true,bodyProgress:1,canLeave:false};
  const f=render(s),current=new Map(f.props.filter(p=>!p.portalDestination&&!p.restReturnMouth).map(p=>[p.id,p]));
  assert.equal(f.restReturn.projected,true);assert.ok(f.restReturn.sourceAperture.y<9.925);
  const copies=f.props.filter(p=>p.restReturnDestination);assert.ok(copies.some(p=>p.restDrift>0));
  assert.ok(copies.some(p=>p.restDetached||p.restFracture),'the rear view includes actually failed shelter pieces');
  for(const p of copies){const q=current.get(p.canonicalId);assert.ok(q);assert.equal(p.fractureState,q.fractureState);assert.equal(p.restDrift,q.restDrift);}
});

test('non-listening disposal is a strict no-op on props and lights and never needs a cleanup owner',()=>{
  const s=fixture(),baseline=render(noReturn(s));
  for(const state of[{...s,sourceRestView:undefined},noReturn(s),{...s,status:'completed'}]){
    const r=applySourceRestReturn({props:baseline.props,lights:baseline.lights,state,eye:baseline.eye});
    assert.equal(r.props,baseline.props);assert.equal(r.lights,baseline.lights);assert.equal(r.planes,null);
  }
});
