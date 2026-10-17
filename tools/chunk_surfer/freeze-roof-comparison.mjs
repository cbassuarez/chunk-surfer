// Immutable, runnable source/asset snapshots for the roof's controlled A/B.
import {access,cp,mkdir,readFile,readdir,writeFile,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,relative} from 'node:path';
import {build} from 'vite';

const root=resolve(import.meta.dirname,'../..');
const condition=process.argv[2];
if(!['baseline','revision'].includes(condition))throw Error('Use baseline or revision');
const out=join(root,'artifacts/roof-floor-design/deep-composition',`frozen-${condition}`);
try{
  await access(join(out,'manifest.json'));
  throw Error(`Frozen ${condition} already exists; preserve it instead of replacing the comparison evidence.`);
}catch(error){if(error.code!=='ENOENT')throw error;}
const source=join(out,'source'),site=join(out,'site');
const baseline=join(root,'artifacts/roof-floor-design/deep-composition/frozen-baseline/source');
const copyFrom=condition==='baseline'?root:baseline;
await mkdir(source,{recursive:true});
for(const name of ['src','content','LEGAL'])await cp(join(copyFrom,name),join(source,name),{recursive:true,preserveTimestamps:true});
if(condition==='baseline')await cp(join(root,'public'),join(source,'public'),{recursive:true,preserveTimestamps:true});
else try{await symlink(join(baseline,'public'),join(source,'public'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
if(condition==='baseline'){
  await mkdir(join(source,'assets'),{recursive:true});
  for(const entry of await readdir(join(root,'assets'),{withFileTypes:true})){
    if(entry.name==='source')continue; // Blender authoring files are not runtime assets.
    await cp(join(root,'assets',entry.name),join(source,'assets',entry.name),{recursive:true,preserveTimestamps:true});
  }
}else try{await symlink(join(baseline,'assets'),join(source,'assets'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
for(const name of ['index.html','fireball-cast.html','window-media.html','source-desktop-surface.html','styles.css','package.json'])
  await cp(join(copyFrom,name),join(source,name),{preserveTimestamps:true});
if(condition==='revision'){
  // Keep concurrent unrelated work out of this experiment. The roof action
  // and exact pane identity are the only permitted runtime differences.
  await cp(join(root,'src/data/academic-roof.js'),join(source,'src/data/academic-roof.js'));
  for(const name of ['src/render/props3d.js','src/render/r3d.js'])await cp(join(root,name),join(source,name));
  const current=await readFile(join(root,'src/main.js'),'utf8');
  let fixed=await readFile(join(source,'src/main.js'),'utf8');
  const start='function sitAtAcademicRoofGlass(id){',end='function leaveYardLookBench(){';
  const block=text=>{const a=text.indexOf(start),b=text.indexOf(end,a);if(a<0||b<0)throw Error('Roof sitting boundary changed');return text.slice(a,b);};
  fixed=fixed.replace(block(fixed),block(current));
  const roofImport=/import \{[^\n]+\} from '\.\/data\/academic-roof\.js';/;
  const nextImport=current.match(roofImport)?.[0];if(!nextImport)throw Error('Roof import missing');
  fixed=fixed.replace(roofImport,nextImport);
  await writeFile(join(source,'src/main.js'),fixed);
}
try{await symlink(join(root,'node_modules'),join(source,'node_modules'),'dir');}catch(error){if(error.code!=='EEXIST')throw error;}
const hashes={};
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);
    if(entry.isDirectory())await walk(path);
    else if(entry.isFile())hashes[relative(source,path)]=createHash('sha256').update(await readFile(path)).digest('hex');
  }
}
for(const name of ['src','content','LEGAL','public','assets'])await walk(join(source,name));
await writeFile(join(out,'manifest.json'),JSON.stringify({condition,createdAt:new Date().toISOString(),hashes},null,2)+'\n');
await build({root:source,configFile:false,base:'./',define:{__APP_VERSION__:JSON.stringify(JSON.parse(await readFile(join(source,'package.json'),'utf8')).version)},
  build:{target:'es2020',copyPublicDir:false,outDir:site,rollupOptions:{input:{
    main:join(source,'index.html'),fireballCast:join(source,'fireball-cast.html'),
    windowMedia:join(source,'window-media.html'),sourceDesktop:join(source,'source-desktop-surface.html'),
  }}}});
console.log(JSON.stringify({condition,site,public:join(source,'public'),files:Object.keys(hashes).length,asset:hashes['public/assets/conservatory-props.glb']}));
