import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DOOR_AUDIO_ASSETS, DOOR_AUDIO_FAMILIES, DOOR_AUDIO_FAMILY_STATUS, DOOR_AUDIO_SOURCES,
} from '../src/data/door-audio-assets.js';
import { DOOR_SOUND_FAMILY } from '../src/audio/door-audio.js';
import { DOOR_ARCHETYPES, CONSERVATORY_DOORS } from '../src/data/conservatory-doors.js';
import { CREDITS } from '../src/data/credits.js';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root));
const json = path => JSON.parse(read(path));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = json('public/audio/doors/manifest.json');
const sources = new Map(DOOR_AUDIO_SOURCES.map(source => [source.id, source]));
const credit = CREDITS.find(section => section.heading === 'Door Mechanism Recordings');
const licenceRecord = read('third_party/licenses/DOOR-AUDIO.md').toString();
const inherited = clip => clip.deliveryKind === 'inherited-project-fallback';
const originalGlassSource = 'bigsoundbank-1270';

function wav(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let format = null, data = null;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + length <= bytes.length, 'the WAV chunk remains inside the asset');
    if (id === 'fmt ') {
      assert.ok(length >= 16);
      format = {
        encoding: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2),
        sampleRate: bytes.readUInt32LE(start + 4), blockAlign: bytes.readUInt16LE(start + 12),
        bits: bytes.readUInt16LE(start + 14),
      };
    }
    if (id === 'data') data = bytes.subarray(start, start + length);
    offset = start + length + length % 2;
  }
  assert.ok(format && data, 'format and samples exist');
  return { ...format, data };
}

test('the runtime bank exactly matches the manifest and every referenced delivery retains its recorded hash', () => {
  assert.deepEqual(DOOR_AUDIO_ASSETS, Object.fromEntries([...manifest.clips, ...manifest.inheritedAssets].map(clip => [clip.id, clip])));
  assert.deepEqual(DOOR_AUDIO_FAMILIES, manifest.families);
  assert.deepEqual(DOOR_AUDIO_FAMILY_STATUS, manifest.familyStatus);
  assert.deepEqual(DOOR_AUDIO_SOURCES, manifest.sources);
  const referenced = new Set();
  for (const [family, actions] of Object.entries(DOOR_AUDIO_FAMILIES)) {
    for (const [action, ids] of Object.entries(actions)) {
      assert.ok(ids.length > 0, `${family}/${action} has a delivery`);
      assert.equal(new Set(ids).size, ids.length, `${family}/${action} does not duplicate a take to simulate variation`);
      for (const id of ids) {
        const clip = DOOR_AUDIO_ASSETS[id];
        assert.ok(clip, `${family}/${action} resolves ${id}`);
        assert.equal(clip.action, action);
        const bytes = read(`public/${clip.url}`);
        assert.equal(bytes.length, clip.bytes, `${id} byte length`);
        assert.equal(hash(bytes), clip.sha256, `${id} content hash`);
        referenced.add(id);
      }
    }
  }
  assert.equal(referenced.size, Object.keys(DOOR_AUDIO_ASSETS).length, 'no unreferenced production delivery masquerades as coverage');
});

