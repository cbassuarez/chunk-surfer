// Task-local staging for inspecting the production renderer. Fixtures do not
// constitute a progression walkthrough; the guided review uses public keys.
import {createServer} from 'vite';
import {resolve} from 'node:path';
import {sourceFamilyReviewHook} from './source-family-review-hook.mjs';

const original="if(id==='catch'||id==='catch-exit')Object.assign(entry.checkpoint,{phase:'catch',x:-16,z:-1,feet:3,level:0,lastSafe:{x:-16,z:-1,feet:3,level:0,yaw:0,pitch:0}});";
const stage=`if(id==='catch'||id==='catch-exit'){
  const data=await import('./data/source-continuation-archipelago.js');
  const selected=new URLSearchParams(location.search).get('reviewIsland');
  const at=data.ARCHIPELAGO_ISLANDS.find(p=>p.id===selected)||data.ARCHIPELAGO_MAIN_ROUTE[0];
  Object.assign(entry.checkpoint,{...at,phase:'catch',yaw:0,pitch:-.07,status:'active',elapsed:.1,lastSafe:{...at,phase:'catch',yaw:0,pitch:0}});
  entry.checkpoint.hush.active=false;
}`;
if(!sourceFamilyReviewHook.includes(original))throw Error('Review hook changed; update the explicit staging seam.');
const hook=sourceFamilyReviewHook.replace(original,stage);
const server=await createServer({server:{host:'127.0.0.1',port:5476,strictPort:true,hmr:false,watch:null},logLevel:'warn',plugins:[{
  name:'source-map-review',enforce:'pre',
  transform(code,id){if(id.split('?')[0]!==resolve('src/main.js'))return null;return code.replace('  installProbe();','  installProbe();\n'+hook);},
}]});
await server.listen();console.log('Source map review: http://127.0.0.1:5476/?skiptut=1&familyReview=1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
