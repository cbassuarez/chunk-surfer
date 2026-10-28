import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, statSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {CREDITS} from '../src/data/credits.js';
import {WINDOW_MEDIA_EXTENSION_SOURCES} from '../src/data/window-media-sources.js';

const ROOT=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(join(ROOT,path));
const json=path=>JSON.parse(read(path));
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest=json('content/media/window-media.media.json');
const receipt=json('artifacts/window-media-revisit/extension-build-receipt.json');
const originalIds=['flowers-seb','sunflower-datamosh','bellringers-datamosh','cathedral','demolition','clouds','eclipse','pollination','eye-s3','eye-s5'];
const addedIds=['mimosa-response','performance-capture'];
const added=addedIds.map(id=>manifest.assets.find(asset=>asset.id===id));

test('the extension retains the approved original ten records and adds exactly two named performances',()=>{
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.networkAtRuntime,false);assert.equal(manifest.audioPolicy,'silent');
  assert.equal(manifest.assets.length,12);assert.equal(new Set(manifest.assets.map(asset=>asset.id)).size,12);
  assert.deepEqual(receipt.retainedAssetIds,originalIds);assert.deepEqual(receipt.newAssetIds,addedIds);
  const retained=manifest.assets.filter(asset=>originalIds.includes(asset.id));
  assert.deepEqual(retained.map(asset=>asset.id),originalIds);
  // Receipt captured before the two additions; this is a golden content guard,
  // not an expected value derived from the current implementation.
  assert.equal(receipt.retainedRecordsSha256,'0b36975a0d21cd36f44b8c56836cf8d01140742b58d23fc4b4e26b64abf4ead8');
  assert.equal(sha(JSON.stringify(retained)),receipt.retainedRecordsSha256);
  assert.deepEqual(manifest.extensions['pressure-performances'].assetIds,addedIds);
});

test('new derivatives match their recorded hashes and contain only the bounded silent video streams',()=>{
  let bytes=0;
  for(const asset of added){
    assert.ok(asset);assert.equal(asset.kind,'video');assert.equal(asset.sensitivity,'none');assert.equal(asset.fps,15);
    assert.ok(asset.width<=640&&asset.height<=360);assert.equal(asset.trim.loopDissolveSeconds,0,'causal contact is not dissolved into a ghost gesture');
    for(const kind of ['webm','mp4','poster']){
      const record=asset.derivatives[kind],file=join(ROOT,'public',record.path);
      assert.ok(record.path.startsWith(`window-media/${asset.id}.`));assert.equal(sha(readFileSync(file)),record.sha256);
      assert.equal(statSync(file).size,record.bytes);bytes+=record.bytes;
      if(kind==='poster'){assert.equal(readFileSync(file).subarray(0,8).toString('hex'),'89504e470d0a1a0a');continue;}
      const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height,avg_frame_rate','-of','json',file],{encoding:'utf8'});
      assert.notEqual(probe.error?.code,'ENOENT','install ffmpeg/ffprobe to check new video derivatives');
      assert.equal(probe.status,0,probe.stderr);const streams=JSON.parse(probe.stdout).streams;
      assert.equal(streams.length,1,`${asset.id}/${kind} must never carry a surprise audio stream`);
      assert.equal(streams[0].codec_type,'video');assert.equal(streams[0].width,asset.width);assert.equal(streams[0].height,asset.height);
      assert.equal(streams[0].avg_frame_rate,'15/1');
    }
  }
  assert.equal(bytes,receipt.newDerivativeBytes);assert.equal(receipt.sourcesUnchanged,true);
});

test('each new source is bound to primary per-item licence evidence and truthful delivery provenance',()=>{
  const acquisition=json('artifacts/window-media-revisit/source-media/acquisition.json');
  assert.equal(acquisition.schema,1);assert.equal(acquisition.acquisition.length,2);
  for(const asset of added){
    const source=asset.source,acquired=acquisition.acquisition.find(item=>item.id===asset.id);
    assert.equal(source.sha256,acquired.sha256);assert.equal(source.downloadUrl,acquired.url);
    assert.equal(sha(read(source.evidenceFile)),source.evidenceSha256);
    assert.equal(source.evidenceSha256,acquired.licenceEvidenceSha256);
    assert.ok(source.creator&&source.title&&source.licenseUrl&&source.url&&source.delivery);
  }
  const mimosa=added[0].source;
  assert.equal(mimosa.license,'CC BY 2.5');assert.equal(mimosa.creator,'Brandizzi');
  assert.ok(read(mimosa.evidenceFile).toString().includes('https://creativecommons.org/licenses/by/2.5'));
  const performance=added[1].source,evidence=json(performance.evidenceFile);
  assert.equal(evidence.metadata.identifier,'dicksonfilmtwo');assert.equal(evidence.metadata.licenseurl,'http://creativecommons.org/licenses/publicdomain/');
  assert.match(performance.creator,/Walter Murch and Sean Cullen/);assert.match(performance.delivery,/not the unavailable LOC silent master/);
  assert.match(performance.delivery,/sound.*removed/);assert.equal(performance.license,'Public domain dedication');
});

