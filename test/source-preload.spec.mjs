// The Source preload scheduler (src/game/source-preload.js): the worlds in
// front of you load first, every branch counts, and loading runs on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSourcePreloader, sourcePreloadOrder, SOURCE_PRELOAD_STAGES, SOURCE_PRELOAD_MINIMUM_AHEAD } from '../src/game/source-preload.js';

// A clock that only moves when the scheduler waits, so nothing here sleeps.
function clock() {
  let t = 0;
  return { now: () => t, wait: (ms) => { t += Math.max(0, ms); return new Promise((resolve) => setImmediate(resolve)); } };
}
const oneTaskEach = (log, extra = {}) => Object.fromEntries(SOURCE_PRELOAD_STAGES.map((stage) => [stage.id,
  [{ id: `load:${stage.id}`, run: async () => { log.push(stage.id); return true; } }, ...(extra[stage.id] || [])]]));

test('the walk is ordered breadth first from where you stand, every fork counted', () => {
  const order = sourcePreloadOrder('hall');
  const depth = Object.fromEntries(order.map((entry) => [entry.id, entry.depth]));
  assert.deepEqual(order.slice(0, 5).map((entry) => entry.id), ['hall', 'dock-shore', 'field', 'contact', 'false-return']);
  assert.equal(depth['dock-shore'], 1); assert.equal(depth.field, 2); assert.equal(depth.contact, 3); assert.equal(depth['false-return'], 3);
  assert.equal(depth.horizon, 9, 'the pub is a detour, not a step on the way to Horizon');
  assert.equal(order.length, SOURCE_PRELOAD_STAGES.length, 'everything after the hall is reachable from it');
  assert.deepEqual(sourcePreloadOrder('drive').map((entry) => entry.id).slice(0, 4), ['drive', 'outskirts', 'pub', 'horizon']);
  assert.deepEqual(sourcePreloadOrder('nowhere'), []);
});

test('from the hall the three steps ahead load first, then everything further along', async () => {
  const log = [], c = clock();
  const loader = createSourcePreloader({ tasks: oneTaskEach(log), ...c });
  loader.setStage('hall');
  const status = await loader.settled();
  assert.deepEqual(log.slice(0, 5), ['hall', 'dock-shore', 'field', 'contact', 'false-return']);
  assert.equal(log.length, SOURCE_PRELOAD_STAGES.length, 'all of Source loads from the hall, not just the minimum');
  assert.ok(status.ahead >= SOURCE_PRELOAD_MINIMUM_AHEAD && status.bufferReady);
  assert.ok(status.stages.every((stage) => stage.state === 'ready'));
});

test('the buffer counts a step only when every world at that distance is loaded', async () => {
  const c = clock(); let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const tasks = oneTaskEach([]);
  tasks['false-return'] = [{ id: 'slow', run: () => blocked }];
  const loader = createSourcePreloader({ tasks, ...c });
  loader.setStage('hall');
  while (!loader.status().loading.includes('slow')) await c.wait(0);
  assert.equal(loader.ahead(), 2, 'contact is loaded but its sibling is not, so step three is not');
  assert.equal(loader.status().bufferReady, false);
  release(true);
  await loader.settled();
  assert.ok(loader.ahead() >= 3);
});

test('a pack two worlds share loads once', async () => {
  let runs = 0; const c = clock();
  const shared = { id: 'pack:doors', run: async () => { runs += 1; return true; } };
  const loader = createSourcePreloader({ tasks: { 'false-return': [shared], earthfall: [shared], pub: [shared] }, ...c });
  loader.setStage('hall');
  await loader.settled();
  assert.equal(runs, 1);
});

test('moving on re-orders what loads next around where you are', async () => {
  const log = [], c = clock();
  let move = null;
  const tasks = oneTaskEach(log);
  // Arrive at the drive while the field is loading.
  tasks.field = [{ id: 'load:field', run: async () => { log.push('field'); move?.(); return true; } }];
  const loader = createSourcePreloader({ tasks, ...c });
  move = () => { loader.setStage('drive'); move = null; };
  loader.setStage('hall');
  await loader.settled();
  const afterMove = log.slice(log.indexOf('field') + 1);
  assert.deepEqual(afterMove.slice(0, 4), ['drive', 'outskirts', 'pub', 'horizon']);
  assert.ok(!afterMove.includes('contact'), 'worlds behind you are no longer queued');
});

test('a load that cannot finish yet is asked again; one that throws is retried, then left failed', async () => {
  const c = clock(); let polls = 0, throws = 0;
  const tasks = {
    station: [{ id: 'program', run: async () => (++polls >= 3) }],
    bells: [{ id: 'broken', run: async () => { throws += 1; throw new Error('no pack'); } }],
  };
  const events = [];
  const loader = createSourcePreloader({ tasks, retryMs: [10, 10], ...c, onEvent: (event) => events.push(event.type) });
  loader.setStage('horizon');
  const status = await loader.settled();
  const stage = (id) => status.stages.find((s) => s.id === id);
  assert.equal(polls, 3); assert.equal(stage('station').state, 'ready');
  assert.equal(throws, 3, 'one attempt and two retries'); assert.equal(stage('bells').state, 'failed');
  assert.match(stage('bells').tasks[0].error, /no pack/);
  assert.equal(status.ahead, 0, 'a failed world is not counted as loaded');
  assert.ok(events.includes('retry') && events.includes('failed'));
});

test('leaving Source pauses loading; nothing needs an event to make it run', async () => {
  const log = [], c = clock();
  const loader = createSourcePreloader({ tasks: oneTaskEach(log), ...c });
  loader.setStage(null);
  await c.wait(1000);
  assert.deepEqual(log, [], 'no stage, no loading');
  loader.setStage('outskirts');
  await loader.settled();
  assert.deepEqual(log, ['outskirts', 'pub', 'horizon', 'bells', 'station', 'chapel']);
});

test('the stages follow the source path the audit describes', async () => {
  // A new stretch of Source has to be placed in this walk too.
  const audit = await readFile('tools/audits/source-path/audit.mjs', 'utf8');
  for (const scene of ['source-false-return', 'source-earthfall', 'source-continuation', 'source-drive', 'source-pub', 'horizon-approach'])
    assert.ok(audit.includes(scene.replace('source-', '')) || audit.includes(scene), `${scene} is on the audited path`);
  const ids = SOURCE_PRELOAD_STAGES.map((stage) => stage.id);
  for (const stage of SOURCE_PRELOAD_STAGES) for (const next of stage.next) assert.ok(ids.includes(next), `${stage.id} → ${next}`);
});
