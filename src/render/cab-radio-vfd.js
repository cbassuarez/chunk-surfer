// The radio's tube: green phosphor segments behind smoked glass, unlit segments still
// faintly there, a clock that stays lit when the set is off. `cabRadioVfdFrame` decides
// what's showing and is pure; `createCabRadioFace` paints it and uploads only on a change.
import {drawVfdGlyph} from './vfd-font.js';
import {CAB_RADIO_FREQUENCIES,CAB_RADIO_ROAD_CLOCK,CAB_RADIO_ROAD_CLOCK_LAST,CAB_RADIO_ROAD_NAMES,CAB_RADIO_ROAD_STATIONS} from '../data/cab-radio.js';

export const CAB_RADIO_VFD_SIZE=Object.freeze([920,240]);
const NAME_CELLS=15,BLANK_CLOCK='  :  ';
const LIT='#6dffc4',CORE='#d6fff0',GHOST='rgba(90,255,190,.052)',GLASS='#020806';

// a top, b top right, c bottom right, d bottom, e bottom left, f top left, g middle.
export const SEVEN_SEGMENTS=Object.freeze({
  0:'abcdef',1:'bc',2:'abdeg',3:'abcdg',4:'bcfg',5:'acdfg',6:'acdefg',7:'abc',8:'abcdefg',9:'abcdfg',' ':'','-':'g',
});
export function segmentsFor(ch){return SEVEN_SEGMENTS[ch]??'';}

