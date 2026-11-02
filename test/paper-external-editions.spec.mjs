import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,readFile,rm,unlink,appendFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateExternalProductionEditions} from '../scripts/validate-paper-assets.mjs';
import {STUDENT_STRIKE_DOCUMENTS} from '../src/data/student-strike-evidence.js';
import {STUDENT_STRIKE_BAKED_RECORDS} from '../src/generated/student-strike-records.js';

test('the two isolated production editions validate against their native prints and authored copy',async()=>{
  assert.deepEqual(await validateExternalProductionEditions(),[]);
});

test('external support rejects stale wording, omitted editions and arbitrary missing-catalog exemptions',async()=>{
  const documents=structuredClone(STUDENT_STRIKE_DOCUMENTS);documents[0].printLines[0]='Changed after the bake';
  const changed=await validateExternalProductionEditions({documents});
  assert.ok(changed.some(e=>e.includes('external semantic hash stale')));
  assert.ok(changed.some(e=>e.includes('physical print copy stale')));
  const missing=await validateExternalProductionEditions({records:STUDENT_STRIKE_BAKED_RECORDS.slice(1)});
  assert.ok(missing.some(e=>e.includes('missing external edition')));
  const arbitrary=await validateExternalProductionEditions({records:[...STUDENT_STRIKE_BAKED_RECORDS,
    {...STUDENT_STRIKE_BAKED_RECORDS[0],id:'unbaked-ordinary-document'}]});
  assert.ok(arbitrary.some(e=>e.includes('unapproved external edition')));
  const records=structuredClone(STUDENT_STRIKE_BAKED_RECORDS);records[0].pages[0].path='../anything.webp';
  const escaped=await validateExternalProductionEditions({records});
  assert.ok(escaped.some(e=>e.includes('external reader path escapes')));
});

test('missing external raster and stale pack bytes fail against real isolated-build fixtures',async()=>{
  const sourceRoot=fileURLToPath(new URL('../',import.meta.url));
  const root=await mkdtemp(path.join(os.tmpdir(),'chunk-surfer-external-paper-'));
  try{
    const stats=JSON.parse(await readFile(path.join(sourceRoot,'public/assets/student-strike-records.stats.json'),'utf8'));
    const paths=[...Object.keys(stats.sourceHashes),'public/assets/student-strike-records.stats.json',
      'public/assets/student-strike-records.glb','public/assets/student-strike-records'];
    for(const source of paths){
      await mkdir(path.dirname(path.join(root,source)),{recursive:true});
      await cp(path.join(sourceRoot,source),path.join(root,source),{recursive:true});
    }
    await unlink(path.join(root,'public',STUDENT_STRIKE_BAKED_RECORDS[0].pages[0].path));
    const missing=await validateExternalProductionEditions({root});
    assert.ok(missing.some(e=>e.includes('missing or invalid external raster/material')));
    await appendFile(path.join(root,'public/assets/student-strike-records.glb'),Buffer.alloc(4));
    const stalePack=await validateExternalProductionEditions({root});
    assert.ok(stalePack.some(e=>e.includes('native pack hash stale')));
    await unlink(path.join(root,'public/assets/student-strike-records.glb'));
    const missingPack=await validateExternalProductionEditions({root});
    assert.ok(missingPack.some(e=>e.includes('missing or invalid isolated build')));
  }finally{await rm(root,{recursive:true,force:true});}
});
