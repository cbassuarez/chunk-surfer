// Build a fixed 3x2 atlas of verified Public Domain portraits from The Met.
// Source JPEGs are a local ignored cache; the compressed atlas and provenance
// manifest are the reproducible runtime artifacts.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT=path.resolve(import.meta.dirname,'../..');
const SRC=path.join(ROOT,'tools/chunk_surfer/portrait-sources');
const OUT=path.join(ROOT,'public/labs/chunk-surfer/assets/portraits');
const W=256,H=320,COLS=3,ROWS=2;
const WORKS=[
  {id:437825,title:'Portrait of a Man',artist:'Titian (Tiziano Vecellio)',file:'437825.jpg',image:'https://images.metmuseum.org/CRDImages/ep/web-large/DP-23080-001.jpg',page:'https://www.metmuseum.org/art/collection/search/437825'},
  {id:436574,title:'Portrait of an Old Man',artist:'El Greco (Domenikos Theotokopoulos)',file:'436574.jpg',image:'https://images.metmuseum.org/CRDImages/ep/web-large/DP-24083-001.jpg',page:'https://www.metmuseum.org/art/collection/search/436574'},
  {id:643060,title:'Study of a Young Woman in Three-quarter Bust-Length',artist:'Bronzino (Agnolo di Cosimo di Mariano)',file:'643060.jpg',image:'https://images.metmuseum.org/CRDImages/dp/web-large/DP838058.jpg',page:'https://www.metmuseum.org/art/collection/search/643060'},
  {id:436739,title:'Portrait of a Woman',artist:'Italian (Florentine) Painter',file:'436739.jpg',image:'https://images.metmuseum.org/CRDImages/ep/web-large/DP104987.jpg',page:'https://www.metmuseum.org/art/collection/search/436739'},
  {id:437322,title:'Portrait of a Woman',artist:'Piero del Pollaiuolo',file:'437322.jpg',image:'https://images.metmuseum.org/CRDImages/ep/web-large/DP-24116-001.jpg',page:'https://www.metmuseum.org/art/collection/search/437322'},
  {id:459071,title:'Portrait of a Woman',artist:'Netherlandish or French',file:'459071.jpg',image:'https://images.metmuseum.org/CRDImages/rl/web-large/SLP0129.jpg',page:'https://www.metmuseum.org/art/collection/search/459071'},
];

fs.mkdirSync(OUT,{recursive:true});
const composites=[],manifest={version:1,atlas:{file:'portraits/portrait-atlas.webp',width:W*COLS,height:H*ROWS,columns:COLS,rows:ROWS},license:'CC0 / Public Domain via The Met Open Access',works:[],frameSource:{source:'Gold frame.glb',accepted:false,reason:'The supplied GLB contains one two-triangle dark plane and no usable frame geometry or texture. Runtime uses project-native brass rail geometry.'}};
for(let i=0;i<WORKS.length;i++){
  const w=WORKS[i],file=path.join(SRC,w.file);if(!fs.existsSync(file))throw new Error(`missing ${file}`);
  const bytes=fs.readFileSync(file),cell=await sharp(bytes).rotate().resize(W,H,{fit:'cover',position:'attention'}).removeAlpha().toBuffer();
  composites.push({input:cell,left:(i%COLS)*W,top:Math.floor(i/COLS)*H});
  manifest.works.push({...w,slot:i,atlasCell:[i%COLS,Math.floor(i/COLS)],isPublicDomain:true,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')});
}
await sharp({create:{width:W*COLS,height:H*ROWS,channels:3,background:'#15130f'}}).composite(composites).webp({quality:82,effort:6}).toFile(path.join(OUT,'portrait-atlas.webp'));
fs.writeFileSync(path.join(OUT,'portraits.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`wrote ${WORKS.length} public-domain portraits to ${path.relative(ROOT,OUT)}`);
