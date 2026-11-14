// Package the approved transparent Transit as the application identity.
// The original ear remains a separate, byte-preserved alternate.
import {copyFileSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {VAN_ICON_LAUNCH} from '../tools/app-icon/motion.mjs';
import {packageStartupVanAssets} from './build-startup-van-assets.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const artwork=join(root,'assets/brand/app-icon-van.png');
const canonical=join(root,'assets/brand/app-icon-van.icns');
const ear=join(root,'assets/brand/app-icon-cutout.icns');
const dock=join(root,'src-tauri/macos/DockTile');
const launch=JSON.parse(readFileSync(join(root,'assets/brand/app-icon-van-launch.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const[path,expected]of Object.entries(launch.inputs||{}))if(sha(readFileSync(join(root,path)))!==expected)throw Error(`Van render source changed: ${path}. Export artwork again before packaging.`);
if(sha(readFileSync(artwork))!==launch.master.sha256)throw Error('Van master does not match its rendered source manifest.');
for(const key of['frameCount','cell','columns','rows','durationSeconds'])if(launch[key]!==VAN_ICON_LAUNCH[key])throw Error(`Unexpected native launch atlas ${key}.`);
const atlas=readFileSync(join(root,launch.atlas.path));
if(sha(atlas)!==launch.atlas.sha256)throw Error('Van launch atlas differs from its rendered source manifest.');
const atlasInfo=await sharp(atlas).metadata();
if(atlasInfo.width!==launch.columns*launch.cell||atlasInfo.height!==launch.rows*launch.cell||!atlasInfo.hasAlpha)throw Error('Invalid launch atlas dimensions or alpha.');

const original=readFileSync(artwork),earBefore=sha(readFileSync(ear));
// The exact source lamp faces are projected by the renderer. Color segmentation
// would confuse the new Union Flag's red paint with a powered tail lamp.
const lamps=launch.lampCentres||[];
if(lamps.length!==2||lamps.some(l=>!Number.isFinite(l.x)||!Number.isFinite(l.y)||l.x<=0||l.x>=1||l.y<=0||l.y>=1))throw Error('The master must supply two projected rear-lamp centres.');
const cache=new Map();
async function raster(size){
 if(cache.has(size))return cache.get(size);
 const source=launch.rasters?.[size];
 if(!source||source.width!==size||source.height!==size||!source.renderedAtOutputResolution)throw Error(`Missing actual ${size}px acquisition render. Export all icon sizes before packaging.`);
 const bytes=readFileSync(join(root,source.path));if(sha(bytes)!==source.sha256)throw Error(`Rendered ${size}px icon changed after export.`);
 const {data,info:small}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 if(small.width!==size||small.height!==size)throw Error(`Incorrect actual ${size}px acquisition dimensions.`);
 if(size<=32)for(let p=0;p<data.length;p+=4)if(data[p+3]<8){data[p]=0;data[p+1]=0;data[p+2]=0;data[p+3]=0;}
 if(size<=32)for(const lamp of lamps){const x=Math.min(size-1,Math.max(0,Math.floor(lamp.x*size))),y=Math.min(size-1,Math.max(0,Math.floor(lamp.y*size)));
  for(let dy=0;dy<(size>=24?2:1);dy++){const yy=Math.min(size-1,y+dy),p=(yy*size+x)*4;if(data[p+3]<24)continue;data[p]=210;data[p+1]=43;data[p+2]=27;data[p+3]=Math.max(224,data[p+3]);}}
 const png=await sharp(data,{raw:{width:small.width,height:small.height,channels:4}}).png().toBuffer();cache.set(size,png);return png;
}
const temporary=mkdtempSync(join(tmpdir(),'chunk-surfer-icons-'));
try{
 const set=join(temporary,'van.iconset');mkdirSync(set);
 for(const base of[16,32,128,256,512])for(const retina of[false,true])writeFileSync(join(set,`icon_${base}x${base}${retina?'@2x':''}.png`),await raster(base*(retina?2:1)));
 execFileSync('iconutil',['-c','icns',set,'-o',canonical]);
 for(const [destination,size]of[['32x32.png',32],['64x64.png',64],['128x128.png',128],['128x128@2x.png',256],['icon.png',512]])writeFileSync(join(root,'src-tauri/icons',destination),await raster(size));
 // Windows installer/Store representations use the same desktop identity.
 for(const file of readdirSync(join(root,'src-tauri/icons'))){if(!file.endsWith('.png')||file==='icon.png'||/^\d+x\d+/.test(file))continue;
  const path=join(root,'src-tauri/icons',file),m=await sharp(path).metadata();if(m.width===m.height)writeFileSync(path,await raster(m.width));}
 copyFileSync(canonical,join(root,'src-tauri/icons/icon.icns'));
 copyFileSync(canonical,join(dock,'DockTile.icns'));
 copyFileSync(ear,join(dock,'Ear.icns'));
 writeFileSync(join(dock,'VanLaunch.png'),atlas);
 writeFileSync(join(dock,'VanLaunch.inc'),[
  '// Generated from assets/brand/app-icon-van-launch.json. Do not edit.',
  `static const NSUInteger CSVLaunchFrameCount = ${launch.frameCount};`,
  `static const NSUInteger CSVLaunchCellSize = ${launch.cell};`,
  `static const NSUInteger CSVLaunchColumns = ${launch.columns};`,
  `static const NSUInteger CSVLaunchRows = ${launch.rows};`,
  `static const NSTimeInterval CSVLaunchDuration = ${launch.durationSeconds.toFixed(1)};`,'',
 ].join('\n'));
 // The native atlas is not an app loader asset. Keep the optional widget's
 // independently budgeted128px recording, never copy the heavy Dock image.
 const startup=await packageStartupVanAssets({root,required:false,fallbackPoster:await raster(128)});
 const layers=[];for(const size of[32,16,24,48,64,256])layers.push({size,png:await raster(size)});
 const header=Buffer.alloc(6+16*layers.length);header.writeUInt16LE(1,2);header.writeUInt16LE(layers.length,4);let offset=header.length;
 for(const [i,{size,png}]of layers.entries()){const entry=6+i*16;header[entry]=size===256?0:size;header[entry+1]=size===256?0:size;header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(png.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=png.length;}
 writeFileSync(join(root,'src-tauri/icons/icon.ico'),Buffer.concat([header,...layers.map(x=>x.png)]));
 if(sha(readFileSync(ear))!==earBefore)throw Error('The original ear artwork changed.');
 const manifest={version:2,default:'van',alternate:'ear',sourceMaster:'assets/brand/app-icon-van.png',masterSha256:sha(original),vanIcnsSha256:sha(readFileSync(canonical)),earIcnsSha256:earBefore,
  atlasSha256:sha(atlas),launch:{...VAN_ICON_LAUNCH},
  acquisition:launch.acquisition?.provenance,rasters:launch.rasters,
  startup,
  smallOpticalFinish:{sizes:[16,24,32],method:'Clear sub3% alpha fringe; minimum tail-lamp coverage projected from canonical lamp faces, independent of red brand paint',lampCentres:lamps},
  desktopPngs:Object.fromEntries(['32x32.png','64x64.png','128x128.png','128x128@2x.png','icon.png'].map(name=>[name,sha(readFileSync(join(root,'src-tauri/icons',name)))]))};
 writeFileSync(join(root,'assets/brand/app-icon-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log(JSON.stringify({packaged:true,default:'van',alternate:'ear',vanIcnsSha256:manifest.vanIcnsSha256,earPreserved:true,atlasSha256:manifest.atlasSha256}));
}finally{rmSync(temporary,{recursive:true,force:true});}
