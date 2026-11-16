// Local production-opening capture surface. No alternate renderer or executor.
import {createServer} from 'vite';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=process.cwd(),port=Number(process.env.OPHANIM_PORT)||5441;
const out=resolve(root,'artifacts/ophanim-opening/2026-11-15');
const before=process.env.OPHANIM_BEFORE==='1';
const rhythmScale=Number(process.env.OPHANIM_RHYTHM_SCALE)||1;
const baselineFiles=new Set(['src/data/opening-prologue.js','src/game/opening-prologue-scene.js','src/game/opening-prologue-direction.js','src/game/conversation.js','src/audio/sam-voice.js','src/game/source-drive/prologue-drive.js','src/game/source-drive/weather.js','src/game/coldopen.js','src/render/r3d.js']);
const server=await createServer({configFile:resolve(root,'vite.config.js'),cacheDir:resolve(root,`node_modules/.vite-ophanim-${port}`),
  plugins:[{name:'ophanim-review',enforce:'pre',async load(id){const path=id.split('?')[0].slice(root.length+1);if(before&&baselineFiles.has(path))return readFile(resolve(out,'before-source',path),'utf8');},
    transform(code,id){if(id.split('?')[0].endsWith('/src/game/opening-road-rhythm.js')&&rhythmScale!==1)return code.replace(/seconds:([\d.]+)/g,(_,n)=>`seconds:${Number(n)*rhythmScale}`);},
    transformIndexHtml(html){return html.replace('</body>','<script type="module" src="/src/dev/ophanim-review.js"></script></body>');},
    configureServer(vite){vite.middlewares.use('/__ophanim-capture',async(req,res)=>{
      try{const name=(req.url||'').slice(1);if(req.method!=='POST'||!/^[-a-z0-9]+\.(json|webm|wav)$/.test(name)){res.statusCode=400;res.end('Invalid capture');return;}
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>200e6)throw Error('Capture too large');chunks.push(chunk);}
        await mkdir(out,{recursive:true});await writeFile(resolve(out,name),Buffer.concat(chunks));res.end(JSON.stringify({name,bytes:size}));
      }catch(error){res.statusCode=500;res.end(String(error));}
    });}}],server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});
await server.listen();console.log(`Ophanim production review: http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1`);
