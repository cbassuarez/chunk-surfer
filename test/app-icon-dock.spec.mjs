import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest=JSON.parse(readFileSync('assets/brand/app-icon-manifest.json','utf8'));
async function pixels(input){return sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});}
async function alpha(buffer){
 const {data,info}=await pixels(buffer);let zero=0,opaque=0;
 for(let i=3;i<data.length;i+=4){if(data[i]===0)zero++;if(data[i]===255)opaque++;}
 return{zero:zero/(info.width*info.height),opaque:opaque/(info.width*info.height),corner:[3,info.width*4-1,(info.height-1)*info.width*4+3,data.length-1].map(i=>data[i]),info};
}

test('every shipping desktop PNG is the transparent van identity with consistent native sizes',async()=>{
 assert.equal(manifest.default,'van');assert.equal(manifest.alternate,'ear');
 const rendered=JSON.parse(readFileSync('assets/brand/app-icon-van-launch.json','utf8'));
 assert.equal(rendered.version,3);assert.equal(rendered.atlas.renderedAtOutputResolution,true);
 assert.equal(rendered.acquisition.provenance.shaderExport,'PIXEL_MESH_FRAG');assert.equal(rendered.acquisition.provenance.externalRawOverlay,false);
 assert.equal(rendered.acquisition.provenance.pureOneBit,false);assert.ok(rendered.acquisition.profilePolicy.recording.captureMix>0&&rendered.acquisition.profilePolicy.recording.captureMix<1);
 assert.equal(rendered.acquisition.provenance.colourResolve,'src/render/pixel-mesh/final-look.js#finalMaterialLightInk (Living Materials)');
 for(const[path,expected]of Object.entries(rendered.inputs))assert.equal(hash(path),expected,`approved render source remains current: ${path}`);
 for(const [name,size]of[['32x32.png',32],['64x64.png',64],['128x128.png',128],['128x128@2x.png',256],['icon.png',512]]){
  const path=`src-tauri/icons/${name}`,a=await alpha(readFileSync(path));
  assert.equal(a.info.width,size);assert.equal(a.info.height,size);assert.ok(a.zero>.45,`${name}: transparent margins ${a.zero}`);
  assert.ok(a.opaque>.10,`${name}: actual visible van retained`);assert.deepEqual(a.corner,[0,0,0,0]);
  assert.equal(hash(path),manifest.desktopPngs[name]);
 }
 assert.equal(hash('assets/brand/app-icon-van.png'),manifest.masterSha256);
});

test('the packaged icon sizes come from independent final-resolution game-shader renders',async()=>{
 const rendered=JSON.parse(readFileSync('assets/brand/app-icon-van-launch.json','utf8'));
 for(const [size,value]of Object.entries(rendered.rasters)){
  const n=Number(size),info=await sharp(value.path).metadata();assert.equal(info.width,n);assert.equal(info.height,n);assert.equal(hash(value.path),value.sha256);
  assert.equal(value.renderedAtOutputResolution,true);assert.deepEqual([value.render.width,value.render.height,value.render.sourceWidth,value.render.sourceHeight],[n,n,n,n]);
  assert.equal(value.render.shaderFingerprint,rendered.acquisition.provenance.shaderFingerprint);assert.equal(value.render.cellPx,1);
  const compact=rendered.acquisition.provenance.compactPolicy;
  assert.equal(value.render.recordingCaptureMix,n<compact.belowPixels?compact.recordingMix:rendered.acquisition.profilePolicy.recording.captureMix);
  assert.equal(value.render.vfdToneAmount,n<compact.belowPixels?compact.toneAmount:rendered.acquisition.profilePolicy.vfd.toneAmount);
 }
 const native64=await sharp(rendered.rasters['64'].path).ensureAlpha().raw().toBuffer();
 const resized=await sharp(rendered.rasters['1024'].path).resize(64,64).ensureAlpha().raw().toBuffer();
 assert.notDeepEqual(native64,resized,'64px receives fresh screen marks instead of blurred 1024px marks');
 assert.equal(rendered.weather.rain,true);assert.deepEqual(rendered.weather.lightningAtSeconds,[2.42]);assert.deepEqual(rendered.weather.thunderAtSeconds,[2.90]);
});