const seeded=serial=>{const x=Math.sin((Number(serial)||0)*91.17+3.3)*43758.5453;return x-Math.floor(x);};
/** The digits running away from the preset and back, across a dial turn. */
export function sweptFrequency(base,tuning){
  if(!tuning)return base;
  const u=Math.max(0,Math.min(1,Number(tuning.fraction)||0)),out=1-Math.abs(u*2-1),seed=seeded(tuning.serial);
  const reach=3.1+seed*7,direction=base>98?-1:1;
  return Math.max(87.5,Math.min(108,base+direction*reach*out*out*(3-2*out)));
}
const clockText=(hour,minute)=>`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
/** The clock for a stretch of the first drive. Past the last stretch nobody has set it. */
export function cabRadioRoadClock(stretch){
  const base=stretch?.id?CAB_RADIO_ROAD_CLOCK[stretch.id]:null;
  if(!base)return null;
  const minutes=Math.min(CAB_RADIO_ROAD_CLOCK_LAST[0]*60+CAB_RADIO_ROAD_CLOCK_LAST[1],base[0]*60+base[1]+Math.floor(Math.max(0,Number(stretch.time)||0)/60));
  return clockText(Math.floor(minutes/60),minutes%60);
}

/**
 * What the tube shows.
 * view: {on, preset, name, volume, clock, tuning, seconds, volumeFlash}. A null clock
 * blinks an empty colon, the way a set does that has lost its time.
 */
export function cabRadioVfdFrame({on=true,preset=-1,name='',clock=null,tuning=null,seconds=0,volumeFlash=null,receiving=true}={}){
  const pulse=Math.floor(Math.max(0,Number(seconds)||0))%2===0;
  const blank=clock==null||String(clock).trim()===':'||String(clock).trim()==='';
  const time=blank?BLANK_CLOCK:String(clock),colon=!blank||pulse;
  if(!on)return{on:false,frequency:'',point:false,band:'',stereo:false,preset:0,name:'',clock:time,colon,key:`off|${time}|${colon}`};
  const base=CAB_RADIO_FREQUENCIES[preset]??CAB_RADIO_FREQUENCIES[0],value=sweptFrequency(base,tuning),tenths=Math.round(value*10);
  const digits=String(tenths).padStart(4,' ');
  let label=String(name||'').toUpperCase();
  if(volumeFlash!=null)label=`VOL ${String(Math.round(Math.max(0,Math.min(1,volumeFlash))*30)).padStart(2,'0')}`;
  else if(tuning)label='';
  else if(label.length>NAME_CELLS){const run=`${label}   `,step=Math.floor(Math.max(0,Number(seconds)||0)*3)%run.length;label=(run+run).slice(step,step+NAME_CELLS);}
  const stereo=!tuning&&receiving!==false,shownPreset=tuning?0:preset+1;
  return{on:true,frequency:digits,point:true,band:'FM',stereo,preset:shownPreset,name:label,clock:time,colon,
    key:`on|${digits}|${stereo}|${shownPreset}|${label}|${time}|${colon}`};
}

/** What to show for a drive frame. Reads only what every drive frame carries. */
export function cabRadioRoadView(frame={},seconds=0){
  const drive=frame.driveState||{},pose=frame.vehiclePose||frame.cinematic?.vehiclePose||{},station=drive.station||'service';
  return{on:drive.radioOn!==false,preset:CAB_RADIO_ROAD_STATIONS.indexOf(station),name:CAB_RADIO_ROAD_NAMES[station]||'',volume:drive.volume,
    tuning:pose.tuning||null,clock:cabRadioRoadClock(pose.stretch),seconds};
}

// ── Painting ─────────────────────────────────────────────────────────────────────────
function segmentPath(ctx,id,x,y,w,h,t){
  const k=t/2,gap=t*.16,mid=y+h/2;
  const horizontal=(yy)=>{ctx.moveTo(x+gap+k,yy);ctx.lineTo(x+gap+k*2,yy-k);ctx.lineTo(x+w-gap-k*2,yy-k);ctx.lineTo(x+w-gap-k,yy);ctx.lineTo(x+w-gap-k*2,yy+k);ctx.lineTo(x+gap+k*2,yy+k);ctx.closePath();};
  // Runs between the centre lines of the bars above and below it, so the points nearly meet.
  const vertical=(xx,y0,y1)=>{ctx.moveTo(xx,y0+gap);ctx.lineTo(xx+k,y0+gap+k);ctx.lineTo(xx+k,y1-gap-k);ctx.lineTo(xx,y1-gap);ctx.lineTo(xx-k,y1-gap-k);ctx.lineTo(xx-k,y0+gap+k);ctx.closePath();};
  if(id==='a')horizontal(y+k);
  else if(id==='d')horizontal(y+h-k);
  else if(id==='g')horizontal(mid);
  else if(id==='f')vertical(x+k,y+k,mid);
  else if(id==='e')vertical(x+k,mid,y+h-k);
  else if(id==='b')vertical(x+w-k,y+k,mid);
  else if(id==='c')vertical(x+w-k,mid,y+h-k);
}
function digit(ctx,ch,x,y,w,h,t,{glow=16}={}){
  const lit=segmentsFor(ch);
  ctx.save();ctx.transform(1,0,-.07,1,.07*(y+h),0);
  // The segments that aren't lit are still in the glass.
  ctx.fillStyle=GHOST;ctx.beginPath();for(const id of'abcdefg')segmentPath(ctx,id,x,y,w,h,t);ctx.fill();
  if(lit){
    ctx.shadowColor=LIT;ctx.shadowBlur=glow;ctx.fillStyle=LIT;ctx.beginPath();for(const id of lit)segmentPath(ctx,id,x,y,w,h,t);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle=CORE;ctx.globalAlpha=.42;ctx.beginPath();for(const id of lit)segmentPath(ctx,id,x+t*.08,y+t*.08,w-t*.16,h-t*.16,t*.5);ctx.fill();
  }
  ctx.restore();
}
function dot(ctx,x,y,r,on,glow=12){
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);
  if(on){ctx.fillStyle=LIT;ctx.shadowColor=LIT;ctx.shadowBlur=glow;}else ctx.fillStyle=GHOST;
  ctx.fill();ctx.restore();
}
function matrix(ctx,text,x,y,cellW,cellH,alpha=1){
  [...text].forEach((ch,i)=>drawVfdGlyph(ctx,ch,x+i*cellW,y,cellW,cellH,{color:LIT,blur:7,alpha,dim:null,halation:.1}));
}
function lamp(ctx,text,x,y,cell,on){
  if(on)matrix(ctx,text,x,y,cell,cell*1.45);
  else[...text].forEach((ch,i)=>drawVfdGlyph(ctx,ch,x+i*cell,y,cell,cell*1.45,{color:'#16503c',blur:0,alpha:.5,halation:0}));
}

/**
 * Paints a frame. From the seat the tube is a few dozen pixels across and only big digits
 * survive, so that's all it draws until you've leaned in.
 */
export function drawCabRadioVfd(ctx,frame,{close=true}={}){
  const[W,H]=CAB_RADIO_VFD_SIZE;
  ctx.save();ctx.fillStyle=GLASS;ctx.fillRect(0,0,W,H);
  // Support grid and filaments behind the segments, only there if you get close.
  ctx.strokeStyle='rgba(120,255,205,.022)';ctx.lineWidth=1;ctx.beginPath();
  for(let x=4;x<W;x+=5){ctx.moveTo(x,0);ctx.lineTo(x,H);}
  ctx.stroke();ctx.strokeStyle='rgba(170,255,225,.045)';ctx.beginPath();
  for(const y of[58,118,176]){ctx.moveTo(0,y);ctx.lineTo(W,y);}
  ctx.stroke();

  const digits=(frame.frequency||'    ').padStart(4,' ').slice(-4);
  if(!close){
    const heavy=30,tall=212,y=14;
    [8,122,240,368].forEach((x,i)=>digit(ctx,digits[i],x,y,98,tall,heavy,{glow:18}));
    dot(ctx,350,y+tall-14,13,!!frame.point,14);
    const clock=String(frame.clock||BLANK_CLOCK).padEnd(5,' ');
    [[clock[0],488],[clock[1],578],[clock[3],704],[clock[4],796]].forEach(([c,x])=>digit(ctx,c,x,y,86,tall,26,{glow:14}));
    dot(ctx,692,y+66,10,!!frame.colon,10);dot(ctx,688,y+146,10,!!frame.colon,10);
    ctx.restore();return;
  }
  // The big digits.
  const t=19,dw=84,dh=150,top=12,left=[14,122,230,350];
  for(let i=0;i<4;i++)digit(ctx,digits[i],left[i],top,dw,dh,t,{glow:20});
  dot(ctx,left[3]-14,top+dh-9,8.5,!!frame.point,14);

  // Band and stereo, and which key is in.
  const right=478,preset=frame.preset?String(frame.preset):' ';
  lamp(ctx,'FM',right,14,30,frame.band==='FM');lamp(ctx,'ST',right+86,14,30,!!frame.stereo);
  lamp(ctx,'CH',right+196,14,30,!!frame.preset);digit(ctx,preset,right+268,8,50,66,11,{glow:12});

  // The clock is the one thing that stays lit.
  const clock=String(frame.clock||BLANK_CLOCK).padEnd(5,' '),cw=66,ch=118,cy=112,cx=[right+64,right+146,right+246,right+328];
  [clock[0],clock[1],clock[3],clock[4]].forEach((c,i)=>digit(ctx,c,cx[i],cy,cw,ch,14,{glow:14}));
  dot(ctx,right+231,cy+36,7,!!frame.colon,10);dot(ctx,right+231,cy+82,7,!!frame.colon,10);

  // The station, in the tube's dot matrix.
  matrix(ctx,String(frame.name||'').padEnd(NAME_CELLS,' ').slice(0,NAME_CELLS),14,172,30,62);
  ctx.restore();
}

/** Keeps one mesh's readout current. Draws and uploads only when what's shown changes. */
export function createCabRadioFace({mesh,upload,close=()=>false,createCanvas=()=>typeof document==='undefined'?null:document.createElement('canvas')}={}){
  let canvas=null,shown=null,lastVolume=null,flashUntil=-1,flashValue=null;
  return{
    sync(view={},seconds=0){
      if(view.volume!=null&&lastVolume!=null&&Math.abs(view.volume-lastVolume)>.001&&view.on!==false){flashUntil=seconds+1.4;flashValue=view.volume;}
      if(view.volume!=null)lastVolume=view.volume;
      const frame=cabRadioVfdFrame({...view,seconds,volumeFlash:seconds<flashUntil?flashValue:null}),near=close()===true,key=`${near?'close':'seat'}|${frame.key}`;
      if(key===shown)return false;
      if(!canvas){canvas=createCanvas();if(!canvas)return false;[canvas.width,canvas.height]=CAB_RADIO_VFD_SIZE;}
      const ctx=canvas.getContext('2d');if(!ctx)return false;
      drawCabRadioVfd(ctx,frame,{close:near});
      if(upload(mesh,canvas)===false)return false;
      shown=key;return true;
    },
    reset(){shown=null;},
  };
}
