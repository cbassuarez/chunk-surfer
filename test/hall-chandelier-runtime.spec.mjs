import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import { createHallChandelierRuntime } from '../src/game/hall-chandelier-runtime.js';

const quick = { firstQuietSeconds: [1, 1], repeatQuietSeconds: [2, 2] };
test('the real flag/save reload preserves consumption and cannot restore an emitted frame',()=>{
  const result=spawnSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    const data=new Map();
    globalThis.localStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
    const {saveLoad,getSave}=await import('./src/game/save.js');
    const {flagSet,flagGet}=await import('./src/game/flags.js');
    const {createHallChandelierRuntime}=await import('./src/game/hall-chandelier-runtime.js');
    saveLoad();flagSet('hall.chandelier.flicker.count',1);saveLoad();
    assert.equal(flagGet('hall.chandelier.flicker.count'),1);
    const runtime=createHallChandelierRuntime({readContext:()=>({runId:getSave().run?.id,consumedCount:flagGet('hall.chandelier.flicker.count'),eligible:true}),budgetReady:()=>true});
    const frame=runtime.guard();assert.equal(frame.consumedCount,1);assert.equal(frame.power,0);assert.equal(frame.active,false);
    assert.ok(frame.quietSeconds>=240&&frame.quietSeconds<=480);
  `],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
test('a failed real storage write cannot authorize light through an in-memory flag',()=>{
  const result=spawnSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    globalThis.localStorage={getItem:()=>null,setItem:()=>{throw new Error('controlled blocked storage');},removeItem:()=>{}};
    const {saveLoad,getSave,savedFlagMatches}=await import('./src/game/save.js');
    const {flagSet,flagGet}=await import('./src/game/flags.js');
    const {createHallChandelierRuntime}=await import('./src/game/hall-chandelier-runtime.js');
    saveLoad();let reservations=0;
    const flag='hall.chandelier.flicker.count';
    const runtime=createHallChandelierRuntime({
      readContext:()=>({runId:getSave().run?.id,consumedCount:Number(flagGet(flag))||0,eligible:true}),
      budgetReady:()=>true,reserveBudget:()=>{reservations++;return true;},
      persistConsumed:count=>{flagSet(flag,count);return savedFlagMatches(flag,count);},
    });
    runtime.configureReview({firstQuietSeconds:[1,1],repeatQuietSeconds:[2,2]});
    for(let i=0;i<12;i++)runtime.tick(.1);
    assert.equal(reservations,1,'the shared reservation remains conservatively spent');
    assert.equal(flagGet(flag),1,'memory alone can contain the new count after storage failed');
    assert.equal(savedFlagMatches(flag,1),false);
    assert.equal(runtime.view().power,0);
    assert.equal(runtime.view().active,false);
    assert.equal(runtime.view().consumedCount,0,'the episode never received persistence approval');
  `],{cwd:new URL('..',import.meta.url),encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr||result.stdout);
});
function fixture() {
  const context = { runId: 'runtime-test', consumedCount: 0, eligible: true };
  const calls = [], budget = { ready: true, reserve: true, save: true };
  let runtime;
  runtime = createHallChandelierRuntime({ readContext: () => context,
    budgetReady: () => { calls.push('ready'); return budget.ready; },
    reserveBudget: () => { calls.push(['reserve', runtime.view().power]); return budget.reserve; },
    persistConsumed: count => { calls.push(['save', count, runtime.view().power]);
      if (budget.save === true) context.consumedCount = count;
      return budget.save;
    },
  });
  const step = seconds => {
    let frame;
    for (let left = seconds; left > 1e-9; left -= .1) frame = runtime.tick(Math.min(.1, left));
    return frame;
  };
  return { runtime, context, calls, budget, step };
}

test('production quiet is retained by default and view is read-only', () => {
  let reads = 0;
  const runtime = createHallChandelierRuntime({ readContext: () => { reads++; return { eligible: true }; } });
  assert.equal(runtime.view().power, 0);
  assert.equal(reads, 0, 'reading a frame cannot read gameplay state or cause onset');
  assert.equal(Object.isFrozen(runtime.view()), true);
  const frame = runtime.tick(.1);
  assert.ok(frame.quietSeconds >= 120 && frame.quietSeconds <= 240);
  assert.equal(frame.active, false);
  assert.equal(frame.consumedCount, 0);
});

