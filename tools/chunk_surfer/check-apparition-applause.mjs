// Run through the shared compute gate. One test worker, then a code-only Vite
// bundle; source recordings, assets and the native Live sets are not rebuilt.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from 'vite';

const out='artifacts/apparition-applause';
const files=[
  'apparition-applause-audio.spec.mjs','apparition-applause-budget.spec.mjs',
  'apparition-applause-integration.spec.mjs','apparition-applause-protection.spec.mjs',
  'apparition-applause-study.spec.mjs','apparition-applause.spec.mjs',
  'apparition-director.spec.mjs','apparition-shadow-only.spec.mjs',
  'apparition-staging.spec.mjs','emergency-light-runtime.spec.mjs','lighting-rig.spec.mjs',
  'mic-self-audio-contract.test.mjs','recording-hallucination-integration-contract.test.mjs',
  'recording-hallucinations.test.mjs','self-audio-mask.test.mjs',
].map(name=>'test/'+name);
const result=spawnSync(process.execPath,['--test','--test-concurrency=1',...files],{encoding:'utf8'});
const transcript=result.stdout+(result.stderr||'');
fs.writeFileSync(out+'/v3-focused-tests.tap',transcript);
process.stdout.write(transcript);
if(result.status!==0)process.exit(result.status||1);
const pkg=JSON.parse(fs.readFileSync('package.json'));
await build({configFile:false,publicDir:false,logLevel:'warn',base:'./',
  define:{__APP_VERSION__:JSON.stringify(pkg.version)},
  build:{target:'es2020',outDir:'/private/tmp/apparition-applause-v3-audio-clock-code',emptyOutDir:true}});
const count=Number(transcript.match(/^# tests (\d+)/m)?.[1]);
const passed=Number(transcript.match(/^# pass (\d+)/m)?.[1]);
const tracked=[...files,'src/game/apparition-applause.js','src/main.js',
  'src/audio/apparition-applause-audio.js','src/data/apparition-applause-score.js',
  'src/game/apparition-applause-study.js'];
const hashes=Object.fromEntries(tracked.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
fs.writeFileSync(out+'/v3-audio-clock-verification.json',JSON.stringify({
  date:new Date().toISOString(),result:'pass-technical',schedulingVersion:'audio-clock-v1',
  tests:{files:files.length,total:count,passed,failed:0,workers:1,transcript:'v3-focused-tests.tap',
    transcriptSha256:crypto.createHash('sha256').update(transcript).digest('hex')},
  codeBuild:{result:'pass',method:'Vite production code bundle publicDir:false, default index entry',
    limits:['Code bundle only; full public-asset packaging and native release are outside this check.']},
  sourceSnapshot:hashes,freshPlayers:0,humanListeningClaim:false,
},null,2)+'\n');
console.log(JSON.stringify({result:'pass-technical',tests:passed,schedulingVersion:'audio-clock-v1'}));
