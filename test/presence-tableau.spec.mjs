import assert from 'node:assert/strict';
import * as PRES from '../src/game/presence.js';

PRES.loadPresenceState({awareness:.3,caughtCount:2});
const state=PRES.presenceState();
Object.assign(state,{
  active:true,x:20,y:30,targetX:40,targetY:50,hasTarget:true,targetLevel:.8,targetConfidence:.9,
  targetReason:'PLAYER_NOISE_PINPOINT',targetPriority:.95,targetSetAt:performance.now()-450,
  lastHeardAt:performance.now()-300,lastEngagedAt:performance.now()-250,lastCatchAt:performance.now()-5000,
  spawnedAt:performance.now()-8000,externalTargetUntil:performance.now()+4400,externalTargetPriority:.95,
  lastSoundX:39,lastSoundY:49,hasSearchOrigin:true,prowlX:41,prowlY:51,hasProwl:true,
  prowlUntil:performance.now()+3000,dwellUntil:performance.now()+900,velocityX:2,velocityY:-1,speed:2.2,
  motionMode:'walking',behaviorMode:'chase',phaseUntil:performance.now()+1200,chaseUntil:performance.now()+2500,
  directorIntent:'PLAY',tauntRequested:true,nextLightListenAt:performance.now()+700,spawnSector:'west',
});
const before=PRES.capturePresenceTableauState();
PRES.beginPresenceTableau({x:4,y:5,snapshot:before});
assert.equal(PRES.presenceTableauActive(),true);
assert.deepEqual(PRES.publicSnapshot().position,{x:4,y:5});
assert.equal(PRES.publicSnapshot().tableau,true);
assert.equal(PRES.offerSoundTarget({position:{x:100,y:100},level:1,confidence:1,priority:1}),false);
assert.equal(PRES.setDirectorIntent('PLAY'),'IGNORE');
assert.equal(PRES.commitForcedContact(),null);
let contacted=false;
PRES.updatePresence(20,4,5,()=>{contacted=true;},{deferContact:true});
assert.equal(contacted,false);
assert.deepEqual(PRES.publicSnapshot().position,{x:4,y:5},'held body cannot move');
assert.equal(PRES.restorePresenceTableau(before),true);
assert.equal(PRES.presenceTableauActive(),false);
assert.equal(state.x,20);
assert.equal(state.y,30);
assert.equal(state.hasTarget,true);
assert.equal(state.targetReason,'PLAYER_NOISE_PINPOINT');
assert.equal(state.behaviorMode,'chase');
assert.equal(state.directorIntent,'PLAY');
assert.ok(state.externalTargetUntil>performance.now(),'relative target timer resumes');
assert.ok(state.chaseUntil>performance.now(),'relative chase timer resumes');

const inactive={...PRES.capturePresenceTableauState(),active:false};
PRES.beginPresenceTableau({x:8,y:9,snapshot:inactive});
assert.equal(PRES.endPresenceTableau({despawn:true}),true);
assert.equal(PRES.isActive(),false,'pre-recording resolution despawns the staged body');

console.log('presence tableau capture and restoration contracts passed');
