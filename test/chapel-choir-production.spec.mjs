import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { CHAPEL_CHOIR_SOURCE, CHAPEL_CHOIR_SCORE } from '../src/data/chapel-choir.js';
import { validateChapelChoirBank } from '../src/audio/chapel-choir.js';
import { renderGainChannels } from '../src/audio/chapel-choir-score.js';
import { chapelServiceFrame, chapelMurmurFrame } from '../src/game/chapel-service.js';
import { flattenCredits } from '../src/data/credits.js';
import { ZONE } from '../src/data/floorplan/legend.js';

test('shipped passage is a declared real ensemble mix with an exact quiet loop boundary', () => {
  const bank = validateChapelChoirBank(JSON.parse(fs.readFileSync('public/audio/chapel-choir/manifest.json')));
  assert.equal(bank.sourceKind, 'ensemble-mix'); assert.equal(bank.independentParts, 0);
  assert.equal(bank.scoreParts, 'SATTB'); assert.equal(bank.duration, CHAPEL_CHOIR_SCORE.duration);
  const bytes = fs.readFileSync('public/audio/chapel-choir/' + bank.tracks[0].file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), bank.tracks[0].sha256);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  let fmt, data;
  for (let at = 12; at + 8 < bytes.length;) {
    const id = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (id === 'fmt ') fmt = bytes.subarray(at + 8, at + 8 + size);
    if (id === 'data') data = bytes.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  assert.equal(fmt.readUInt16LE(0), 1); assert.equal(fmt.readUInt16LE(2), 1);
  assert.equal(fmt.readUInt32LE(4), 48000); assert.equal(fmt.readUInt16LE(14), 16);
  assert.equal(data.length / 2 / 48000, 88, 'padding must survive the export duration limit');
  assert.equal(data.readInt16LE(0), 0); assert.equal(data.readInt16LE(data.length - 2), 0);
  let peak = 0;
  for (let at = 0; at < data.length; at += 2) peak = Math.max(peak, Math.abs(data.readInt16LE(at)) / 32768);
  assert.ok(peak > .1 && peak < .5, 'real passage and conservative source headroom');
  assert.ok(data.subarray(Math.ceil(80.1 * 48000) * 2).every(n => n === 0), 'quiet between sections, without a false overlapping singer');
  const gain = fs.readFileSync('public/audio/chapel-choir/' + bank.control.file);
  assert.equal(createHash('sha256').update(gain).digest('hex'), bank.control.sha256);
  const expected = renderGainChannels(CHAPEL_CHOIR_SCORE, { voices: 1, controlHz: bank.control.sampleRate });
  assert.equal(gain.length, expected.length * 4);
  assert.ok(gain.equals(Buffer.from(expected.channels[0].buffer)), 'shipped controls exactly match authored sample-clock score');
});

test('ordinary choir protection keeps the existing apparition recording rule separate', () => {
  const base = { eligible: true, listener: { group: 'upper', zone: ZONE.chapel, ground: 4.8 },
    sources: [{ id: 'front', x: 0, y: 0, z: 0, group: 'upper', ground: 4.8 }], voices: [{ gain: 1 }] };
  for (const flag of ['recording', 'listening', 'playback', 'paused', 'blocked', 'battle', 'suppressActors']) {
    assert.equal(chapelServiceFrame({ ...base, [flag]: true }).muted, true, flag);
  }
  assert.equal(chapelServiceFrame({ ...base, focused: false }).muted, true);
  assert.equal(chapelServiceFrame({ ...base, finale: true }).active, false);
  assert.equal(chapelServiceFrame({ ...base, effectsMode: 'off' }).active, false);
  assert.equal(chapelServiceFrame({ ...base, listener: { ...base.listener, group: 'ground' } }).active, false);
  for (const flag of ['recording', 'listening']) assert.equal(chapelMurmurFrame({ ...base, [flag]: true }).muted, false);
});

test('production tick gives choir the normal protection input, keeps legacy failure fallback and murmur ownership', () => {
  const main = fs.readFileSync('src/main.js', 'utf8');
  const code = main.match(/function tickChapelServiceAudio\(\)\{[\s\S]*?\n\}/)?.[0]; assert.ok(code);
  const calls = [], input = { active: true, muted: false, voices: [] };
  const context = { currentChapelServiceInput: () => input, currentChapelMurmurInput: () => ({ murmur: true }),
    chapelChoirAudioFrame: {}, chapelServiceAudioFrame: {}, chapelMurmurAudioFrame: {}, chapelApparitionLast: null,
    chapelChoirAudio: { update: i => { calls.push(['choir', i]); return { loaded: true }; } },
    chapelServiceAudio: { update: i => calls.push(['legacy', i]) },
    chapelMurmurAudio: { update: i => calls.push(['murmur', i]) },
  };
  vm.createContext(context); vm.runInContext(code, context); context.tickChapelServiceAudio();
  assert.equal(calls[0][1], input); assert.equal(calls[1][1].muted, true); assert.equal(calls[2][1].murmur, true);
  context.chapelChoirAudio.update = () => ({ loaded: false, failed: 'missing recording',nearby:true,fallbackFadeSeconds:8 });
  calls.length = 0; context.tickChapelServiceAudio(); assert.equal(calls[0][0], 'legacy'); assert.equal(calls[0][1].muted, false);assert.equal(calls[0][1].fadeInSeconds,8);
  context.chapelChoirAudio.update=()=>({loaded:false,failed:null,nearby:true});calls.length=0;context.tickChapelServiceAudio();
  assert.equal(calls[0][1].muted,true,'a pending choir load cannot start a global-phase spoken service');
  assert.match(main, /createChapelChoirRuntime\(\{context:actx,destination:sfxGain,score:CHAPEL_CHOIR_SCORE/);
  assert.match(main.match(/function resetRunAudio[\s\S]*?\n\}/)[0], /chapelChoirAudio\?\.stop/);
});

test('real recording attribution and provisional limits reach the game credits', () => {
  const text = flattenCredits().map(v => v.text).join('\n');
  for (const value of [CHAPEL_CHOIR_SOURCE.title, CHAPEL_CHOIR_SOURCE.performer, CHAPEL_CHOIR_SOURCE.url,
    CHAPEL_CHOIR_SOURCE.licenceUrl, CHAPEL_CHOIR_SOURCE.changes]) assert.ok(text.includes(value), value);
  assert.match(text, /independent six-part recording pending/);
});