test('game credits expose creator, title, licence, source links and specific adaptations for both additions',()=>{
  const lines=CREDITS.find(section=>section.heading==='Window Collage Footage').lines;
  assert.deepEqual(WINDOW_MEDIA_EXTENSION_SOURCES.map(source=>source.id),addedIds);
  for(const source of WINDOW_MEDIA_EXTENSION_SOURCES){
    assert.ok(lines.includes(`${source.title} — ${source.author} (${source.licence})`));
    assert.ok(lines.includes(source.url));assert.ok(lines.includes(source.licenceUrl));
    assert.ok(lines.includes(`Adapted: ${source.changes}`));assert.match(source.changes,/silent transcode/);
    const asset=added.find(asset=>asset.id===source.id);
    assert.equal(source.author,asset.source.creator);assert.equal(source.url,asset.source.url);assert.equal(source.licenceUrl,asset.source.licenseUrl);
  }
  const licence=read('third_party/licenses/WINDOW-MEDIA-EXTENSION.md').toString();
  for(const source of WINDOW_MEDIA_EXTENSION_SOURCES){assert.ok(licence.includes(source.id));assert.ok(licence.includes(source.url));assert.ok(licence.includes(source.licenceUrl));}
});

// Run each actual producer against an in-memory filesystem and no-op encoder.
// This catches the destructive manifest replacement that motivated the ownership
// rule without rebuilding videos or modifying the user's existing media bank.
function exerciseProducer(relativePath,before){
  const writes=new Map(),manifestPath='/repo/content/media/window-media.media.json';
  const sourceHashes=new Map(added.map(asset=>[asset.source.file,asset.source.sha256]));
  function bytes(file){
    if(writes.has(file))return Buffer.from(writes.get(file));
    if(file===manifestPath)return Buffer.from(JSON.stringify(before));
    const name=basename(file);
    if(sourceHashes.has(name))return Buffer.from(`source:${name}`);
    const asset=added.find(value=>basename(value.source.evidenceFile)===name);
    if(asset)return read(asset.source.evidenceFile);
    return Buffer.from(`generated:${file}`);
  }
  const context={Buffer,process:{argv:['node',relativePath,'/sources']},console:{log(){}},join,resolve,basename,
    mkdirSync(){},readFileSync:(file,encoding)=>encoding?bytes(file).toString():bytes(file),statSync:file=>({size:bytes(file).length}),
    writeFileSync:(file,value)=>writes.set(file,String(value)),spawnSync:()=>({status:0}),execFileSync(){},
    createHash:algorithm=>{
      const chunks=[];return {update(value){chunks.push(Buffer.from(value));return this;},digest(format){
        const value=Buffer.concat(chunks),marker=value.toString();
        if(marker.startsWith('source:')&&sourceHashes.has(marker.slice(7)))return sourceHashes.get(marker.slice(7));
        return createHash(algorithm).update(value).digest(format);
      }};
    },
  };
  const script=read(relativePath).toString().replace(/^import[^\n]*\n/gm,'').replaceAll('import.meta.dirname',JSON.stringify('/repo/scripts'));
  runInNewContext(script,context,{filename:relativePath,timeout:1000});
  return JSON.parse(writes.get(manifestPath));
}

test('both real producers upsert owned IDs while preserving unrelated registered media',()=>{
  const sentinel={id:'another-producer:retained',kind:'video',source:{creator:'another author'},sentinel:{mustRemain:['unchanged']}};
  const before={...manifest,assets:[...manifest.assets,sentinel]};
  for(const [script,ownedIds] of [['scripts/build-window-media.mjs',originalIds],['scripts/build-window-media-extension.mjs',addedIds]]){
    const rebuilt=exerciseProducer(script,before),foreign=before.assets.filter(asset=>!ownedIds.includes(asset.id));
    assert.deepEqual(rebuilt.assets.filter(asset=>!ownedIds.includes(asset.id)),foreign,script);
    assert.equal(new Set(rebuilt.assets.map(asset=>asset.id)).size,rebuilt.assets.length,script);
    for(const id of ownedIds)assert.equal(rebuilt.assets.filter(asset=>asset.id===id).length,1,`${script}: ${id} is upserted once`);
    assert.equal(rebuilt.audioPolicy,'silent');assert.equal(rebuilt.networkAtRuntime,false);
  }
});
