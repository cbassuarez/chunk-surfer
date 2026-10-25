import test from 'node:test';
import assert from 'node:assert/strict';
import {TOWER_WARNING as SPEC} from '../src/data/tower-warning.js';
import {freshTowerWarning,towerWarningFrame,towerWarningFocus,beginTowerWarning,stepTowerWarning,towerWarningOccluded} from '../src/game/tower-warning.js';

const listener={...SPEC.approach,y:1.65};
const start=()=>beginTowerWarning(freshTowerWarning(),{listener,yaw:Math.PI,visible:true}).state;
function tick(s,seconds,input={}){for(let t=0;t<seconds;t+=.05)s=stepTowerWarning(s,{dt:.05,listener,...input});return s;}
function finishSpeech(){let s=tick(start(),1);for(let i=0;i<SPEC.lines.length;i++){s=stepTowerWarning(s,{dt:.05,listener,audio:{lineId:`${SPEC.id}:line:${i}`,done:true}});if(i<SPEC.lines.length-1)s=tick(s,.8);}return s;}

test('the warning is a deliberate close approach; distance, facing and real visibility matter',()=>{
  assert.equal(towerWarningFocus(freshTowerWarning(),{listener,yaw:Math.PI,visible:true}),true);
  for(const input of [{listener,yaw:0,visible:true},{listener,yaw:Math.PI,visible:false},{listener:{x:0,z:0},yaw:Math.PI,visible:true}])assert.equal(beginTowerWarning(freshTowerWarning(),input).started,false);
  assert.equal(beginTowerWarning(start(),{listener,yaw:Math.PI,visible:true}).started,false);
});
test('slow or failed voice production never silently consumes a warning',()=>{
  let s=tick(start(),50,{audio:{ready:false,done:false}});
  assert.equal(s.phase,'speaking');assert.equal(s.lineIndex,0);assert.equal(s.distance,0);
  s=tick(s,20,{audio:{lineId:'wrong-line',done:true}});assert.equal(s.lineIndex,0);
});
test('only completed audible sources advance the three one-sided lines, with real gaps',()=>{
  const s=finishSpeech();assert.equal(s.phase,'leaving');assert.equal(s.lineIndex,2);
  assert.equal(s.distance,0);assert.equal(towerWarningFrame(s).line,null);
  assert.equal(SPEC.lines.some(line=>/^(?:me|you|recordist)$/.test(line.voice)),false);
});
test('pause freezes turning, words and actual walking rather than clearing ownership',()=>{
  for(const s of [start(),tick(start(),1),tick(finishSpeech(),4)])assert.deepEqual(tick(s,8,{blocked:true,audio:{lineId:`${SPEC.id}:line:0`,done:true}}),s);
});
test('the body walks the authored route continuously and remains if followed to its end',()=>{
  let s=finishSpeech(),previous=towerWarningFrame(s).position;
  for(let i=0;i<800;i++){
    s=stepTowerWarning(s,{dt:.05,visible:true,exitOccluded:false});const f=towerWarningFrame(s);
    assert.ok(Math.hypot(f.position.x-previous.x,f.position.z-previous.z)<=SPEC.walkSpeed*.05+1e-6);previous=f.position;
  }
  assert.equal(s.phase,'leaving');assert.equal(towerWarningFrame(s).routeFinished,true);assert.equal(towerWarningFrame(s).visible,true);
  s=stepTowerWarning(s,{dt:.05,exitOccluded:true});assert.equal(s.phase,'departed');assert.equal(towerWarningFrame(s).visible,false);
});
test('collision stops the walk and its gait without moving or deleting the body',()=>{
  let s=tick(finishSpeech(),2,{canOccupy:()=>false});assert.equal(s.distance,0);assert.equal(s.walkSeconds,0);
  assert.equal(towerWarningFrame(s).walking,false);assert.equal(s.phase,'leaving');
  s=tick(s,4);assert.ok(s.distance>0);assert.ok(s.walkSeconds>0);
});
test('old Lyric masonry occludes the endpoint but not the speaker or a following player',()=>{
  assert.equal(towerWarningOccluded(listener,SPEC.position),false);
  const end=SPEC.route.at(-1);assert.equal(towerWarningOccluded(listener,end),true);
  assert.equal(towerWarningOccluded({x:end.x,y:1.65,z:end.z-1},end),false);
});
test('reload retains heard lines and physical departure; completion does not respawn',()=>{
  let s=tick(finishSpeech(),5),restored=freshTowerWarning(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored,s);assert.deepEqual(towerWarningFrame(restored),towerWarningFrame(s));
  restored=tick(restored,60,{exitOccluded:true});assert.equal(restored.phase,'departed');
  assert.equal(towerWarningFrame(freshTowerWarning(restored)).visible,false);
});
