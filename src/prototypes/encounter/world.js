import { uiClear, uiDraw, uiSize, uiWithAlpha } from '../../render/ui.js';
import { drawEnemyVoidStage, drawSignalBeing, drawFirstPersonHands } from '../../render/combat-view.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
let room=null, roomKey='', shell=null;

// Material study for the existing Natatorium shell: broken concentric ripples
// around the same hollow core. The production signal being is drawn over it.
function shellTexture(){
  if(shell)return shell;
  shell=document.createElement('canvas');shell.width=640;shell.height=640;
  const ctx=shell.getContext('2d'), data=ctx.createImageData(640,640);
  let seed=440;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  for(let y=0;y<640;y++)for(let x=0;x<640;x++){
    const u=(x-320)/300,v=(y-320)/255,a=Math.atan2(v,u),r=Math.hypot(u,v);
    const warp=Math.sin(a*5+r*8)*.022+Math.sin(a*11-r*12)*.012+Math.sin(a*29)*.006;
    const rr=r+warp, outside=clamp((.99-rr)*15), inside=clamp((rr-.20)*14);
    if(outside*inside<=0)continue;
    const ridges=Math.pow(Math.max(0,Math.sin(rr*96+Math.sin(a*4)*.7)),5);
    const light=clamp(.35-u*.30-v*.27),noise=rand();
    const broken=noise>.96?0:Math.sin(a*19+r*7)>.96?.12:1;
    const value=(.08+ridges*.73)*light*outside*inside*broken;
    const dot=noise<value*.86;
    const i=(y*640+x)*4;
    data.data[i]=dot?154+Math.round(light*45):22;
    data.data[i+1]=dot?162+Math.round(light*44):31;
    data.data[i+2]=dot?124+Math.round(light*37):25;
    data.data[i+3]=Math.round(clamp(dot?.83:outside*inside*.16)*255);
  }
  ctx.putImageData(data,0,0);return shell;
}

function roomTexture(w,h,dpr){
  const key=`${w}:${h}:${dpr}`;if(roomKey===key)return room;roomKey=key;
  room=document.createElement('canvas');room.width=w;room.height=h;
  const ctx=room.getContext('2d'),cx=w*.58,cy=h*.42;
  ctx.fillStyle='#020605';ctx.fillRect(0,0,w,h);
  const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,w*.70);
  glow.addColorStop(0,'#1c3025');glow.addColorStop(.4,'#0c1811');glow.addColorStop(1,'#010403');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  ctx.lineWidth=dpr;
  ctx.fillStyle='#0a160f';ctx.beginPath();ctx.moveTo(w*.12,h*.56);ctx.lineTo(w*.79,h*.53);ctx.lineTo(w*1.16,h);ctx.lineTo(-w*.3,h);ctx.closePath();ctx.fill();
  // The empty pool, lane lines and side drains keep a trace of the place under
  // the battle stage. They carry no clue or attack information.
  ctx.strokeStyle='#3b51412e';
  for(let n=0;n<18;n++){
    const t=n/18,yy=h*(.52+.6*t*t);ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy-h*.018);ctx.stroke();
  }
  for(let n=-9;n<10;n++){
    ctx.beginPath();ctx.moveTo(cx+n*w*.038,h*.5);ctx.lineTo(cx+n*w*.24,h*1.1);ctx.stroke();
  }
  ctx.fillStyle='#020806';ctx.beginPath();ctx.moveTo(w*.23,h*.58);ctx.lineTo(w*.76,h*.555);ctx.lineTo(w*.91,h*.94);ctx.lineTo(-w*.03,h);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#76877437';ctx.lineWidth=dpr*2;ctx.beginPath();ctx.moveTo(w*.23,h*.58);ctx.lineTo(w*.76,h*.555);ctx.lineTo(w*.91,h*.94);ctx.stroke();
  ctx.strokeStyle='#7998771f';ctx.lineWidth=dpr;
  for(let n=0;n<5;n++){ctx.beginPath();ctx.moveTo(w*(.1+n*.21),0);ctx.lineTo(w*(.24+n*.105),h*.47);ctx.stroke();}
  // Far windows are just perceptible; their spill stops well above the pool.
  for(let n=0;n<5;n++){
    const x=w*(.35+n*.085),y=h*.18,ww=w*.055,hh=h*.22;
    const g=ctx.createLinearGradient(x,y,x,y+hh);g.addColorStop(0,'#91a6922b');g.addColorStop(1,'#35544108');ctx.fillStyle=g;ctx.fillRect(x,y,ww,hh);
    ctx.fillStyle='#07100a';ctx.fillRect(x+ww*.48,y,2*dpr,hh);ctx.fillRect(x,y+hh*.55,ww,2*dpr);
    ctx.strokeStyle='#5b75602b';ctx.strokeRect(x,y,ww,hh);
  }
  ctx.fillStyle='#010704';ctx.fillRect(w*.06,0,w*.08,h*.68);ctx.fillRect(w*.83,0,w*.057,h*.64);
  ctx.fillStyle='#85997618';ctx.fillRect(w*.14-2*dpr,0,2*dpr,h*.68);ctx.fillRect(w*.83,0,2*dpr,h*.64);
  const vignette=ctx.createRadialGradient(w*.56,h*.47,w*.15,w*.5,h*.5,w*.7);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#000c');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
  let seed=991;for(let n=0;n<w*h/70;n++){
    seed=(Math.imul(seed,1664525)+1013904223)|0;const x=(seed>>>0)%w;
    seed=(Math.imul(seed,1664525)+1013904223)|0;const y=(seed>>>0)%h;
    ctx.fillStyle=n%5===0?'#acc49917':'#0000002a';ctx.fillRect(x,y,dpr,dpr);
  }
  return room;
}

