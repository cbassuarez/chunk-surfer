import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { strikeFireballSurface } from './game/fireball-surface-hit.js';
import { fireballSurfacePose } from './game/fireball-surface-pose.js';
import { createFireballSurfaceChase } from './game/fireball-surface-chase.js';

const canvas=document.getElementById('cast');
const ctx=canvas.getContext('2d',{alpha:true});
const sprite=new Image();
sprite.src='./assets/fireball-sheet.svg';
let cast=null,pane=null,startedAt=performance.now(),raf=0;
let locallyStruckIdentity='';
let lastPainted=null;
const chase=createFireballSurfaceChase();
const acquiredKeys=new Set();
let acquisitionIdentity='';

// Study observers read the completed canvas frame, rather than inferring a
// paint from delivery timing. Copies keep observation separate from game state.
export function readFireballSurfaceFrame(){return lastPainted?structuredClone(lastPainted):null;}

function adoptChase(frame){
  cast=frame.cast;
  const identity=`${cast?.castId}:${cast?.surfaceIndex}`;
  if(identity!==acquisitionIdentity){acquiredKeys.clear();acquisitionIdentity=identity;}
  if(frame.acquired&&!acquiredKeys.has(frame.key)){
    acquiredKeys.add(frame.key);
    void emit('fireball-cast-acquire',{castId:cast.castId,surfaceIndex:cast.surfaceIndex,offer:frame.offer});
  }
}

function trackPointer(event){
  if(pane)return;
  const bounds=canvas.getBoundingClientRect();
  adoptChase(chase.pointer({x:event.clientX-bounds.left,y:event.clientY-bounds.top,active:true},{paintedPose:lastPainted?.pose,now:performance.now()}));
  paint(performance.now());
}

function strike(event){
  if(pane)return false;
  trackPointer(event);
  const bounds=canvas.getBoundingClientRect();
  const result=strikeFireballSurface(cast,(payload)=>emit('fireball-cast-hit',payload),{
    x:event.clientX-bounds.left,y:event.clientY-bounds.top,width:bounds.width,height:bounds.height,pose:lastPainted?.pose,
  });
  if(!result.hit){void emit('fireball-cast-miss',result.payload||{});return false;}
  adoptChase(chase.setCast(result.cast));
  locallyStruckIdentity=`${cast.castId}:${cast.surfaceIndex}`;
  startedAt=performance.now();
  paint(startedAt);
  return true;
}

function enterPane(){
  if(!pane?.interactive)return false;
  void emit('window-choreography-pane-action',{
    cueId:String(pane.cueId||''),paneId:String(pane.paneId||''),action:'enter',
  });
  return true;
}

