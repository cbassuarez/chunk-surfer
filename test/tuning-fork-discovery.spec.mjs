// The inscription is 444; the steel sounds 440. Pin every physical description
// without correcting the player's later, deliberately contradictory speech.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TALISMAN } from '../src/data/conservatory-script.js';
import { bagInspectionDialogue } from '../src/game/bag-items.js';
import { runtimeTree } from '../src/narrative/runtime-content.js';
import { FORK_TONE, forkToneAt, createForkToneRuntime } from '../src/audio/fork-tone.js';
import { SEAM } from '../src/game/practice-seams.js';
import { tuningForkCancellationThoughts } from '../src/game/tuning-fork-discovery.js';
import * as scenes from '../src/game/scenes.js';
import {
  makeThoughtScene, thoughtHad, markThought, resetThoughts,
  loadThoughtState, saveThoughtState,
} from '../src/game/thoughts.js';
import {
  TUNING_FORK_EVIDENCE, TUNING_FORK_ENGRAVING, TUNING_FORK_ENGRAVING_LINE,
  TUNING_FORK_BAG_LINE, TUNING_FORK_DETAIL,
} from '../src/data/tuning-fork-discovery.js';

const canonical = JSON.parse(readFileSync(new URL('../content/narrative/conservatory.talisman.story.json', import.meta.url), 'utf8'));
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const readText = canonical.nodes.read.lines.filter(line => line.who === 'direction').map(line => line.text).join(' ');
const engravingValues = text => [...String(text).matchAll(/A=(\d+)/g)].map(match => Number(match[1]));

test('first sight, canonical reading and the carried object state the same physical inscription', () => {
  assert.ok(Object.isFrozen(TUNING_FORK_EVIDENCE));
  assert.ok(Object.isFrozen(TUNING_FORK_DETAIL));
  assert.deepEqual(TUNING_FORK_EVIDENCE, { soundedHz: SEAM.referenceHz, engravedHz: SEAM.pressureHz });
  assert.equal(TUNING_FORK_EVIDENCE.soundedHz, FORK_TONE.hz);
  assert.equal(TUNING_FORK_EVIDENCE.engravedHz, FORK_TONE.seamHz);
  assert.notEqual(TUNING_FORK_EVIDENCE.soundedHz, TUNING_FORK_EVIDENCE.engravedHz);
  assert.deepEqual(engravingValues(readText), [444]);
  assert.deepEqual(engravingValues(TUNING_FORK_DETAIL.body), engravingValues(readText));
  assert.deepEqual(engravingValues(TUNING_FORK_ENGRAVING_LINE), engravingValues(readText));
  assert.deepEqual(engravingValues(TUNING_FORK_BAG_LINE), engravingValues(readText));
  assert.equal(TUNING_FORK_ENGRAVING, 'A=444');
  assert.equal(TUNING_FORK_DETAIL.id, 'tuning-fork');
  assert.equal(TUNING_FORK_DETAIL.title, 'TUNING FORK');
  assert.equal(TUNING_FORK_DETAIL.source, 'PRACTICE WING');
  assert.doesNotMatch(TUNING_FORK_DETAIL.body, /beat|four times|disagree|institution|A=440/i, 'the first detail records evidence without explaining the discovery');
});

test('the production bag dialogue agrees with the inscription after acquisition', () => {
  const bag = bagInspectionDialogue('tuning-fork');
  const physical = bag.start.lines.filter(line => line.who === 'direction').map(line => line.text).join(' ');
  assert.deepEqual(engravingValues(physical), engravingValues(readText), `bag physical description contradicts the canonical engraving: ${physical}`);
  assert.equal(physical, TUNING_FORK_BAG_LINE);
  assert.equal(bag.start.lines.length, 2, 'do not add an explanation/reward to the existing inspection');
});

test('legacy physical reading agrees while the active later spoken four-forty remains', () => {
  const legacyPhysical = TALISMAN.read.lines.filter(line => line.who === 'direction').map(line => line.text).join(' ');
  assert.deepEqual(engravingValues(legacyPhysical), engravingValues(readText), `legacy physical description contradicts the canonical engraving: ${legacyPhysical}`);
  assert.equal(legacyPhysical, TUNING_FORK_ENGRAVING_LINE);
  assert.ok(canonical.nodes.pocket.lines.some(line => line.who === 'you' && /A=440/.test(line.text)), 'the later spoken insistence is intentional and must survive the physical-description repair');
  assert.ok(runtimeTree('conservatory.talisman').read.choices.some(choice => choice.goto === 'pocket' && choice.set?.includes('has.fork')), 'existing runtime acquisition remains the same choice');
});

