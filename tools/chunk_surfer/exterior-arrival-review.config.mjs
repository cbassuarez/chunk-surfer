import {mergeConfig} from 'vite';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import frozen from './source-drive-study/vite-stopping-frozen.config.mjs';

const snapshot=resolve(process.env.SOURCE_DRIVE_SNAPSHOT_DIR||'artifacts/exterior-arrival/frozen/sources');
const packs=new Set(['conservatory-props','opening-street','street-pilot','exterior-frontages','pub-hospitality','source-vehicle-interior','ellery-exterior-roofline','conservatory-main-stair','conservatory-stair-walls','exterior-stationers','stop-listening'].map(n=>`/assets/${n}.glb`));
export default mergeConfig(frozen,{plugins:[{
  name:'frozen-exterior-production-packs',
  configureServer(server){server.middlewares.use((req,res,next)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const path=resolve(snapshot,'public'+pathname);
    if(!packs.has(pathname)||!existsSync(path))return next();
    res.setHeader('Content-Type','model/gltf-binary');
    res.setHeader('X-Exterior-Arrival-Snapshot','fixed');
    res.setHeader('Cache-Control','no-store');res.end(readFileSync(path));
  });},
}],cacheDir:'node_modules/.vite-exterior-arrival-review'});
