import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { stableDiffusionOffAtStartup } from '../src/platform/stable-diffusion-policy.js';
import { findForbiddenLensFiles } from '../scripts/validate-lean-bundle.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('all production opt-ins are overridden even by a saved ON preference', () => {
  const storage = { getItem: () => '0' };
  for (const query of ['', 'sd=1', 'lens=1', 'diffusion=ws://127.0.0.1:8000']) {
    assert.equal(stableDiffusionOffAtStartup(new URLSearchParams(query), {
      available: false, startupOptIn: true, storage,
    }), true, query || '<none>');
  }
  assert.equal(stableDiffusionOffAtStartup(new URLSearchParams(), {
    available: true, startupOptIn: true, storage: { getItem: () => '1' },
  }), false, 'explicit local --sd overrides an old saved OFF preference');
});

test('ordinary bundle never declares a lens executable or model resource', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'));
  const pkg = JSON.parse(read('package.json'));
  const main = read('src/main.js');
  const workflow = read('.github/workflows/release.yml');
  assert.deepEqual(config.bundle.resources, { '../LEGAL/EULA.md': 'EULA.md', 'steamworks-runtime/': 'steamworks/' });
  assert.equal(config.bundle.externalBin, undefined);
  assert.equal(pkg.scripts['tauri:build'], 'tauri build');
  assert.match(pkg.scripts.build,/vite build\s*&&\s*npm run lean:verify -- dist$/,
    'the frontend tree is scanned before its assets can be embedded into a native executable');
  assert.ok(!read('scripts/package-windows-portable.mjs').includes('cpSync(sidecar'));
  assert.match(main, /const SD_DEV_ENABLED=import\.meta\.env\.DEV && import\.meta\.env\.VITE_STABLE_DIFFUSION==='1'/);
  assert.match(main, /if\(!SD_DEV_ENABLED\)return null/);
  assert.match(main, /if\(stableDiffusionOff\(\)\)\{afterCalibration\(\);return;\}/);
  assert.doesNotMatch(workflow, /install_torch\.py|build_bundle\.py|lens-bundle-v2/);
});

test('lean package tree validator rejects model weights, lens processes and model directories', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'chunk-sd-free-'));
  try {
    const app = path.join(dir, 'Chunk Surfer.app');
    mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
    writeFileSync(path.join(app, 'Contents', 'Resources', 'ordinary-pbr.png'), 'image');
    assert.deepEqual(findForbiddenLensFiles(app), []);
    writeFileSync(path.join(app, 'Contents', 'Resources', 'weights.safetensors'), 'model');
    assert.deepEqual(findForbiddenLensFiles(app), ['Contents/Resources/weights.safetensors']);
    rmSync(path.join(app, 'Contents', 'Resources', 'weights.safetensors'));
    writeFileSync(path.join(app, 'chunk-lens.exe'), 'native lens');
    assert.deepEqual(findForbiddenLensFiles(app), ['chunk-lens.exe']);
    rmSync(path.join(app, 'chunk-lens.exe'));
    mkdirSync(path.join(app, 'lens', 'models'), { recursive: true });
    assert.deepEqual(findForbiddenLensFiles(app), ['lens/']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('lean validation catches Python and diffusion runtimes without rejecting authored binary assets', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'chunk-runtime-free-'));
  try {
    for(const name of ['horizon-tape.bin','model.bin','grand-piano.glb','models.json'])writeFileSync(path.join(dir,name),'authored');
    assert.deepEqual(findForbiddenLensFiles(dir),[]);
    for(const name of ['python.exe','python312.dll','python3.12','Python','python312.zip',
      'libpython3.12.dylib','libpython3.12.so.1.0','libtorch_cpu.so','torch_cuda.dll','c10.dll',
      'cublas64_12.dll','diffusion_pytorch_model.bin','pytorch_model-00001-of-00002.bin','weights.onnx_data']){
      writeFileSync(path.join(dir,name),'unwanted runtime');
      assert.ok(findForbiddenLensFiles(dir).includes(name),name);
      rmSync(path.join(dir,name));
    }
    for(const name of ['.venv','site-packages','Python.framework','python3.12','torch','diffusers','diffusion_server']){
      mkdirSync(path.join(dir,name));
      assert.ok(findForbiddenLensFiles(dir).includes(name+'/'),name);
      rmSync(path.join(dir,name),{recursive:true});
    }
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('lean validation preserves internal framework links and rejects aliased or external model trees',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'chunk-package-links-')),app=path.join(dir,'Chunk Surfer.app');
  const link=(target,destination)=>symlinkSync(process.platform==='win32'?path.resolve(path.dirname(destination),target):target,
    destination,process.platform==='win32'?'junction':'dir');
  try{
    const versions=path.join(app,'Contents','Frameworks','Ordinary.framework','Versions');
    mkdirSync(path.join(versions,'A'),{recursive:true});
    writeFileSync(path.join(versions,'A','ordinary.dylib'),'framework');link('A',path.join(versions,'Current'));
    // An internal ancestor alias must not recurse forever or change the scan.
    link(app,path.join(app,'local-alias'));assert.deepEqual(findForbiddenLensFiles(app),[]);
    const hidden=path.join(app,'hidden','torch');mkdirSync(hidden,{recursive:true});
    writeFileSync(path.join(hidden,'model.bin'),'model');link(hidden,path.join(app,'innocent-runtime'));
    const internal=findForbiddenLensFiles(app);
    assert.ok(internal.includes('hidden/torch/'));assert.ok(internal.includes('innocent-runtime'));
    rmSync(path.join(app,'innocent-runtime'));rmSync(path.join(app,'hidden'),{recursive:true});
    const outside=path.join(dir,'outside');mkdirSync(outside);writeFileSync(path.join(outside,'weights.safetensors'),'model');
    link(outside,path.join(app,'external-runtime'));
    assert.deepEqual(findForbiddenLensFiles(app),['external-runtime (external symlink)']);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('lean validation rejects dangling links instead of silently accepting an uninspectable package', {skip:process.platform==='win32'},()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'chunk-broken-links-'));
  try{symlinkSync('missing',path.join(dir,'runtime'));assert.deepEqual(findForbiddenLensFiles(dir),['runtime (unresolved symlink)']);}
  finally{rmSync(dir,{recursive:true,force:true});}
});