test('new WAV deliveries have spatial-ready PCM format and preserve export headroom', () => {
  assert.equal(new Set(manifest.clips.map(clip => clip.sha256)).size, manifest.clips.length,
    'different new takes do not point at identical rendered bytes');
  assert.equal(new Set(manifest.clips.map(clip => `${clip.sourceFileSha256}:${clip.sourceStartSeconds}:${clip.sourceEndSeconds}`)).size,
    manifest.clips.length, 'different take IDs do not reuse the identical source excitation interval');
  for (const clip of manifest.clips) {
    assert.equal(inherited(clip), false);
    const audio = wav(read(`public/${clip.url}`));
    const originalGlass = clip.sourceId === originalGlassSource;
    assert.ok([44100, 48000].includes(clip.sampleRate), `${clip.id} supported delivery sample rate`);
    assert.equal(clip.sampleRate, originalGlass ? 48000 : 44100,
      'the original glass session retains 48 kHz; existing preview-derived cuts retain their established 44.1 kHz');
    assert.deepEqual({ encoding: audio.encoding, channels: audio.channels, sampleRate: audio.sampleRate, bits: audio.bits, blockAlign: audio.blockAlign },
      { encoding: 1, channels: 1, sampleRate: clip.sampleRate, bits: 16, blockAlign: 2 }, clip.id);
    assert.ok(Math.abs(audio.data.length / 2 / audio.sampleRate - clip.durationSeconds) < 1 / audio.sampleRate, `${clip.id} duration`);
    assert.equal(clip.channels, audio.channels); assert.equal(clip.sampleRate, audio.sampleRate);
    assert.equal(clip.samplesAtOrAboveFullScale, 0, 'the producer measured the complete decoded excerpt');
    assert.ok(clip.peakDbFS < 0);
    // Bound this independent PCM inspection to 38,000 evenly spaced samples
    // per file; hashes bind the complete asset to the producer's full scan.
    const samples = audio.data.length / 2, stride = Math.max(1, Math.ceil(samples / 38000));
    for (let index = 0; index < samples; index += stride) {
      const value = audio.data.readInt16LE(index * 2);
      assert.ok(value > -32768 && value < 32767, `${clip.id} sampled full-scale PCM value at ${index}`);
    }
    assert.equal(clip.forceCategory, null, 'uncalibrated recordings do not claim measured force');
    assert.equal(clip.pitchOrTimeVariation, false, 'recorded performances are not pitch-shifted clones');
    assert.equal(clip.deliveryKind, originalGlass ? 'original-bwf-derived' : 'freesound-hq-preview-derived');
    assert.ok(clip.sourceStartSeconds >= 0 && clip.sourceEndSeconds > clip.sourceStartSeconds);
    assert.ok(Math.abs(clip.durationSeconds - (clip.sourceEndSeconds - clip.sourceStartSeconds)) <= 1 / clip.sampleRate);
  }
});

test('each new used source has approved per-item provenance and complete public attribution with adaptations', () => {
  assert.ok(credit, 'the game exposes door recording credits');
  const lines = credit.lines.join('\n'), used = new Set(manifest.clips.map(clip => clip.sourceId));
  assert.equal(used.size, sources.size, 'the credits list corresponds to recordings actually used');
  for (const id of used) {
    const source = sources.get(id);
    assert.ok(source, id);
    assert.ok(['CC0 1.0', 'CC BY 4.0'].includes(source.licence), `${id} approved licence`);
    const expectedLicence = source.licence === 'CC0 1.0'
      ? 'https://creativecommons.org/publicdomain/zero/1.0/' : 'https://creativecommons.org/licenses/by/4.0/';
    assert.equal(source.licenceUrl, expectedLicence);
    assert.equal(hash(read(source.sourceFile)), source.sourceFileSha256, `${id} delivered input unchanged`);
    const page = read(source.sourcePage);
    assert.equal(hash(page), source.sourcePageSha256, `${id} primary licence evidence unchanged`);
    if (id === originalGlassSource) {
      assert.equal(source.deliveryKind, 'bigsoundbank-original-bwf');
      assert.equal(source.url, 'https://bigsoundbank.com/old-glass-door-s1270.html');
      assert.equal(source.download, 'https://bigsoundbank.com/UPLOAD/bwf-en/1270.wav');
      assert.match(page.toString(), /CC0 \(public domain\)/, 'the per-item original delivery page declares CC0');
      const original = wav(read(source.sourceFile));
      assert.deepEqual({ sampleRate: original.sampleRate, channels: original.channels, bits: original.bits },
        { sampleRate: 48000, channels: 1, bits: 24 }, 'the received original matches the recorder delivery specification');
    } else {
      assert.ok(page.toString().includes(expectedLicence) || page.toString().includes(expectedLicence.replace('https:', 'http:')));
      assert.equal(source.deliveryKind, 'freesound-hq-preview', 'preview WAV wrapping never implies original master access');
    }
    for (const value of [source.title, source.author, source.url, source.licence, source.licenceUrl, `Adapted: ${source.changes}`]) {
      assert.ok(value && lines.includes(value), `${id} public credit includes ${value}`);
    }
    for (const value of [source.title, source.author, source.url, source.licenceUrl]) assert.ok(licenceRecord.includes(value), `${id} bundled licence record`);
  }
  for (const clip of manifest.clips) {
    assert.equal(clip.sourceFileSha256, sources.get(clip.sourceId).sourceFileSha256);
    assert.equal(clip.sourceFile, sources.get(clip.sourceId).sourceFile);
  }
  for (const clip of manifest.inheritedAssets) {
    assert.equal(inherited(clip), true);
    assert.equal(clip.sourceId, 'inherited-project-audio');
    assert.match(clip.provenance, /External provenance not re-established/);
    assert.equal(sources.has(clip.sourceId), false, 'the pre-existing fallback is not falsely assigned a new CC licence');
  }
});

