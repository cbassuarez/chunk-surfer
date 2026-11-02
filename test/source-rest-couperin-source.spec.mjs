import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SOURCE_REST_COUPERIN_SOURCE as S,sourceRestCouperinCreditLines} from '../src/data/source-rest-couperin-source.js';
import {SOURCE_REST_COUPERIN_URL,SOURCE_REST_COUPERIN_DURATION} from '../src/audio/source-rest-couperin.js';
import {CREDITS} from '../src/data/credits.js';
const hash=b=>createHash('sha256').update(b).digest('hex');

test('local full-performance bytes and manifest match the small public provenance record',()=>{
  const bytes=readFileSync(new URL('../public/'+S.asset.url,import.meta.url));
  const manifest=readFileSync(new URL('../public/'+S.asset.manifestUrl,import.meta.url));
  const report=JSON.parse(manifest);
  assert.equal(bytes.length,S.asset.bytes);assert.equal(hash(bytes),S.asset.sha256);assert.equal(hash(manifest),S.asset.manifestSha256);
  assert.equal(report.sourceSha256,S.sourceSha256);assert.equal(report.pairSha256,S.asset.sha256);
  assert.equal(report.sampleCount,S.asset.sampleCount);assert.equal(report.sampleRate,S.asset.sampleRate);
  assert.equal(report.duration,S.asset.duration);assert.equal(report.notes.length,S.revoicing.noteCandidates);
  assert.equal(SOURCE_REST_COUPERIN_URL,S.asset.url);assert.ok(Math.abs(SOURCE_REST_COUPERIN_DURATION-S.asset.duration)<.001);
  assert.ok(S.asset.duration>840,'complete performance, not an eleven-second repeated excerpt');
});

test('prepared MPEG carrier is independent two-channel32kHz audio, with bounded measured decoded samples',()=>{
  const b=readFileSync(new URL('../public/'+S.asset.url,import.meta.url));
  let i=b.toString('ascii',0,3)==='ID3'?10+((b[6]&127)<<21)+((b[7]&127)<<14)+((b[8]&127)<<7)+(b[9]&127):0;
  while(i<b.length-4&&!(b[i]===255&&(b[i+1]&224)===224))i++;
  assert.ok(i<b.length-4);assert.equal((b[i+1]>>3)&3,3,'MPEG1');
  assert.equal((b[i+2]>>2)&3,2,'32kHz');assert.equal(b[i+3]>>6,0,'stereo, not mono');assert.equal(S.asset.channels,2);
  const m=JSON.parse(readFileSync(new URL('../public/'+S.asset.manifestUrl,import.meta.url),'utf8')).measurements;
  assert.equal(m.nonfiniteSamples,0);assert.equal(m.clippedSamples,0);assert.ok(m.dryDecodedWorstEqualPowerPeak<.34);
});

test('actual public credits include performer, complete source, electronic provenance and natural timing policy',()=>{
  const entry=CREDITS.find(s=>s.heading==='Source III — Harpsichord and Revoicing');assert.ok(entry);
  assert.deepEqual(entry.lines,sourceRestCouperinCreditLines());const text=entry.lines.join('\n');
  assert.match(text,/David Joseph Stith/);assert.match(text,/complete/);assert.match(text,/CC0 1\.0/);
  assert.match(text,/Electronic revoicing created for Chunk Surfer/);assert.match(text,/irregularities retained/);
  assert.match(text,/user-adjusted pitch, with no added error stingers/);
  assert.match(text,/Nicolas Sceaux/);assert.match(text,/CC BY 2\.5/);
  assert.ok(entry.lines.includes(S.sourceUrl));assert.ok(entry.lines.includes(S.licenceUrl));
});

test('licence record distinguishes the supplied Bach marimba take from the credited harpsichord source',()=>{
  const licence=readFileSync(new URL('../third_party/licenses/SOURCE-REST-COUPERIN.txt',import.meta.url),'utf8');
  assert.ok(licence.includes(S.sourceSha256));assert.ok(licence.includes(S.asset.sha256));
  assert.match(licence,/Source II’s Bach Chaconne is the separate developer-supplied\nmarimba recording/);
  assert.match(licence,/does not\s+attribute this harpsichord performance to the player/);
  assert.match(licence,/old automatic transcription may introduce/);
  assert.match(licence,/lossy-to-lossy/);assert.match(licence,/folded to mono/);
});
