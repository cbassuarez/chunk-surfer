// THE SCENE DOCK'S THREE STANDING FAULTS, PINNED SO THEY CANNOT RETURN.
//
// All three were reported from the same twenty seconds of play: a giant railing
// driven through the FOH door, a staircase that could not be climbed, and a
// door that stayed open forever once opened. They have nothing in common in the
// code and everything in common on screen, so they are guarded together.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MATERIAL } from '../src/data/floorplan/legend.js';

import {
  SOURCE_LANDING_PORTAL_DOOR_ID,
  SOURCE_LANDING_PORTAL_LOCAL,
  SOURCE_LANDING_REAR_LOCAL,
} from '../src/data/source-landing.js';
import { freshChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { sourceFocusActionLabel } from '../src/game/source-haystack.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const runtime = await readFile(new URL('../src/game/source-space-runtime.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const apply=(state,type,details={})=>reduceChunkSurf(state,{type,...details});

function haystackRuntime(slot=0){
  let state=freshChunkSurfState({seed:4417,returnPoint:{x:0,y:0,facing:0}});
  state=apply(state,'SOURCE_ENTERED',{returnPoint:state.returnPoint});
  state=apply(state,'HALL_ADVANCED',{distance:112});
  state=apply(state,'HAYSTACK_REACHED',{origin:{x:0,y:-224},slot});
  return createSourceSpaceRuntime({initialState:state});
}

// ── 1. BEHIND THE FOH DOOR IS THE HAYSTACK CORRIDOR ITSELF ─────────────────
//
// Not a stand-in built out of louvre panels, and not a fabricated recess: the
// corridor the player actually walked, still standing where it actually is.
// The hall used to be gated on phase alone, so it was deleted the instant the
// landscape began and the Scene Dock had nothing behind it.
{
  assert.ok(!/source-landing-portal-depth-/.test(runtime),
    'the impossible thresholds are gone from behind the leaf');
  assert.ok(!/source-landing-corridor-/.test(runtime),
    'nothing is fabricated behind the leaf — the real corridor renders there');
  assert.ok(!/id: 'source-landing-corridor-hush'/.test(runtime),
    'and no stand-in body is invented to stand in it');

  assert.ok(/function hallRenderableInPhase\(\)/.test(runtime),
    'the corridor needs a render gate of its own, separate from the body gate');
  assert.ok(/function visualHallCell\(x, y\) \{\n    if \(!hallRenderableInPhase\(\)\) return null;/.test(runtime),
    'the eye uses the render gate');
  assert.match(runtime, /const backtracking =/, 'the visible rear hall must remain freely walkable before ascent');
}

// ── 1b. THE SHEET REVERSES THE BRACKET, NOT THE PLAYER ─────────────────────
//
// This is the player-facing contract. Before the read there is a manifestation
// on either side. After it, the forward body is gone and forward motion enters
// the new Scene Dock; the rear body survives inside a corridor that still
// renders but refuses the body like a painted wall.
{
  const game=haystackRuntime(0);
  const target=game.sourceObjective().target;
  const player={x:target.x,y:target.y+3,facing:0};
  game.setPlayerPosition(player);

  const before=game.sourceBracketFrame();
  assert.equal(before.front.visible,true,'the forward HUSH was not established before the sheet');
  assert.equal(before.rear.visible,true,'the rear HUSH was not established before the sheet');
  assert.ok(before.front.y<player.y&&before.rear.y>player.y,'the two HUSHes do not actually bracket the player');

  const result=game.inspectFocused(player.x,player.y,player.facing);
  assert.equal(result.event,'page-found');
  game.commitStillPageReveal();
  const origin=game.state().landscapeOrigin;
  assert.equal(origin.x+SOURCE_LANDING_REAR_LOCAL.x,player.x,'the Scene Dock mouth moved sideways from the body');
  assert.equal(origin.y+SOURCE_LANDING_REAR_LOCAL.y+1,player.y,'the Scene Dock mouth is not seated on the transition line');

  assert.equal(game.sourceBracketFrame().front.visible,false,'the forward HUSH survives the sheet');
  const landing=game.sourceLandingHushFrame();
  assert.equal(landing.rear.visible,true,'the rear HUSH is the one the transition removed');
  assert.ok(landing.rear.y>player.y,'the surviving HUSH moved in front of the player');

  const threshold=game.geometry.cellAt(player.x,player.y);
  const forward=game.geometry.cellAt(player.x,player.y-2);
  assert.ok(threshold?.sourceLanding,'the player is left standing outside the new physical room');
  assert.ok(forward?.sourceLanding,'forward space did not become the Scene Dock');
  assert.ok(game.geometry.cellAt(player.x,player.y+2),'the real rear corridor is no longer walkable');
  assert.ok(game.geometry.renderCellAt(player.x,player.y+2),'the fake rear corridor disappeared visually');
  assert.equal(game.geometry.canStep(player.x,player.y,player.x,player.y+1).ok,true,
    'the visible rear mouth hides an invisible barrier');
  assert.equal(game.geometry.canStep(player.x,player.y,player.x,player.y-1).ok,true,
    'the Scene Dock in front is not traversable');

  // The real sheet has twelve seeded placements across three rows. Every one
  // must land on the same body/eye contract; a fix for the centre slot alone is
  // another intermittent stuck transition.
  for(let slot=0;slot<12;slot+=1){
    const variant=haystackRuntime(slot);
    const page=variant.sourceObjective().target;
    const at={x:page.x,y:page.y+3,facing:0};
    variant.setPlayerPosition(at);
    assert.equal(variant.inspectFocused(at.x,at.y,at.facing).event,'page-found',`slot ${slot} cannot commit`);
    variant.commitStillPageReveal();
    assert.ok(variant.geometry.cellAt(at.x,at.y)?.sourceLanding,`slot ${slot} leaves the body outside the dock`);
    assert.equal(variant.geometry.canStep(at.x,at.y,at.x,at.y+1).ok,true,`slot ${slot} blocks the visible rear corridor`);
    assert.equal(variant.geometry.canStep(at.x,at.y,at.x,at.y-1).ok,true,`slot ${slot} blocks the Scene Dock`);
  }

  // The still page is reachable from its far side too. That used to preserve a
  // south-facing camera while Source's fixed north axis built the dock behind
  // it, forcing a manual half-turn on the first uncovered frame. The page owns
  // that hidden recenter now.
  const reverse=haystackRuntime(0);
  const reversePage=reverse.sourceObjective().target;
  const reverseAt={x:reversePage.x,y:reversePage.y-3,facing:2};
  reverse.setPlayerPosition(reverseAt);
  const reverseResult=reverse.inspectFocused(reverseAt.x,reverseAt.y,reverseAt.facing);
  assert.equal(reverseResult.event,'page-found');
  reverse.commitStillPageReveal();
  assert.equal(reverseResult.revealFacing,undefined,'the still sheet must preserve the live bearing');
  assert.ok(reverse.geometry.cellAt(reverseAt.x,reverseAt.y-2)?.sourceLanding);
  const arrival=main.slice(main.indexOf('function enterSourceLandscape('),main.indexOf('function ',main.indexOf('function enterSourceLandscape(')+10));
  assert.doesNotMatch(arrival,/r3dSetFacing|r3dSetPitch/,'the covered swap recentres the camera');

}

// The first-lift fixture starts on the exterior ledge. Height alone must not
// reveal Source: only walking around the opaque return completes the arrival.
{
  const preset=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT,{seed:4417});
  const game=createSourceSpaceRuntime({initialState:preset.state});
  game.setPlayerPosition(preset.position);
  const o=game.state().landscapeOrigin;
  const p=(x,z)=>({x:o.x+x/.5,y:o.y+z/.5,facing:0});
  assert.equal(game.sourceShoreFrame().surface,'ledge');
  assert.equal(game.state().firstLiftCompleted,false);
  let from=preset.position;
  for(const to of [p(9,-388),p(9,-392),p(5,-392)]){
    assert.equal(game.geometry.canStep(from.x,from.y,to.x,to.y).ok,true);
    const result=game.onStep(from,to); assert.equal(result?.relocate,undefined);
    game.setPlayerPosition(to);from=to;
  }
  assert.equal(game.state().firstLiftCompleted,true);
  assert.equal(game.sourceShoreFrame().proper,true);
  assert.equal(game.sourceShoreFrame().visible,true);
  assert.ok(game.geometry.renderPlanFor(from.x,from.y).w<=768,'the void length grew the square render plan');
}

// ── 2. THE WAY UP LOOKS LIKE A WAY UP, AND THE CHUTE DOES NOT ───────────────
//
// A chute is one-way DOWN. Handrails either side of a pitched slatted deck
// advertise an ascent that does not exist, and it was the only thing in the
// arrival tier that read as climbable.
{
  assert.ok(!/mesh: 'tower_loft_rail'/.test(runtime),
    'chutes must not carry handrails: a chute cannot be climbed and must not offer a handhold');
  assert.ok(/-cheek-\$\{side\}/.test(runtime),
    'chutes read as chutes through enclosure, not through rails');
  assert.ok(/mesh: 'plant_grated_steps'/.test(runtime),
    'the lift must carry a visible flight, or the traversal volume is unmarked');
  assert.ok(/-flight-\$\{tread\}/.test(runtime),
    'the lift flight is built per tread so it spans the real tier gap');
}

// ── 3b. THE LEAF NEVER REBUILDS THE FIELD ──────────────────────────────────
//
// The plan is 768x768. Opening a two-cell aperture must retain that plan across
// every animation tick and issue only its small patch; otherwise the authored
// 2.2-second swing turns into a multi-second main-thread freeze.
{
  const game=haystackRuntime(0);
  const target=game.sourceObjective().target;
  const player={x:target.x,y:target.y+3,facing:0};
  game.setPlayerPosition(player);
  game.inspectFocused(player.x,player.y,player.facing);
  game.commitStillPageReveal();
  game.tick(6,player);

  const origin=game.state().landscapeOrigin;
  const door={x:origin.x+SOURCE_LANDING_PORTAL_LOCAL.x,y:origin.y+SOURCE_LANDING_PORTAL_LOCAL.y};
  const observer={x:door.x,y:door.y+5,facing:0};
  game.setPlayerPosition(observer);
  const retained=game.geometry.renderPlanFor(observer.x,observer.y);
  assert.equal(game.inspectFocused(observer.x,observer.y,observer.facing).event,'landing-door-opened');
  const opening=game.geometry.renderPlanFor(observer.x,observer.y);
  assert.strictEqual(opening,retained,'opening the FOH leaf rebuilt the full Source plan');
  assert.equal(opening.patch,null,'the permanent aperture must not mutate while the leaf moves');

  let elapsed=0;
  while(!game.landingPortalFrame().complete&&elapsed<3){
    game.tick(1/60,observer);
    elapsed+=1/60;
    assert.strictEqual(game.geometry.renderPlanFor(observer.x,observer.y),retained,
      'an FOH animation tick rebuilt the full Source plan');
  }
  assert.ok(game.landingPortalFrame().complete,'the FOH leaf did not finish its authored opening move');
  assert.ok(elapsed<2.3,`the FOH leaf took ${elapsed.toFixed(2)} simulated seconds to open`);
  const beyond=game.geometry.cellAt(door.x,door.y-3);
  assert.equal(beyond?.material,MATERIAL.sourceVoid,'the real FOH leaf still opens into a wall');
  assert.doesNotMatch(runtime,/id: 'source-landing-opening-emergency-casing'/,
    'the brick bulkhead prop still stands behind the open FOH leaf');
  assert.ok(!game.sourceVoidFrame().whiteout,'opening the leaf must preserve room exposure');

  const branch=main.slice(main.indexOf("if(result.event==='landing-door-opened')"),main.indexOf("if(result.event==='page-found')"));
  assert.match(branch,/syncSourceRender\(\)/,'the FOH event no longer submits its retained-plan patch');
  assert.doesNotMatch(branch,/syncSourceRender\(\{force:true\}\)/,
    'the FOH input frame still forces a full 512x512 upload');
  assert.doesNotMatch(runtime,/landingPortalElapsed[\s\S]{0,500}lastPlan = null/,
    'the FOH animation still invalidates the full plan per tick');
}

// The leaf completes its opening swing continuously and keeps the room
// returnable through the long first nothingness.
{
  const preset=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LANDING,{seed:4417});
  const game=createSourceSpaceRuntime({initialState:preset.state});
  const o=game.state().landscapeOrigin,door={x:o.x+SOURCE_LANDING_PORTAL_LOCAL.x,y:o.y+SOURCE_LANDING_PORTAL_LOCAL.y};
  const observer={x:door.x,y:door.y+5,facing:0},outside={x:door.x,y:door.y-3,facing:0};
  game.setPlayerPosition(observer);game.inspectFocused(observer.x,observer.y,0);game.tick(2.3,observer);
  game.onStep(observer,outside);game.setPlayerPosition(outside);game.tick(3,outside);
  assert.equal(game.landingPortalFrame().progress,1);
  assert.equal(game.state().landingDoorSealed,false);
  assert.equal(game.geometry.canStep(outside.x,outside.y,observer.x,observer.y).ok,true);
}

