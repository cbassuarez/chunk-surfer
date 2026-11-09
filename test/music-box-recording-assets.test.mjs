import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { MUSIC_BOX_REFERENCE } from '../src/data/music-box-reference.js';

const root = new URL('../', import.meta.url);
function wav(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF'); assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
  let format, data;
  for (let position = 12; position + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', position, position + 4), length = bytes.readUInt32LE(position + 4), start = position + 8;
    if (id === 'fmt ') format = { code: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2), rate: bytes.readUInt32LE(start + 4), bits: bytes.readUInt16LE(start + 14) };
    if (id === 'data') data = bytes.subarray(start, start + length);
    position = start + length + length % 2;
  }
  assert.ok(format && data); assert.equal(format.code, 1); assert.equal(format.bits, 16);
  let peak = 0, square = 0;
  for (let i = 0; i < data.length; i += 2) { const value = data.readInt16LE(i) / 32768; peak = Math.max(peak, Math.abs(value)); square += value * value; }
  return { ...format, data, seconds: data.length / (format.channels * format.rate * 2), peak, rms: Math.sqrt(square / (data.length / 2)) };
}

test('packaged music-box recordings match their source assets and documented pitch-preserving preparation', () => {
  const provenance = JSON.parse(fs.readFileSync(new URL('assets/music-box/reference-performance.json', root)));
  for (const [file, channels, seconds] of [
    [MUSIC_BOX_REFERENCE.file, 2, MUSIC_BOX_REFERENCE.durationSeconds],
    [MUSIC_BOX_REFERENCE.releaseFile, 1, MUSIC_BOX_REFERENCE.releaseSeconds],
    [MUSIC_BOX_REFERENCE.rattleFile, 1, MUSIC_BOX_REFERENCE.rattleSeconds],
  ]) {
    const shipped = fs.readFileSync(new URL(`public/${file}`, root));
    const source = fs.readFileSync(new URL(`assets/${file}`, root));
    assert.deepEqual(shipped, source); assert.ok(shipped.length <= MUSIC_BOX_REFERENCE.maxEncodedBytes);
    assert.equal(createHash('sha256').update(shipped).digest('hex'), provenance.sha256[file.split('/').at(-1)]);
    const info = wav(shipped); assert.equal(info.channels, channels); assert.equal(info.rate, 48000);
    assert.ok(Math.abs(info.seconds - seconds) < 1 / 48000);
    assert.ok(info.peak > .01 && info.peak < 1, `${file} has finite audible material without clipping`);
    assert.ok(info.rms > .0005, `${file} is not an empty or silent placeholder`);
  }
  assert.equal(provenance.clip.startSeconds, 65); assert.equal(provenance.clip.endSeconds, 111.3);
  assert.match(provenance.pitch, /Unchanged/); assert.match(provenance.operation, /manual/);
  assert.match(provenance.mechanicalContact.use, /phone placement/);
});

// Independent signal inspection of shipped PCM: a quiet rattle or a matching
// filename cannot pass this check. FFT neighbourhoods follow measured comb
// modes from the original performance, not generic equal-tempered note labels.
function spectrum(data, rate, from, to) {
  const first = Math.round(from * rate), count = Math.round((to - from) * rate);
  let size = 1; while (size < count) size *= 2;
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  for (let i = 0; i < count; i++) real[i] = data.readInt16LE((first + i) * 2) / 32768 * (.5 - .5 * Math.cos(2 * Math.PI * i / (count - 1)));
  for (let i = 1, reverse = 0; i < size; i++) {
    let bit = size >> 1;
    for (; reverse & bit; bit >>= 1) reverse ^= bit;
    reverse ^= bit;
    if (i < reverse) { const value = real[i]; real[i] = real[reverse]; real[reverse] = value; }
  }
  for (let length = 2; length <= size; length *= 2) {
    const half = length / 2, angle = -2 * Math.PI / length, stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
    for (let block = 0; block < size; block += length) {
      let wr = 1, wi = 0;
      for (let i = 0; i < half; i++) {
        const a = block + i, b = a + half;
        const tr = wr * real[b] - wi * imaginary[b], ti = wr * imaginary[b] + wi * real[b];
        real[b] = real[a] - tr; imaginary[b] = imaginary[a] - ti;
        real[a] += tr; imaginary[a] += ti;
        const next = wr * stepReal - wi * stepImaginary;
        wi = wr * stepImaginary + wi * stepReal; wr = next;
      }
    }
  }
  return Array.from({ length: size / 2 }, (_, i) => ({ hz: i * rate / size, power: real[i] ** 2 + imaginary[i] ** 2 }));
}

test('every shipped release contains dominant pitched comb energy from its attack through the rake', () => {
  const provenance = JSON.parse(fs.readFileSync(new URL('assets/music-box/reference-performance.json', root)));
  assert.equal(provenance.releaseCandidate.file, MUSIC_BOX_REFERENCE.releaseFile.split('/').at(-1));
  assert.equal(provenance.releaseCandidate.playbackRate, 1);
  assert.equal(provenance.releaseCandidate.combGrains.length, 8);
  assert.ok(provenance.releaseCandidate.combGrains.every(grain => grain.sourceStartSeconds >= 65 && grain.sourceStartSeconds + grain.seconds <= 111.3));
  const combHz = [790.3, 830.6, 1037.8, 1108.9, 1246.6, 1398.2, 1405, 1564.5, 1658, 1862.5, 2082.3];
  const release = wav(fs.readFileSync(new URL(`public/${MUSIC_BOX_REFERENCE.releaseFile}`, root)));
  for (const [from, to] of [[0, .16], [.04, .28], [.15, .4], [.27, .5], [0, .55]]) {
    const bins = spectrum(release.data, release.rate, from, to);
    let total = 0, tonal = 0;
    for (const bin of bins) {
      if (bin.hz < 350 || bin.hz >= 10000) continue;
      total += bin.power;
      if (combHz.some(hz => Math.abs(hz - bin.hz) < 25)) tonal += bin.power;
    }
    assert.ok(tonal / total > .8, `${from}–${to}s: comb resonances must dominate broadband rattle; got ${(tonal / total).toFixed(3)}`);
  }
});
