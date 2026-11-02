import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestAfflictionFrame,sourceRestMistakeStructure,sourceRestMistakeImpactReceipt} from '../src/game/source-rest-affliction.js';
import {sourceRestCouperinAffliction} from '../src/game/source-rest-couperin-affliction.js';
import {SOURCE_REST_PERFORMANCE} from '../src/data/source-rest-performance.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {sourceRestPlaceStudy} from '../src/game/source-rest-place.js';
import {sourceRestGeometryLibrary} from '../src/render/source-rest-models.js';
import {sourceRestDestructionGeometryLibrary,sourceRestDestructionFragments,sourceRestDestructionPostBatch} from '../src/render/source-rest-destruction-models.js';
import {sourceRestBodyPose} from '../src/render/source-rest-body.js';
import {applySourceRestDestruction} from '../src/render/source-rest-destruction.js';

const seat=SOURCE_REST_SEATS[0],rows=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='mistake');
const matrix=p=>[p.sx,0,0,0,0,p.sy,0,0,0,0,p.sz,0,p.x,p.y,p.z,1];
const carriers=sourceRestPlaceStudy().parts.filter(p=>p.mesh.endsWith('rest-oak')&&/(window-reveal|loggia-post)--?1$/.test(p.id)).map(p=>({...p,id:'source-continuation-'+p.id,matrix:matrix(p),restPlace:true}));
const support={id:'keep-real-floor',physicalKind:'surface',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,8.4,-21,1]};
const cue=(time,extra={})=>({...sourceRestAfflictionFrame({active:true,currentTime:time,playedSeconds:time,progress:.6}),embodied:true,bodyProgress:1,canLeave:false,...extra});
const apply=(time,options={})=>applySourceRestDestruction([...carriers,support],{cue:cue(time),time,seat,canLeave:false,...options});
function volume(model){let total=0;for(let n=0;n<model.i.length;n+=3){const[a,b,c]=model.i.slice(n,n+3).map(i=>model.p.slice(i*3,i*3+3));total+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}return total;}

test('finite post sections are closed-volume cuts of the actual bevelled oak',()=>{
 const models=sourceRestDestructionGeometryLibrary(),parts=sourceRestDestructionFragments('post');
 assert.equal(parts.length,8);let sum=0;
 for(const part of parts){const model=models[part.mesh.replace('source-continuation-','')];assert.ok(model.p.every(Number.isFinite));assert.ok(model.i.every(i=>i>=0&&i<model.p.length/3));const v=volume(model);assert.ok(v>0);sum+=v;}
 assert.ok(Math.abs(sum-volume(sourceRestGeometryLibrary()['rest-oak']))<1e-10,'fracturing adds closed cut faces without discarding the original mass');
 assert.equal(parts.reduce((n,p)=>n+p.triangles,0),576);
});

test('settled batching preserves each actual post volume at its current measured dimensions',()=>{
 const models=sourceRestDestructionGeometryLibrary(),original=volume(sourceRestGeometryLibrary()['rest-oak']);
 for(const post of carriers){
  const batch=sourceRestDestructionPostBatch(post.id,7);if(!batch)continue;
  const remainder=models[batch.remainder.replace('source-continuation-','')],rubble=models[batch.rubble.replace('source-continuation-','')],scale=post.sx*post.sy*post.sz;
  assert.ok(Math.abs(volume(remainder)*scale+volume(rubble)-original*scale)<1e-9,post.id);
 }
});

test('every real annotation advances finite visible material damage with at most eight live chips',()=>{
 for(const [index,row] of rows.entries()){
  const frame=cue(row.start+.001),structure=sourceRestMistakeStructure(frame),rendered=applySourceRestDestruction(carriers,{cue:frame,seat});
  assert.ok(structure.events.some(event=>event.annotationId===row.id),row.id);
  assert.equal(structure.posts.reduce((n,p)=>n+p.hits,0),index+1);assert.ok(rendered.diagnostics.mistakeInstances<=48);
  assert.ok(rendered.diagnostics.mistakeChips<=8);assert.ok(rendered.diagnostics.mistakeCracked>0);
 }
 assert.equal(sourceRestMistakeStructure(sourceRestCouperinAffliction({active:true,currentTime:600,progress:.6})).events.length,0,'no invented Couperin error report');
});

