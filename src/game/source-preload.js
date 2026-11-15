// SOURCE AHEAD. The worlds in front of you are loaded before you reach them.
//
// Source is a route, not a building: every stretch after the long hall is its
// own renderer with its own models (tools/audits/source-path prints the walk).
// Each one used to load at its own threshold, so walking into the next world
// meant a black card, a held frame or a "could not be prepared" screen while
// packs uploaded. The long hall is a minute or more of walking with nothing
// to load, so that is when the rest of Source loads.
//
// This scheduler knows the order of the walk and nothing else. It runs on its
// own clock from the moment Source opens, one load at a time with a pause
// between, never waiting for and never triggered by anything that happens in
// the hall. Its only input is where you are now: the stages within
// SOURCE_PRELOAD_MINIMUM_AHEAD steps of you load first (every branch of a
// fork counts), then it carries on through everything further along. A stage
// it has loaded stays loaded: the prop store does not evict.
//
// The loads themselves are the scenes' own asset steps (prewarm* exports and
// prepare()), so a scene that arrives early finds the same work in flight and
// shares it, and a scene that arrives late finds it done.

export const SOURCE_PRELOAD_MINIMUM_AHEAD = 3;

// The walk, in stages a player would call a place. Forward edges only: a
// refuge portal back to the field leads somewhere already loaded.
export const SOURCE_PRELOAD_STAGES = Object.freeze([
  Object.freeze({ id: 'hall', label: 'The long hall of paper', next: ['dock-shore'] }),
  Object.freeze({ id: 'dock-shore', label: 'The Scene Dock and the Hanging Shore', next: ['field'] }),
  Object.freeze({ id: 'field', label: 'The field', next: ['contact', 'false-return'] }),
  Object.freeze({ id: 'contact', label: 'Contact: the HUSH encounters', next: [] }),
  Object.freeze({ id: 'false-return', label: 'The false return to Ellery', next: ['earthfall'] }),
  Object.freeze({ id: 'earthfall', label: 'The Source II descent', next: ['source-ii'] }),
  Object.freeze({ id: 'source-ii', label: 'Source II: Wrong Return', next: ['source-iii'] }),
  Object.freeze({ id: 'source-iii', label: 'Source III: The Catch', next: ['drive'] }),
  Object.freeze({ id: 'drive', label: 'The Source drive', next: ['outskirts'] }),
  Object.freeze({ id: 'outskirts', label: 'The still ground and the repeating scene', next: ['pub', 'horizon'] }),
  Object.freeze({ id: 'pub', label: 'The Source pub', next: ['horizon'] }),
  Object.freeze({ id: 'horizon', label: 'Horizon', next: ['bells', 'station'] }),
  Object.freeze({ id: 'bells', label: 'The bell passage and the tower door field', next: [] }),
  Object.freeze({ id: 'station', label: "The station's doors", next: ['chapel'] }),
  Object.freeze({ id: 'chapel', label: 'Through the chapel door', next: [] }),
]);

// Stages in loading order from `current`: breadth first, so every branch at
// one step lands before anything two steps out. `current` itself is depth 0
// (a resumed save can start in a world that has not loaded yet).
export function sourcePreloadOrder(current, stages = SOURCE_PRELOAD_STAGES) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  if (!byId.has(current)) return [];
  const order = [], seen = new Set([current]);
  let frontier = [current];
  for (let depth = 0; frontier.length; depth += 1) {
    const next = [];
    for (const id of frontier) {
      order.push({ id, depth });
      for (const after of byId.get(id).next || []) if (byId.has(after) && !seen.has(after)) { seen.add(after); next.push(after); }
    }
    frontier = next;
  }
  return order;
}

const settle = (value) => (value && typeof value.then === 'function' ? value : Promise.resolve(value));

