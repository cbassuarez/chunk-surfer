// CPU-only comparison against the saved pre-change modules; no source rewrites.
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=process.cwd(),before=resolve(root,'artifacts/ophanim-opening/2026-11-15/before-source');
export async function load(url,context,next){
  if(url.startsWith('file:')){const path=fileURLToPath(url);if(path.startsWith(root+'/src/')){
    try{return{format:'module',source:await readFile(resolve(before,path.slice(root.length+1)),'utf8'),shortCircuit:true};}catch(error){if(error.code!=='ENOENT')throw error;}
  }}return next(url,context);
}
