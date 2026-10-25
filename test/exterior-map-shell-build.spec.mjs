import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildExteriorMapShell} from '../tools/chunk_surfer/build-exterior-map-shell.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('isolated shell generation reads the requested pack and writes only the requested output',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-exterior-map-build-'));
  const production=path.join(root,'src/data/generated/exterior-map-shell.js'),before=fs.readFileSync(production);
  try{
    const assetPath=path.join(temp,'conservatory-props.glb'),outputPath=path.join(temp,'derived','exterior-map-shell.js');
    fs.copyFileSync(path.join(root,'public/assets/conservatory-props.glb'),assetPath);
    const data=buildExteriorMapShell({root:path.join(temp,'isolated-root'),assetPath,outputPath});
    const generated=await import(pathToFileURL(outputPath).href);
    assert.deepEqual(generated.EXTERIOR_MAP_SHELL,data);
    assert.ok(data.cellCount>2000);assert.ok(data.runs.length>100);
    assert.deepEqual(fs.readFileSync(production),before,'an isolated build cannot rewrite the production survey');
    assert.equal(fs.existsSync(path.join(temp,'isolated-root','src/data/generated/exterior-map-shell.js')),false,'custom output is authoritative');
    const missingOutput=path.join(temp,'must-not-be-created.js');
    assert.throws(()=>buildExteriorMapShell({assetPath:path.join(temp,'missing.glb'),outputPath:missingOutput}),/ENOENT/);
    assert.equal(fs.existsSync(missingOutput),false,'the specified input must be read rather than silently falling back to production');
    const readOnlyOutput=path.join(temp,'read-only','survey.js');
    buildExteriorMapShell({assetPath,outputPath:readOnlyOutput,write:false});
    assert.equal(fs.existsSync(path.dirname(readOnlyOutput)),false,'read-only extraction creates no directories or files');
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('the normal and isolated prop pipelines derive the shell after writing the final pack and credits',()=>{
  const source=fs.readFileSync(path.join(root,'tools/chunk_surfer/build-props.mjs'),'utf8');
  const hook=source.indexOf("const {buildExteriorMapShell}=await import('./build-exterior-map-shell.mjs')");
  assert.ok(hook>source.indexOf("fs.writeFileSync(CREDITS,JSON.stringify(credits,null,2)"));
  assert.match(source.slice(hook,hook+400),/assetPath:OUT/);
  assert.match(source.slice(hook,hook+400),/CHUNK_SURFER_PROPS_OUT_DIR[\s\S]*path\.join\(OUT_DIR,'exterior-map-shell\.js'\)/);
});
