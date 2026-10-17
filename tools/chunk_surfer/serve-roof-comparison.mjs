// Local, opaque-label formative comparison. No game source or save is changed.
// Each immutable build has its own origin so absolute /assets requests cannot
// cross into the other condition. Only an issued trial URL gets the QA fixture.
import {createServer} from 'node:http';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve,join,extname,sep} from 'node:path';
import {createHash,randomBytes,randomInt} from 'node:crypto';

const root=resolve(import.meta.dirname,'../..');
const out=resolve(root,'artifacts/roof-floor-design/deep-composition');
const launcherPort=Number(process.env.ROOF_COMPARE_PORT||5400);
const host='127.0.0.1';
const builds=[
  {key:'baseline',site:resolve(process.env.ROOF_COMPARE_BASELINE_SITE||join(out,'frozen-baseline/site')),public:resolve(process.env.ROOF_COMPARE_BASELINE_PUBLIC||join(out,'frozen-baseline/source/public'))},
  {key:'revision',site:resolve(process.env.ROOF_COMPARE_REVISION_SITE||join(out,'frozen-revision/site')),public:resolve(process.env.ROOF_COMPARE_REVISION_PUBLIC||join(out,'frozen-revision/source/public'))},
];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.pdf':'application/pdf','.wav':'audio/wav','.mp3':'audio/mpeg','.ogg':'audio/ogg','.webm':'video/webm','.mp4':'video/mp4','.wasm':'application/wasm','.txt':'text/plain; charset=utf-8'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeJson=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const tokens=new Map();
const sessionCards=[];
const servers=[];
let assignments=0;
// Four visits in each order, shuffled once. First-exposure groups are balanced.
const block=[0,0,0,0,1,1,1,1];
for(let i=block.length-1;i>0;i--){const j=randomInt(i+1);[block[i],block[j]]=[block[j],block[i]];}
// The condition behind each port is independently randomized at server start.
if(randomInt(2))builds.reverse();
builds.forEach((build,i)=>{build.port=launcherPort+i+1;build.origin=`http://${host}:${build.port}`;build.sourceAssets=resolve(build.public,'../assets');});

