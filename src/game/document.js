// Physical paper inspection.
//
// The text was manufactured offline. This scene only presents that immutable
// sheet as an object: a very slightly bowed A4 page with a real edge, shadow and
// restrained inspection light. No meaningful document glyph is shaped here.

import * as scenes from './scenes.js';
import { uiScrim, uiDraw, uiSize, uiText } from '../render/ui.js';
import { promptLine } from './bindings.js';
import {
  paperAssetProbe, paperImageState, paperMaterialState, paperPageCount, preloadPaperDocument,
} from './paper-assets.js';
import { paper3dRender, paper3dProbe } from '../render/paper3d.js';

let onClose=()=>{};
let onTurn=()=>{};
const TURN_SECONDS=.34;
const A4_ASPECT=210/297;
const STRIPS=36;

export function documentInit({close,turn}={}){if(close)onClose=close;if(turn)onTurn=turn;}
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function hash32(value=''){let h=2166136261>>>0;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function unit(value=''){return hash32(value)/0xffffffff;}

function inspectRect(surface){
  const {dpr,cellW,cellH,cols,rows}=surface;
  const viewportW=cols*cellW*dpr,viewportH=rows*cellH*dpr;
  // Leave enough negative space around the sheet for it to read as an object,
  // not a full-screen PDF surface.
  const maxH=viewportH*.79,maxW=viewportW*.63;
  let h=maxH,w=h*A4_ASPECT;if(w>maxW){w=maxW;h=w/A4_ASPECT;}
  return {x:(viewportW-w)/2+cellW*dpr*.35,y:(viewportH-h)/2-cellH*dpr*.42,w,h,dpr};
}
function poseFor(doc,page){
  const key=`${doc?.id||'paper'}:${page}`;
  return {
    roll:(unit(`${key}:roll`)-.5)*.0085,        // ±0.24°
    yaw:(unit(`${key}:yaw`)-.5)*.0200,          // ±0.57°
    pitch:(unit(`${key}:pitch`)-.5)*.0140,      // ±0.40°
    bow:.00045+unit(`${key}:bow`)*.00105,       // 0.45–1.5 mm
    edgeCurl:unit(`${key}:lift`)*.0018,          // 0–1.8 mm
    seed:hash32(key),
  };
}
function paperStage(ctx,rect){
  const cx=rect.x+rect.w*.5,cy=rect.y+rect.h*.48;
  ctx.save();
  const glow=ctx.createRadialGradient(cx,cy,rect.w*.06,cx,cy,rect.h*.64);
  glow.addColorStop(0,'rgba(208,203,190,.065)');
  glow.addColorStop(.62,'rgba(84,81,74,.022)');
  glow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=glow;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();
}
function localPagePath(ctx,w,h){ctx.beginPath();ctx.rect(-w*.5,-h*.5,w,h);}
function drawPaperShadow(ctx,w,h,dpr,flipScale=1){
  ctx.save();
  ctx.scale(Math.max(.055,Math.abs(flipScale)),1);
  ctx.shadowColor='rgba(0,0,0,.62)';ctx.shadowBlur=24*dpr;ctx.shadowOffsetX=5*dpr;ctx.shadowOffsetY=9*dpr;
  ctx.fillStyle='rgba(15,14,12,.42)';ctx.fillRect(-w*.5,-h*.5,w,h);ctx.restore();
}
function drawPaperSurface(ctx,image,w,h,pose,dpr,{flipScale=1,turnDir=0}={}){
  const absScale=Math.max(.045,Math.abs(flipScale)),sign=flipScale<0?-1:1;
  ctx.save();ctx.scale(sign*absScale,1);
  const sourceW=image.naturalWidth||image.width,sourceH=image.naturalHeight||image.height;
  // A strip mesh gives the otherwise perfectly flat raster just enough physical
  // bow to break the PDF-viewer silhouette while keeping type fully readable.
  for(let i=0;i<STRIPS;i++){
    const u0=i/STRIPS,u1=(i+1)/STRIPS,um=(u0+u1)*.5;
    const sx=Math.floor(sourceW*u0),sw=Math.max(1,Math.ceil(sourceW*u1)-sx);
    const dx=-w*.5+w*u0,dw=w/STRIPS+1.25*dpr;
    const curve=Math.sin((um-.5)*Math.PI)*pose.bow*h;
    const edgeLift=Math.pow(Math.abs(um-.5)*2,3)*pose.lift*h;
    const turnLift=turnDir?Math.sin(Math.PI*um)*turnDir*(1-absScale)*h*.018:0;
    ctx.drawImage(image,sx,0,sw,sourceH,dx,-h*.5+curve-edgeLift+turnLift,dw,h+edgeLift*.35);
  }
  // Toner/paper remains in the baked image. These are only object-scale light
  // cues: a soft grazing falloff and a one-pixel exposed paper edge.
  ctx.save();localPagePath(ctx,w,h);ctx.clip();
  const side=ctx.createLinearGradient(-w*.5,0,w*.5,0);
  side.addColorStop(0,'rgba(54,49,42,.050)');side.addColorStop(.09,'rgba(255,255,255,.008)');side.addColorStop(.68,'rgba(255,255,255,0)');side.addColorStop(1,'rgba(48,45,40,.035)');
  ctx.fillStyle=side;ctx.globalCompositeOperation='multiply';ctx.fillRect(-w*.5,-h*.5,w,h);ctx.restore();
  ctx.strokeStyle='rgba(75,70,62,.22)';ctx.lineWidth=Math.max(.75,dpr*.68);ctx.strokeRect(-w*.5+.5,-h*.5+.5,w-1,h-1);
  ctx.strokeStyle='rgba(235,231,218,.36)';ctx.lineWidth=Math.max(.6,dpr*.52);ctx.beginPath();ctx.moveTo(-w*.5+1,h*.5-1);ctx.lineTo(w*.5-1,h*.5-1);ctx.lineTo(w*.5-1,-h*.5+1);ctx.stroke();
  ctx.restore();
}
function placeholder(ctx,w,h,dpr){
  ctx.fillStyle='#eeece5';ctx.fillRect(-w*.5,-h*.5,w,h);ctx.strokeStyle='rgba(60,56,49,.18)';ctx.lineWidth=Math.max(1,dpr);ctx.strokeRect(-w*.5,-h*.5,w,h);
}
function drawPhysicalPage(ctx,doc,page,rect,{flipScale=1,turnDir=0,turnAmount=null}={}){
  const state=paperImageState(doc,page),material=paperMaterialState(doc,page),pose=poseFor(doc,page),handling=state.asset?.record?.handlingVector||[-1,0,0,0];
  if(state.ready&&state.image){
    const amount=turnAmount==null?Math.max(0,1-Math.abs(flipScale)):turnAmount;
    const frame=paper3dRender({
      image:state.image,materialImage:material.ready?material.image:null,
      width:rect.w,height:rect.h,handlingVector:handling,seed:pose.seed,
      bow:pose.bow,edgeCurl:pose.edgeCurl,yaw:pose.yaw,pitch:pose.pitch,roll:pose.roll,
      turn:amount,turnDir:turnDir||1,
    });
    if(frame){
      // Canvas shadows the WebGL alpha silhouette, including a clipped torn
      // corner. The document itself is genuinely perspective-rendered 3-D.
      ctx.save();ctx.shadowColor='rgba(0,0,0,.64)';ctx.shadowBlur=25*rect.dpr;ctx.shadowOffsetX=5*rect.dpr;ctx.shadowOffsetY=10*rect.dpr;
      ctx.drawImage(frame,rect.x,rect.y,rect.w,rect.h);ctx.restore();return true;
    }
  }
  // WebGL2 is optional. Browser/driver failure falls back to the old physical
  // strip presentation rather than breaking document interaction.
  const cx=rect.x+rect.w*.5,cy=rect.y+rect.h*.5;ctx.save();ctx.translate(cx,cy);ctx.rotate(pose.roll+turnDir*(1-Math.abs(flipScale))*.012);ctx.transform(1,pose.yaw*.028,pose.yaw,1,0,0);
  drawPaperShadow(ctx,rect.w,rect.h,rect.dpr,flipScale);
  if(state.ready&&state.image)drawPaperSurface(ctx,state.image,rect.w,rect.h,{bow:pose.bow*2.0,lift:pose.edgeCurl},rect.dpr,{flipScale,turnDir});
  else{ctx.scale(Math.max(.055,Math.abs(flipScale)),1);placeholder(ctx,rect.w,rect.h,rect.dpr);}ctx.restore();return !!(state.ready&&state.image);
}
function drawTurn(ctx,doc,turn,rect){
  const t=clamp(turn.t/TURN_SECONDS,0,1),dir=Math.sign(turn.to-turn.from)||1;
  if(t<.5){const q=t*2,scale=Math.max(.045,Math.cos(q*Math.PI*.5));drawPhysicalPage(ctx,doc,turn.from,rect,{flipScale:scale,turnDir:dir,turnAmount:q});}
  else{const q=(t-.5)*2,scale=Math.max(.045,Math.sin(q*Math.PI*.5));drawPhysicalPage(ctx,doc,turn.to,rect,{flipScale:scale,turnDir:-dir,turnAmount:1-q});}
}

export function readDocument(doc){if(!doc)return null;return scenes.push(makeDocumentScene(doc));}
export function makeDocumentScene(doc,{id=`doc:${doc?.id||'document'}`,onSceneClose=null,onSceneTurn=null,lookProfile='calm',sourcePressureLive=false}={}){
  let page=0,turn=null;const total=paperPageCount(doc),closeCallback=typeof onSceneClose==='function'?onSceneClose:onClose,turnCallback=typeof onSceneTurn==='function'?onSceneTurn:onTurn,resolved=paperAssetProbe(doc);
  function close(){scenes.pop();closeCallback(doc);}
  function turnTo(next){const target=clamp(Math.floor(Number(next)||0),0,total-1);if(target===page||turn)return;const prev=page;void paperImageState(doc,target);turn={from:prev,to:target,t:0};page=target;turnCallback({doc,page:target,prev,total,dir:Math.sign(target-prev)||1});}
  function next(){if(page<total-1)turnTo(page+1);else close();}
  return {
    id,blocksInput:true,blocksWorld:false,lookProfile,lensPreset:lookProfile,sourcePressureLive:!!sourcePressureLive,
    enter(){void preloadPaperDocument(doc);},
    update(dt){if(turn){turn.t+=Math.max(0,Number(dt)||0);if(turn.t>=TURN_SECONDS)turn=null;}},
    view:()=>({id,page,total,documentId:doc?.id||null,paper:resolved,paper3d:paper3dProbe(),turning:!!turn}),
    render(){
      uiScrim(.84);
      uiDraw((surface)=>{const {ctx}=surface,rect=inspectRect(surface);paperStage(ctx,rect);if(turn)drawTurn(ctx,doc,turn,rect);else drawPhysicalPage(ctx,doc,page,rect);});
      const {cols,rows}=uiSize(),left=total>1?`${page+1} / ${total}`:'A4';
      const nav=total<=1?promptLine([{action:'back',label:'CLOSE'}]):page===0?promptLine([{action:'confirm',label:'NEXT'},{action:'back',label:'CLOSE'}]):page===total-1?promptLine([{action:'select',label:'BACK'},{action:'back',label:'CLOSE'}]):promptLine([{action:'select',label:'PAGE'},{action:'back',label:'CLOSE'}]);
      uiText(3,rows-2,left,'t-dim',.70);uiText(Math.max(3,cols-nav.length-3),rows-2,nav,'t-dim',.78);if(!resolved.resolved)uiText(3,1,'PAPER ASSET NOT BUILT','t-dim',.55);
    },
    key(e){const raw=e.key||'',k=raw.toLowerCase(),code=e.code||'';if(raw==='ArrowRight'||raw==='PageDown'||raw===' '||raw==='Enter'||k==='d'||k==='j'||code==='Space'){next();return true;}if(raw==='ArrowLeft'||raw==='PageUp'||k==='a'||k==='h'){turnTo(page-1);return true;}if(raw==='ArrowDown'){next();return true;}if(raw==='ArrowUp'){turnTo(page-1);return true;}if(raw==='Escape'||k==='e'){close();return true;}return true;},
  };
}
