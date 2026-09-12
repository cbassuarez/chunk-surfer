// Inspection input is routed by the owning scene. It never claims a global
// key or mutates the inventory. The visible object is composited into the UI.
import {itemPortrait,ITEM_ASCII_OPTIONS} from '../data/item-portraits.js';
import {assetUrl} from '../platform/paths.js';
import {drawItemPortrait} from '../render/item-portraits.js';
import {uiDraw} from '../render/ui.js';
let shared=null,boot=null,currentId=null,loadedId=null,owner=null,renderCount=0;
async function renderer(){
 if(shared)return shared;if(boot)return boot;if(typeof document==='undefined')return null;
 boot=(async()=>{
  const {createAsciiObject}=await import('../render/vendor/ascii-object/renderer.js');
  const canvas=document.createElement('canvas');canvas.id='item-inspection-buffer';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'fixed',left:'-10000px',top:'0',width:'512px',height:'384px',pointerEvents:'none'});document.body.appendChild(canvas);
  const engine=createAsciiObject({canvas},ITEM_ASCII_OPTIONS);
  if(!engine){canvas.remove();throw new Error('Item renderer unavailable');}
  const frame=document.createElement('canvas');shared={canvas,engine,frame,lost:false};
  canvas.addEventListener('webglcontextlost',()=>{shared.lost=true;loadedId=null;});
  return shared;
 })().catch(()=>{boot=null;return null;});return boot;
}
export function itemInspectionStats(){return{contexts:shared?1:0,currentId,loadedId,renderCount,active:!!owner};}
export function createItemInspection(value){
 const item=itemPortrait(value);if(!item)return null;
 const appearance=value?.source||value||{};
 const token={};let closed=false,rect=null,drag=null,yaw=0,pitch=0,dirty=true,failed=false;
 owner=token;
 const ready=renderer().then(r=>{
  if(!r||r.lost||closed||owner!==token){failed=!r||!!r?.lost;return;}
  const same=currentId===item.id&&loadedId===item.id;currentId=item.id;if(!same)loadedId=null;
  r.engine.setOptions({...ITEM_ASCII_OPTIONS,...item.lighting,src:assetUrl(item.model),scale:item.scale,
   materialColors:appearance.materialColors||null,nodeRotations:appearance.nodeRotations||null,hiddenNodes:appearance.hiddenNodes||null,
   recorderPhosphor:appearance.recorderPhosphor||null,
   onLoad:()=>{if(owner===token&&currentId===item.id){loadedId=item.id;r.engine.resetView();if(yaw||pitch)r.engine.orbitBy(yaw,pitch);dirty=true;}},onError:()=>{if(owner===token&&currentId===item.id){failed=true;loadedId=null;}}});
  r.engine.resetView();if(yaw||pitch)r.engine.orbitBy(yaw,pitch);dirty=true;
 });
 function orbit(dx,dy){yaw+=dx;pitch+=dy;dirty=true;if(owner===token&&loadedId===item.id)shared?.engine.orbitBy(dx,dy);}
 function reset(){yaw=0;pitch=0;dirty=true;if(owner===token)shared?.engine.resetView();}
 return {
  ready,
  view:()=>({id:item.id,yaw,pitch,dragging:!!drag,ready:loadedId===item.id&&!failed&&!shared?.lost,failed:failed||!!shared?.lost}),
  reset,
  key(e){
   const k=String(e.key||'').toLowerCase(),a=e.controllerAction;
   const d={arrowleft:[-.10,0],a:[-.10,0],arrowright:[.10,0],d:[.10,0],arrowup:[0,-.08],w:[0,-.08],arrowdown:[0,.08],s:[0,.08],move_left:[-.10,0],move_right:[.10,0],move_up:[0,-.08],move_down:[0,.08]}[a||k];
   if(d){orbit(...d);return true;}
   if(k==='r'||a==='tabPrev'){reset();return true;}return false;
  },
  pointer(e){
   if(e.type==='pointercancel'||e.type==='lostpointercapture'){drag=null;return true;}
   if(e.type==='pointerdown'&&rect&&(e.originalEvent?.button??e.button??0)===0&&e.cellX>=rect.x&&e.cellX<=rect.x+rect.w&&e.cellY>=rect.y&&e.cellY<=rect.y+rect.h){drag={id:e.pointerId,x:e.clientX,y:e.clientY};return true;}
   if(drag&&e.pointerId===drag.id){if(e.type==='pointermove'){orbit((e.clientX-drag.x)*.009,(e.clientY-drag.y)*.009);drag={...drag,x:e.clientX,y:e.clientY};}if(e.type==='pointerup')drag=null;return true;}return false;
  },
  draw(box,{active=true}={}){
   rect=box;
   if(closed||!active||!shared||shared.lost||owner!==token||loadedId!==item.id||failed){drawItemPortrait(item.id,box.x,box.y,{...box,large:true});return;}
   if(dirty){shared.engine.renderFrame();shared.frame.width=shared.canvas.width;shared.frame.height=shared.canvas.height;shared.frame.getContext('2d').drawImage(shared.canvas,0,0);dirty=false;renderCount++;}
   uiDraw(({ctx,dpr,cellW,cellH})=>{const x=box.x*cellW*dpr,y=box.y*cellH*dpr,w=box.w*cellW*dpr,h=box.h*cellH*dpr;
    const fit=Math.min(w/shared.canvas.width,h/shared.canvas.height),iw=shared.canvas.width*fit,ih=shared.canvas.height*fit;
    ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.drawImage(shared.frame,x+(w-iw)/2,y+(h-ih)/2,iw,ih);ctx.restore();});
  },
  dispose(){closed=true;drag=null;if(owner===token)owner=null;},
 };
}
