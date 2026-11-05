// His ink on sheet 1, drawn into a canvas in page space so the paper shader
// (src/render/paper3d.js) and the flat reading view can lay it on the baked
// form. The strokes come from src/game/work-order-ink.js; this only rasterises.
import {WORK_ORDER_BIRO,workOrderInkLayout,workOrderInkStrokesAt} from '../game/work-order-ink.js';

const PAGE_W=210,PAGE_H=297;
function rgba(hex,alpha){const n=parseInt(String(hex).replace('#',''),16);return `rgba(${n>>16&255},${n>>8&255},${n&255},${alpha})`;}

/**
 * One reusable surface. `draw(marks,{order,fraction})` returns {image,version};
 * the version only changes when the picture does, so the shader re-uploads
 * only while the pen is actually moving.
 */
export function createWorkOrderInkSurface({width=1240,createCanvas=()=>document.createElement('canvas')}={}){
  let canvas=null,ctx=null,key=null,version=0,layoutKey=null,layout=[];
  function draw(marks=[],{order=Infinity,fraction=1}={}){
    const list=Array.isArray(marks)?marks:[];
    const lk=`${list.length}:${list.at(-1)?.id||''}`;
    if(lk!==layoutKey){layout=workOrderInkLayout(list);layoutKey=lk;}
    const k=`${lk}|${order}|${Number.isFinite(order)?Math.round(Math.max(0,Math.min(1,fraction))*400):''}`;
    if(canvas&&k===key)return{image:canvas,version};
    if(!canvas){canvas=createCanvas();canvas.width=width;canvas.height=Math.round(width*PAGE_H/PAGE_W);ctx=canvas.getContext('2d');}
    const scale=canvas.width/PAGE_W;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle=rgba(WORK_ORDER_BIRO.color,WORK_ORDER_BIRO.opacity);ctx.lineCap='round';ctx.lineJoin='round';
    for(const {points,width:mm} of workOrderInkStrokesAt(layout,{order,fraction})){
      ctx.lineWidth=Math.max(1,mm*scale);ctx.beginPath();ctx.moveTo(points[0][0]*scale,points[0][1]*scale);
      for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0]*scale,points[i][1]*scale);
      ctx.stroke();
    }
    key=k;version+=1;
    return{image:canvas,version};
  }
  return{draw,get version(){return version;}};
}