test('the real object-detail and loose-prop surfaces consume the facts without replacing acquisition', () => {
  const start = main.indexOf("if(hit.action==='story-tuning-fork')");
  assert.ok(start >= 0);
  const branch = main.slice(start, main.indexOf("if(hit.action==='rekey-ledger')", start));
  assert.match(branch, /openObjectDetail\(\{\s*\.\.\.TUNING_FORK_DETAIL\s*,/, 'first object detail must consume the physical description instead of a divergent inline stamp');
  assert.match(branch, /onContinue\s*:\s*\(\)\s*=>\s*interactTalisman\(true\)/, 'reading still continues into the existing encounter');
  assert.doesNotMatch(branch, /flagApply|saveCommit|startFork|emitNoise|addBattery|playerKeys/, 'detail presentation must not add a reward, sound or progression effect');
  const looseStart = main.indexOf("PROPS.setLooseProp('story-tuning-fork'");
  const loose = main.slice(looseStart, main.indexOf('\n  });', looseStart));
  assert.match(loose, /again\s*:[^\n]*TUNING_FORK_ENGRAVING/, 'repeat inspect must consume the same physical inscription, whether alone or in its existing sentence');
  assert.doesNotMatch(loose, /again\s*:[^\n]*A=440/, 'repeat inspect must not revert the physical object to 440');
  assert.match(loose, /action\s*:\s*'story-tuning-fork'/);
});

test('unfinished fork cancellation removes only its consumed thought without mutating the saved input', () => {
  const had = Object.freeze(['post-door', 'talisman', 'talisman.seen', 'first-take']);
  const extra = Object.freeze({ retained: true });
  const state = Object.freeze({ had, extra, version: 7 });
  const result = tuningForkCancellationThoughts(state);
  assert.deepEqual(result, { had: ['post-door', 'talisman.seen', 'first-take'], extra, version: 7 });
  assert.notEqual(result, state);
  assert.notEqual(result.had, had);
  assert.equal(result.extra, extra, 'unrelated save fields remain intact');
  assert.deepEqual(state.had, ['post-door', 'talisman', 'talisman.seen', 'first-take']);
  assert.deepEqual(tuningForkCancellationThoughts(), { had: [] });
  assert.deepEqual(tuningForkCancellationThoughts({ had: null, extra }), { had: [], extra });
  for (const decision of [{ owned: true }, { declined: true }, { owned: true, declined: true }]) {
    assert.equal(tuningForkCancellationThoughts(state, decision), state, 'ownership or deliberate refusal must not re-arm the encounter');
  }
});

test('the real thought serializer preserves other IDs without retaining caller-owned arrays', () => {
  const original = Object.freeze({ had: Object.freeze(['post-door', 'talisman', 'talisman.seen', 'first-take']) });
  try {
    loadThoughtState(original);
    loadThoughtState(tuningForkCancellationThoughts(saveThoughtState()));
    markThought('another-existing-thought');
    const saved = saveThoughtState();
    assert.deepEqual(saved.had, ['post-door', 'talisman.seen', 'first-take', 'another-existing-thought']);
    assert.deepEqual(original.had, ['post-door', 'talisman', 'talisman.seen', 'first-take']);
    saved.had.length = 0;
    assert.equal(thoughtHad('post-door'), true, 'the saved array must not alias the live thought store');
    assert.equal(thoughtHad('another-existing-thought'), true);
    assert.equal(thoughtHad('talisman'), false);
  } finally { resetThoughts(); }
});

// Execute the production encounter and generic thought dispatcher against the
// real thought store and real Escape scene lifecycle. Rendering, audio output,
// world geometry and durable storage are outside this focused harness.
function productionFunction(name, endMarker, environment, source = main) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `production ${name} must exist`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `production ${name} extraction boundary must exist`);
  return new Function('environment', `with (environment) { return (${source.slice(start, end).trim()}); }`)(environment);
}

