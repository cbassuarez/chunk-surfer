// TWELVE DOCUMENTARY DETAILS FROM THE QUIET VIGIL.
//
// These are things the camera can verify: wet paper, a lock, a window, a meter.
// No portrait plate supplies a face the world model deliberately withholds.
// Deterministic, dependency-free PNGs; the same source produces the same bytes.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT=path.resolve(import.meta.dirname,'../..'),OUT=path.join(ROOT,'public/story-art');
const W=720,H=900;
const CRC_TABLE=(()=>{const table=new Int32Array(256);for(let n=0;n<256;n+=1){let c=n;for(let k=0;k<8;k+=1)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c;}return table;})();
const crc32=(buf)=>{let c=0xffffffff;for(const byte of buf)c=CRC_TABLE[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;};
function chunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc32(out.subarray(4,8+data.length)),8+data.length);return out;}
function writePng(file,rgb){const stride=W*3,raw=Buffer.alloc((stride+1)*H);for(let y=0;y<H;y+=1){const o=y*(stride+1);raw[o]=1;for(let x=0;x<stride;x+=1){const here=rgb[y*stride+x],left=x>=3?rgb[y*stride+x-3]:0;raw[o+1+x]=(here-left)&255;}}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;fs.writeFileSync(file,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]));}
const rng=(seed)=>{let s=seed>>>0;return()=>{s^=s<<13;s>>>=0;s^=s>>17;s^=s<<5;s>>>=0;return s/4294967296;};};
const clamp=(v)=>Math.max(0,Math.min(255,Math.round(v)));
const GLYPH={
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],C:['01111','10000','10000','10000','10000','10000','01111'],
  D:['11110','10001','10001','10001','10001','10001','11110'],E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01111'],H:['10001','10001','10001','11111','10001','10001','10001'],I:['11111','00100','00100','00100','00100','00100','11111'],
  K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],M:['10001','11011','10101','10101','10001','10001','10001'],
  N:['10001','11001','10101','10011','10001','10001','10001'],O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
  R:['11110','10001','10001','11110','10100','10010','10001'],S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],W:['10001','10001','10001','10101','10101','11011','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],'2':['01110','10001','00001','00010','00100','01000','11111'],
  '3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['00110','01000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],'8':['01110','10001','10001','01110','10001','10001','01110'],
  '9':['01110','10001','10001','01111','00001','00010','11100'],':':['00000','00100','00100','00000','00100','00100','00000'],'-':['00000','00000','00000','11111','00000','00000','00000'],'.':['00000','00000','00000','00000','00000','00100','00100'],
};
function canvas(seed){const rand=rng(seed),rgb=Buffer.alloc(W*H*3);for(let y=0;y<H;y+=1)for(let x=0;x<W;x+=1){const i=(y*W+x)*3,v=y/H,n=(rand()-.5)*5;rgb[i]=clamp(8+v*18+n);rgb[i+1]=clamp(12+v*20+n);rgb[i+2]=clamp(17+v*24+n);}return{rgb,rand};}
function pixel(rgb,x,y,color,alpha=1){if(x<0||y<0||x>=W||y>=H)return;const i=(Math.floor(y)*W+Math.floor(x))*3;for(let c=0;c<3;c+=1)rgb[i+c]=clamp(rgb[i+c]+(color[c]-rgb[i+c])*alpha);}
function rect(rgb,x,y,w,h,color,alpha=1){for(let py=Math.max(0,Math.floor(y));py<Math.min(H,Math.ceil(y+h));py+=1)for(let px=Math.max(0,Math.floor(x));px<Math.min(W,Math.ceil(x+w));px+=1)pixel(rgb,px,py,color,alpha);}
function line(rgb,x0,y0,x1,y1,width,color,alpha=1){const steps=Math.ceil(Math.hypot(x1-x0,y1-y0));for(let n=0;n<=steps;n+=1){const t=n/Math.max(1,steps),x=x0+(x1-x0)*t,y=y0+(y1-y0)*t;rect(rgb,x-width/2,y-width/2,width,width,color,alpha);}}
function circle(rgb,cx,cy,r,width,color,alpha=1){for(let a=0;a<Math.PI*2;a+=1/Math.max(8,r*3))line(rgb,cx+Math.cos(a)*r,cy+Math.sin(a)*r,cx+Math.cos(a+.02)*r,cy+Math.sin(a+.02)*r,width,color,alpha);}
function text(rgb,value,x,y,size,color){let cursor=x;for(const char of String(value).toUpperCase()){const glyph=GLYPH[char];if(glyph)for(let row=0;row<7;row+=1)for(let col=0;col<5;col+=1)if(glyph[row][col]==='1')rect(rgb,cursor+col*size,y+row*size,size*.78,size*.78,color,.94);cursor+=size*6;}}
function paper(rgb,x,y,w,h){rect(rgb,x+8,y+10,w,h,[22,20,17],.65);rect(rgb,x,y,w,h,[176,173,151],.96);rect(rgb,x+8,y+8,w-16,h-16,[126,132,121],.20);}
function rain(rgb,rand){for(let n=0;n<330;n+=1){const x=rand()*W,y=rand()*H,len=10+rand()*35;line(rgb,x,y,x+len*.18,y+len,1,[175,188,199],.10+rand()*.18);}}
function finish(rgb,rand){rect(rgb,0,H-85,W,85,[8,10,13],.45);rain(rgb,rand);return rgb;}

