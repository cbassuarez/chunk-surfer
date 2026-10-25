import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve('artifacts/standing-tear');await mkdir(output,{recursive:true});
const revision=Date.now();
const server=await createServer({server:{host:'127.0.0.1',port:5487,strictPort:true,hmr:false,watch:null},logLevel:'warn',plugins:[{
  name:'standing-tear-local-review',transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?tearRevision=${revision}&v=`),
  configureServer(vite){vite.middlewares.use('/__tear-review/',async(req,res)=>{
    const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
    if(req.method!=='POST'||!/^tear-[\w-]+\.(png|json|webm)$/.test(name)){res.statusCode=400;res.end();return;}
    try{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>64*1024*1024)throw Error('Review file too large');chunks.push(chunk);}
      await writeFile(resolve(output,name),Buffer.concat(chunks));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,bytes}));
    }catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
  });}
}]});await server.listen();console.log('Standing Tear review http://127.0.0.1:5487/?skiptut=1&tearReview=1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