test('bundle and static Dock share the van ICNS while the original ear remains a separate alternate',()=>{
 const van=hash('assets/brand/app-icon-van.icns'),ear=hash('assets/brand/app-icon-cutout.icns');
 assert.notEqual(van,ear);assert.equal(van,manifest.vanIcnsSha256);assert.equal(ear,manifest.earIcnsSha256);
 assert.equal(hash('src-tauri/icons/icon.icns'),van);
 assert.equal(hash('src-tauri/macos/DockTile/DockTile.icns'),van);
 assert.equal(hash('src-tauri/macos/DockTile/Ear.icns'),ear);
 const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
 assert.ok(config.bundle.icon.includes('icons/icon.icns'));
 assert.equal(config.bundle.macOS.files['PlugIns/ChunkSurferDockTile.docktileplugin'],'target/dock-tile/ChunkSurferDockTile.docktileplugin');
 const info=readFileSync('src-tauri/Info.plist','utf8');assert.match(info,/<key>NSDockTilePlugIn<\/key>\s*<string>ChunkSurferDockTile\.docktileplugin<\/string>/);
});

test('the preserved ear alternate retains its opaque black cavity',async()=>{
 const {data,info}=await pixels('assets/brand/app-icon-cutout.png');
 for(const [u,v]of[[.375,.55],[.38,.60]]){const p=(Math.floor(info.height*v)*info.width+Math.floor(info.width*u))*4;assert.deepEqual([...data.subarray(p,p+4)],[0,0,0,255]);}
});

test('ICO contains the six supported transparent van layers with visible red tail lamps at small sizes',async()=>{
 const d=readFileSync('src-tauri/icons/icon.ico');assert.equal(d.readUInt16LE(0),0);assert.equal(d.readUInt16LE(2),1);assert.equal(d.readUInt16LE(4),6);
 const sizes=[];
 for(let i=0;i<6;i++){
  const p=6+i*16,size=d[p]||256,length=d.readUInt32LE(p+8),offset=d.readUInt32LE(p+12);sizes.push(size);
  assert.ok(offset>=102&&offset+length<=d.length);assert.equal(d.readUInt16LE(p+6),32);
  const png=d.subarray(offset,offset+length),a=await alpha(png);assert.equal(a.info.width,size);assert.ok(a.zero>.45);assert.deepEqual(a.corner,[0,0,0,0]);
  if(size<=32){
   const {data,info}=await pixels(png);
   for(const lamp of manifest.smallOpticalFinish.lampCentres){const x=Math.floor(lamp.x*size),y=Math.floor(lamp.y*size),at=(y*info.width+x)*4;
    assert.ok(data[at]>=180&&data[at+1]<65&&data[at+2]<65&&data[at+3]>=224,`size ${size}: distinct lamp at ${x},${y}`);}
  }
 }
 assert.deepEqual(sizes,[32,16,24,48,64,256]);
});

test('native atlas preserves all 84 alpha frames and movement, with unused cells clear',async()=>{
 const spec=JSON.parse(readFileSync('assets/brand/app-icon-van-launch.json','utf8'));
 assert.deepEqual([spec.frameCount,spec.cell,spec.cellSize,spec.columns,spec.rows,spec.durationSeconds],[84,256,256,8,11,3.4]);
 assert.equal(hash('assets/brand/app-icon-van-launch.png'),spec.atlas.sha256);
 assert.equal(hash('src-tauri/macos/DockTile/VanLaunch.png'),spec.atlas.sha256);
 const {data,info}=await pixels('src-tauri/macos/DockTile/VanLaunch.png');assert.deepEqual([info.width,info.height,info.channels],[2048,2816,4]);
 const frame=i=>{const out=Buffer.alloc(256*256*4),x=i%8*256,y=Math.floor(i/8)*256;for(let row=0;row<256;row++)data.copy(out,row*256*4,((y+row)*info.width+x)*4,((y+row)*info.width+x+256)*4);return out;};
 const first=frame(0),last=frame(83);let change=0;
 for(let p=0;p<first.length;p++)change+=Math.abs(first[p]-last[p]);assert.ok(change/first.length>3,'the atlas contains actual movement, not identical stills');
 for(let i=0;i<84;i++){const f=frame(i);let opaque=0;for(let p=3;p<f.length;p+=4)if(f[p]>240)opaque++;assert.ok(opaque>6553,`frame ${i}: readable van throughout launch`);}
 for(const i of[84,85,86,87])assert.ok(frame(i).every(v=>v===0),'unused atlas cells stay transparent');
 const include=readFileSync('src-tauri/macos/DockTile/VanLaunch.inc','utf8');
 for(const [name,value]of[['FrameCount',84],['CellSize',256],['Columns',8],['Rows',11],['Duration','3.4']])assert.match(include,new RegExp(`CSVLaunch${name} = ${String(value).replace('.','\\.')}[;]`));
});

