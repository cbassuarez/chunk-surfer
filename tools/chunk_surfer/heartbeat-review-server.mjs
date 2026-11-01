import {createServer} from 'vite';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const output=resolve('artifacts/heartbeat-study/in-game');
await mkdir(output,{recursive:true});
const port=Number(process.env.HEARTBEAT_REVIEW_PORT)||5498,revision=Date.now(),maximumBytes=80*1024*1024;
const required=['src/main.js','src/audio/fear.js','src/audio/standing-tear-dsp.js',
  'src/data/heartbeat-audio-assets.js','src/game/fear-overlay.js','src/game/fear-pressure.js','src/game/source-sensory.js',
  'src/dev/heartbeat-review.js','tools/chunk_surfer/heartbeat-review-server.mjs',
  'tools/chunk_surfer/prepare-heartbeat-audio.py','third_party/licenses/HEARTBEAT-AUDIO.md'];
async function manifest(){
  const engine=(await readdir(resolve('src/audio'))).filter(name=>/^heartbeat.*\.js$/.test(name)).map(name=>'src/audio/'+name);
  const assets=(await readdir(resolve('public/audio/heartbeat'))).filter(name=>/\.(wav|json)$/.test(name)).map(name=>'public/audio/heartbeat/'+name);
  if(!engine.length||!assets.some(name=>name.endsWith('.wav')))throw Error('The production heartbeat engine and bank must exist before capture.');
  const tracked=[...new Set([...required,...engine,...assets])].sort();
  return{kind:'heartbeat-review-source-manifest',version:1,revision,generatedAt:new Date().toISOString(),
    runtime:'current-local-game-browser-or-native-dev-host',
    files:Object.fromEntries(await Promise.all(tracked.map(async name=>[name,createHash('sha256').update(await readFile(resolve(name))).digest('hex')])))};
}
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null},logLevel:'warn',plugins:[{
  name:'heartbeat-gameplay-review',
  transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?heartbeatReviewRevision=${revision}&v=`),
  configureServer(vite){
    vite.middlewares.use('/__heartbeat-review/',async(req,res)=>{
      const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
      try{
        if(req.method==='GET'&&name==='manifest'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await manifest()));return;}
        if(req.method!=='POST'||!/^heartbeat-[\w-]+\.(webm|mp4|wav|json|png)$/.test(name)){
          res.statusCode=400;res.end('Only explicitly named local heartbeat review artifacts are accepted.');return;
        }
        if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`){res.statusCode=403;res.end('Review writes must originate in this local game.');return;}
        if(Number(req.headers['content-length'])>maximumBytes){res.statusCode=413;res.end('Review artifact exceeds80MiB.');return;}
        const chunks=[];let bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>maximumBytes)throw Error('Review artifact exceeds80MiB.');chunks.push(chunk);}
        await writeFile(resolve(output,name),Buffer.concat(chunks));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,bytes}));
      }catch(error){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
    });
  },
}]});
await server.listen();
console.log(`Heartbeat review http://127.0.0.1:${port}/?skiptut=1&heartbeatReview=1`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