test('the first wrong note opens a near window joint; the next marked mistake releases its actual timber before any grueling passage',()=>{
 const first=apply(rows[0].start+.03),second=apply(rows[1].start+.10);
 assert.equal(first.diagnostics.mistakeDetached,0);assert.equal(first.diagnostics.mistakeCracked,1);
 assert.ok(first.props.find(p=>p.restCrack).id.includes('window-reveal-'));
 assert.ok(second.props.some(p=>p.restMistake&&p.restDetached&&p.fractureState==='falling'));
 assert.ok(second.diagnostics.mistakeDetached>0);assert.equal(second.diagnostics.fracturedStructures,0,'failure belongs to this mistake, not an inherited hard-passage threshold');
});

test('actual wooden members settle on the real refuge floor, retain broken joints, and never remove playable support',()=>{
 const original=structuredClone(carriers),late=apply(600,{effectsMode:'off'});
 assert.equal(late.props.find(p=>p.id===support.id),support);assert.deepEqual(carriers,original);
 const pieces=late.props.filter(p=>p.restMistake&&p.restFracture);assert.equal(pieces.length,3);
 assert.equal(pieces.reduce((n,p)=>n+p.batchedSections,0),21);assert.ok(pieces.every(p=>p.fractureState==='fallen'&&p.y>=seat.feet));
 assert.equal(late.diagnostics.physicalCollisionChanged,false);assert.equal(late.props.filter(p=>p.restSurvivingPost).length,3);
 assert.equal(late.diagnostics.mistakeInstances,6,'settled mass and surviving construction take two props per failed carrier');
 const stood=apply(600,{cue:cue(600,{embodied:false,bodyProgress:0}),canLeave:true});
 assert.equal(stood.body.length,0);assert.equal(stood.diagnostics.mistakeDetached,late.diagnostics.mistakeDetached);assert.equal(stood.diagnostics.mistakeImpacts.length,0);
});

test('a marked fragment reaches the real seated hand on its own source clock, with no invented HUSH contact',()=>{
 const time=rows[1].start+.37,frame=cue(time),result=apply(time),impact=result.diagnostics.mistakeImpacts[0];
 assert.ok(impact);assert.equal(impact.sourceClock,rows[1].start+.36);assert.equal(impact.annotationId,rows[1].id);
 assert.deepEqual(impact.point,sourceRestBodyPose({cue:frame,seat}).contacts[1].wrist);
 assert.ok(result.props.some(p=>p.id===impact.chipId));assert.equal(result.body.length,12);
 assert.deepEqual(result,apply(time),'a held score cannot advance physical contact');
 for(const options of [{effectsMode:'off'},{reducedDread:true}]){
  const quiet=apply(time,options);assert.equal(quiet.diagnostics.mistakeChips,0);assert.equal(quiet.diagnostics.mistakeImpacts.length,0);
 }
 const a=apply(90,{reducedMotion:true}),b=apply(91,{reducedMotion:true});
 assert.deepEqual(a.props.filter(p=>p.restMistake),b.props.filter(p=>p.restMistake),'reduced motion retains settled structural loss without flight or spin');
});

test('composure accounting requires a presented, legible, locked and settled embodied contact; it never grants a lasting injury',()=>{
 const impact=apply(rows[1].start+.37).diagnostics.mistakeImpacts[0],input={impact,rendered:true,visible:true,embodied:true,settled:true,canLeave:false,
  held:false,protected:false,reducedDread:false,effectsMode:'full',progress:.6,composure:8,floor:2,phase:'wrong-return'};
 for(const denied of [{rendered:false},{visible:false},{embodied:false},{settled:false},{canLeave:true},{held:true},{protected:true},{reducedDread:true},{effectsMode:'off'},{progress:.96}])assert.equal(sourceRestMistakeImpactReceipt({}, {...input,...denied}).event,null);
 const first=sourceRestMistakeImpactReceipt({},input);assert.equal(first.event.cost,1);assert.equal(first.event.after,7);assert.equal(first.event.lastingInjury,false);
 assert.equal(sourceRestMistakeImpactReceipt(first.state,input).event,null,'one frame window cannot reapply a receipt');
 const second=sourceRestMistakeImpactReceipt(first.state,{...input,impact:{...impact,id:'second'}});assert.equal(second.state.spent,2);
 assert.equal(sourceRestMistakeImpactReceipt(second.state,{...input,impact:{...impact,id:'third'}}).event,null,'persisted count remains authoritative after reload');
 assert.equal(sourceRestMistakeImpactReceipt({}, {...input,composure:2}).event,null,'physical contact cannot push below the existing floor');
});
