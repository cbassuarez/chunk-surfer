// Ordinary building HUSH behind real navigation obstructions. These are
// deterministic geometry/state checks, not a claim about the rendered scene.
import assert from 'node:assert/strict';
import { createPresenceNavigation } from '../src/game/presence-navigation.js';

globalThis.document ||= { title: 'Chunk Surfer', baseURI: 'http://localhost/' };
globalThis.window ||= globalThis;
const originalPerformance = globalThis.performance;
const originalRandom = Math.random;
let now = 3000;
globalThis.performance = { now: () => now };
Math.random = () => .05;
const PRES = await import('../src/game/presence.js');

function scenario(kind) {
  const blocked = new Set(Array.from({ length: kind === 'wall' ? 11 : 3 }, (_, i) => `${i + (kind === 'wall' ? 5 : 9)},10`));
  const wall = (x,y) => kind === 'wall' && blocked.has(`${Math.floor(x)},${Math.floor(y)}`);
  const occupiable = (x,y) => kind !== 'furniture' || !blocked.has(`${Math.floor(x)},${Math.floor(y)}`);
  const nav = createPresenceNavigation({
    isSolid: wall,
    canOccupy: occupiable,
    canStep: (_x,_y,x,y) => ({ok: !wall(x,y) && occupiable(x,y)}),
    planSize: () => ({w:32,h:24}),
  });
  return {nav,blocked};
}

try {
  for (const kind of ['wall','furniture']) {
    now=3000;
    PRES.loadPresenceState({});
    const {nav,blocked}=scenario(kind);
    const player={x:10,y:11};
    PRES.spawnAtCell(9.4,9,{gaitSeed:1});
    const actor=PRES.presenceState();
    actor.spawnedAt=0;
    // A plausible existing east-facing gait; no player position is supplied to
    // target acquisition. This is one particular random outcome, not a promise.
    actor.gait.heading=Math.PI/2;
    PRES.offerSoundTarget({position:{x:10,y:10},level:.55,confidence:.34,priority:.68,
      expiresAt:now+4800,reason:'PLAYER_NOISE_CLUE'});
    const firstBelief={x:actor.targetX,y:actor.targetY};
    assert.notDeepEqual(firstBelief,player,`${kind}: clue is fallible`);
    let minDistance=Infinity,contacts=0,passed=false,nearAt=null;
    for(let i=0;i<360;i++){
      now+=50;
      PRES.updatePresence(.05,player.x,player.y,()=>{contacts++;},{navigation:nav,deferContact:true});
      assert.ok(nav.isWalkable({x:actor.x,y:actor.y}),`${kind}: no step into obstacle`);
      assert.ok(!blocked.has(`${Math.floor(actor.x)},${Math.floor(actor.y)}`));
      const d=PRES.distanceTo(player.x,player.y);
      if(d<minDistance){minDistance=d;nearAt=now;}
      if(actor.x>player.x+.5)passed=true;
    }
    assert.equal(contacts,0,`${kind}: a close pass on the far side is not a contact`);
    assert.ok(minDistance<=2.05,`${kind}: it comes within approximately one metre`);
    assert.ok(passed,`${kind}: this sound/search outcome passes the player's coordinate`);
    assert.ok(PRES.distanceTo(player.x,player.y)>minDistance+.1,`${kind}: the body subsequently recedes`);
    assert.equal(actor.targetReason,'PLAYER_NOISE_CLUE',`${kind}: no covert player-target rewrite`);
    assert.ok(nearAt>3000);
    console.log(`${kind}: fallible target ${JSON.stringify(firstBelief)}, nearest ${(minDistance*.5).toFixed(2)} m, passage ${passed}, contact ${contacts}`);
  }
  // Shelter is not invulnerability: if the actual body reaches accessible
  // space beside the player, ordinary proximity still begins the deferred
  // contact transaction. No sight or concealed-state flag is added to HUSH.
  now=3000;
  PRES.loadPresenceState({});
  const {nav}=scenario('furniture');
  PRES.spawnAtCell(11.25,11,{gaitSeed:1});
  const actor=PRES.presenceState(); actor.spawnedAt=0;actor.lastCatchAt=-1e9;
  let attempt=null;
  PRES.updatePresence(0,10,11,value=>{attempt=value;},{navigation:nav,deferContact:true});
  assert.ok(attempt?.id,'actual contact beside furniture remains possible');
  assert.equal(actor.caughtCount,0,'contact is still a deferred gameplay transaction');
  console.log('accessible side: deferred physical contact remains possible');
} finally {
  PRES.despawn();
  Math.random=originalRandom;
  globalThis.performance=originalPerformance;
}
