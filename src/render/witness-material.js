// The clear WITNESS shell exposes one authored assembly, not the game world.
// Circuit layout is shared with the GLB. Only real switches and earned service
// stamps vary; there is no decorative current, time-dependent grain, or flicker.
import { WITNESS_DESIGN, witnessAssemblyLayout } from '../data/witness-assembly.js';
import { ENDING_IDS } from '../progression/schema.js';
import { drawHardwareScrew } from './hardware-faceplate.js';

const COLORS=WITNESS_DESIGN.colors, MAX_ENTRIES=12, MAX_PIXELS=8*1024*1024;
const cache=new Map();let cachePixels=0;
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:min));
const rect=(c,x,y,w,h,r=0)=>{c.beginPath();c.roundRect(x,y,Math.max(0,w),Math.max(0,h),Math.max(0,Math.min(r,w/2,h/2)));};
function fill(c,x,y,w,h,color,r=0){if(w<=0||h<=0)return;c.fillStyle=color;rect(c,x,y,w,h,r);c.fill();}
function stroke(c,x,y,w,h,color,r=0,width=1){if(w<=0||h<=0)return;c.strokeStyle=color;c.lineWidth=width;rect(c,x,y,w,h,r);c.stroke();}
function path(c,points){c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));}
function route(c,points,color,width=1){path(c,points);c.strokeStyle=color;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke();}
function disc(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
function ramp(c,x,y,w,h,stops){const g=c.createLinearGradient(x,y,x+w,y+h);for(const[p,color]of stops)g.addColorStop(p,color);return g;}
function physicalPrint(c,value,x,y,size=8,{align='left',color=COLORS.ink,alpha=1}={}){
  c.save();c.globalAlpha*=alpha;c.font=`500 ${size}px Arial,Helvetica,sans-serif`;
  c.textAlign=align;c.textBaseline='middle';c.fillStyle='rgba(5,18,13,.64)';c.fillText(value,x+.45,y+.75);
  c.fillStyle=color;c.fillText(value,x,y);c.restore();
}
export function witnessEndingIds(value){return ENDING_IDS.filter(id=>Array.isArray(value)&&value.includes(id));}
export function clearWitnessMaterialCache(){cache.clear();cachePixels=0;}
export function witnessMaterialCacheStats(){return {entries:cache.size,pixels:cachePixels,maxEntries:MAX_ENTRIES,maxPixels:MAX_PIXELS};}
function layer(ctx,key,w,h,dpr,paint){
  if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit.canvas;}
  const width=Math.ceil(w*dpr),height=Math.ceil(h*dpr),pixels=width*height;
  const owner=ctx.canvas?.ownerDocument||(typeof document==='undefined'?null:document);
  if(!owner?.createElement||pixels>MAX_PIXELS)return null;
  const canvas=owner.createElement('canvas');canvas.width=width;canvas.height=height;
  const c=canvas.getContext?.('2d');if(!c)return null;
  c.scale(dpr,dpr);paint(c);
  while(cache.size&&(cache.size>=MAX_ENTRIES||cachePixels+pixels>MAX_PIXELS)){
    const first=cache.keys().next().value;cachePixels-=cache.get(first).pixels;cache.delete(first);
  }
  cache.set(key,{canvas,pixels});cachePixels+=pixels;return canvas;
}
function drawLayer(c,key,w,h,dpr,paint){
  const canvas=layer(c,key,w,h,dpr,paint);
  if(canvas)c.drawImage(canvas,0,0,canvas.width/dpr,canvas.height/dpr);else paint(c);
}
function component(c,p){
  const {x,y,w,h,id,kind}=p;
  c.save();c.shadowColor='#03110ddd';c.shadowBlur=3;c.shadowOffsetX=1.4;c.shadowOffsetY=2.7;
  if(kind==='capacitor'){
    const r=Math.min(w,h)/2;
    disc(c,x,y+1,r+1,'#11231e');c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0;
    disc(c,x,y,r,ramp(c,x-r,y-r,w,h,[[0,'#eef0dc'],[.2,'#ced1bf'],[.5,'#8e9e91'],[.77,'#bcc3b4'],[1,'#596e60']]));
    disc(c,x,y-.5,r*.79,ramp(c,x-r,y-r,w,h,[[0,'#e2e4d1'],[.48,'#b5c0ad'],[1,'#829787']]));
    route(c,[{x:x-r*.39,y:y-.8},{x:x+r*.39,y:y-.8}],'#748576',.65);
    route(c,[{x,y:y-r*.39},{x,y:y+r*.39}],'#839382',.6);
    c.beginPath();c.arc(x,y,r*.91,Math.PI*1.05,Math.PI*1.78);c.strokeStyle='#f8f3dba8';c.lineWidth=.65;c.stroke();
  }else if(kind==='film'){
    fill(c,x-w/2,y-h/2,w,h,'#5b351e',1.8);c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0;
    fill(c,x-w/2,y-h/2,w,h-2,ramp(c,x,y-h/2,0,h,[[0,'#e0b270'],[.24,COLORS.amber],[1,'#986235']]),1.7);
    route(c,[{x:x-w/2+2,y:y-h/2+1},{x:x+w/2-2,y:y-h/2+1}],'#efd098b5',.65);
  }else if(kind==='ic'){
    for(let i=0;i<Math.max(4,Math.floor(w/5));i++){
      const px=x-w/2+3+i*5;fill(c,px,y-h/2-3,1.8,h+6,COLORS.silver,.35);
    }
    fill(c,x-w/2,y-h/2,w,h,'#0e1c19',1.5);c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0;
    stroke(c,x-w/2+.6,y-h/2+.6,w-1.2,h-1.2,'#526052',1,.6);
    disc(c,x-w/2+4,y-h/2+4,1.1,'#647163');
    physicalPrint(c,id,x,y,6.5,{align:'center',color:'#b2bca5',alpha:.75});
  }else{
    route(c,[{x:x-w/2-4,y},{x:x+w/2+4,y}],COLORS.silver,1.1);
    fill(c,x-w/2,y-h/2,w,h,ramp(c,x,y-h/2,0,h,[[0,'#d8b985'],[.5,'#b39569'],[1,'#7b694b']]),h/2);
    c.shadowBlur=0;c.shadowOffsetX=c.shadowOffsetY=0;
    ['#705241','#253c31','#a9a276'].forEach((color,i)=>fill(c,x-w*.28+i*w*.2,y-h/2+.2,1.4,h-.4,color));
  }
  c.restore();
  if(kind!=='ic')physicalPrint(c,id,x+w/2+3,y+2,5.5,{color:'#a7b69b',alpha:.68});
}
function interior(c,a){
  const W=a.width,H=a.height;
  // An opaque inner tray is essential: clear means visible construction, not
  // accidental alpha compositing with a corridor behind the modal.
  fill(c,12,15,W-24,H-35,'#111c17',9);
  fill(c,16,19,W-32,H-43,ramp(c,16,19,W-32,H-43,[[0,'#515849'],[.26,'#282f26'],[.74,'#2f392b'],[1,'#787963']]),7);
  fill(c,30,71,W-60,H-151,'#080e0c',5);
  for(const b of a.boards){
    c.save();c.shadowColor='#000c';c.shadowBlur=4;c.shadowOffsetY=3;
    fill(c,b.x,b.y,b.w,b.h,'#081a13',2);c.shadowBlur=0;c.shadowOffsetY=0;
    fill(c,b.x,b.y,b.w,b.h-1.7,ramp(c,b.x,b.y,0,b.h,[[0,'#315543'],[.16,COLORS.pcb],[1,'#18392d']]),1.6);
    stroke(c,b.x+.6,b.y+.6,b.w-1.2,b.h-2.8,COLORS.pcbEdge,1,.65);c.restore();
    // Board-edge solder mask and a handful of honest plated fastening vias.
    for(const x of [b.x+4,b.x+b.w-4])for(const y of [b.y+4,b.y+b.h-5]){
      disc(c,x,y,1.65,'#b49b62');disc(c,x,y,.72,'#10231b');
    }
  }
  for(const points of a.traces){
    route(c,points,'#082318',2.8);route(c,points,'#8d7943',1.35);route(c,points,'#c0a36777',.4);
    for(const p of [points[0],points.at(-1)]){disc(c,p.x,p.y,1.65,'#aa915c');disc(c,p.x,p.y,.6,'#263f2a');}
  }
  a.components.forEach(p=>component(c,p));
  for(const j of a.connectors){
    fill(c,j.x-4.7,j.y-3,9.4,6,'#0a1912',.8);
    fill(c,j.x-4,j.y-3.4,8,5.7,'#c5b89b',.7);
    for(let i=0;i<j.pins;i++){fill(c,j.x-2.8+i*2.7,j.y-2.1,1.2,2.7,'#3c3b2b',.2);}
  }
  for(const wire of a.wires){
    c.save();c.shadowColor='#020907c4';c.shadowBlur=2.4;c.shadowOffsetY=2.1;
    route(c,wire.points,'#101911',wire.radius*2+1);c.shadowBlur=0;c.shadowOffsetY=0;
    route(c,wire.points,COLORS[wire.color],wire.radius*2);
    route(c,wire.points.map(p=>({x:p.x-.28,y:p.y-.38})),wire.color==='cream'?'#f4e6c46b':'#bf817067',.55);
    c.restore();
  }
  // These are underside pad-printed chassis legends, outside the VFD well.
  if(W>=580){
    physicalPrint(c,'AUDIOCORP',43,27.8,9,{alpha:.95});
    physicalPrint(c,'WITNESS EDITION',W/2,27.8,10,{align:'center'});
    physicalPrint(c,'DA–1000',W-42,27.8,8.5,{align:'right',alpha:.9});
  }else{
    physicalPrint(c,'WITNESS EDITION',42,27.8,9);
    if(W>300)physicalPrint(c,'DA–1000',W-42,27.8,8,{align:'right'});
  }
}
function cover(c,a){
  const W=a.width,H=a.height;
  c.save();rect(c,12,15,W-24,H-35,9);c.clip();
  // Warm transmission is restrained, leaving the solder-mask visibly green.
  fill(c,12,15,W-24,H-35,ramp(c,12,15,W-24,H-35,[[0,'#f7ebcb20'],[.3,'#ead9ad08'],[.75,'#f0dbad10'],[1,'#dec49225']]),9);
  const reflect=ramp(c,14,15,W*.8,H*.5,[[0,'#fff7dd1e'],[.31,'#fffbe60a'],[.315,'#ffffec16'],[.33,'#ffffff00'],[1,'#ffffff00']]);
  fill(c,12,15,W-24,H-35,reflect,9);
  // A narrow bright inner return and dark outer seam describe thickness. The
  // diagonal moulded flanks occupy real material, not a blanket white overlay.
  stroke(c,13,16,W-26,H-37,'#171d1499',8,2);
  stroke(c,15.1,18.1,W-30.2,H-41.2,'#f4eac08c',6.5,2.3);
  stroke(c,19,22,W-38,H-49,'#181e1666',4,.75);
  stroke(c,20.2,23.1,W-40.4,H-51.2,'#ffffdf42',3.5,.65);
  route(c,[{x:23,y:17.7},{x:W-25,y:17.7}],'#fffbe0b0',1.15);
  route(c,[{x:16,y:27},{x:16,y:H-32}],'#fff5d882',1.4);
  route(c,[{x:24,y:H-23.3},{x:W-26,y:H-23.3}],'#e5d3a389',2.4);
  route(c,[{x:W-16,y:29},{x:W-16,y:H-34}],'#a6936f8c',2.2);
  // Polished aperture lip. The opaque instrument well is drawn above it.
  stroke(c,30.5,71.5,W-61,H-157,'#d2c3948a',5.2,1.7);
  stroke(c,32.3,73.3,W-64.6,H-160.6,'#f7efd36e',4,1);
  c.restore();
  for(const [i,position]of a.mounts.entries()){
    // Physical fasteners keep their diameter on a responsive panel. Anchor
    // their seats inside the clear rim rather than scaling them off its edge.
    const p={x:clamp(position.x,24,W-24),y:position.y};
    disc(c,p.x+.6,p.y+1.2,8.2,'#12190fa8');
    disc(c,p.x,p.y,8,ramp(c,p.x-8,p.y-8,16,16,[[0,'#a28446'],[.22,'#ecd39a'],[.52,'#b59959'],[.78,'#735b32'],[1,'#d3bd7c']]));
    disc(c,p.x,p.y,6.65,'#3d402e');
    drawHardwareScrew(c,p.x,p.y,5.55,{seed:`witness:mount:${i}`,dpr:1,darkPanel:true});
  }
}

