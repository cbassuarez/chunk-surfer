import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve('artifacts/source-continuation-depth');await mkdir(output,{recursive:true});
const revision=Date.now();
const server=await createServer({server:{host:'127.0.0.1',port:5467,strictPort:true,hmr:false,watch:null,forwardConsole:false},logLevel:'warn',plugins:[{name:'local-source-review-capture',transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?sourceDepth=${revision}&v=`),configureServer(vite){vite.middlewares.use('/__source-review/',async(req,res)=>{
  if(req.method!=='POST'){res.statusCode=405;res.end();return;}
  const name=(req.url||'').split('?')[0].replace(/^\/+/, '');if(!/^source-route-[\w-]+\.(webm|json)$/.test(name)){res.statusCode=400;res.end();return;}
  try{const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>128*1024*1024)throw Error('Capture too large');chunks.push(chunk);}await writeFile(resolve(output,name),Buffer.concat(chunks));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({path:resolve(output,name),bytes}));}catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
});}}]});await server.listen();console.log('Source review: http://127.0.0.1:5467/?skiptut=1&sourceTrace=1&sourceReview=1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
