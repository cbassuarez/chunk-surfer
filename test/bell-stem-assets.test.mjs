import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { BELL_TOWER_STEM_MANIFEST_URL } from '../src/audio/bell-stem-assets.js';
import { validateBellStemManifest } from '../src/audio/bell-stem-manifest.js';

const root=resolve('public/assets/audio/bell-tower');
const manifest=JSON.parse(await readFile(resolve(root,'manifest.json'),'utf8'));
const credits=JSON.parse(await readFile(resolve(root,'credits.json'),'utf8'));

assert.equal(BELL_TOWER_STEM_MANIFEST_URL,'assets/audio/bell-tower/manifest.json');
assert.equal(validateBellStemManifest(manifest).ok,true);
assert.equal(manifest.entries.length,16);
assert.equal(credits.licenseId,'cc0-bigsoundbank-3445-3446');

function wavInfo(bytes){
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WAVE');
  let offset=12,format=null,dataBytes=null;
  while(offset+8<=bytes.length){
    const id=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
    if(id==='fmt ')format={audioFormat:bytes.readUInt16LE(start),channels:bytes.readUInt16LE(start+2),sampleRate:bytes.readUInt32LE(start+4),blockAlign:bytes.readUInt16LE(start+12),bitsPerSample:bytes.readUInt16LE(start+14)};
    if(id==='data')dataBytes=size;
    offset=start+size+(size&1);
  }
  assert.ok(format&&dataBytes!=null,'WAV contains fmt and data chunks');
  return{...format,duration:dataBytes/format.blockAlign/format.sampleRate};
}

for(const entry of manifest.entries){
  assert.equal(entry.licenseId,credits.licenseId);
  assert.match(entry.url,/^bell-0[1-8]-(hand|back)-01\.wav$/);
  assert.equal(entry.contactOffsetSamples,0);
  const info=wavInfo(await readFile(resolve(root,entry.url)));
  assert.ok([1,65534].includes(info.audioFormat),'WAV is PCM or WAVE_FORMAT_EXTENSIBLE PCM');
  assert.equal(info.channels,1);
  assert.equal(info.sampleRate,48000);
  assert.equal(info.bitsPerSample,24);
  assert.ok(info.duration>=11.99,`${entry.url} is at least 12 seconds`);
}

console.log('bell stem asset contract ok');