/** Physical service plate layout, never a change to the transport hit boxes. */
export function witnessServiceLayout(assembly,buttonSlots=[]){
  const s=assembly.service,left=buttonSlots[0]?.x??Infinity;
  if(s.x+s.w+8<=left)return {...s,compact:false};
  // A narrow instrument has three unchanged full-width transport keys. Put a
  // shorter service stamp on the unused lower rim instead of painting on them.
  return {x:Math.max(42,(assembly.width-176)/2),y:assembly.height-31,w:Math.max(1,Math.min(176,assembly.width-84)),h:8,compact:true};
}
function service(c,a,buttonSlots,endings){
  const s=witnessServiceLayout(a,buttonSlots),earned=witnessEndingIds(endings);
  fill(c,s.x,s.y,s.w,s.h,'#c9c2a438',1.5);stroke(c,s.x,s.y,s.w,s.h,'#e2d4ae68',1.5,.55);
  const count=`${String(earned.length).padStart(2,'0')} / ${String(ENDING_IDS.length).padStart(2,'0')}`;
  if(s.compact){
    physicalPrint(c,`WITNESSED ${count}`,s.x+4,s.y+s.h/2,5.9);
  }else physicalPrint(c,`WITNESSED ${count}`,s.x+8,s.y+7,6.8);
  const size=s.compact?3.2:5.2,gap=s.compact?3.8:8.2;
  const start=s.compact?s.x+s.w-ENDING_IDS.length*gap-4:s.x+8;
  const y=s.compact?s.y+2.3:s.y+12.6;
  ENDING_IDS.forEach((id,i)=>{
    stroke(c,start+i*gap,y,size,size,'#e4d4ab48',.3,.45);
    if(earned.includes(id))fill(c,start+i*gap+.8,y+.8,Math.max(.5,size-1.6),Math.max(.5,size-1.6),COLORS.ink,.15);
  });
}
function switches(c,slots,keys){
  slots.forEach((slot,i)=>{
    const key=keys[i]||{},travel=clamp(key.travel),x=slot.x+slot.w/2,y=slot.y;
    c.save();c.shadowColor='#07100cc9';c.shadowBlur=3;c.shadowOffsetY=2;
    fill(c,x-14,y-6,28,slot.h+14,'#16271f',3);c.shadowBlur=0;c.shadowOffsetY=0;
    stroke(c,x-13.5,y-5.5,27,slot.h+13,'#98a78c9c',2.5,.6);
    fill(c,x-4,y-5+travel,8,slot.h+11-travel,ramp(c,x-4,0,8,0,[[0,'#6a6f58'],[.32,'#e0d8b8'],[.56,'#b6ae8c'],[1,'#4d5847']]),1);
    for(let k=0;k<3;k++)route(c,[{x:x-5,y:y-4+k*1.6+travel},{x:x+5,y:y-3.5+k*1.6+travel}],'#e0dec288',.55);
    disc(c,x+11,y+slot.h+6,1.55,'#0b1610');
    disc(c,x+11,y+slot.h+6,1,key.lit?'#dda65a':'#544528');
    c.restore();
  });
}
function phosphorSpill(c,a,color,level){
  if(typeof color!=='string'||!level)return;
  // Only the live display's chosen phosphor can illuminate nearby material.
  // The well will cover the emitting edge itself; a restrained halo remains
  // on the clear lip and the board returns. Never invent a second lamp.
  c.save();c.globalAlpha*=clamp(level)*.09;c.shadowColor=color;c.shadowBlur=12;
  stroke(c,34,75,a.width-68,a.height-164,color,3,1.1);c.restore();
}

/** x/y are device pixels; w/h and buttonSlots are recorder design units;
 * dpr is the complete design-to-device scale. Inputs are read-only snapshots.
 */
export function drawWitnessChassis(ctx,{x=0,y=0,w=736,h=405,dpr=1,buttonSlots=[],keys=[],endings=[],phosphor=null,illumination=0}={}){
  if(!ctx||![x,y,w,h,dpr].every(Number.isFinite)||w<=24||h<=35||dpr<=0)return false;
  const assembly=witnessAssemblyLayout(w,h),cacheKey=`${WITNESS_DESIGN.revision}:${w}:${h}:${dpr}`;
  ctx.save();try{
    ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    ctx.translate(x,y);ctx.scale(dpr,dpr);
    drawLayer(ctx,`body:${cacheKey}`,w,h,dpr,c=>interior(c,assembly));
    switches(ctx,buttonSlots,keys);service(ctx,assembly,buttonSlots,endings);
    drawLayer(ctx,`cover:${cacheKey}`,w,h,dpr,c=>cover(c,assembly));
    phosphorSpill(ctx,assembly,phosphor,illumination);
  }finally{ctx.restore();}
  return true;
}