// tasks: { [stageId]: [{ id, label, run }] }. A task id may appear under more
// than one stage (two worlds that share a pack); it runs once. run() resolves
// true (or nothing) when done, false when it cannot finish yet (a shader still
// compiling, a renderer not up): it is asked again after `pollMs`. A throw is
// a failed attempt, retried after each of `retryMs`, then left failed: the
// scene's own start still tries, and still shows its own error.
export function createSourcePreloader({
  stages = SOURCE_PRELOAD_STAGES,
  tasks = {},
  minimumAhead = SOURCE_PRELOAD_MINIMUM_AHEAD,
  gapMs = 120,
  pollMs = 250,
  maxPolls = 240,
  retryMs = [4000, 20000],
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  onEvent = null,
} = {}) {
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const records = new Map();
  for (const stage of stages) for (const task of tasks[stage.id] || []) {
    if (!records.has(task.id)) records.set(task.id, { task, state: 'pending', attempts: 0, polls: 0, notBefore: 0, ms: null, error: null, startedAt: null });
  }
  let current = null, stopped = false, pumping = null, wakeAt = null, generation = 0;
  const emit = (event) => { try { onEvent?.(event); } catch (_) { /* diagnostics never stop loading */ } };
  const stageTasks = (id) => (tasks[id] || []).map((task) => records.get(task.id));
  const stageState = (id) => {
    const list = stageTasks(id);
    if (!list.length || list.every((r) => r.state === 'ready')) return 'ready';
    if (list.some((r) => r.state === 'loading')) return 'loading';
    if (list.some((r) => r.state === 'failed')) return 'failed';
    return 'pending';
  };

  function pick() {
    if (current === null) return { next: null, soonest: null };
    let soonest = null;
    const at = now();
    for (const { id } of sourcePreloadOrder(current, stages)) {
      for (const record of stageTasks(id)) {
        if (record.state === 'ready' || record.state === 'failed' || record.state === 'loading') continue;
        if (record.notBefore > at) { soonest = soonest === null ? record.notBefore : Math.min(soonest, record.notBefore); continue; }
        return { next: record, soonest };
      }
    }
    return { next: null, soonest };
  }

  async function run(record) {
    record.state = 'loading'; record.startedAt = now(); record.attempts += 1;
    emit({ type: 'start', id: record.task.id, stage: current });
    let result;
    try { result = await settle(record.task.run()); }
    catch (error) {
      record.error = String(error?.message || error);
      const delay = retryMs[record.attempts - 1];
      if (delay === undefined) { record.state = 'failed'; emit({ type: 'failed', id: record.task.id, error: record.error }); }
      else { record.state = 'pending'; record.notBefore = now() + delay; emit({ type: 'retry', id: record.task.id, error: record.error, inMs: delay }); }
      return;
    }
    if (result === false) {
      record.attempts -= 1; record.polls += 1;
      if (record.polls >= maxPolls) { record.state = 'failed'; record.error = 'never became ready'; emit({ type: 'failed', id: record.task.id, error: record.error }); return; }
      record.state = 'pending'; record.notBefore = now() + pollMs;
      return;
    }
    record.state = 'ready'; record.error = null; record.ms = now() - record.startedAt;
    emit({ type: 'ready', id: record.task.id, ms: record.ms, ahead: ahead() });
  }

  // One loop at a time. A loop parked until a retry is due gives way to a new
  // one when you move, so a far retry never holds up the world you walked to.
  async function pump() {
    if (stopped || (pumping !== null && wakeAt === null)) return;
    const mine = ++generation;
    pumping = mine; wakeAt = null;
    try {
      while (!stopped && mine === generation) {
        const { next, soonest } = pick();
        if (!next) {
          if (soonest !== null && current !== null) { wakeAt = soonest; await wait(Math.max(0, soonest - now())); if (mine === generation) wakeAt = null; continue; }
          break;
        }
        await run(next);
        await wait(gapMs);
      }
    } finally { if (pumping === mine) pumping = null; }
  }

  // How many steps in front of `current` are complete, counting each step
  // only when every world at that distance is loaded.
  function ahead() {
    if (current === null) return 0;
    const order = sourcePreloadOrder(current, stages);
    const deepest = order.reduce((max, entry) => Math.max(max, entry.depth), 0);
    let count = 0;
    for (let depth = 1; depth <= deepest; depth += 1) {
      if (!order.filter((entry) => entry.depth === depth).every((entry) => stageState(entry.id) === 'ready')) break;
      count = depth;
    }
    return count;
  }

  return {
    // Where you are now. An unknown or null stage pauses loading (you have left
    // Source); anything already loaded stays loaded.
    setStage(id) {
      const next = stageById.has(id) ? id : null;
      if (next === current) return;
      current = next;
      emit({ type: 'stage', stage: current });
      if (current !== null) { void pump(); }
    },
    stage: () => current,
    ahead,
    stop() { stopped = true; generation += 1; },
    // Resolves once every stage reachable from here is loaded or has failed.
    async settled() {
      while (!stopped && current !== null && (pumping !== null || pick().next || pick().soonest !== null)) await wait(gapMs);
      return this.status();
    },
    status() {
      const order = current === null ? [] : sourcePreloadOrder(current, stages);
      const depthOf = new Map(order.map((entry) => [entry.id, entry.depth]));
      const reachable = order.length ? Math.max(...order.map((entry) => entry.depth)) : 0;
      const count = ahead();
      return {
        stage: current,
        ahead: count,
        minimumAhead,
        // The end of the walk is closer than the minimum once you are near it.
        bufferReady: current !== null && count >= Math.min(minimumAhead, reachable),
        loading: [...records.values()].filter((r) => r.state === 'loading').map((r) => r.task.id),
        waitingUntil: wakeAt,
        stages: stages.map((stage) => ({
          id: stage.id, label: stage.label, depth: depthOf.has(stage.id) ? depthOf.get(stage.id) : null, state: stageState(stage.id),
          tasks: stageTasks(stage.id).map((r) => ({ id: r.task.id, label: r.task.label || r.task.id, state: r.state, ms: r.ms, attempts: r.attempts, error: r.error })),
        })),
      };
    },
  };
}
