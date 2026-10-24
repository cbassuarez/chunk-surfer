import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve('artifacts/conservatory-rift-study');await mkdir(output,{recursive:true});
const revision=Date.now();
const server=await createServer({server:{host:'127.0.0.1',port:5487,strictPort:true,hmr:false,watch:null},logLevel:'warn',plugins:[{
  name:'conservatory-rift-local-study',transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?riftRevision=${revision}&v=`),
  configureServer(vite){vite.middlewares.use('/__rift-review/',async(req,res)=>{
    const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
    if(req.method!=='POST'||!/^rift-[\w-]+\.(png|json)$/.test(name)){res.statusCode=400;res.end();return;}
    try{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>32*1024*1024)throw Error('Frame too large');chunks.push(chunk);}
      await writeFile(resolve(output,name),Buffer.concat(chunks));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,bytes}));
    }catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.message}));}
  });}
}]});await server.listen();console.log('Rift study: http://127.0.0.1:5487/?skiptut=1&riftStudy=1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
