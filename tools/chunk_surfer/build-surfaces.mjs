// Build the architectural surface atlas used by the WebGL world renderer.
//
// The supplied GLBs contain no image textures. Their useful payload is either
// flat-colour geometry (stone courses / Interfloor strips) or a material
// palette. We preserve the recoverable geometry language and add deterministic
// micro-detail only where the advertised marble/floral/geometric image is
// absent. Every such substitution is recorded in surfaces.json.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SRC = path.join(ROOT, 'tools/chunk_surfer/prop-sources');
const OUT = path.join(ROOT, 'public/labs/chunk-surfer/assets/surfaces');
const SIZE = 256, COLS = 4, ROWS = 2;

const SPECS = [
  { name:'wall_stone_a', file:'walls.glb', tile:2.4, mode:'source-geometry+source-palette' },
  { name:'wall_stone_b', file:'walls.glb', tile:2.0, mode:'source-geometry+source-palette' },
  { name:'floor_interfloor', file:'floor_interfloor.glb', tile:1.2, mode:'source-geometry+source-palette' },
  { name:'floor_carrara', file:'floor_carrara.glb', tile:1.8, mode:'source-palette+fallback-detail', fallbackReason:'The GLB contains four plain slabs and no image or marble veining.' },
  { name:'floor_pool_geo', file:'floor_pool_geo.glb', tile:.6, mode:'source-palette+fallback-detail', fallbackReason:'The GLB contains a plain six-face box and no geometric image.' },
  { name:'floor_pool_floral', file:'floor_pool_floral.glb', tile:.6, mode:'source-palette+fallback-detail', fallbackReason:'The GLB contains a plain six-face box and no floral image.' },
  { name:'floor_concrete', file:'concrete.glb', tile:1.5, mode:'source-geometry+source-palette' },
];

function readGLB(file){
  const bytes=fs.readFileSync(file);if(bytes.toString('ascii',0,4)!=='glTF')throw new Error(`${file}: not GLB`);
  const len=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+len).toString('utf8'));
  return {bytes,json};
}
const srgb=(v)=>Math.max(0,Math.min(255,Math.round(255*(v<=.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-.055))));
function palette(json){
  const out=(json.materials||[]).map((m)=>(m.pbrMetallicRoughness?.baseColorFactor||[.5,.5,.5]).slice(0,3).map(srgb));
  return out.length?out:[[128,128,128]];
}
const hash=(x,y,s=0)=>{let n=(Math.imul(x+17,374761393)^Math.imul(y+31,668265263)^Math.imul(s+7,1442695041))>>>0;n=Math.imul(n^(n>>>13),1274126177)>>>0;return((n^(n>>>16))>>>0)/4294967295;};
const clamp=(v)=>Math.max(0,Math.min(255,Math.round(v)));
function image(bg){const p=Buffer.alloc(SIZE*SIZE*4);for(let i=0;i<SIZE*SIZE;i++){p[i*4]=bg[0];p[i*4+1]=bg[1];p[i*4+2]=bg[2];p[i*4+3]=255;}return p;}
function set(p,x,y,c,a=1){if(x<0||y<0||x>=SIZE||y>=SIZE)return;const o=(y*SIZE+x)*4;p[o]=clamp(p[o]*(1-a)+c[0]*a);p[o+1]=clamp(p[o+1]*(1-a)+c[1]*a);p[o+2]=clamp(p[o+2]*(1-a)+c[2]*a);}
function rect(p,x0,y0,x1,y1,c){for(let y=Math.max(0,y0|0);y<Math.min(SIZE,y1|0);y++)for(let x=Math.max(0,x0|0);x<Math.min(SIZE,x1|0);x++)set(p,x,y,c);}
function line(p,x0,y0,x1,y1,w,c,a=1){const n=Math.ceil(Math.hypot(x1-x0,y1-y0));for(let i=0;i<=n;i++){const t=i/Math.max(1,n),cx=x0+(x1-x0)*t,cy=y0+(y1-y0)*t;for(let yy=-w;yy<=w;yy++)for(let xx=-w;xx<=w;xx++)if(xx*xx+yy*yy<=w*w)set(p,Math.round(cx+xx),Math.round(cy+yy),c,a);}}
function grain(p,amount,seed){for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const d=(hash(x,y,seed)-.5)*amount,o=(y*SIZE+x)*4;p[o]=clamp(p[o]+d);p[o+1]=clamp(p[o+1]+d);p[o+2]=clamp(p[o+2]+d);}}

