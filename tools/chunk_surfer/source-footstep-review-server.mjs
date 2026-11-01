import {createServer} from 'vite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const output=resolve('artifacts/footstep-study/in-game');
await mkdir(output,{recursive:true});
const port=Number(process.env.FOOTSTEP_REVIEW_PORT)||5497,revision=Date.now();
const tracked=['src/main.js','src/audio/foot-contact.js','src/audio/source-footing-treatment.js','src/audio/footsteps.js','src/audio/roomtone.js',
  'src/dev/source-footstep-review.js','src/dev/source-footstep-host.js','public/audio/footsteps/manifest.json'];
const manifest=async()=>({kind:'source-footstep-review-source-manifest',revision,
  generatedAt:new Date().toISOString(),runtime:'local-game-browser-or-native-dev-host',
  files:Object.fromEntries(await Promise.all(tracked.map(async name=>[name,createHash('sha256').update(await readFile(resolve(name))).digest('hex')])))});
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null},logLevel:'warn',plugins:[{
  name:'source-footstep-gameplay-review',
  transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?sourceFootstepRevision=${revision}&v=`),
  configureServer(vite){
    vite.middlewares.use('/__source-footsteps/',async(req,res)=>{
      const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
      try{
        if(req.method==='GET'&&name==='manifest'){
          res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await manifest()));return;
        }
        if(req.method!=='POST'||!/^footsteps-[\w-]+\.(webm|mp4|wav|json|png)$/.test(name)){
          res.statusCode=400;res.end('Only explicitly named local review artifacts are accepted.');return;
        }
        const chunks=[];let bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>96*1024*1024)throw Error('Review artifact exceeds96MiB.');chunks.push(chunk);}
        await writeFile(resolve(output,name),Buffer.concat(chunks));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,bytes}));
      }catch(error){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
    });
  },
}]});
await server.listen();
console.log(`Source footstep review http://127.0.0.1:${port}/?skiptut=1&sourceFootstepReview=1`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