const PLATES=[
  ['vigil.ruth.png',0x51a3,(p)=>{paper(p,112,105,500,680);rect(p,92,88,28,720,[38,40,39]);for(let y=210;y<690;y+=62){line(p,150,y,565,y,3,[70,75,69]);text(p,String((y-148)/62).padStart(2,'0'),165,y+15,5,[54,58,55]);}text(p,'THURSDAY',168,135,12,[38,45,40]);circle(p,500,166,38,5,[133,48,35]);}],
  ['vigil.ruth-notice.png',0x51a4,(p)=>{paper(p,92,100,536,690);text(p,'FIRST STRIKE',135,205,6,[44,43,38]);text(p,'06:00',150,345,16,[119,37,27]);text(p,'THURSDAY',142,570,8,[44,43,38]);line(p,128,545,565,475,9,[126,42,31],.8);text(p,'CORRECTED',205,495,7,[126,42,31]);}],
  ['vigil.leila.png',0x22c7,(p)=>{rect(p,65,80,590,710,[22,31,39]);for(const x of[75,360,645])rect(p,x,80,10,710,[78,75,64]);for(const y of[90,430,780])rect(p,65,y,590,10,[78,75,64]);line(p,105,155,320,390,20,[21,20,18]);line(p,310,145,105,400,20,[21,20,18]);rect(p,455,530,70,150,[91,57,37]);circle(p,490,530,35,6,[150,133,104]);}],
  ['vigil.leila-window.png',0x22c8,(p)=>{rect(p,70,85,580,720,[18,26,34]);rect(p,355,85,12,720,[87,82,68]);rect(p,70,435,580,12,[87,82,68]);line(p,112,164,337,410,24,[15,15,14]);line(p,333,160,110,412,24,[15,15,14]);rect(p,420,575,85,160,[98,57,35]);rect(p,435,590,54,90,[186,131,64],.32);}],
  ['vigil.owen.png',0x7f11,(p)=>{rect(p,120,75,480,750,[43,49,47]);rect(p,185,125,350,650,[30,34,33]);rect(p,238,250,150,330,[55,58,52]);rect(p,325,360,90,170,[109,105,83]);circle(p,370,445,30,8,[26,27,25]);rect(p,420,290,22,250,[31,32,29]);}],
  ['vigil.owen-keys.png',0x7f12,(p)=>{rect(p,0,0,W,H,[14,16,18],.65);circle(p,350,380,142,20,[103,106,99]);for(let n=0;n<8;n+=1){const a=n/8*Math.PI*2,x=350+Math.cos(a)*125,y=380+Math.sin(a)*125;line(p,x,y,x+Math.cos(a)*210,y+Math.sin(a)*210,18,[91,92,84]);circle(p,x+Math.cos(a)*210,y+Math.sin(a)*210,26,10,[91,92,84]);}text(p,'SOUTH PORCH',148,725,11,[171,166,136]);line(p,120,700,590,700,4,[139,54,41]);}],
  ['vigil.denise.png',0x3e58,(p)=>{rect(p,78,70,565,750,[151,154,142],.45);paper(p,118,115,485,665);rect(p,150,160,420,360,[60,62,56]);rect(p,170,340,380,140,[99,101,88]);for(let x=185;x<545;x+=48)rect(p,x,270,18,105,[30,31,29]);text(p,'LAUNDRY 1912',150,590,12,[45,48,43]);}],
  ['vigil.denise-archive.png',0x3e59,(p)=>{for(let n=0;n<5;n+=1){paper(p,105+n*12,95+n*105,500,150);text(p,String(1982+n),155+n*12,135+n*105,11,[48,50,45]);}rect(p,90,600,545,160,[17,20,22]);text(p,'AFTER 1986',155,650,16,[157,149,119]);line(p,130,730,590,730,5,[128,48,35]);}],
  ['vigil.malcolm.png',0x0d9b,(p)=>{paper(p,75,70,570,760);for(let n=0;n<18;n+=1){const x=100+(n*137)%500,y=110+(n*83)%660;line(p,x,y,x+80,y+((n%3)-1)*55,2,[75,89,82],.75);}circle(p,215,305,38,5,[139,48,37]);circle(p,510,610,38,5,[139,48,37]);}],
  ['vigil.malcolm-line.png',0x0d9c,(p)=>{paper(p,75,70,570,760);for(let n=0;n<16;n+=1){const x=105+(n*151)%480,y=105+(n*97)%660;line(p,x,y,x+72,y+((n%3)-1)*48,2,[75,89,82],.65);}circle(p,205,300,46,7,[139,48,37]);circle(p,520,625,46,7,[139,48,37]);line(p,205,300,520,625,8,[135,47,35]);text(p,'1:2500',405,735,7,[46,49,44]);}],
  ['vigil.kit.png',0x6ab4,(p)=>{paper(p,105,85,510,730);for(let y=190;y<705;y+=68)line(p,145,y,575,y,2,[72,76,70]);text(p,'GAIN LOG',155,125,14,[43,47,43]);text(p,'22:30',430,125,11,[122,46,34]);for(let x=150;x<565;x+=10){const y=485+Math.sin(x*.047)*35+Math.sin(x*.011)*12;line(p,x,y,x+10,485+Math.sin((x+10)*.047)*35+Math.sin((x+10)*.011)*12,4,[126,48,35]);}}],
  ['vigil.kit-meter.png',0x6ab5,(p)=>{rect(p,120,260,480,390,[34,37,38]);rect(p,155,300,410,235,[12,17,15]);for(let x=175;x<545;x+=12){const y=420+Math.sin(x*.062)*55;rect(p,x,y,8,Math.max(5,510-y),[49,165,89],.84);}text(p,'-11 DB',245,565,10,[163,176,151]);line(p,40,170,470,320,32,[25,27,28]);circle(p,70,180,58,14,[28,30,31]);}],
];

fs.mkdirSync(OUT,{recursive:true});
for(const [file,seed,draw] of PLATES){const {rgb,rand}=canvas(seed);draw(rgb);writePng(path.join(OUT,file),finish(rgb,rand));console.log(`wrote ${path.relative(ROOT,path.join(OUT,file))} (${fs.statSync(path.join(OUT,file)).size} bytes)`);}
