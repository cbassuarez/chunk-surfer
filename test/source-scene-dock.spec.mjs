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
  assert.ok(/function physicalHallCell\(x, y\) \{\n    if \(!hallVisibleInPhase\(\)\) return null;/.test(runtime),
    'the BODY keeps the strict gate — there is no walking back up the corridor');
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
  assert.equal(game.geometry.cellAt(player.x,player.y+2),null,'the fake rear corridor remains physically open');
  assert.ok(game.geometry.renderCellAt(player.x,player.y+2),'the fake rear corridor disappeared visually');
  assert.equal(game.geometry.canStep(player.x,player.y,player.x,player.y+1).ok,false,
    'the player can walk back into the painted corridor');
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
    assert.ok(variant.geometry.cellAt(at.x,at.y)?.sourceLanding,`slot ${slot} leaves the body outside the dock`);
    assert.equal(variant.geometry.canStep(at.x,at.y,at.x,at.y+1).ok,false,`slot ${slot} leaves the rear corridor open`);
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
  assert.equal(reverseResult.revealFacing,0,'the opaque sheet does not hand the camera back toward the Scene Dock');
  assert.ok(reverse.geometry.cellAt(reverseAt.x,reverseAt.y-2)?.sourceLanding,
    'the recentered forward view does not contain the Scene Dock');
  assert.match(main,/enterSourceLandscape\(result\.revealFacing\)/,
    'the live page event ignores the runtime reveal bearing');
  assert.match(main,/R3\.r3dSetFacing\(facing\);[\s\S]*?chunkSurfRuntime\.setPlayerPosition\(\{x:px,y:py,facing\}\)/,
    'the covered swap does not synchronize camera and Source body facing');
}

// FIRST LIFT RETAINS THE SAME PLAN TOO. Its topology change is the narrow fake
// corridor at the player's back; the atlas and compositor already switch on
// this frame, so a 768x768 CPU rebuild/GPU upload here is not an acceptable
// third transition workload.
{
  const preset=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.FIRST_LIFT,{seed:4417});
  const game=createSourceSpaceRuntime({initialState:preset.state});
  game.setPlayerPosition(preset.position);
  const retained=game.geometry.renderPlanFor(preset.position.x,preset.position.y);
  retained.patch=null;
  const before=retained.rgba.slice();

  game.onStep({x:0,y:-572,facing:0},{x:0,y:-573,facing:0});
  assert.equal(game.state().firstLiftCompleted,true,'the FIRST LIFT fixture did not cross the tier boundary');
  const crossed=game.geometry.renderPlanFor(0,-573);
  assert.strictEqual(crossed,retained,'FIRST LIFT rebuilt the full Source plan');
  assert.ok(crossed.patch,'FIRST LIFT did not submit its corridor mutation');
  assert.ok(crossed.patch.w<=16&&crossed.patch.h===crossed.h,
    `FIRST LIFT patch escaped the corridor (${crossed.patch.w}x${crossed.patch.h})`);
  assert.notDeepEqual(crossed.rgba,before,'the retained patch did not remove the painted forward corridor');
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
  game.tick(6,player);

  const origin=game.state().landscapeOrigin;
  const door={x:origin.x+SOURCE_LANDING_PORTAL_LOCAL.x,y:origin.y+SOURCE_LANDING_PORTAL_LOCAL.y};
  const observer={x:door.x,y:door.y+5,facing:0};
  game.setPlayerPosition(observer);
  const retained=game.geometry.renderPlanFor(observer.x,observer.y);
  assert.equal(game.inspectFocused(observer.x,observer.y,observer.facing).event,'landing-door-opened');
  const opening=game.geometry.renderPlanFor(observer.x,observer.y);
  assert.strictEqual(opening,retained,'opening the FOH leaf rebuilt the full Source plan');
  assert.ok(opening.patch&&opening.patch.w<=13&&opening.patch.h<=13,'the FOH patch escaped its aperture');

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
  assert.ok(game.sourceVoidFrame().whiteout>.25,
    'opening the real leaf no longer admits a blinding white cinematic');

  const branch=main.slice(main.indexOf("if(result.event==='landing-door-opened')"),main.indexOf("if(result.event==='page-found')"));
  assert.match(branch,/syncSourceRender\(\)/,'the FOH event no longer submits its retained-plan patch');
  assert.doesNotMatch(branch,/syncSourceRender\(\{force:true\}\)/,
    'the FOH input frame still forces a full 512x512 upload');
  assert.doesNotMatch(runtime,/landingPortalElapsed[\s\S]{0,500}lastPlan = null/,
    'the FOH animation still invalidates the full plan per tick');
}

// The body seals collision immediately, but the visible object completes a real
// closing swing instead of teleporting from open to shut.
{
  const game=haystackRuntime(0);
  const target=game.sourceObjective().target;
  const player={x:target.x,y:target.y+3,facing:0};
  game.setPlayerPosition(player);
  game.inspectFocused(player.x,player.y,player.facing);
  game.tick(6,player);
  const origin=game.state().landscapeOrigin;
  const door={x:origin.x+SOURCE_LANDING_PORTAL_LOCAL.x,y:origin.y+SOURCE_LANDING_PORTAL_LOCAL.y};
  const observer={x:door.x,y:door.y+5,facing:0};
  game.setPlayerPosition(observer);
  game.inspectFocused(observer.x,observer.y,observer.facing);
  game.tick(2.3,observer);
  game.setPlayerPosition({x:door.x,y:door.y-3,facing:0});
  assert.equal(game.landingPortalFrame().closing,true,'the sealed leaf snapped shut');
  assert.equal(game.landingPortalFrame().progress,1,'the closing swing does not begin from open');
  game.tick(1,{px:door.x,py:door.y-3,facing:0});
  assert.ok(game.landingPortalFrame().progress>0&&game.landingPortalFrame().progress<1,
    'the closing swing has no physical duration');
  game.tick(2,{px:door.x,py:door.y-3,facing:0});
  assert.equal(game.landingPortalFrame().progress,0,'the real leaf never finishes closing');
}

// ── 3. THE LEAF SHUTS BEHIND YOU AND DOES NOT REOPEN ────────────────────────
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

  // The runtime seals on the body crossing the threshold, not on the prompt.
  assert.ok(/SOURCE_LANDING_DOOR_SEALED/.test(runtime),
    'the runtime must dispatch the seal itself');
  assert.ok(/candidate\.y - o\.y < SOURCE_LANDING_PORTAL_LOCAL\.y - 1/.test(runtime),
    'the seal triggers on the body reaching the Source side of the leaf');
}

// ── 4. THE PROMPT WITHHOLDS THE DESTINATION ────────────────────────────────
{
  assert.equal(sourceFocusActionLabel({ kind: 'source-landing-door', open: false }), '???');
  assert.equal(sourceFocusActionLabel({ kind: 'source-landing-door', open: true }), '???');
  assert.equal(sourceFocusActionLabel({ kind: 'source-landing-door', sealed: true }), 'SEALED');
}

console.log('source scene dock specs passed');