function stone(pal,variant){const mortar=pal[0]||[112,112,110],p=image(mortar);let y=-8,row=0;while(y<SIZE){const h=variant?34+(row%3)*5:40+(row%2)*8;rect(p,0,y,SIZE,y+h,[mortar[0]*.68,mortar[1]*.69,mortar[2]*.69]);let x=(row%2?-42:0)+(variant&&row%3===0?-20:0),col=0;while(x<SIZE){const w=variant?62+Math.floor(hash(row,col,8)*48):78+Math.floor(hash(row,col,3)*55);const c=pal[(row+col)%pal.length],v=(hash(col,row,19)-.5)*10;rect(p,x+2,y+2,x+w-2,y+h-2,c.map(q=>q+v));x+=w;col++;}y+=h;row++;}grain(p,7,variant?71:41);return p;}
function interfloor(pal){const base=pal[0],p=image(base.map(v=>v*.72));const widths=[14,15,14,16,13,15,14,15,13,16,14,15,14,16,13,15,14];let x=0,i=0;while(x<SIZE){const w=widths[i%widths.length],v=(hash(i,2,9)-.5)*12;rect(p,x+2,0,x+w, SIZE,base.map(q=>q+v));for(let y=0;y<SIZE;y++)if(hash(i,y,22)>.93)line(p,x+3,y,x+w-2,y,0,base.map(q=>q-9),.3);x+=w+3;i++;}grain(p,4,17);return p;}
function carrara(pal){const b=pal.reduce((a,c)=>a.map((v,i)=>v+c[i]),[0,0,0]).map(v=>v/pal.length),p=image(b);grain(p,4,28);for(let k=0;k<9;k++){const x0=hash(k,1,4)*SIZE,amp=12+hash(k,2,4)*35,freq=.018+hash(k,3,4)*.028;let prev=[x0,0];for(let y=2;y<SIZE;y+=2){const x=x0+Math.sin(y*freq+k*1.7)*amp+(hash(k,y,44)-.5)*6;line(p,prev[0],prev[1],x,y,k%3===0?1:0,[100,108,112],k%3===0?.24:.13);prev=[x,y];}}return p;}
function poolGeo(pal){const b=pal[0],p=image(b);const grout=b.map(v=>v*.55);for(let y=0;y<SIZE;y+=64)for(let x=0;x<SIZE;x+=64){rect(p,x,y,x+62,y+62,b.map((v,i)=>v+(hash(x,y,i)-.5)*7));line(p,x+8,y+31,x+31,y+8,2,pal[1]||[90,112,118],.48);line(p,x+31,y+8,x+55,y+31,2,pal[2]||[150,136,106],.42);line(p,x+55,y+31,x+31,y+55,2,pal[1]||[90,112,118],.48);line(p,x+31,y+55,x+8,y+31,2,pal[2]||[150,136,106],.42);}for(let v=0;v<SIZE;v+=64){rect(p,v+62,0,v+64,SIZE,grout);rect(p,0,v+62,SIZE,v+64,grout);}grain(p,3,55);return p;}
function poolFloral(pal){const b=pal[0],p=image(b);for(let gy=0;gy<4;gy++)for(let gx=0;gx<4;gx++){const cx=gx*64+32,cy=gy*64+32;for(let leaf=0;leaf<4;leaf++){const a=leaf*Math.PI/2+((gx+gy)%2)*.3,ex=cx+Math.cos(a)*15,ey=cy+Math.sin(a)*15;for(let r=8;r>0;r--)line(p,cx,cy,ex,ey,Math.max(1,Math.floor(r/3)),pal[1+leaf%Math.max(1,pal.length-1)]||[96,126,94],.16);}}for(let v=0;v<SIZE;v+=64){rect(p,v+62,0,v+64,SIZE,b.map(q=>q*.6));rect(p,0,v+62,SIZE,v+64,b.map(q=>q*.6));}grain(p,3,81);return p;}
function concrete(pal){const b=pal[Math.floor(pal.length/2)]||pal[0],p=image(b);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const broad=(hash(x>>4,y>>4,90)-.5)*18,fine=(hash(x,y,91)-.5)*11,o=(y*SIZE+x)*4;p[o]=clamp(b[0]+broad+fine);p[o+1]=clamp(b[1]+broad+fine);p[o+2]=clamp(b[2]+broad+fine);}for(let i=0;i<32;i++){const x=hash(i,1,93)*SIZE,y=hash(i,2,93)*SIZE,r=1+hash(i,3,93)*3;line(p,x-r,y,x+r,y,Math.round(r),pal[i%pal.length],.20);}return p;}