test('the last launch frame hands off to the packaged still without a pose or framing jump',async()=>{
 const frame=await sharp('src-tauri/macos/DockTile/VanLaunch.png').extract({left:3*256,top:10*256,width:256,height:256}).ensureAlpha().raw().toBuffer();
 const still=await sharp('src-tauri/icons/128x128@2x.png').ensureAlpha().raw().toBuffer();
 let delta=0;
 for(let p=0;p<frame.length;p+=4){
  for(let c=0;c<3;c++)delta+=Math.abs(frame[p+c]*frame[p+3]/255-still[p+c]*still[p+3]/255);
  delta+=Math.abs(frame[p+3]-still[p+3]);
 }
 // Atlas and still use the same actual256px acquisition. Compare visible
 // premultiplied signal, excluding meaningless transparent RGB/PNG rounding.
 assert.ok(delta/frame.length<1.3,`mean visible byte difference ${delta/frame.length}`);
});

test('the app widget ships a small video loop from its own rendered frames',async()=>{
 const source=JSON.parse(readFileSync('assets/brand/app-icon-startup.json','utf8'));
 const startup=JSON.parse(readFileSync('public/app-icon/van-startup.json','utf8'));
 for(const name of['frameCount','cell','cellSize','columns','rows','durationSeconds'])assert.equal(startup[name],source[name]);
 assert.deepEqual([startup.frameCount,startup.cell,startup.columns,startup.rows,startup.durationSeconds],[42,128,7,6,3.4]);
 assert.deepEqual(startup.stages,[{atSeconds:0,name:'arrival'},{atSeconds:.95,name:'brake'},{atSeconds:1.27,name:'settle'},
  {atSeconds:1.55,name:'departure'},{atSeconds:3.2,name:'offscreen'}]);
 assert.equal(startup.stagesSeconds.lockStart,.95);assert.equal(startup.stagesSeconds.smokeEnd,1.65);assert.equal(startup.stagesSeconds.tracksEnd,3.25);
 assert.equal(startup.video,'van-startup.mp4');assert.equal(startup.poster,'van-startup-poster.png');
 assert.equal(hash('public/app-icon/van-startup.mp4'),source.video.sha256);assert.equal(startup.videoSha256,source.video.sha256);
 assert.equal(hash(source.atlas.path),source.atlas.sha256);
 assert.equal(hash('public/app-icon/van-startup-poster.png'),source.poster.sha256);assert.equal(startup.posterSha256,source.poster.sha256);
 assert.equal(source.atlas.renderedAtOutputResolution,true);assert.equal(source.poster.render.sourceWidth,128);
 const atlas=readFileSync(source.atlas.path),poster=readFileSync('public/app-icon/van-startup-poster.png');
 const a=await sharp(atlas).metadata(),p=await sharp(poster).metadata();assert.deepEqual([a.width,a.height,p.width,p.height],[896,768,128,128]);
 assert.ok(atlas.length<=300*1024);assert.ok(poster.length<=16*1024);assert.ok(a.width*a.height*4+p.width*p.height*4<3*1024*1024);
 const video=readFileSync('public/app-icon/van-startup.mp4');
 assert.ok(video.length<=128*1024);assert.equal(video.length,startup.bytes.video);
 assert.equal(video.toString('ascii',4,8),'ftyp');
 assert.ok(video.indexOf('moov')>0&&video.indexOf('moov')<video.indexOf('mdat'),'video metadata precedes frames for immediate playback');
 assert.equal(startup.weather.rain,true);assert.deepEqual(startup.weather.lightningAtSeconds,[]);assert.deepEqual(startup.weather.thunderAtSeconds,[]);
 assert.equal(startup.acquisition.shaderFingerprint,source.acquisition.provenance.shaderFingerprint);
});
