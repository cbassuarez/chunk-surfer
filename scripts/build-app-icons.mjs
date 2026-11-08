// Package the approved cut-out ear from one canonical transparent PNG.
// The PNG owns the artwork, including the opaque black cavity.
import {copyFileSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const artwork=join(root,'assets/brand/app-icon-cutout.png');
const canonical=join(root,'assets/brand/app-icon-cutout.icns');
const temporary=mkdtempSync(join(tmpdir(),'chunk-surfer-icons-'));
try{
 const set=join(temporary,'ear.iconset');
 mkdirSync(set);
 for(const base of[16,32,128,256,512])for(const retina of[false,true]){
  const size=base*(retina?2:1),file=join(set,`icon_${base}x${base}${retina?'@2x':''}.png`);
  execFileSync('sips',['-z',String(size),String(size),artwork,'--out',file],{stdio:'ignore'});
 }
 execFileSync('iconutil',['-c','icns',set,'-o',canonical]);
 const source=size=>join(set,size===64?'icon_32x32@2x.png':`icon_${size}x${size}.png`);
 for(const [destination,size] of [['32x32.png',32],['64x64.png',64],['128x128.png',128],['128x128@2x.png',256],['icon.png',512]])
  copyFileSync(source(size),join(root,'src-tauri/icons',destination));
 copyFileSync(canonical,join(root,'src-tauri/icons/icon.icns'));
 copyFileSync(canonical,join(root,'src-tauri/macos/DockTile/DockTile.icns'));
 const layers=[];
 for(const size of [32,16,24,48,64,256]){
  let file=source(size);
  if(size===24||size===48){
   file=join(temporary,`${size}.png`);
   execFileSync('sips',['-z',String(size),String(size),source(size===24?32:64),'--out',file],{stdio:'ignore'});
  }
  layers.push({size,png:readFileSync(file)});
 }
 const header=Buffer.alloc(6+16*layers.length);header.writeUInt16LE(1,2);header.writeUInt16LE(layers.length,4);
 let offset=header.length;
 for(const [i,{size,png}] of layers.entries()){
  const entry=6+i*16;header[entry]=size===256?0:size;header[entry+1]=size===256?0:size;
  header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);
  header.writeUInt32LE(png.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=png.length;
 }
 writeFileSync(join(root,'src-tauri/icons/icon.ico'),Buffer.concat([header,...layers.map(x=>x.png)]));
 console.log('Packaged transparent ear for bundle, closed Dock plug-in, running Dock, PNG and ICO.');
}finally{rmSync(temporary,{recursive:true,force:true});}
