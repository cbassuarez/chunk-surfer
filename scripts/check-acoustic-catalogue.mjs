import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACOUSTIC_CATALOGUE, validateAcousticCatalogue } from '../src/audio/acoustic-catalogue.js';
import { HUSH_MISCHIEF_CUES } from '../src/data/hush-cues.js';

const result = validateAcousticCatalogue(ACOUSTIC_CATALOGUE);
assert.equal(result.ok, true, result.errors.join('\n'));

const ids = Object.keys(ACOUSTIC_CATALOGUE);
assert.equal(new Set(ids).size, ids.length, 'duplicate acoustic catalogue ids');

const cueIds = HUSH_MISCHIEF_CUES.map((cue) => cue.id);
assert.equal(new Set(cueIds).size, cueIds.length, 'duplicate HUSH mischief cue ids');

for (const cue of HUSH_MISCHIEF_CUES) {
  assert.equal(cue.gameplay?.emittedAsWorldNoise, false, `${cue.id} may recursively alert the HUSH`);
  assert.equal(cue.gameplay?.maySpoilTake, false, `${cue.id} may falsify recording state`);
  assert.ok(Number.isFinite(cue.selection?.familyCooldownMs), `${cue.id} missing family cooldown`);
  assert.ok(Number.isFinite(cue.selection?.cueCooldownMs), `${cue.id} missing cue cooldown`);
  assert.ok(Number.isFinite(cue.selection?.maxPerRun), `${cue.id} missing run cap`);
  assert.ok(typeof cue.caption?.text === 'string' && cue.caption.text.length > 0, `${cue.id} missing accessible caption`);
}

// EVERY KIND THAT IS EMITTED MUST BE DEFINED.
//
// This exists because four of them were not, and nothing said so. emitNoise
// passes `kind` straight through, bypassing inferAcousticKind, and
// normalizeAcousticEvent silently falls back to generic defaults for a kind it
// has never heard of — 300ms, flat spectrum, impulsiveness .5, family
// 'handling'. So a wrench dragged down a stair was acoustically identical to
// picking up a clipboard, and the only way to find out was to go looking.
//
// The scan matches parentheses rather than lines, because the emission that
// started this was spread over two of them.
const sources = ['src/main.js', 'src/game/recordist.js', 'src/game/presence.js', 'src/game/bell-tower-runtime.js'];
const emitted = new Map();
for (const relative of sources) {
  let text;
  try { text = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'); } catch { continue; }
  for (const call of ['emitNoise(', 'emitAcousticEvent(']) {
    let at = text.indexOf(call);
    while (at !== -1) {
      let depth = 0, i = at + call.length - 1, end = -1;
      for (; i < text.length && i < at + 4000; i += 1) {
        if (text[i] === '(') depth += 1;
        else if (text[i] === ')') { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) {
        // Nested `source:{kind:'player'}` is not the event's kind. Strip those
        // before matching or the scan reports the source's kind as an
        // undefined noise kind, which is a false positive and wastes the alarm.
        const body = text.slice(at, end).replace(/source:\s*[^,{]*\{[^}]*\}/g, '');
        const kind = body.match(/kind:\s*'([a-z_]+)'/);
        if (kind) {
          const line = text.slice(0, at).split('\n').length;
          if (!emitted.has(kind[1])) emitted.set(kind[1], `${relative}:${line}`);
        }
      }
      at = text.indexOf(call, at + 1);
    }
  }
}
const undefinedKinds = [...emitted].filter(([kind]) => !ACOUSTIC_CATALOGUE[kind]);
assert.equal(undefinedKinds.length, 0,
  `noise kinds emitted but absent from the catalogue (they degrade to generic defaults, silently):\n${
    undefinedKinds.map(([kind, where]) => `  ${kind}  ${where}`).join('\n')}`);

console.log('acoustic catalogue ok');
console.log(`${ids.length} semantic noise kinds`);
console.log(`${emitted.size} of them reached by an emitter, all defined`);
console.log(`${cueIds.length} fair mischief cues`);
