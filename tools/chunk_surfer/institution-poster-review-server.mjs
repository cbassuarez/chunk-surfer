import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const output=resolve('artifacts/institution-posters');await mkdir(output,{recursive:true});
const revision=Date.now();
const server=await createServer({
  server:{host:'127.0.0.1',port:5489,strictPort:true,hmr:false,watch:null},logLevel:'warn',
  plugins:[{
    name:'institution-poster-local-review',
    transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?institutionPosterRevision=${revision}&v=`),
    configureServer(vite){vite.middlewares.use('/__institution-poster-review/',async(req,res)=>{
      const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
      if(req.method!=='POST'||!/^poster-[a-z0-9][a-z0-9-]*\.(png|json)$/.test(name)||name.length>180){
        res.statusCode=400;res.end();return;
      }
      try{
        const chunks=[];let bytes=0;
        for await(const chunk of req){
          bytes+=chunk.length;if(bytes>32*1024*1024)throw Error('Review file too large');chunks.push(chunk);
        }
        await writeFile(resolve(output,name),Buffer.concat(chunks));
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,bytes}));
      }catch(error){
        res.statusCode=500;res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({error:error.message}));
      }
    });},
  }],
});
await server.listen();console.log('Institution posters review http://127.0.0.1:5489/?skiptut=1&posterReview=1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
