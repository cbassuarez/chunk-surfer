import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT=path.resolve(import.meta.dirname,'../../..');
const rel=(p)=>path.join(ROOT,p);
let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};

const cfg=JSON.parse(fs.readFileSync(rel('public/labs/chunk-surfer/lens.local.example.json'),'utf8'));
const endpoint=new URL(cfg.url);
ck('tracked lens config is loopback WebSocket only',endpoint.protocol==='ws:'&&endpoint.hostname==='127.0.0.1',cfg.url);
ck('local config has no cloud credential',!('token' in cfg));

const main=fs.readFileSync(rel('public/labs/chunk-surfer/src/main.js'),'utf8');
const tuner=fs.readFileSync(rel('public/labs/chunk-surfer/src/net/tuner.js'),'utf8');
const client=fs.readFileSync(rel('public/labs/chunk-surfer/src/net/diffusion.js'),'utf8');
const server=fs.readFileSync(rel('tools/chunk_surfer/diffusion_server/server.py'),'utf8');
const pkg=JSON.parse(fs.readFileSync(rel('package.json'),'utf8'));
ck('browser rejects non-loopback diffusion endpoints',main.includes("remote diffusion endpoint rejected — the lens is local-only")&&main.includes("u.hostname==='127.0.0.1'"));
ck('local development enables the lens unless explicitly disabled',main.includes("qp.get('lens')==='0'")&&main.includes("if(!localPage && !qp.has('lens')) return null"));
ck('tuner describes the local service',tuner.includes('LOCAL DIFFUSION: ON')&&!tuner.includes('Modal rendering'));
ck('loopback transport has no token seam',!main.includes('dtoken')&&!client.includes('searchParams.set(\'token\'')&&!server.includes('LENS_TOKEN'));
ck('game selects surface diffusion instead of camera diffusion',main.includes('surfaceDiffusionStart({')&&!main.includes('sourceCanvas:R3.r3dCanvas()'));
ck('local lens restyles the ten material tiles once',client.includes("mode:'surfaces'")&&client.includes('SURFACE_NAMES')&&client.includes("setState('ready')"));
ck('walking between rooms cannot regenerate material tiles',/setZone\(p\)\{if\(p\)prompt=p;\}/.test(client));
ck('material replacement commits only after a complete batch',client.includes('commitSurfaces(mix)')&&main.includes('r3dCommitSurfaceDream(mix)'));
ck('detail-transfer tuning does not rerun inference',client.includes('setSurfaceMix(mix)')&&main.includes('r3dSetSurfaceDreamMix(mix)'));
ck('hidden tabs release the local device',client.includes("document.addEventListener('visibilitychange'")&&client.includes("old.close(1000, 'page hidden')"));
ck('visible tabs do not evict each other',!server.includes('active_ws')&&!server.includes('service restart'));
ck('one command launches the local service',pkg.scripts['lens:local']==='tools/chunk_surfer/diffusion_server/run-local.sh');

const serverDir=rel('tools/chunk_surfer/diffusion_server');
const launcher=path.join(serverDir,'run-local.sh');
ck('local launcher is executable',(fs.statSync(launcher).mode&0o111)!==0);
ck('cloud deployment wrapper is gone',!fs.existsSync(path.join(serverDir,'modal_app.py')));

const scanned=[
  'public/labs/chunk-surfer/src/net/diffusion.js',
  'public/labs/chunk-surfer/src/net/tuner.js',
  'tools/chunk_surfer/diffusion_server/README.md',
  'tools/chunk_surfer/diffusion_server/server.py',
  'tools/chunk_surfer/diffusion_server/pipeline.py',
  'tools/chunk_surfer/diffusion_server/train_lora.py',
  'tools/chunk_surfer/tests/fps.mjs',
  'tools/chunk_surfer/tests/flicker.mjs',
].map((p)=>fs.readFileSync(rel(p),'utf8')).join('\n');
ck('inference, training, and lens tests contain no Modal endpoint or SDK',!/modal\.run|import modal|modal_app|lens-token|dtoken/i.test(scanned));

const py=path.join(serverDir,'.venv-local/bin/python');
if(fs.existsSync(py)){
  const probe=spawnSync(py,['-c',
    "import json,sys;sys.path.insert(0,'.');import server;print(json.dumps(server.healthz()))"],
    {cwd:serverDir,encoding:'utf8',env:{...process.env,LENS_EAGER:'0'}});
  let health=null;try{health=JSON.parse((probe.stdout||'').trim().split('\n').at(-1));}catch(_){}
  ck('server imports without downloading weights',probe.status===0,probe.stderr?.trim().slice(0,160));
  ck('health contract identifies a cold local service',health?.ok===true&&health?.transport==='loopback'&&health?.ready===false,JSON.stringify(health));
}else ck('local venv exists for server contract',false,py);

if(!pass){console.error('\n❌ LOCAL LENS FAILURES');process.exit(1);}
console.log('\n✅ LOCAL LENS PASSED');