function encounterHarness() {
  scenes.clear(); resetThoughts();
  loadThoughtState({ had: ['post-door', 'talisman.seen', 'first-take'] });
  const flags = {}, commits = [], sound = { strikes: 0, damps: 0 };
  let thoughtOptions = null;
  const environment = {
    storyMode: true, planName: 'conservatory', NO_THINK: false,
    thoughtHad, markThought, loadThoughtState, saveThoughtState, tuningForkCancellationThoughts,
    scenes, FP: { toRuntimePoint: point => point }, TALISMAN_CELL: { x: 0, y: 0 }, px: 0, py: 0, D: value => value,
    TALISMAN: runtimeTree('conservatory.talisman'), ensureCtx() {},
    saveCommit(patch) { commits.push(structuredClone(patch)); }, getSave: () => ({ flags }),
    flagTest: id => !!flags[id],
    syncStoryObjectProps() {}, refreshWorldProps() {},
    strikeFork() { sound.strikes++; }, dampFork() { sound.damps++; },
    STORY: null, actx: null, dialogGain: null, master: null, CR: { fx: null }, fireCue() {}, createReplayService: () => null,
    applyStoryChoice(choice) { for (const id of choice?.set || []) flags[id] = true; },
    makeThoughtScene(options) { thoughtOptions = options; return makeThoughtScene(options); },
  };
  environment.think = productionFunction('think', '\n// A repeatable dialog beat', environment);
  const interact = productionFunction('interactTalisman', '\n// A=440, held', environment);
  return { interact, flags, commits, sound,
    choice(choice) { thoughtOptions.onChoice(choice); },
    cancel() { assert.ok(scenes.top(), 'the encounter is open'); scenes.top().key({ key: 'Escape' }); },
    cleanup() { scenes.clear(); resetThoughts(); },
  };
}

test('ordinary Escape re-arms the unfinished production fork encounter across thought save/load', () => {
  const harness = encounterHarness();
  try {
    assert.equal(harness.interact(), true);
    assert.equal(thoughtHad('talisman'), true, 'the real dispatcher consumes its once-per-run thought on opening');
    harness.choice({ goto: 'strike' });
    assert.equal(harness.sound.strikes, 1);
    harness.cancel();
    assert.equal(scenes.depth(), 0);
    assert.equal(thoughtHad('talisman'), false, 'Escape must not consume an unowned, unrefused fork');
    assert.equal(harness.sound.damps, 1, 'cancellation stops the struck tone');
    const saved = harness.commits.at(-1)?.thoughts;
    assert.deepEqual(saved, { had: ['post-door', 'talisman.seen', 'first-take'] }, 'the repair must persist the retained unrelated thoughts');
    loadThoughtState(saved);
    assert.equal(harness.interact(), true, 'a fresh load permits ordinary reinspection');
    assert.equal(scenes.depth(), 1);
    assert.equal(harness.flags['has.fork'], undefined, 'cancellation grants no ownership');
  } finally { harness.cleanup(); }
});

test('deliberate refusal and pocket ownership remain consumed when their final lines are cancelled', () => {
  for (const choice of [{ goto: 'leave' }, { goto: 'pocket', set: ['has.fork'] }]) {
    const harness = encounterHarness();
    try {
      harness.interact();
      harness.choice(choice);
      harness.cancel();
      assert.equal(thoughtHad('talisman'), true, `${choice.goto} is a deliberate decision`);
      assert.equal(harness.interact(), false, 'a committed decision must not re-arm');
      assert.deepEqual(saveThoughtState().had, ['post-door', 'talisman.seen', 'first-take', 'talisman']);
      loadThoughtState(saveThoughtState());
      assert.equal(thoughtHad('talisman'), true, 'the real thought serializer retains the committed decision');
      assert.equal(!!harness.flags['has.fork'], choice.goto === 'pocket');
    } finally { harness.cleanup(); }
  }
});

test('the actual held-fork builder applies the canonical physical engraving', () => {
  const source = readFileSync(new URL('../src/render/battle-hand-tools.js', import.meta.url), 'utf8');
  const labels = [];
  class Shape { moveTo() {} lineTo() {} quadraticCurveTo() {} }
  const environment = {
    THREE: { Shape, ExtrudeGeometry: class {} }, physical: () => ({}), cylinder() {}, add() {},
    box: () => ({ position: { x: 0 } }), label: (...args) => labels.push(args),
    handleGrip: () => ({}), target: () => ({}), clamp: value => value,
    TUNING_FORK_ENGRAVING,
  };
  const buildFork = productionFunction('fork', '\nfunction radio(', environment, source);
  const group = {};
  buildFork(group);
  assert.equal(labels.length, 1, 'the held tool has one physical stamp surface');
  assert.equal(labels[0][0], group);
  assert.equal(labels[0][1], TUNING_FORK_ENGRAVING, 'the actual label call must not continue to print the old 440');
  assert.match(source, /import\s*\{[^}]*TUNING_FORK_ENGRAVING[^}]*\}\s*from\s*['"]\.\.\/data\/tuning-fork-discovery\.js['"]/, 'the builder obtains its physical mark from the shared evidence, rather than a coincidental literal');
});

