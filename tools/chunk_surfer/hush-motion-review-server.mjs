import {createServer} from 'vite';
import {mkdir,readFile,readdir,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

const output=resolve('artifacts/hush-motion-study/in-game');
await mkdir(output,{recursive:true});
const port=Number(process.env.HUSH_MOTION_REVIEW_PORT)||5502,revision=Date.now(),maximumBytes=80*1024*1024;
const required=['src/game/hush-density-performance.js','public/assets/hush-density.glb','src/main.js','src/game/presence.js','src/game/pressure-gait.js','src/game/pressure-performance.js','src/game/source-hush-follow.js','src/game/source-continuation-hush.js','src/render/pressure-volume.js','src/render/character-asset.js','src/dev/hush-motion-review.js','public/assets/pressure-character.glb','src/render/r3d.js','artifacts/hush-motion-study/traction-performance.js','artifacts/hush-motion-study/fixtures.json','artifacts/hush-motion-study/rig/pressure-character-neck-study.glb'];
required.push('src/data/source-continuation-void.js','src/game/source-continuation-void.js','src/game/source-continuation-physics.js','src/game/source-continuation.js','src/game/source-continuation-portals.js','src/render/source-continuation-void.js','src/render/source-continuation-renderer.js','src/render/source-mesh-portals.js','src/data/van-brand-art.js','src/data/van-brand.js','src/render/van-brand.js','public/assets/van-brand.glb');
async function manifest(){return{kind:'hush-motion-source-manifest',revision,generatedAt:new Date().toISOString(),files:Object.fromEntries(await Promise.all(required.map(async name=>[name,createHash('sha256').update(await readFile(resolve(name))).digest('hex')])))};}
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null},logLevel:'warn',plugins:[{
  name:'hushMotion-gameplay-review',
  transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?hushMotionReviewRevision=${revision}&v=`),
  configureServer(vite){
    vite.middlewares.use('/__hushMotion-review/',async(req,res)=>{
      const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
      try{
        if(req.method==='GET'&&name==='manifest'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await manifest()));return;}
        if(req.method!=='POST'||!/^hushMotion-[\w-]+\.(webm|mp4|wav|json|png)$/.test(name)){
          res.statusCode=400;res.end('Only explicitly named local hushMotion review artifacts are accepted.');return;
        }
        if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`){res.statusCode=403;res.end('Review writes must originate in this local game.');return;}
        if(Number(req.headers['content-length'])>maximumBytes){res.statusCode=413;res.end('Review artifact exceeds80MiB.');return;}
        const chunks=[];let bytes=0;
        for await(const chunk of req){bytes+=chunk.length;if(bytes>maximumBytes)throw Error('Review artifact exceeds80MiB.');chunks.push(chunk);}
        const partial=resolve(output,name+'.part');await writeFile(partial,Buffer.concat(chunks));await rename(partial,resolve(output,name));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,bytes}));
      }catch(error){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
    });
  },
}]});
await server.listen();
console.log(`HUSH motion review http://127.0.0.1:${port}/?skiptut=1&hushMotionReview=1`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
