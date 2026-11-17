import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),out=resolve(root,'artifacts/menu-feedback-live/2026-11-16');
const server=await createServer({configFile:resolve(root,'vite.config.js'),cacheDir:resolve(root,'node_modules/.vite-menu-feedback'),
  plugins:[{name:'menu-feedback-review',transformIndexHtml(html){return html.replace('</body>','<script type="module" src="/src/dev/menu-feedback-review.js"></script></body>');},
    configureServer(vite){vite.middlewares.use('/__menu-feedback',async(req,res)=>{
      try{const name=(req.url||'').slice(1);if(req.method!=='POST'||!/^[-a-z0-9]+\.(png|json|webm)$/.test(name)){res.statusCode=400;res.end('Invalid capture');return;}
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>35e6)throw Error('Capture too large');chunks.push(chunk);}
        await mkdir(out,{recursive:true});await writeFile(resolve(out,name),Buffer.concat(chunks));res.end('Saved '+name);
      }catch(error){res.statusCode=500;res.end(String(error));}
    });}}],server:{host:'127.0.0.1',port:5456,strictPort:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true}});
await server.listen();console.log('Menu feedback production review: http://127.0.0.1:5456/?nodisplaynotice=1&skipwarn=1&nomic=1');
