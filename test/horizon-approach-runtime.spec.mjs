import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChunkSurfGodPreset, buildPreTapeGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { SOURCE_HORIZON, SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

function atHorizon({ onState = () => {} } = {}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state, onState });
  runtime.setPlayerPosition(built.position);
  assert.equal(runtime.completeNormalExit().handled, true);
  assert.equal(runtime.state().profile.marbleEyes, null);
  return runtime;
}

test('truth without an open offer does not invent a route decision', () => {
  let writes = 0;
  const runtime = atHorizon({ onState: () => { writes++; } });
  const before = writes;
  assert.equal(runtime.recognizeHorizonApproach().eligible, false);
  assert.equal(runtime.decideHorizonApproach(true).handled, false);
  assert.equal(runtime.state().finale.bust.recognized, false);
  assert.equal(runtime.state().finale.bust.decision, null);
  assert.equal(runtime.state().finale.route, null);
  assert.equal(writes, before);
});

test('an earned offer authorizes the tower using the established reducer', () => {
  const runtime = atHorizon();
  assert.equal(runtime.chooseHorizonExit('tower').handled, false);
  assert.equal(runtime.recognizeHorizonApproach({ eligible: true }).recognized, true);
  assert.equal(runtime.decideHorizonApproach(true).accepted, true);
  assert.equal(runtime.state().profile.marbleEyes, null);
  assert.equal(runtime.chooseHorizonExit('chapel').handled, false);
  assert.equal(runtime.chooseHorizonExit('tower').entered, 'bells');
  assert.equal(runtime.state().horizon.exit, 'tower');
  assert.equal(runtime.state().finale.route, 'tower');
});

test('repeated recognition does not write another save event', () => {
  let writes = 0;
  const runtime = atHorizon({ onState: () => { writes++; } });
  runtime.recognizeHorizonApproach({ eligible: true });
  const after = writes;
  assert.equal(runtime.recognizeHorizonApproach({ eligible: true }).recognized, true);
  assert.equal(writes, after);
});

test('walking onward can decline without opening the tower offer', () => {
  const runtime = atHorizon();
  assert.equal(runtime.decideHorizonApproach(false).decision, 'declined');
  assert.equal(runtime.recognizeHorizonApproach({ eligible: true }).handled, false);
  assert.equal(runtime.decideHorizonApproach(true).handled, false);
  assert.equal(runtime.chooseHorizonExit('tower').handled, false);
  assert.equal(runtime.chooseHorizonExit('chapel').entered, 'chapel-outskirts');
});

test('a saved decision survives interruption without restarting the offer', () => {
  const runtime = atHorizon();
  runtime.recognizeHorizonApproach({ eligible: true });
  runtime.decideHorizonApproach(true);
  const saved = JSON.parse(JSON.stringify(runtime.state()));
  const resumed = createSourceSpaceRuntime({ initialState: saved });
  assert.equal(resumed.recognizeHorizonApproach({ eligible: false }).handled, false);
  assert.equal(resumed.decideHorizonApproach(false).handled, false);
  assert.equal(resumed.state().finale.bust.decision, 'accepted');
  assert.equal(resumed.chooseHorizonExit('tower').entered, 'bells');
});

test('an offer cannot change another part of Source', () => {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  assert.equal(runtime.recognizeHorizonApproach({ eligible: true }).handled, false);
  assert.equal(runtime.decideHorizonApproach(false).handled, false);
});

test('the existing street stays available until its far edge is reached', () => {
  const runtime=atHorizon(),o=runtime.state().landscapeOrigin;
  for(const distance of [800,50,.01]){
    runtime.setPlayerPosition({x:o.x,y:o.y+SOURCE_HORIZON.from+distance,facing:0});
    assert.equal(runtime.horizonApproachDue(),false);
    assert.equal(runtime.horizonFrame().preTape,true);
  }
  assert.equal(runtime.state().finale.bust.decision,null);
  runtime.setPlayerPosition({x:o.x,y:o.y+SOURCE_HORIZON.from,facing:0});
  assert.equal(runtime.horizonApproachDue(),true);
  assert.equal(runtime.horizonFrame().preTape,false);
  assert.equal(runtime.state().finale.bust.decision,null);
});

test('walking across the far edge needs no dial, eye or interaction action', () => {
  const runtime=atHorizon(),o=runtime.state().landscapeOrigin;
  runtime.setPlayerPosition({x:o.x,y:o.y+SOURCE_HORIZON.from+.5,facing:0});
  assert.equal(runtime.horizonApproachDue(),false);
  runtime.onStep({x:o.x,y:o.y+SOURCE_HORIZON.from+.5},{x:o.x,y:o.y+SOURCE_HORIZON.from-.5,facing:0});
  assert.equal(runtime.horizonApproachDue(),true);
  assert.equal(runtime.state().phase,'horizon');
  assert.equal(runtime.state().finale.route,null);
  assert.equal(runtime.state().profile.marbleEyes,null);
});

test('old image decay cannot erase the preserved street or its sound and body cues', () => {
  const built=buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength+500,{seed:4417});
  const old={...built.state,horizon:{...built.state.horizon,unravelling:{active:true,amount:.96,
    furthestMetres:256,elapsedSeconds:500,markers:['street-unravels','street-erased']}}};
  const clean=createSourceSpaceRuntime({initialState:built.state}),legacy=createSourceSpaceRuntime({initialState:old});
  clean.setPlayerPosition(built.position);legacy.setPlayerPosition(built.position);
  const history=JSON.parse(JSON.stringify(legacy.state().horizon));
  const options={time:0,reducedMotion:true};
  const pieces=runtime=>runtime.propInstances(built.position.x,built.position.y,options)
    .map(piece=>({id:piece.id,mesh:piece.mesh,matrix:piece.matrix?Array.from(piece.matrix):null}));
  assert.deepEqual(pieces(legacy),pieces(clean));
  assert.deepEqual(legacy.outskirtsBodyFrame(options),clean.outskirtsBodyFrame(options));
  assert.deepEqual(legacy.outskirtsStreetFrame(options),clean.outskirtsStreetFrame(options));
  assert.deepEqual(legacy.state().horizon,history,'saved history is preserved independently of presentation');
  assert.equal(legacy.state().finale.bust.decision,null);
});
