import assert from 'node:assert/strict';
import {vfdGlyph,VFD_COLS,VFD_ROWS} from '../../src/render/vfd-font.js';

// Record rectangular electrodes, vector segments and the actual aperture clip.
// Without a document-backed canvas the LCD raster cache emits its geometry.
export function lcdGeometry({alpha=1}={}){
  const state={globalAlpha:alpha,shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,
    tx:0,ty:0,sx:1,sy:1,clipping:null};
  const stack=[],fills=[],nativeText=[];
  let path=[];
  function bounds(rects){
    const xs=rects.flatMap(({x,w})=>[x,x+w]),ys=rects.flatMap(({y,h})=>[y,y+h]);
    const x=Math.min(...xs),y=Math.min(...ys);
    return{x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
  }
  function project(x,y,w=0,h=0){
    return{x:x*state.sx+state.tx,y:y*state.sy+state.ty,w:w*state.sx,h:h*state.sy};
  }
  function record(cells,kind){
    if(!cells.length)return;
    const fill=state.fillStyle;
    fills.push({kind,cells,ink:bounds(cells),clip:state.clipping,alpha:state.globalAlpha,
      color:typeof fill==='string'?fill:fill?.stops,blur:state.shadowBlur});
  }
  const ctx=new Proxy(state,{get(target,key){
    if(key in target)return target[key];
    if(key==='canvas')return undefined;
    if(key==='save')return()=>stack.push({...state});
    if(key==='restore')return()=>{const saved=stack.pop();assert.ok(saved);
      for(const key of Object.keys(state))delete state[key];
      Object.assign(state,saved);
    };
    if(key==='translate')return(x,y)=>{state.tx+=x*state.sx;state.ty+=y*state.sy;};
    if(key==='scale')return(x,y)=>{state.sx*=x;state.sy*=y;};
    if(key==='getTransform')return()=>({a:state.sx,b:0,c:0,d:state.sy,e:state.tx,f:state.ty});
    if(key==='createLinearGradient'||key==='createRadialGradient')return()=>({
      stops:[],addColorStop(offset,color){this.stops.push([offset,color]);},
    });
    if(key==='beginPath')return()=>{path=[];};
    if(key==='rect')return(x,y,w,h)=>path.push(project(x,y,w,h));
    if(key==='moveTo'||key==='lineTo')return(x,y)=>path.push(project(x,y));
    if(key==='clip')return()=>{
      if(!path.length)return;
      const box=bounds(path),prior=state.clipping;
      if(!prior){state.clipping=box;return;}
      const x=Math.max(box.x,prior.x),y=Math.max(box.y,prior.y);
      state.clipping={x,y,w:Math.min(box.x+box.w,prior.x+prior.w)-x,h:Math.min(box.y+box.h,prior.y+prior.h)-y};
    };
    if(key==='fill')return()=>record(path,path.every(cell=>cell.w>0&&cell.h>0)?'matrix':'path');
    if(key==='fillRect')return(x,y,w,h)=>record([project(x,y,w,h)],'rect');
    if(key==='fillText'||key==='measureText')return(...args)=>nativeText.push({method:key,args});
    return()=>{};
  }});
  return{ctx,state,stack,fills,nativeText};
}
export const within=(ink,box,padding=.01)=>!!box&&ink.x>=box.x-padding&&ink.y>=box.y-padding
  &&ink.x+ink.w<=box.x+box.w+padding&&ink.y+ink.h<=box.y+box.h+padding;
export function deviceBox(box,{cellW,cellH,dpr=1}){
  return{x:box.x*cellW*dpr,y:box.y*cellH*dpr,w:box.w*cellW*dpr,h:box.h*cellH*dpr};
}
export function matrixInk(fills,box,{padding=0}={}){
  return fills.filter(({kind,ink,alpha,blur})=>kind==='matrix'&&alpha>0&&blur===0&&(!box||within(ink,box,padding)));
}
function normalizeCells(cells){
  const x=Math.min(...cells.map(cell=>cell.x)),y=Math.min(...cells.map(cell=>cell.y));
  const w=cells[0].w,h=cells[0].h;
  return cells.map(cell=>[Math.round((cell.x-x)/w*.84),Math.round((cell.y-y)/h*.84)]);
}
function expectedCells(char){
  const glyph=vfdGlyph(char);
  assert.ok(glyph,'missing ROM character '+char);
  const cells=[];
  for(let y=0;y<VFD_ROWS;y++)for(let x=0;x<VFD_COLS;x++){
    if(glyph[y]&(1<<(VFD_COLS-1-x)))cells.push({x,y,w:.84,h:.84});
  }
  return normalizeCells(cells);
}
export function paintedWord(fills,text,box,options={}){
  const matches=matrixInk(fills,box,options);
  const chars=[...text].filter(char=>char!==' ');
  const glyphs=[];
  for(const char of chars){
    const expected=JSON.stringify(expectedCells(char));
    const previous=glyphs.at(-1);
    // Optical passes can draw the same glyph at the same position. Require
    // increasing glyph positions to distinguish them from repeated letters.
    const next=matches.find(({ink,cells})=>(!previous||ink.x>previous.ink.x+previous.ink.w*.75)
      &&JSON.stringify(normalizeCells(cells))===expected);
    if(!next)return[];
    glyphs.push(next);
  }
  return glyphs;
}