function build(name,pal){switch(name){case'wall_stone_a':return stone(pal,0);case'wall_stone_b':return stone(pal,1);case'floor_interfloor':return interfloor(pal);case'floor_carrara':return carrara(pal);case'floor_pool_geo':return poolGeo(pal);case'floor_pool_floral':return poolFloral(pal);default:return concrete(pal);}}
function variance(p){let n=SIZE*SIZE,mean=0,sq=0;for(let i=0;i<n;i++){const o=i*4,v=.2126*p[o]+.7152*p[o+1]+.0722*p[o+2];mean+=v;sq+=v*v;}mean/=n;return +(sq/n-mean*mean).toFixed(2);}

fs.mkdirSync(OUT,{recursive:true});
// Retire the first-pass single stone swatch so stale builds cannot load it by
// accident now that the atlas owns two deliberate coursing variants.
fs.rmSync(path.join(OUT,'wall_stone.png'),{force:true});
const atlas=Buffer.alloc(SIZE*COLS*SIZE*ROWS*4);const manifest={version:1,atlas:{file:'surfaces/surface-atlas.png',width:SIZE*COLS,height:SIZE*ROWS,tileSize:SIZE,columns:COLS,rows:ROWS},surfaces:{}};
for(let i=0;i<SPECS.length;i++){
  const s=SPECS[i],file=path.join(SRC,s.file);if(!fs.existsSync(file))throw new Error(`${s.name}: missing ${file}`);
  const {bytes,json}=readGLB(file),pal=palette(json),pixels=build(s.name,pal),col=i%COLS,row=Math.floor(i/COLS);
  for(let y=0;y<SIZE;y++)pixels.copy(atlas,((row*SIZE+y)*SIZE*COLS+col*SIZE)*4,y*SIZE*4,(y+1)*SIZE*4);
  await sharp(pixels,{raw:{width:SIZE,height:SIZE,channels:4}}).png({compressionLevel:9}).toFile(path.join(OUT,`${s.name}.png`));
  manifest.surfaces[s.name]={file:`surfaces/${s.name}.png`,slot:i,atlasCell:[col,row],tileMeters:s.tile,source:s.file,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceImages:(json.images||[]).length,sourceTextures:(json.textures||[]).length,sourceMaterials:(json.materials||[]).length,mode:s.mode,variance:variance(pixels),...(s.fallbackReason?{fallbackReason:s.fallbackReason}:{})};
  console.log(`  · ${s.name}: slot ${i}, variance ${manifest.surfaces[s.name].variance}, ${s.mode}`);
}
await sharp(atlas,{raw:{width:SIZE*COLS,height:SIZE*ROWS,channels:4}}).png({compressionLevel:9}).toFile(path.join(OUT,'surface-atlas.png'));
fs.writeFileSync(path.join(OUT,'surfaces.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`wrote ${SPECS.length} surfaces + ${COLS}x${ROWS} atlas to ${path.relative(ROOT,OUT)}`);
