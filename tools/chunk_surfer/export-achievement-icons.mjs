import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ACHIEVEMENT_DEFS} from '../../src/progression/achievement-defs.js';
import {achievementIconKnown,ACHIEVEMENT_ICON_ART_VERSION} from '../../src/render/achievement-icons.js';

// Material PNGs must come from the shipping Canvas renderer. This importer does
// not synthesize a visually similar SVG material or silently keep old line art.
const args=process.argv.slice(2),capture=args.find(arg=>arg.startsWith('--capture='))?.slice(10);
const verifyOnly=args.includes('--verify'),output=resolve(args.find(arg=>!arg.startsWith('--'))||'public/assets/achievements');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;};

async function captureReader(path){
 if(!path.toLowerCase().endsWith('.zip'))return name=>readFile(resolve(path,name));
 const bytes=await readFile(path),entries=new Map();let offset=0;
 while(offset+4<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
  if(offset+30>bytes.length)throw Error('Truncated icon capture ZIP');
  const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8),crc=bytes.readUInt32LE(offset+14),size=bytes.readUInt32LE(offset+18),nameLength=bytes.readUInt16LE(offset+26),extraLength=bytes.readUInt16LE(offset+28);
  if(method!==0||(flags&8))throw Error('Use the unmodified ZIP downloaded by the production icon-export page');
  const start=offset+30+nameLength+extraLength,end=start+size;
  if(end>bytes.length)throw Error('Truncated icon capture entry');
  const name=bytes.subarray(offset+30,offset+30+nameLength).toString('utf8');
  if(!/^[a-z0-9_.-]+$/i.test(name)||entries.has(name))throw Error('Unexpected or duplicate ZIP entry: '+name);
  const data=bytes.subarray(start,end);if(crc32(data)!==crc)throw Error('Damaged icon capture: '+name);
  entries.set(name,data);offset=end;
 }
 if(!entries.has('manifest.json'))throw Error('The ZIP is not a production annunciator icon capture');
 return async name=>{if(!entries.has(name))throw Error('Missing icon capture file: '+name);return entries.get(name);};
}

if(!capture&&!verifyOnly)throw Error('Bake exact production materials at /artifacts/achievement-system-production/icon-export.html, then run node tools/chunk_surfer/export-achievement-icons.mjs --capture=/path/to/ellery-achievement-resin-icons.zip . Use --verify to check an already imported pack.');
const read=await captureReader(capture?resolve(capture):output);
const manifest=JSON.parse(await read('manifest.json'));
if(manifest.kind!=='chunk-surfer-original-achievement-icons'||manifest.version!==3||manifest.artVersion!==ACHIEVEMENT_ICON_ART_VERSION||manifest.renderer?.kind!=='actual-achievement-resin-canvas'||manifest.count!==ACHIEVEMENT_DEFS.length)throw Error('Expected the current 38-icon semantic resin Canvas bake');
if(!Array.isArray(manifest.records)||manifest.records.length!==ACHIEVEMENT_DEFS.length||new Set(manifest.records.map(row=>row.id)).size!==ACHIEVEMENT_DEFS.length)throw Error('Invalid icon catalogue mapping');
for(const path of['src/render/achievement-deck.js','src/render/achievement-icons.js','src/render/hardware-material.js','src/render/instrument-material.js','src/progression/achievement-defs.js','src/render/achievement-resin.js','src/data/achievement-presentation.js','public/assets/fonts/NimbusSans-Regular.otf','public/assets/fonts/NimbusSans-Bold.otf','public/assets/fonts/NimbusMonoPS-Regular.otf']){
 if(manifest.sourceHashes?.[path]!==hash(await readFile(resolve(path))))throw Error('Production source changed since the icon bake: '+path+'. Bake again after the implementation is finished.');
}
const writes=[],achieved=new Set(),sealed=new Set(),sealedMasks=new Set(),sealedByCategory=new Map();let pngBytes=0;
for(const def of ACHIEVEMENT_DEFS){
 if(!achievementIconKnown(def.icon||def.id))throw Error('Missing solid master: '+def.id);
 const row=manifest.records.find(row=>row.id===def.id);
 if(!row||row.name!==def.name||row.icon!==(def.icon||def.id)||row.hidden!==!!def.hidden||row.category!==def.category)throw Error('Stale icon metadata: '+def.id);
 for(const unlocked of[false,true]){
  const state=unlocked?'unlocked':'locked',files=row.files?.[state],stem=def.id.toLowerCase()+'-'+state;
  if(files?.svg!==stem+'.svg')throw Error('Unexpected neutral master filename: '+def.id);
  const svg=await read(files.svg);if(!svg.toString().includes('viewBox="0 0 64 64"'))throw Error('Invalid neutral vector master: '+files.svg);
  if(!unlocked&&def.hidden)sealedMasks.add(hash(svg));
  writes.push([files.svg,svg]);
  for(const size of[256,64]){
   const file=files[size],name=stem+'-'+size+'.png';
   if(file?.path!==name)throw Error('Unexpected PNG filename: '+def.id);
   const bytes=await read(name),meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();
   if(meta.width!==size||meta.height!==size||meta.format!=='png'||!stats.isOpaque||bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error('Invalid or damaged production PNG: '+name);
   if(unlocked&&size===256)achieved.add(file.sha256);
   if(!unlocked&&def.hidden&&size===256){sealed.add(file.sha256);if(!sealedByCategory.has(def.category))sealedByCategory.set(def.category,new Set());sealedByCategory.get(def.category).add(file.sha256);}
   pngBytes+=bytes.length;writes.push([name,bytes]);
  }
 }
}
if(achieved.size!==ACHIEVEMENT_DEFS.length)throw Error('Two achieved icons have identical material art; check the original semantic masters');
if(sealedMasks.size!==1)throw Error('Hidden unachieved subjects must share one anonymous cover geometry');
if([...sealedByCategory.values()].some(hashes=>hashes.size!==1)||sealed.size!==sealedByCategory.size)throw Error('Hidden cover color must follow its canonical category without exposing subject artwork');
if(!verifyOnly){
 await mkdir(output,{recursive:true});
 for(const[name,bytes]of writes)await writeFile(resolve(output,name),bytes);
 await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
console.log(JSON.stringify({action:verifyOnly?'verified':'imported',output,count:manifest.count,pngCount:manifest.count*4,pngBytes,uniqueAchieved:achieved.size,anonymousHiddenCoverGeometry:sealedMasks.size,hiddenCoverCategoryVariants:sealed.size,renderer:manifest.renderer.kind,steamVerified:false}));