function creature(box,{now=0,alpha=1,coherence=1,reduced=false,impact=false,resolving=false,resolveAge=0}={}){
  uiWithAlpha(alpha,()=>{
    uiDraw(({ctx,dpr,cellW,cellH})=>{
      const x=box.x*cellW*dpr,y=box.y*cellH*dpr,w=box.w*cellW*dpr,h=box.h*cellH*dpr;
      const bob=reduced?0:Math.sin(now*.8)*h*.008;
      ctx.save();ctx.translate(x+w/2,y+h/2+bob);ctx.rotate(reduced?-.09:Math.sin(now*.25)*.04-.09);
      ctx.globalAlpha*=.72;ctx.drawImage(shellTexture(),-w/2,-h/2,w,h);
      if(impact){ctx.globalAlpha=.30;ctx.globalCompositeOperation='screen';ctx.drawImage(shellTexture(),-w/2-4*dpr,-h/2,w,h);}
      ctx.restore();
    });
    drawSignalBeing('natatorium',{...box,now,snr:'silence',coherenceRatio:coherence,reducedMotion:reduced,intentKind:null,
      hitFlash:!reduced&&resolving&&resolveAge<.4?.7*(1-resolveAge/.4):0});
  });
}

export function drawWorld({phase,progress,now,reduced,reviewHold,combat,selectedTool,resolving,resolveAge}){
  uiClear();const {cols:c,rows:r}=uiSize();
  const exploring=phase==='exploration'||phase==='called';
  const scare=phase==='intrusion'||phase==='versus';
  const stage={x:0,y:0,w:c,h:r};
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const w=Math.round(c*cellW*dpr),h=Math.round(r*cellH*dpr);
    ctx.drawImage(roomTexture(w,h,dpr),0,0);
    if(phase==='called'){
      ctx.fillStyle=`rgba(0,3,1,${.2+progress*.77})`;ctx.fillRect(0,0,w,h);
      // One unlit splice across the view, never repeated flashing.
      if(!reduced){ctx.fillStyle='#000';ctx.fillRect(0,h*.47,w,h*.03);}
    }
  });
  if(exploring){
    if(phase==='exploration')creature({x:c*.52,y:r*.30,w:c*.16,h:r*.17},{now:0,alpha:.06,reduced:true});
    return;
  }
  if(scare){
    uiDraw(({ctx,dpr,cellW,cellH})=>{const w=c*cellW*dpr,h=r*cellH*dpr;ctx.fillStyle=phase==='intrusion'&&!reduced?'#353e2b':'#030806';ctx.fillRect(0,0,w,h);});
    const impact=phase==='intrusion';
    creature(impact&&!reduced?{x:c*.11,y:-r*.67,w:c*1.36,h:r*2.45}:{x:c*.39,y:-r*.05,w:c*.75,h:r*1.1},
      {now:reviewHold?3:now,alpha:impact?1:.9,reduced,impact:impact&&!reduced});
    if(!reduced)uiDraw(({ctx,dpr,cellW,cellH})=>{
      const w=c*cellW*dpr,h=r*cellH*dpr;
      ctx.fillStyle='#000';ctx.fillRect(0,0,w,h*.065);ctx.fillRect(0,h*.91,w,h*.09);
      if(impact){ctx.fillRect(0,h*.25,w,h*.035);ctx.fillRect(w*.7,h*.55,w*.3,h*.012);}
    });
    return;
  }
  // Preserve the room as residue around the production void stage.
  uiWithAlpha(.65,()=>drawEnemyVoidStage('natatorium',{...stage,reduceFlash:true,environmentLighting:{ambientColor:[.40,.54,.40],poolScale:.76}}));
  const narrow=c<115, equipment=phase==='equipment';
  const enemyBox=narrow&&equipment
    ? {x:c*.37,y:r*.14,w:c*.26,h:r*.13}
    : narrow?{x:c*.39,y:r*.16,w:c*.49,h:r*.47}:{x:c*.65,y:r*.18,w:c*.31,h:r*.58};
  const ratio=combat?combat.movementCoherence/combat.movementMaxCoherence:1;
  const reveal=phase==='reveal';
  const enemyProgress=phase==='battle'?0:reveal?clamp((progress-.27)/.60):1;
  if(enemyProgress>0)uiDraw(({ctx,dpr,cellW,cellH})=>{
    ctx.beginPath();ctx.rect(c*(1-enemyProgress)*cellW*dpr,0,c*enemyProgress*cellW*dpr,r*cellH*dpr);ctx.clip();
    creature(enemyBox,{now,alpha:phase==='result'?.16:1,coherence:ratio,reduced,resolving,resolveAge});
  });
  const heroProgress=phase==='battle'?0:reveal?clamp(progress/.65):1;
  if(heroProgress>0)uiDraw(({ctx,dpr,cellW,cellH})=>{
    ctx.beginPath();ctx.rect(0,0,c*heroProgress*cellW*dpr,r*cellH*dpr);ctx.clip();
    drawFirstPersonHands(selectedTool,{stage,left:{x:c*.06,y:r*.45,w:c*.30,h:r*.40},right:{x:c*.37,y:r*.54,w:c*.17,h:r*.32},
      reducedMotion:reduced,now,snr:'silence',resolveProgress:resolving?clamp(resolveAge/.8):0,hurt:resolving&&resolveAge>.84?.25:0});
  });
  if(reveal&&!reduced)uiDraw(({ctx,dpr,cellW,cellH})=>{
    const w=c*cellW*dpr,h=r*cellH*dpr;
    if(progress<.65){ctx.fillStyle='#b1bfa028';ctx.fillRect(w*heroProgress, h*.42,2*dpr,h*.48);}
    if(progress>.27&&progress<.87){ctx.fillStyle='#baad8b55';ctx.fillRect(w*(1-enemyProgress),h*.16,2*dpr,h*.55);}
  });
  if(equipment)uiDraw(({ctx,dpr,cellW,cellH})=>{
    const w=c*cellW*dpr,h=r*cellH*dpr,g=ctx.createLinearGradient(0,0,w*.8,0);
    g.addColorStop(0,'#0005');g.addColorStop(1,'#0000');ctx.fillStyle=g;ctx.fillRect(0,h*.16,w,h*.7);
  });
}
