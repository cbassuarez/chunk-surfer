import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
async function alpha(buffer){
 const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let zero=0,opaque=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)zero++;if(data[i]===255)opaque++;}
 return{zero:zero/(info.width*info.height),opaque:opaque/(info.width*info.height),corner:[3,info.width*4-1,(info.height-1)*info.width*4+3,data.length-1].map(i=>data[i]),info};
}
test('every shipping desktop PNG is the cut-out silhouette, not the former nearly opaque plate',async()=>{
 for(const [name,size]of[['32x32.png',32],['64x64.png',64],['128x128.png',128],['128x128@2x.png',256],['icon.png',512]]){
  const a=await alpha(readFileSync(`src-tauri/icons/${name}`));
  assert.equal(a.info.width,size);assert.equal(a.info.height,size);assert.ok(a.zero>.5,`${name}: transparent area ${a.zero}`);
  assert.ok(a.opaque>.1,`${name}: visible ear retained`);assert.deepEqual(a.corner,[0,0,0,0]);
 }
});
test('bundle and prelaunch/running Dock retain the same approved ICNS artwork',()=>{
 assert.equal(hash('src-tauri/icons/icon.icns'),hash('assets/brand/app-icon-cutout.icns'));
 assert.equal(hash('src-tauri/macos/DockTile/DockTile.icns'),hash('assets/brand/app-icon-cutout.icns'));
 const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
 assert.ok(config.bundle.icon.includes('icons/icon.icns'));
 const info=readFileSync('src-tauri/Info.plist','utf8');assert.match(info,/<key>NSDockTilePlugIn<\/key>\s*<string>ChunkSurferDockTile\.docktileplugin<\/string>/);
 assert.equal(config.bundle.macOS.files['PlugIns/ChunkSurferDockTile.docktileplugin'],'target/dock-tile/ChunkSurferDockTile.docktileplugin');
});
test('the ear cavity is opaque black at every shipping desktop size',async()=>{
 for(const name of['32x32.png','64x64.png','128x128.png','128x128@2x.png','icon.png']){
  const {data,info}=await sharp(`src-tauri/icons/${name}`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(const [u,v]of[[.375,.55],[.38,.60]]){
   const at=(Math.floor(info.height*v)*info.width+Math.floor(info.width*u))*4;
   assert.deepEqual([...data.subarray(at,at+4)],[0,0,0,255],`${name}: cavity must absorb light, not reveal the desktop`);
  }
 }
});
test('ICO has all six supported layers and retains transparent margins in each',async()=>{
 const d=readFileSync('src-tauri/icons/icon.ico');assert.equal(d.readUInt16LE(0),0);assert.equal(d.readUInt16LE(2),1);assert.equal(d.readUInt16LE(4),6);
 const sizes=[];
 for(let i=0;i<6;i++){
  const at=6+i*16,size=d[at]||256,length=d.readUInt32LE(at+8),offset=d.readUInt32LE(at+12);sizes.push(size);
  assert.ok(offset>=102&&offset+length<=d.length);assert.equal(d.readUInt16LE(at+6),32);
  const a=await alpha(d.subarray(offset,offset+length));assert.equal(a.info.width,size);assert.ok(a.zero>.5,`ICO ${size}: transparent silhouette`);
 }
 assert.deepEqual(sizes,[32,16,24,48,64,256]);
});
test('startup uses only the approved native assembly and has no animation preference or preview command',()=>{
 const lib=readFileSync('src-tauri/src/lib.rs','utf8'),tile=readFileSync('src-tauri/src/dock_tile.rs','utf8');
 assert.doesNotMatch(lib,/chunk_configure_dock_opening|chunk_preview_dock_opening/);
 assert.doesNotMatch(tile,/dock-opening\.json|requestUserAttention|std::thread::spawn|fn play\(/);
 assert.match(lib,/dock_tile::install\(\)/);
 assert.match(tile,/chunk_surfer_install_dock_assembly\(DOCK_TILE\.as_ptr\(\), DOCK_TILE\.len\(\)\)/);
 const build=readFileSync('src-tauri/build.rs','utf8');
 assert.match(build,/build_dock_assembly\(\)/);
 assert.match(build,/rustc-link-lib=static=chunk_surfer_dock_assembly/);
 assert.match(build,/OUT_DIR/);
});