test('the selected bell preserves four separated activations and their relative recorded levels', () => {
  const bells = DOOR_AUDIO_FAMILIES.bell.bell.map(id => DOOR_AUDIO_ASSETS[id]);
  const audition = json('artifacts/door-sound-study/source-audio/494565-bell-activations.json').takes;
  assert.equal(bells.length, 4);
  assert.equal(new Set(bells.map(clip => clip.sha256)).size, 4);
  assert.equal(new Set(bells.map(clip => clip.sourceFileSha256)).size, 1);
  assert.deepEqual([...new Set(bells.map(clip => clip.processingGainDb))], [-1], 'all receive the same export headroom');
  assert.equal(new Set(bells.map(clip => clip.gainDb)).size, 1, 'runtime attenuation does not normalize the recorded variation');
  for (const [index, clip] of bells.entries()) {
    assert.equal(clip.sourceId, '775noise-494565');
    assert.equal(clip.sourceStartSeconds, audition[index].startSecondsInPublicPreview);
    assert.ok(Math.abs(clip.sourceEndSeconds - audition[index].endSecondsInPublicPreview) < .00001);
    assert.ok(Math.abs(clip.rmsDbFS - audition[index].mean_volume) < .12, 'small edge fades retain the auditioned level');
    assert.ok(Math.abs(clip.peakDbFS - audition[index].max_volume) < .12);
    if (index) assert.ok(clip.sourceStartSeconds > bells[index - 1].sourceEndSeconds, 'different non-overlapping source excitations');
  }
  assert.ok(Math.max(...bells.map(clip => clip.rmsDbFS)) - Math.min(...bells.map(clip => clip.rmsDbFS)) > 8,
    'the real quiet/loud differences were not flattened');
});

test('the heritage glazed door retains one coherent original session and stays on the matching public leaves', () => {
  const family = DOOR_AUDIO_FAMILIES['heritage-glazed'];
  assert.ok(family);
  assert.deepEqual(Object.keys(family).sort(), ['close', 'motionClose', 'open']);
  const clips = Object.values(family).flat().map(id => DOOR_AUDIO_ASSETS[id]);
  assert.equal(clips.length, 3);
  assert.equal(new Set(clips.map(clip => clip.sourceFileSha256)).size, 1, 'opening, moving and seating retain one physical-door session');
  for (const clip of clips) {
    assert.equal(clip.sourceId, originalGlassSource);
    assert.equal(clip.sampleRate, 48000);
    assert.equal(clip.processingGainDb, -3, 'the session receives uniform export headroom');
  }
  assert.equal(DOOR_SOUND_FAMILY['public-glazed-pair'], 'heritage-glazed');
  for (const [archetype, mapped] of Object.entries(DOOR_SOUND_FAMILY)) {
    if (archetype !== 'public-glazed-pair') assert.notEqual(mapped, 'heritage-glazed', `${archetype} retains its own mechanism character`);
  }
});

test('every declared door archetype resolves a deliberate mechanism family or the explicit acoustic fallback', () => {
  assert.deepEqual(Object.keys(DOOR_SOUND_FAMILY).sort(), Object.keys(DOOR_ARCHETYPES).sort());
  for (const archetype of new Set([...Object.keys(DOOR_ARCHETYPES), ...CONSERVATORY_DOORS.map(door => door.archetype)])) {
    const family = DOOR_SOUND_FAMILY[archetype];
    assert.ok(family, `${archetype} has an authored mapping`);
    if (!DOOR_AUDIO_FAMILIES[family]) {
      assert.equal(family, 'acoustic', 'only the documented unfilled acoustic family may inherit the legacy mechanism');
      assert.ok(['hall-acoustic-pair', 'practice-acoustic-single'].includes(archetype));
    }
    const resolved = DOOR_AUDIO_FAMILIES[family] || DOOR_AUDIO_FAMILIES.legacy;
    for (const action of ['open', 'close']) assert.ok(resolved[action]?.every(id => DOOR_AUDIO_ASSETS[id]), `${archetype}/${action} resolves a real asset`);
  }
  assert.match(licenceRecord, /acoustic-gasket\/seal recording family/);
});
