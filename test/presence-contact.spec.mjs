import assert from 'node:assert/strict';

globalThis.document ||= { title:'Chunk Surfer',baseURI:'http://localhost/' };
globalThis.window ||= globalThis;

const PRES=await import('../src/game/presence.js');

function stageContact(){
  PRES.despawn();
  PRES.loadPresenceState({awareness:0,caughtCount:0,contactDirector:{warningsShown:2}});
  PRES.spawnBehind(0,0,0,0);
  const state=PRES.presenceState();
  state.x=0;state.y=0;state.spawnedAt=-1e9;state.lastCatchAt=-1e9;
  return state;
}

let state=stageContact(),attempt=null;
PRES.updatePresence(0,0,0,(value)=>{attempt=value;},{deferContact:true});
assert.equal(typeof attempt?.id,'number');
assert.equal(state.caughtCount,0,'a deferred touch is not yet a confirmed catch');
assert.equal(state.awareness,0,'a deferred touch teaches HUSH nothing yet');
assert.equal(PRES.pendingContactAttempt().id,attempt.id);
const confirmed=PRES.confirmContactAttempt(attempt.id);
assert.deepEqual(confirmed,{count:1,awareness:.18});
assert.equal(PRES.pendingContactAttempt(),null);
assert.equal(PRES.confirmContactAttempt(attempt.id),null,'an attempt confirms once');

state=stageContact();attempt=null;
PRES.updatePresence(0,0,0,(value)=>{attempt=value;},{deferContact:true});
const target={x:80,y:40};
assert.equal(PRES.releaseContactAttempt(attempt.id,{target,expiresAt:performance.now()+12000,priority:1}),true);
assert.equal(state.active,true,'release does not despawn HUSH');
assert.equal(state.caughtCount,0);
assert.equal(state.awareness,0);
assert.equal(state.hasTarget,true);
assert.deepEqual({x:state.targetX,y:state.targetY},target);
assert.equal(PRES.pendingContactAttempt(),null);

state=stageContact();let calls=0;
PRES.updatePresence(0,0,0,()=>{calls++;},{deferContact:true,suppressContact:true});
assert.equal(calls,0,'brush dialogue suppresses repeat contact while movement continues');
assert.equal(PRES.pendingContactAttempt(),null);

state=stageContact();let sourceCount=0;
PRES.updatePresence(0,0,0,(count)=>{sourceCount=count;},{deferContact:true,catchMode:'source-checkpoint'});
assert.equal(sourceCount,1,'Source checkpoint mode keeps immediate contact semantics');
assert.equal(state.caughtCount,1);

PRES.loadPresenceState({awareness:.4,caughtCount:3,contactDirector:{brushesShown:2,warningsShown:1,recentContentIds:['a']}});
assert.equal(PRES.pendingContactAttempt(),null,'pending attempts never survive load');
assert.deepEqual(PRES.savePresenceState().contactDirector,{
  schema:1,lastKind:null,eligibleSinceBrush:0,brushesShown:2,warningsShown:1,recentContentIds:['a'],
});

state=stageContact();attempt=null;
PRES.updatePresence(0,0,0,(value)=>{attempt=value;},{deferContact:true});
assert.ok(attempt?.id,'the load case begins with a real pending attempt');
PRES.loadPresenceState({awareness:.2,caughtCount:2,contactDirector:{brushesShown:1}});
calls=0;
PRES.updatePresence(0,0,0,()=>{calls++;},{deferContact:true});
assert.equal(PRES.pendingContactAttempt(),null);
assert.equal(calls,0,'load closes a pending attempt and grants catch grace instead of replaying it');
assert.equal(PRES.savePresenceState().contactDirector.brushesShown,1,'the already-spent brush count survives load');

PRES.despawn();
console.log('presence deferred contact specs passed');