test('real controller reserves and saves before light, independently of ordinary STAB pool', () => {
  const { runtime, context, calls, step } = fixture();
  context.pool = 0;
  runtime.configureReview(quick);
  step(1.2);
  assert.deepEqual(calls.filter(Array.isArray), [['reserve', 0], ['save', 1, 0]]);
  assert.equal(context.consumedCount, 1);
  assert.ok(runtime.view().power > 0);
  assert.equal(runtime.view().active, true);
  step(.2);
  assert.equal(calls.filter(value => Array.isArray(value) && value[0] === 'save').length, 1);
});

test('render guard never starts a due beat or touches the budget', () => {
  const { runtime, calls, budget, step } = fixture();
  runtime.configureReview(quick);
  budget.ready = false;
  step(2);
  assert.equal(runtime.view().eligibleSeconds, 1);
  const count = calls.length;
  budget.ready = true;
  for (let index = 0; index < 20; index++) runtime.guard();
  assert.equal(calls.length, count);
  assert.equal(runtime.view().power, 0);
  assert.equal(runtime.view().consumedCount, 0);
  runtime.tick(.1);
  assert.equal(runtime.view().consumedCount, 1, 'only a gameplay tick can commit');
});

test('guard cancels active light under all supplied protections even without gameplay ticks', () => {
  for (const protection of [{ eligible: false }, { paused: true }, { hidden: true }, { focused: false },
    { recording: true }, { listening: true }, { playback: true }, { stalled: true }, { slating: true },
    { blocked: true }, { battle: true }, { finale: true }, { dialogue: true }, { suppressActors: true },
    { reduceDread: true }, { effectsMode: 'reduced' }, { effectsMode: 'off' },
    { applausePriority: true }, { threatNear: .26 }]) {
    const { runtime, context, calls, step } = fixture();
    runtime.configureReview(quick); step(1.2);
    assert.ok(runtime.view().power > 0);
    const count = calls.length;
    Object.assign(context, protection);
    const frame = runtime.guard();
    assert.equal(frame.active, false, JSON.stringify(protection));
    assert.equal(frame.power, 0);
    assert.equal(frame.consumedCount, 1);
    assert.equal(calls.length, count, 'guard cannot consult or spend the budget');
    for (const key of Object.keys(protection)) delete context[key];
    context.eligible = true;
    step(.5);
    assert.equal(runtime.view().power, 0, 'return never resumes the interrupted glow');
  }
});

test('a due protected opportunity is discarded and cannot flash on return', () => {
  const { runtime, context, budget, step } = fixture();
  runtime.configureReview(quick); budget.ready = false; step(2);
  context.recording = true; runtime.guard();
  assert.equal(runtime.view().eligibleSeconds, 0);
  context.recording = false; budget.ready = true; runtime.guard();
  step(.5);
  assert.equal(runtime.view().consumedCount, 0);
  assert.equal(runtime.view().power, 0);
  step(.6);
  assert.equal(runtime.view().consumedCount, 1);
});

test('run changes and reload consumption initialize dark with the correct next quiet', () => {
  const { runtime, context, step } = fixture();
  runtime.configureReview(quick); step(1.2);
  context.runId = 'other-run'; context.consumedCount = 2;
  const frame = runtime.guard();
  assert.equal(frame.active, false); assert.equal(frame.power, 0);
  assert.equal(frame.consumedCount, 2);
  step(10);
  assert.equal(runtime.view().active, false);
  context.runId = 'reloaded-run'; context.consumedCount = 1;
  runtime.guard();
  assert.equal(runtime.view().power, 0);
  assert.equal(runtime.view().quietSeconds, 2);
  step(1);
  assert.equal(runtime.view().consumedCount, 1);
});

test('review reconfiguration retains durable consumption and restores production durations', () => {
  const { runtime, context, step } = fixture();
  runtime.configureReview(quick); step(1.2);
  const reviewed = runtime.configureReview(quick);
  assert.equal(reviewed.consumedCount, 1); assert.equal(reviewed.power, 0);
  assert.equal(context.consumedCount, 1);
  const production = runtime.configureReview(null);
  assert.equal(production.consumedCount, 1); assert.equal(production.power, 0);
  assert.ok(production.quietSeconds >= 240 && production.quietSeconds <= 480);
});

test('budget races and failed persistence remain dark and consume no episode', () => {
  for (const failure of ['reserve', 'save']) {
    const { runtime, budget, context, step, calls } = fixture();
    runtime.configureReview(quick); budget[failure] = false;
    step(1.1);
    assert.equal(runtime.view().power, 0); assert.equal(runtime.view().active, false);
    assert.equal(runtime.view().consumedCount, 0); assert.equal(context.consumedCount, 0);
    if (failure === 'reserve') assert.equal(calls.some(value => Array.isArray(value) && value[0] === 'save'), false);
  }
});
