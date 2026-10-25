import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,sep} from 'node:path';
import {sourceFamilyReviewHook} from './source-family-review-hook.mjs';
const root=process.cwd(),baseline=process.argv.includes('--baseline'),port=baseline?5490:5491;
const base=resolve('artifacts/source-family-audit-2026-10-25'),output=resolve(base,baseline?'before':'after');await mkdir(output,{recursive:true});
const revision=Date.now();
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null,forwardConsole:false},logLevel:'warn',plugins:[{
  name:'source-family-evidence',enforce:'pre',
  async load(id){
    if(!baseline)return null;
    const path=id.split('?')[0],rel=relative(root,path);
    if(!rel.startsWith('src'+sep)&&!rel.startsWith('content'+sep))return null;
    try{return await readFile(resolve(base,'baseline-source',rel),'utf8');}catch{return null;}
  },
  transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?familyRevision=${revision}&v=`),
  transform(code,id){if(id.split('?')[0]!==resolve('src/main.js'))return null;return code.replace('  installProbe();','  installProbe();\n'+sourceFamilyReviewHook);},
  configureServer(vite){vite.middlewares.use('/__source-family/',async(req,res)=>{
    const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
    if(req.method!=='POST'||!/^family-[a-z0-9][a-z0-9-]*\.(png|json|webm)$/.test(name)){res.statusCode=400;res.end();return;}
    try{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>96*1024*1024)throw Error('Capture too large');chunks.push(chunk);}
      await writeFile(resolve(output,name),Buffer.concat(chunks));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,bytes}));
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:String(error.message)}));}
  });},
}]});await server.listen();console.log(`Source family ${baseline?'baseline':'final'} http://127.0.0.1:${port}/?skiptut=1&familyReview=1&sourceTrace=1`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
