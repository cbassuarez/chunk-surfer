// Content pass only. withMachinePanel owns the plate, well, glass and meter.
import {uiDraw} from './ui.js';
import {vfdGlyph} from './vfd-font.js';
import {activeTheme,uiBrightness,uiFlickerAlpha,vfdSettings} from './palette.js';
import {hardwareMotionReduced,hardwareEffectsReduced} from './hardware-material.js';
import {pathRegisterArt,pathRegisterCopy,pathRegisterLevel,pathRegisterWrap} from './title-path-register-model.js';

function glyphs(text,x,y,pitch,level=1,capacity=text.length) {
  const shapes=[];
  [...String(text).toUpperCase().padEnd(capacity,' ')].forEach((ch,i)=>{
    vfdGlyph(ch).forEach((bits,row)=>{
      for(let col=0;col<5;col++) shapes.push({x:x+(i*6+col)*pitch,y:y+row*pitch,
        w:pitch*.72,h:pitch*.72,level:bits&(1<<(4-col))?level:0});
    });
  });
  return shapes;
}

function textShapes(layout,items,selected,{activeRun,confirm,buildLabel}) {
  const l=layout,u=l.unit,shapes=[];
  const text=(value,at,level=1,capacity)=>shapes.push(...glyphs(value,at.x,at.y,at.pitch,level,capacity));
  text('CHUNK SURFER',l.title);
  text(activeRun?'A NIGHT IS IN PROGRESS':'START A NIGHT',l.profile,.70,25);
  const shape=(x,y,w,h,level)=>shapes.push({x,y,w,h,level});
  l.rows.forEach(row=>{
    const item=items[row.index],on=row.index===selected;
    shape(l.pad-u,row.y-2*u,5*u,l.selectionHeight,on?1:0);
    shape(row.x-3*u,row.y-5*u,29*u,2*u,on?.8:0);
    shape(row.x-3*u,row.y+l.selectionHeight,29*u,2*u,on?.8:0);
    text(item.label,{...row,pitch:l.labelPitch},item.disabled?.25:on||vfdSettings.menuContrast?1:.66,13);
  });
  const scrollX=l.pad-3*u+l.menuWidth-7*l.labelPitch;
  if(l.start>0) text('▲',{x:scrollX,y:l.menuY-8*u,pitch:l.labelPitch},.8);
  if(l.start+l.visible<items.length) text('▼',{x:scrollX,y:l.rows.at(-1).y,pitch:l.labelPitch},.8);
  const id=items[selected].id,copy=pathRegisterCopy(id,{activeRun,confirm});
  const captions=pathRegisterWrap(copy.caption,l.caption.capacity);
  for(let i=0;i<2;i++)text(captions[i]||'',
    {...l.caption,y:l.caption.y+i*9*l.caption.pitch},.9,l.caption.capacity);
  text(id==='settings'?'A   D   C   X':'',l.categories,.7,13);
  copy.lines.forEach((line,i)=>text(line,{x:l.pad,y:l.helpY+i*l.helpStep,pitch:l.helpPitch},i?.75:.92,Math.min(38,l.helpCapacity)));
  if(buildLabel) {
    const pitch=1.2*u,value=String(buildLabel).toUpperCase();
    const right=l.width-l.pad,available=right-(l.title.x+11*6*l.title.pitch+24*u);
    const capacity=Math.max(0,Math.floor(available/(6*pitch)));
    const label=value.slice(0,capacity);
    text(label,{x:right-label.length*6*pitch,y:l.title.y,pitch},.50);
  }
  return shapes;
}

// Each scene holds just its current text layer and current picture frame.
// Once settled these are reused; no per-frame glyph assembly or canvas readback.
export function createPathRegisterDisplay() {
  let textLayer=null,pictureLayer=null,scratch=null,textKey='',pictureKey='';
  const canvas=()=>document.createElement('canvas');
  function bake(target,width,height,dpr,shapes,{color,brightness,blurScale,id,time=Infinity}) {
    target.width=Math.ceil(width*dpr); target.height=Math.ceil(height*dpr);
    scratch ||= canvas(); scratch.width=target.width; scratch.height=target.height;
    const ambient=target.getContext('2d'),emission=scratch.getContext('2d');
    ambient.fillStyle='#66735c'; ambient.globalAlpha=.04;
    for(const s of shapes) ambient.fillRect(s.x*dpr,s.y*dpr,s.w*dpr,s.h*dpr);
    ambient.globalAlpha=1; emission.fillStyle=color;
    for(const s of shapes) {
      const level=id?pathRegisterLevel(s,time,id):s.level;
      if(!level)continue;
      emission.globalAlpha=Math.min(1,Math.round(level*brightness*16)/16);
      emission.fillRect(s.x*dpr,s.y*dpr,s.w*dpr,s.h*dpr);
    }
    if(!hardwareEffectsReduced()) {
      ambient.globalAlpha=.23; ambient.filter=`blur(${2.1*blurScale*dpr}px)`; ambient.drawImage(scratch,0,0);
      ambient.globalAlpha=.08; ambient.filter=`blur(${5*blurScale*dpr}px)`; ambient.drawImage(scratch,0,0);
    }
    ambient.globalAlpha=1; ambient.filter='none'; ambient.drawImage(scratch,0,0);
  }
  return {
    draw(layout,items,selected,{activeRun=false,confirm=false,buildLabel='',time=Infinity}={}) {
      uiDraw(({ctx,dpr})=>{
        const id=items[selected].id,color=vfdSettings.phosphor==='faithful'?'#ffcf74':activeTheme().counter;
        const brightness=uiBrightness(),l=layout,pad=12*l.unit;
        const common=[dpr,color,brightness,hardwareEffectsReduced(),l.width,l.height,l.labelPitch,l.helpPitch];
        const nextText=JSON.stringify([...common,items.map(i=>[i.id,i.disabled]),selected,l.start,activeRun,confirm,buildLabel,vfdSettings.menuContrast]);
        if(textKey!==nextText) {
          textLayer ||= canvas();
          bake(textLayer,l.width,l.height,dpr,textShapes(l,items,selected,{activeRun,confirm,buildLabel}),
            {color,brightness,blurScale:l.unit});
          textKey=nextText;
        }
        const nextPicture=JSON.stringify([...common,id,time,l.art.w]);
        if(pictureKey!==nextPicture) {
          pictureLayer ||= canvas();
          const shapes=pathRegisterArt(id).map(s=>({...s,x:pad+s.x*l.art.scale,y:pad+s.y*l.art.scale,
            w:s.w*l.art.scale,h:s.h*l.art.scale}));
          bake(pictureLayer,l.art.w+pad*2,l.art.h+pad*2,dpr,shapes,{color,brightness,blurScale:l.art.scale,id,time});
          pictureKey=nextPicture;
        }
        if(!hardwareMotionReduced())ctx.globalAlpha*=uiFlickerAlpha(l.x,l.y,'ui-amber');
        ctx.drawImage(textLayer,l.x*dpr,l.y*dpr);
        ctx.drawImage(pictureLayer,(l.x+l.art.x-pad)*dpr,(l.y+l.art.y-pad)*dpr);
      });
    },
    dispose() { textLayer=pictureLayer=scratch=null; textKey=pictureKey=''; },
  };
}