async function preflight(){
  const report={status:'ready-for-local-formative-comparison',humanAcceptance:'pending',createdAt:new Date().toISOString(),launcher:`http://${host}:${launcherPort}`,builds:[]};
  for(const build of builds){
    const index=await readFile(join(build.site,'index.html')).catch(()=>null);
    const glb=await readFile(join(build.public,'assets/conservatory-props.glb')).catch(()=>null);
    if(!index||!glb)throw Error(`Missing immutable ${build.key} build or GLB. Expected ${join(build.site,'index.html')} and ${join(build.public,'assets/conservatory-props.glb')}. Freeze/build it first; no application-code fallback is allowed.`);
    const entry=index.toString().match(/<script[^>]+src=["']([^"']+)["']/i)?.[1];
    if(!entry||/^[a-z]+:/i.test(entry))throw Error(`Immutable ${build.key} index has no local built entry script.`);
    const entryPath=new URL(entry,'http://frozen.invalid/').pathname;
    const entryFile=await existingFile(build.site,entryPath);
    if(!entryFile)throw Error(`Immutable ${build.key} entry script is missing: ${entryPath}`);
    for(const directory of ['fonts','paper']){const info=await stat(join(build.sourceAssets,directory)).catch(()=>null);if(!info?.isDirectory())throw Error(`Immutable ${build.key} runtime assets missing: ${join(build.sourceAssets,directory)}`);}
    report.builds.push({key:build.key,origin:build.origin,site:build.site,public:build.public,sourceAssets:build.sourceAssets,indexSha256:sha(index),entryScript:entryPath,entrySha256:sha(await readFile(entryFile)),glbSha256:sha(glb)});
  }
  return report;
}
function send(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));
}
async function bodyJson(req){
  let bytes=0,raw='',oversized=false;for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)oversized=true;if(!oversized)raw+=chunk;}
  if(oversized)throw Error('Request too large');
  return JSON.parse(raw||'{}');
}
function localRequest(req){
  const hostname=String(req.headers.host||'').split(':')[0];
  return hostname===host||hostname==='localhost';
}
function safePath(base,path){
  const full=resolve(base,`.${path}`);
  return full===base||full.startsWith(base+sep)?full:null;
}
async function existingFile(base,path){
  const file=safePath(base,path);if(!file)return null;
  const info=await stat(file).catch(()=>null);return info?.isFile()?file:null;
}
async function updateKey(report){
  await writeFile(join(out,'comparison-operator-key.json'),JSON.stringify({...report,assignmentBlock:block.map(v=>v?'M then L':'L then M'),sessions:sessionCards},null,2)+'\n');
}
function issueSession(participant){
  const first=block[assignments++%block.length];
  const id=randomBytes(12).toString('hex');
  const visitIndexes=[first,1-first];
  const visits=visitIndexes.map((buildIndex,order)=>{
    const token=randomBytes(20).toString('hex');const build=builds[buildIndex];
    const config={sessionId:id,participant,visit:buildIndex?'M':'L',order:order+1,launcherOrigin:`http://${host}:${launcherPort}`,weatherSeed:44812};
    tokens.set(token,{buildIndex,config});
    return{label:`Visit ${config.visit}`,order:order+1,url:`${build.origin}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&roofTrial=${token}`};
  });
  sessionCards.push({sessionId:id,participant,order:visits.map(v=>v.label),builds:visitIndexes.map(i=>builds[i].key)});
  return{sessionId:id,participant,visits,humanAcceptance:'pending',protocol:'/human-comparison-protocol.json'};
}
async function launcher(req,res,url,report){
  if(url.pathname==='/api/ready')return send(res,200,{ready:true,humanAcceptance:'pending',conditions:2});
  if(url.pathname==='/api/session'&&req.method==='POST'){
    const origin=req.headers.origin;
    if(origin&&origin!==`http://${host}:${launcherPort}`)return send(res,403,{error:'Local launcher origin required'});
    let input;try{input=await bodyJson(req);}catch{return send(res,400,{error:'Invalid or oversized JSON request.'});}
    const participant=String(input?.participant||'').trim();
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(participant))return send(res,400,{error:'Use an anonymous ID of 1 to 32 letters, digits, hyphens or underscores.'});
    const result=issueSession(participant);await updateKey(report);return send(res,200,result);
  }
  const files={'/':'comparison-launcher.html','/human-comparison-protocol.json':'human-comparison-protocol.json'};
  if(files[url.pathname])return send(res,200,await readFile(join(out,files[url.pathname])),mime[extname(files[url.pathname])]);
  return send(res,404,{error:'Not found'});
}
async function game(req,res,url,build,buildIndex){
  if(url.pathname==='/__roof_trial__.js')return send(res,200,await readFile(join(out,'comparison-trial.js')),mime['.js']);
  let path;try{path=decodeURIComponent(url.pathname);}catch{return send(res,400,{error:'Malformed path'});}
  if(path.includes('\0')||path.includes('\\'))return send(res,400,{error:'Invalid path'});
  if(path==='/')path='/index.html';
  // Built JS/CSS belongs to this immutable site. Source-root runtime assets
  // such as fonts and paper are frozen separately from public. Nothing falls
  // back to the live workspace; incomplete snapshots fail instead of mixing.
  const frozenAsset=path==='/assets/conservatory-props.glb'?await existingFile(build.public,path):null;
  const sourceAsset=path.startsWith('/assets/')&&!path.startsWith('/assets/source/')?await existingFile(build.sourceAssets,path.slice('/assets'.length)):null;
  const file=frozenAsset||await existingFile(build.site,path)||await existingFile(build.public,path)||sourceAsset;
  if(!file)return send(res,404,{error:'Missing static file'});
  let bytes=await readFile(file);
  if(path==='/index.html'){
    const trial=tokens.get(url.searchParams.get('roofTrial'));
    if(trial?.buildIndex===buildIndex){
      const prelude=`<script>window.__ROOF_TRIAL_CONFIG__=${safeJson(trial.config)};for(const key of Object.keys(localStorage)){if(key.startsWith('chunk-surfer:'))localStorage.removeItem(key);}</script><script src="/__roof_trial__.js"></script>`;
      bytes=Buffer.from(bytes.toString().replace(/<head(?:\s[^>]*)?>/i,head=>head+prelude));
    }
  }
  return send(res,200,bytes,mime[extname(file)]||'application/octet-stream');
}

try{
  if(!Number.isInteger(launcherPort)||launcherPort<1024||launcherPort>65532)throw Error('ROOF_COMPARE_PORT must be an integer from 1024 to 65532.');
  const report=await preflight();
  if(process.argv.includes('--check')){console.log(JSON.stringify(report,null,2));process.exit(0);}
  await updateKey(report);
  for(let i=-1;i<builds.length;i++){
    const port=i<0?launcherPort:builds[i].port;
    const server=createServer(async(req,res)=>{
      try{if(!localRequest(req))return send(res,403,{error:'Loopback host required'});
        const url=new URL(req.url,`http://${host}:${port}`);
        if(!['GET','HEAD','POST'].includes(req.method))return send(res,405,{error:'Method not allowed'});
        if(i<0)await launcher(req,res,url,report);else await game(req,res,url,builds[i],i);
      }catch(error){send(res,500,{error:error.message});}
    });
    servers.push(server);await new Promise((done,fail)=>{server.once('error',fail);server.listen(port,host,done);});
  }
  console.log(`Roof comparison: http://${host}:${launcherPort}`);
  console.log('Use a throwaway browser profile. Local test origins reset their game save/profile keys at trial load; normal game origins are untouched.');
  console.log('Fixture preparation only: testRun, tutorial skip, one accepted take, school master key, gallery placement, seeded night. After Start: ordinary controls; telemetry is read-only.');
  console.log('No unfamiliar-human results exist yet. Operator key stays in comparison-operator-key.json; do not show it to participants or response coders.');
  const close=()=>{for(const server of servers)server.close();process.exit(0);};
  process.once('SIGINT',close);process.once('SIGTERM',close);
}catch(error){for(const server of servers)server.close();console.error(error.message);process.exitCode=1;}