function size(){
  const dpr=Math.max(1,devicePixelRatio||1),w=Math.max(1,Math.round(innerWidth*dpr)),h=Math.max(1,Math.round(innerHeight*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;ctx.imageSmoothingEnabled=false;}
  return{w,h,dpr};
}

// IT IS COMING AT YOU, NOT PAST YOU — AND IT IS BUILT THE SAME WAY THE ONE
// INSIDE THE GAME IS.
//
// The transparent native carrier stays fixed and owns every old target position.
// Only its black target tile travels, using the same pure pose as pointer hits.
// The layers and ordered dither remain the ones the player saw on the stage.
const BAYER4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const dithered=(cx,cy,coverage)=>(BAYER4[((cy&3)<<2)|(cx&3)]+.5)/16<coverage;
const EMBER_RAMP=['#FFF6AA','#FFE15A','#FFAD1F','#FF6A15','#E74712','#A9260C','#5C1406'];
const RETURN_RAMP=['#EAFBFF','#BFF1FF','#84E0FF','#3FBEEC','#1C86B4','#12536F','#08283A'];
const rampAt=(ramp,t)=>ramp[Math.max(0,Math.min(ramp.length-1,Math.round(t*(ramp.length-1))))];
const NOTE_SPRITES={
  quaver:['..###','..#.#','..#..','..#..','..#..','###..','###..'],
  beamed:['#######','#.....#','#.....#','#.....#','#.....#','###.###','###.###'],
  crotchet:['...#.','...#.','...#.','...#.','...#.','###..','###..'],
};
const NOTE_KINDS=['quaver','beamed','crotchet','quaver'];
function hash(seed,index){
  let h=(Math.imul(seed|0,0x9e3779b1)^Math.imul(index+1,0x85ebca6b))>>>0;
  h^=h>>>15;h=Math.imul(h,0x2545f491)>>>0;h^=h>>>13;
  return (h>>>0)/4294967296;
}

function drawPane(w,h,at){
  const palette=pane?.palette||'black';
  ctx.fillStyle=palette==='white'?'#f7f6ef':palette==='red'?'#360000':'#000';
  ctx.fillRect(0,0,w,h);
  const unit=Math.max(2,Math.round(Math.min(w,h)/64));
  const elapsed=Math.max(0,(at-startedAt)/1000);
  if(pane.mode==='shatter'){
    for(let index=0;index<42;index+=1){
      const x=hash(91,index)*w,y=hash(211,index)*h+elapsed*30*(.3+hash(412,index));
      const side=unit*(1+Math.floor(hash(732,index)*5));
      ctx.fillStyle=index%4===0?'#d7dbe0':'#303238';ctx.fillRect(x,y%h,side,side);
    }
  }else{
    const red=palette==='red';
    const white=palette==='white';
    for(let row=0;row<h;row+=unit){
      for(let col=0;col<w;col+=unit){
        const wave=.5+.5*Math.sin(col*.028+row*.019+elapsed*(pane.mode==='boss'?1.8:.3));
        if(!dithered(Math.round(col/unit),Math.round(row/unit),.05+wave*.08))continue;
        ctx.fillStyle=red?'#a31313':white?'#d8d7d0':'#1e2730';ctx.fillRect(col,row,unit,unit);
      }
    }
    if(pane.mode==='boss'){
      ctx.fillStyle=red?'#e52b1a':white?'#111':'#d4d8df';
      const cx=w*.5,cy=h*.52,body=Math.min(w,h)*.38;
      ctx.fillRect(cx-body*.12,cy-body*.48,body*.24,body*.96);
      ctx.fillRect(cx-body*.38,cy-body*.15,body*.76,body*.24);
    }
  }
  const text=String(pane.text||pane.title||'').trim();
  if(text){
    ctx.fillStyle=palette==='white'?'#080808':'#f2f2ed';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`${Math.max(9,Math.floor(Math.min(w,h)*.075))}px ui-monospace,monospace`;
    const words=text.split(/\s+/u),lines=[];let line='';
    for(const word of words){const next=line?`${line} ${word}`:word;if(ctx.measureText(next).width>w*.82&&line){lines.push(line);line=word;}else line=next;}
    if(line)lines.push(line);
    lines.slice(0,5).forEach((value,index)=>ctx.fillText(value,w*.5,h*.5+(index-(Math.min(5,lines.length)-1)*.5)*Math.min(w,h)*.10));
  }
  if(pane.interactive){
    ctx.strokeStyle=palette==='white'?'#111':'#fff';ctx.lineWidth=unit;
    ctx.strokeRect(unit*2,unit*2,w-unit*4,h-unit*4);
  }
}

function paint(at){
  const {w,h,dpr}=size();ctx.clearRect(0,0,w,h);
  lastPainted=null;
  if(pane){drawPane(w,h,at);return;}
  if(cast){
    const paintedCast=cast;
    const interaction=chase.snapshot();
    const pose=interaction.pose||fireballSurfacePose(cast,{width:w/dpr,height:h/dpr});
    const tileW=pose.size*dpr;
    ctx.save();ctx.translate(pose.x*dpr,pose.y*dpr);
    ctx.beginPath();ctx.rect(0,0,tileW,tileW);ctx.clip();
    ctx.fillStyle='#000';ctx.fillRect(0,0,tileW,tileW);
    drawFireballTile(tileW,tileW,dpr,at);
    ctx.restore();
    lastPainted={cast:paintedCast,pose,interaction:{acquired:interaction.acquired,progress:interaction.progress,key:interaction.key,velocity:interaction.velocity,bounces:interaction.bounces},at:performance.timeOrigin+at,width:w/dpr,height:h/dpr};
  }
}

// rAF animates cosmetic breathing only. Native event delivery must paint its
// geometry and cue synchronously even when an unfocused webview suspends rAF.
function draw(at){paint(at);raf=requestAnimationFrame(draw);}

function drawFireballTile(w,h,dpr,at){
  const ray=cast.rays?.[0];
  if(!ray)return;
  const elapsed=Math.max(0,(at-startedAt)/1000);
  const answered=cast.state==='deflected'||cast.state==='reversed';
  const ramp=answered?RETURN_RAMP:EMBER_RAMP;
  const unit=Math.max(2,Math.round(Math.min(w,h)/56));
  const seed=(Number(cast.surfaceIndex)||0)*2654435761+7;
  const cx=w*.5,cy=h*.5;
  const cells=Math.max(3,Math.round(Math.min(w,h)*.46/unit));

  if(cast.state==='impact'||cast.state==='deflected'){
    // It arrived. The dither blows out to white and collapses, which is the one
    // moment this window is allowed to be brighter than the game behind it.
    const age=Math.max(0,1-elapsed/.26);
    const open=1-age;
    for(let gy=-cells;gy<=cells;gy+=1){
      for(let gx=-cells;gx<=cells;gx+=1){
        const dist=Math.hypot(gx,gy)/cells;
        if(dist>1)continue;
        const shell=1-Math.abs(dist-open)*2.2;
        if(shell<=0)continue;
        if(!dithered(Math.round(cx/unit)+gx,Math.round(cy/unit)+gy,shell*age+age*.35))continue;
        ctx.fillStyle=rampAt(ramp,dist*.85);
        ctx.fillRect(Math.round(cx/unit+gx)*unit,Math.round(cy/unit+gy)*unit,unit,unit);
      }
    }
    if(Number.isInteger(cast.damage)&&cast.damage>0){
      ctx.fillStyle=EMBER_RAMP[1];ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=`${Math.floor(Math.min(w,h)*.24)}px ui-monospace,monospace`;
      ctx.fillText(String(cast.damage),cx,cy);
    }
    return;
  }

  // ── the corona, breathing, filling the surface ─────────────────────────
  const breath=cast.reducedMotion?.5:(.5+.5*Math.sin(elapsed*8.2));
  for(let gy=-cells;gy<=cells;gy+=1){
    for(let gx=-cells;gx<=cells;gx+=1){
      const dist=Math.hypot(gx,gy)/cells;
      if(dist>1)continue;
      // Solid at the core, dithering out to nothing at the rim, with the rim
      // itself moving as it burns.
      const coverage=(1-dist)**1.35*(1.06+breath*.16)-(dist>.62?(dist-.62)*.4:0);
      if(coverage<=.02)continue;
      if(!dithered(Math.round(cx/unit)+gx,Math.round(cy/unit)+gy,coverage))continue;
      ctx.fillStyle=rampAt(ramp,Math.min(1,dist*1.15));
      ctx.fillRect(Math.round(cx/unit+gx)*unit,Math.round(cy/unit+gy)*unit,unit,unit);
    }
  }

  // ── the authored core, tumbling ───────────────────────────────────────
  const frame=cast.reducedMotion?2:Math.floor(elapsed*14)%8;
  const side=Math.min(w,h)*.52;
  const spin=cast.reducedMotion?0:Math.atan2(ray.direction.y,ray.direction.x)+Math.sin(elapsed*3.1)*.14;
  if(sprite.complete&&sprite.naturalWidth){
    ctx.save();ctx.translate(cx,cy);ctx.rotate(spin);
    ctx.drawImage(sprite,frame*32,0,32,32,-side*.5,-side*.5,side,side);
    ctx.restore();
  }

  // ── embers thrown off the rim ─────────────────────────────────────────
  for(let ember=0;ember<14;ember+=1){
    const phase=cast.reducedMotion?hash(seed,ember):((elapsed*(.8+hash(seed+5,ember)*1.1)+hash(seed,ember))%1);
    const angle=hash(seed+31,ember)*Math.PI*2;
    const reach=Math.min(w,h)*(.18+phase*.42);
    const size=Math.max(unit,Math.round(unit*(2.4-phase*1.6)));
    ctx.globalAlpha=(1-phase)*.85;
    ctx.fillStyle=rampAt(ramp,.2+phase*.7);
    ctx.fillRect(Math.round(cx+Math.cos(angle)*reach),Math.round(cy+Math.sin(angle)*reach),size,size);
  }
  ctx.globalAlpha=1;

  // The brackets now promise a genuinely fixed catch mark. Name the action
  // and the reoffer so a retreat cannot read as evasion from the player's hand.
  if(cast.catchReady){
    const radius=Math.min(w,h)*.43;
    const arm=Math.max(unit*3,Math.round(radius*.22));
    ctx.globalAlpha=cast.reducedMotion?1:.78+.22*Math.sin(elapsed*5.2);
    ctx.strokeStyle=RETURN_RAMP[1];
    ctx.lineWidth=Math.max(unit,Math.round(unit*1.5));
    ctx.beginPath();
    for(const sx of [-1,1])for(const sy of [-1,1]){
      const x=cx+sx*radius,y=cy+sy*radius;
      ctx.moveTo(x-sx*arm,y);ctx.lineTo(x,y);ctx.lineTo(x,y-sy*arm);
    }
    ctx.stroke();
    ctx.globalAlpha=1;
  }
  if(cast.state==='outbound'&&(cast.catchReady||cast.offer>1)){
    const label=cast.catchReady?(cast.offer>1?'LAST CHANCE':'DEFLECT'):'AGAIN';
    ctx.font=`bold ${Math.max(10*dpr,Math.round(Math.min(w,h)*.075))}px ui-monospace,monospace`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='#000';ctx.fillRect(w*.1,h*.825,w*.8,h*.13);
    ctx.fillStyle=RETURN_RAMP[1];ctx.fillText(label,w*.5,h*.89);
  }

  // ── and what it is made of ────────────────────────────────────────────
  const shed=cast.reducedMotion?1:3;
  for(let note=0;note<shed;note+=1){
    const phase=cast.reducedMotion?.5:((elapsed*.7+hash(seed+404,note))%1);
    const alpha=Math.sin(Math.min(1,phase)*Math.PI)*.8;
    if(alpha<=.05)continue;
    const glyph=NOTE_SPRITES[NOTE_KINDS[note%NOTE_KINDS.length]];
    const px=Math.max(1,Math.round(Math.min(w,h)*.055/glyph.length));
    const angle=hash(seed+808,note)*Math.PI*2;
    const reach=Math.min(w,h)*(.12+phase*.34);
    const originX=Math.round(cx+Math.cos(angle)*reach);
    const originY=Math.round(cy+Math.sin(angle)*reach-phase*Math.min(w,h)*.1);
    ctx.globalAlpha=alpha;
    ctx.fillStyle=answered?RETURN_RAMP[1]:'#FFB536';
    for(let row=0;row<glyph.length;row+=1){
      const line=glyph[row];
      for(let col=0;col<line.length;col+=1){
        if(line[col]!=='#')continue;
        ctx.fillRect(originX+col*px,originY+row*px,px,px);
      }
    }
  }
  ctx.globalAlpha=1;
  void dpr;
}

async function boot(){
  addEventListener('pointerdown',(event)=>{event.preventDefault();event.stopPropagation();if(!enterPane())strike(event);},{capture:true});
  addEventListener('pointermove',trackPointer,{capture:true});
  addEventListener('pointerenter',trackPointer,{capture:true});
  // Native surfaces accept the first mouse press. Activation alone is not a
  // catch: showing a window or switching applications can also focus it.
  // Global Tauri listeners receive targeted events too. Each physical surface
  // must keep its own cast identity and feedback when siblings are updated.
  const surfaceWindow=getCurrentWindow();
  await surfaceWindow.listen('fireball-cast',({payload})=>{
    const identity=`${payload?.castId}:${payload?.surfaceIndex}`;
    // An already accepted physical press cannot be reopened by a late in-flight
    // pose update. The authoritative deflect/RETURN response may still replace it.
    if(identity===locallyStruckIdentity&&payload?.state==='outbound'){paint(performance.now());return;}
    const previous=cast;
    if(identity!==locallyStruckIdentity)locallyStruckIdentity='';
    pane=null;adoptChase(chase.setCast(payload||null));
    const changed=!previous||previous.castId!==cast?.castId||previous.state!==cast?.state
      ||previous.catchReady!==cast?.catchReady||previous.offer!==cast?.offer;
    if(changed)startedAt=performance.now();
    paint(performance.now());
  });
  await surfaceWindow.listen('window-choreography-pane',({payload})=>{
    chase.setCast(null);cast=null;pane=payload||null;startedAt=performance.now();paint(startedAt);
  });
  await surfaceWindow.listen('fireball-cast-pointer',({payload})=>{
    if(payload?.width&&payload?.height)chase.resize(payload);
    const frame=chase.nativePointer(payload,{paintedPose:lastPainted?.pose,now:performance.now()});
    if(pane)return;
    adoptChase(frame);paint(performance.now());
  });
  raf=requestAnimationFrame(draw);
}
void boot();
addEventListener('beforeunload',()=>cancelAnimationFrame(raf));