// Capture the actual production graph and AudioParam writes. The small renderer
// below evaluates those captured sine/gain/panner values after their ramps have
// settled. It is a deterministic graph/beat check, not a browser/device render
// or proof that a player hears or interprets the beat.
function audioGraph() {
  const nodes = [];
  const param = value => ({ value, events: [], cancelScheduledValues(time) { this.events = this.events.filter(event => event.time < time); },
    linearRampToValueAtTime(next, time) { this.events.push({ value: next, time }); } });
  const node = kind => {
    const value = { kind, connections: [], disconnected: false, starts: 0, stops: 0,
      connect(next) { this.connections.push(next); return next; }, disconnect() { this.disconnected = true; },
      start() { this.starts += 1; }, stop() { this.stops += 1; } };
    if (kind === 'gain') value.gain = param(1);
    if (kind === 'pan') value.pan = param(0);
    if (kind === 'oscillator') { value.frequency = param(440); value.detune = param(0); }
    nodes.push(value); return value;
  };
  const destination = node('destination');
  const context = { currentTime: 0, createGain: () => node('gain'), createStereoPanner: () => node('pan'), createOscillator: () => node('oscillator') };
  return { nodes, context, destination };
}
const settled = param => param.events.at(-1)?.value ?? param.value;
function leftGain(node, destination) {
  if (node === destination) return 1;
  const own = node.kind === 'gain' ? settled(node.gain)
    : node.kind === 'pan' ? Math.cos((settled(node.pan) + 1) * Math.PI / 4) : 1;
  return own * node.connections.reduce((sum, next) => sum + leftGain(next, destination), 0);
}

test('production fork graph sounds 440 against 444 and yields eight amplitude dips in two settled seconds', () => {
  const graph = audioGraph();
  const runtime = createForkToneRuntime(graph);
  const oscillators = graph.nodes.filter(node => node.kind === 'oscillator');
  assert.equal(oscillators.length, 3);
  assert.deepEqual(oscillators.map(osc => osc.frequency.value).sort((a, b) => a - b), [440, 444, 880]);
  assert.ok(oscillators.every(osc => osc.type === 'sine' && osc.starts === 1));

  // Centre pan uses equal-power gain on the fork path; find an ordinary point
  // whose left-channel fundamental matches the unpanned institution tone.
  const gainAtBalance = FORK_TONE.seamGain / Math.SQRT1_2;
  const distance = FORK_TONE.radius * (1 - (gainAtBalance / FORK_TONE.gain) ** (1 / 2.1));
  const frame = forkToneAt({ x: 0, z: distance }, { x: 0, z: 0 }, { seam: 1 });
  runtime.update(frame, 0);
  const fundamental = oscillators.find(osc => osc.frequency.value === 440);
  const institution = oscillators.find(osc => osc.frequency.value === 444);
  assert.ok(Math.abs(leftGain(fundamental, graph.destination) - leftGain(institution, graph.destination)) < 1e-12);
  assert.ok(oscillators.every(osc => Number.isFinite(leftGain(osc, graph.destination)) && leftGain(osc, graph.destination) > 0));
  assert.deepEqual(institution.frequency.events, [{ value: frame.seamHz, time: .35 }], 'production update schedules the frame pitch');

  const rate = 24000, seconds = 2, window = rate / 50, envelope = [];
  const voices = oscillators.map(osc => ({ hz: settled(osc.frequency) * 2 ** (settled(osc.detune) / 1200), gain: leftGain(osc, graph.destination) }));
  for (let offset = 0; offset < rate * seconds; offset += window) {
    let energy = 0;
    for (let sample = offset; sample < offset + window; sample += 1) {
      const t = 1 + sample / rate;
      const value = voices.reduce((sum, voice) => sum + voice.gain * Math.sin(2 * Math.PI * voice.hz * t), 0);
      energy += value * value;
    }
    envelope.push(Math.sqrt(energy / window));
  }
  const top = Math.max(...envelope), bottom = Math.min(...envelope);
  const dips = envelope.filter((value, index) => index > 0 && index < envelope.length - 1 && value < envelope[index - 1] && value <= envelope[index + 1] && value < (top + bottom) / 2).length;
  assert.equal(dips, 8, 'the actual captured oscillator graph must beat four times per second');
  assert.ok(bottom / top < .3, `the captured balanced graph should have deep modulation, got ${bottom / top}`);

  runtime.update({ gain: 0, pan: 0, seamGain: 0 }, 2);
  assert.equal(leftGain(fundamental, graph.destination), 0);
  assert.equal(leftGain(institution, graph.destination), 0, 'inactive frame silences both evidence voices');
  const eventsBeforeStop = graph.nodes.filter(node => node.kind === 'gain').reduce((sum, node) => sum + node.gain.events.length, 0);
  runtime.stop(); runtime.stop(); runtime.update(frame, 3);
  assert.ok(oscillators.every(osc => osc.stops === 1), 'idempotent stop does not restart a tone');
  assert.equal(graph.nodes.filter(node => node.kind === 'gain').reduce((sum, node) => sum + node.gain.events.length, 0), eventsBeforeStop);
});
