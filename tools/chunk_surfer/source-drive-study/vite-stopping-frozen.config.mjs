// An inspection server for an exact captured JS/content/owned-asset snapshot.
// It changes no game logic and never reads later edits into the module graph.
import {mergeConfig} from 'vite';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import existing from '../../../vite.config.js';
const repo=resolve(import.meta.dirname,'../../..'),snapshot=resolve(repo,process.env.SOURCE_DRIVE_SNAPSHOT_DIR||'artifacts/source-drive-study/cut/stopping-frozen/sources');
const frozenPath=id=>resolve(snapshot,relative(repo,id.split('?')[0]));
const frozen={name:'frozen-source-drive-inspection',enforce:'pre',
 load(id){const path=frozenPath(id);if(existsSync(path)&&/\.(?:js|mjs|json|css|glsl)$/.test(path))return readFileSync(path,'utf8');},
 transformIndexHtml:{order:'pre',handler(){return readFileSync(resolve(snapshot,'index.html'),'utf8');}},
 configureServer(server){server.middlewares.use((req,res,next)=>{
  const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
  if(pathname.startsWith('/src/')&&existsSync(resolve(snapshot,pathname.slice(1))))res.setHeader('X-Source-Drive-Snapshot','fixed');
  // Imported JSON must pass through Vite's module transform. Ordinary fetches
  // receive the raw captured narrative bytes, like the production host.
  const imported=url.searchParams.has('import')||req.headers['sec-fetch-dest']==='script';
  const allowed=pathname.startsWith('/assets/source-drive/')||(pathname.startsWith('/content/')&&!imported);
  if(!allowed)return next();
  const path=resolve(snapshot,(pathname.startsWith('/assets/')?'public/':'')+pathname.slice(1));
  if(!path.startsWith(snapshot+'/')||!existsSync(path))return next();
  const mime={'.glb':'model/gltf-binary','.json':'application/json','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav'}[extname(path)]||'application/octet-stream';
  res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');res.end(readFileSync(path));
 });}
};
export default mergeConfig(existing,{plugins:[frozen],cacheDir:process.env.SOURCE_DRIVE_FROZEN_CACHE||'node_modules/.vite-source-drive-frozen',server:{host:'127.0.0.1',port:Number(process.env.SOURCE_DRIVE_FROZEN_PORT)||5338,strictPort:true,hmr:false,watch:null}});
