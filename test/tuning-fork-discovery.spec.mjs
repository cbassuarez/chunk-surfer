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