// ── 3. EXPLICIT LEGACY SEALS STILL NORMALIZE, BUT WALKING DOES NOT SEAL ──────
{
  let state = freshChunkSurfState();
  assert.equal(state.landingDoorOpen, false, 'the dock arrives with its leaf closed');
  assert.equal(state.landingDoorSealed, false, 'and unsealed');

  state = reduceChunkSurf(state, { type: 'SOURCE_LANDING_DOOR_OPENED' });
  assert.equal(state.landingDoorOpen, true, 'the player opens it');

  state = reduceChunkSurf(state, { type: 'SOURCE_LANDING_DOOR_SEALED' });
  assert.equal(state.landingDoorOpen, false, 'crossing shuts it');
  assert.equal(state.landingDoorSealed, true, 'and seals it');

  const retried = reduceChunkSurf(state, { type: 'SOURCE_LANDING_DOOR_OPENED' });
  assert.equal(retried.landingDoorOpen, false, 'a sealed leaf does not reopen');
  assert.deepEqual(retried, state, 'and the refusal changes nothing else');

  // The seal survives a reload.
  const reloaded = reduceChunkSurf(freshChunkSurfState(), { type: 'SOURCE_LANDING_DOOR_OPENED' });
  assert.equal(reloaded.landingDoorOpen, true, 'a fresh run can still open it');

  // First-shore walking no longer dispatches the irreversible legacy seal.
  const step=runtime.slice(runtime.indexOf('function onStep('),runtime.indexOf('function onStep(')+1900);
  assert.doesNotMatch(step,/SOURCE_LANDING_DOOR_SEALED/);
}

// ── 4. THE PROMPT NAMES THE ACTION, NOT THE UNKNOWN DESTINATION ───────────
{
  assert.equal(sourceFocusActionLabel({ kind: 'source-landing-door', open: false }), 'OPEN DOOR');
  assert.equal(sourceFocusActionLabel({ kind: 'source-landing-door', open: true }), 'OPENING');
  assert.equal(sourceFocusActionLabel({ kind: 'source-landing-door', sealed: true }), 'SEALED');
  assert.equal(sourceFocusActionLabel({ kind: 'source-landing-door', sealed: true, open: true }), 'SEALED',
    'the irreversible seal wins over an old open flag');
}

console.log('source scene dock specs passed');
