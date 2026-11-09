// Close enough to read an old analogue desk, with the live-room glass left
// above it. Nothing here claims that its dead power supply has come back on.
import {uiDraw,uiSize} from './ui.js';
import {drawHardwareCap} from './hardware-material.js';
import {B3_CONSOLE_LAYOUT,B3_CONSOLE_REFERENCE} from '../data/b3-console-layout.js';
const FINISH=B3_CONSOLE_LAYOUT.finish;

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const LEGENDS=B3_CONSOLE_LAYOUT.channelNames;
export const B3_VISIBLE_STRIPS=8;
export function b3ConsoleReadout(view={}){
  const fader=Array.isArray(view.fader)?view.fader:[],gain=clamp((fader[2]??.75)/.75,0,1.33);
  const output=view.active?Math.max(0,Number(view.noiseRatio??view.intensity)||0):0;
  const source=Number.isFinite(view.sourceRatio)?Math.max(0,view.sourceRatio):gain>0?output/gain:0;
  const meter=ratio=>ratio>0?clamp((20*Math.log10(ratio)+20)/23):0;
  return{sourceRatio:source,outputRatio:output,sourceMeter:meter(source),outputMeter:meter(output),
    strips:LEGENDS.map((legend,i)=>({channel:i+1,legend,value:clamp(fader[i]??.75),signal:i===2?meter(source):0}))};
}
export function b3ConsoleLayout(size={},selected=1){
  const cols=Math.max(20,Number(size.cols)||120),rows=Math.max(8,Number(size.rows)||38),visible=cols>=100?8:cols>=54?4:2;
  const w=Math.min(cols-1,96),h=Math.min(15.5,Math.max(5.8,rows*.39)),x=(cols-w)/2,y=rows-h-.9;
  const bank=Math.floor((clamp(selected,1,16)-1)/visible)*visible,detail=h>=10,masterW=cols>=100?16:cols>=70?11:cols>=40?6.3:3.8;
  const master={x:x+w-masterW-.55,y:y+.55,w:masterW,h:h-1.1};
  const power={x:master.x+.3,y:detail?y+h-3.1:y+1.5,w:masterW-.6,h:detail?2.5:Math.max(2,h-2.5)};
  const closeW=Math.min(4.1,w*.20),lookW=Math.min(11,w*.31),inspectW=Math.min(15,w*.43),toolbarY=Math.max(0,y-1.3);
  const close={x:x+w-closeW,y:toolbarY,w:closeW,h:1.15};
  const look={x:close.x-.4-lookW,y:toolbarY,w:lookW,h:1.15};
  const inspect={x:look.x-.4-inspectW,y:toolbarY,w:inspectW,h:1.15};
  const prev={x:x+.55,y:y+.7,w:1.4,h:h-1.4},next={x:master.x-1.55,y:y+.7,w:1.4,h:h-1.4};
  const stripX=prev.x+prev.w,stripW=(next.x-stripX)/visible;
  const strips=Array.from({length:visible},(_,i)=>({channel:bank+i+1,x:stripX+i*stripW,y:y+.65,w:stripW,h:h-1.3,
    track:{x:stripX+i*stripW+stripW*.2,y:y+(detail?4.8:2.2),w:stripW*.6,h:Math.max(1.2,h-(detail?7:3.7))}}));
  return{cols,rows,x,y,w,h,bank,visible,detail,master,power,close,look,inspect,prev,next,strips,footerY:rows-.8,
    worldVisibleToY:Math.max(0,y-1.3),collapsed:{x:Math.max(1,(cols-Math.min(70,cols-2))/2),y:rows-2.8,w:Math.min(70,cols-2),h:1.65}};
}
export function b3ConsoleHit(layout,x,y){
  const inside=r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;
  for(const [kind,r]of [['close',layout.close],['look',layout.look],['inspect',layout.inspect],['power',layout.power],['previous',layout.prev],['next',layout.next]])if(inside(r))return{kind};
  const strip=layout.strips.find(inside);if(!strip)return null;
  return{kind:y>=strip.track.y-.4&&y<=strip.track.y+strip.track.h+.4?'fader':'select',channel:strip.channel,track:strip.track};
}
export function b3FaderFromY(track,y){return clamp(1-(y-track.y)/Math.max(.01,track.h));}

export function drawB3Console(view,size=uiSize()){
  const l=b3ConsoleLayout(size,view.selected),read=b3ConsoleReadout(view);
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const px=v=>v*cellW*dpr,py=v=>v*cellH*dpr;
    const text=(s,x,y,w,color='#d4d0b7',scale=.64)=>{ctx.font=`${Math.max(8,Math.min(22,cellH*scale))*dpr}px 'Hardware Sans',sans-serif`;ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(s,px(x),py(y),Math.max(1,px(w)));};
    const rect=(r,c)=>{ctx.fillStyle=c;ctx.fillRect(px(r.x),py(r.y),px(r.w),py(r.h));};
    const cap=(r,label,kind,focused=false)=>{drawHardwareCap(ctx,px(r.x),py(r.y),px(r.w),py(r.h),{finish:'keycap',color:'white',focused,travel:view.pressed===kind?1:0,dpr});text(label,r.x+r.w/2,r.y+r.h/2,r.w-.25,'#262a23',.58);};
    const meter=(r,value,label)=>{
      rect(r,'#101510');const inner={x:r.x+.12,y:r.y+.12,w:r.w-.24,h:r.h-.24};rect(inner,'#d8ccb0');
      const cx=px(inner.x+inner.w/2),cy=py(inner.y+inner.h*.93),radius=Math.min(px(inner.w*.46),py(inner.h*.86));
      ctx.save();ctx.beginPath();ctx.rect(px(inner.x),py(inner.y),px(inner.w),py(inner.h));ctx.clip();
      ctx.strokeStyle='#5a5141';ctx.lineWidth=dpr;
      ctx.beginPath();ctx.arc(cx,cy,radius,Math.PI*1.12,Math.PI*1.88);ctx.stroke();
      for(let i=0;i<=6;i++){const a=Math.PI*(1.12+.76*i/6);ctx.strokeStyle=i>=5?'#843d2a':'#514b3e';ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*radius*.84,cy+Math.sin(a)*radius*.84);ctx.lineTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);ctx.stroke();}
      const a=Math.PI*(1.12+.76*clamp(value));ctx.strokeStyle='#482b25';ctx.lineWidth=1.6*dpr;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(a)*radius*.97,cy+Math.sin(a)*radius*.97);ctx.stroke();
      ctx.restore();text(label,r.x+r.w/2,r.y+r.h*.82,r.w-.3,'#413d31',.5);
    };
    ctx.save();
    if(view.looking){
      rect(l.collapsed,'#141b15');ctx.strokeStyle='#727b69';ctx.lineWidth=dpr;ctx.strokeRect(px(l.collapsed.x),py(l.collapsed.y),px(l.collapsed.w),py(l.collapsed.h));
      const words=`B3  /  ${view.powerOn?'I':'O'}    CLICK / TAB: DESK`;
      text(words,l.collapsed.x+l.collapsed.w/2,l.collapsed.y+.8,l.collapsed.w-1,'#d0d4c0',.66);ctx.restore();return;
    }
    const x=px(l.x),y=py(l.y),w=px(l.w),h=py(l.h),edge=Math.max(5*dpr,px(.65));
    ctx.fillStyle='#070a07';ctx.fillRect(x-3*dpr,y+3*dpr,w+6*dpr,h);
    const body=ctx.createLinearGradient(0,y,0,y+h);body.addColorStop(0,'#71777a');body.addColorStop(.045,FINISH.panel);body.addColorStop(.82,'#3d4448');body.addColorStop(1,'#22282a');
    ctx.fillStyle=body;ctx.fillRect(x,y,w,h);
    const wood=ctx.createLinearGradient(x,0,x+edge,0);wood.addColorStop(0,'#131910');wood.addColorStop(.5,FINISH.wood);wood.addColorStop(1,'#292a1f');ctx.fillStyle=wood;ctx.fillRect(x,y,edge,h);ctx.fillRect(x+w-edge,y,edge,h);
    ctx.strokeStyle='#979b85';ctx.lineWidth=dpr;ctx.beginPath();ctx.moveTo(x+edge,y+.5*dpr);ctx.lineTo(x+w-edge,y+.5*dpr);ctx.stroke();
    for(const xx of[x+edge*.55,x+w-edge*.55])for(const yy of[y+7*dpr,y+h-7*dpr]){ctx.fillStyle='#0b100b';ctx.beginPath();ctx.arc(xx,yy,1.8*dpr,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#70735e';ctx.beginPath();ctx.moveTo(xx-1.2*dpr,yy);ctx.lineTo(xx+1.2*dpr,yy);ctx.stroke();}
    cap(l.inspect,view.returnTraced?'MONITOR RETURN':'TRACE / PATCH','inspect');cap(l.close,'LEAVE','close');cap(l.look,'LOOK UP  /  TAB','look');cap(l.prev,'‹','previous');cap(l.next,'›','next');
    text(B3_CONSOLE_REFERENCE.displayName,l.master.x+l.master.w/2,l.y+1,l.master.w-.3,FINISH.ivory,.60);
    if(l.detail&&l.master.w>=8){meter({x:l.master.x+.5,y:l.y+1.6,w:l.master.w-1,h:2.25},read.sourceMeter,'RETURN');meter({x:l.master.x+.5,y:l.y+4,w:l.master.w-1,h:2.25},read.outputMeter,'STUDIO');text('16 INPUT / 8 GROUP',l.master.x+l.master.w/2,l.y+6.8,l.master.w-1,'#c1c6c5',.48);
      if(l.h>=14){const gx=l.master.x+.6,gw=(l.master.w-1.2)/8,gy=l.y+7.3;
      for(let group=0;group<8;group++){const xx=gx+(group+.5)*gw;rect({x:xx-gw*.42,y:gy,w:gw*.84,h:2.2},FINISH.group);text(String(group+1),xx,gy+.3,gw*.8,FINISH.ivory,.43);rect({x:xx-.05,y:gy+.7,w:.1,h:1.05},'#111719');rect({x:xx-gw*.24,y:gy+1.3,w:gw*.48,h:.25},FINISH[B3_CONSOLE_LAYOUT.groupCapColors[group]]);}
      text('TAPE MONITOR',l.master.x+l.master.w/2,gy+2.5,l.master.w-1,'#bcc5c7',.44);}}
    const p=l.power;rect(p,FINISH.master);ctx.strokeStyle=view.focus==='power'?'#ead5a5':'#535d4c';ctx.lineWidth=dpr;ctx.strokeRect(px(p.x),py(p.y),px(p.w),py(p.h));
    text('PSU  /  P',p.x+p.w/2,p.y+.45,p.w-.15,'#c3c6ad',.54);
    const switchX=px(p.x+p.w*.5),switchY=py(p.y+p.h*.5),sw=Math.min(px(p.w*.25),15*dpr),sh=Math.min(py(p.h*.33),25*dpr);
    ctx.fillStyle='#080e08';ctx.fillRect(switchX-sw*.65,switchY-sh*.65,sw*1.3,sh*1.3);ctx.fillStyle='#b9bba6';ctx.fillRect(switchX-sw*.5,switchY+(view.powerOn?-sh*.5:0),sw,sh*.5);
    text(view.powerOn?'I':'O',p.x+p.w/2,p.y+p.h-.35,p.w-.1,'#b6bda5',.58);
    for(const strip of l.strips){
      const item=read.strips[strip.channel-1],active=strip.channel===view.selected&&view.focus==='fader',sx=px(strip.x),sw=px(strip.w),sy=py(strip.y),sh=py(strip.h),cx=sx+sw*.5;
      ctx.fillStyle=active?'#646f75':FINISH.channel;ctx.fillRect(sx,sy,sw-dpr,sh);ctx.strokeStyle='#8a9295';ctx.lineWidth=dpr;ctx.beginPath();ctx.moveTo(sx+.5*dpr,sy);ctx.lineTo(sx+.5*dpr,sy+sh);ctx.stroke();
      text(String(strip.channel).padStart(2,'0'),strip.x+strip.w/2,strip.y+.45,strip.w-.2,'#d6d2ba',.65);
      if(l.detail){
        const pot=(xx,yy,radius,color)=>{ctx.fillStyle='#1b2124';ctx.beginPath();ctx.arc(xx,yy,radius+1.1*dpr,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.beginPath();ctx.arc(xx,yy,radius,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ede8d4';ctx.beginPath();ctx.moveTo(xx,yy-radius*.72);ctx.lineTo(xx,yy-radius*.12);ctx.stroke();};
        pot(cx,py(strip.y+1.1),Math.min(6*dpr,sw*.14),FINISH.red);
        for(let row=0;row<3;row++)for(let col=0;col<2;col++)pot(cx+(col?1:-1)*sw*.17,py(strip.y+1.8+row*.57),Math.min(5.2*dpr,sw*.11),col?FINISH.green:FINISH.blue);
        // Dark segmented bar meter; a dead desk has no animated pilot lights.
        for(let segment=0;segment<7;segment++)rect({x:strip.x+strip.w*.86,y:strip.y+.8+segment*.29,w:strip.w*.07,h:.18},segment<2?'#443a33':'#293a35');
        // An unlit routing key, not a phosphor or an active circuit indicator.
        const kw=Math.min(15*dpr,sw*.3),ky=py(strip.y+3.75);ctx.fillStyle='#101910';ctx.fillRect(cx-kw*.6,ky-3*dpr,kw*1.2,6*dpr);ctx.fillStyle='#7e8970';ctx.fillRect(cx-kw*.45,ky-2*dpr,kw*.9,3*dpr);
      }
      const t=strip.track,ty=py(t.y),th=py(t.h),tw=px(t.w);
      ctx.fillStyle='#091108';ctx.fillRect(cx-Math.max(dpr,tw*.045),ty,Math.max(2*dpr,tw*.09),th);
      for(let i=0;i<=5;i++){const yy=ty+i*th/5;ctx.strokeStyle=i===1?'#ddd7b7':'#9ba58e';ctx.lineWidth=dpr;ctx.beginPath();ctx.moveTo(cx-tw*.45,yy);ctx.lineTo(cx-tw*.26,yy);ctx.stroke();}
      const capW=Math.max(7*dpr,Math.min(tw*.78,31*dpr)),capH=Math.max(5*dpr,Math.min(py(.66),14*dpr)),capY=ty+(1-item.value)*th;
      drawHardwareCap(ctx,cx-capW/2,capY-capH/2,capW,capH,{color:'white',finish:'keycap',focused:active,travel:view.dragChannel===strip.channel ? .12 : 0,dpr});
      ctx.fillStyle='#31372b';ctx.fillRect(cx-capW*.43,capY-.7*dpr,capW*.86,1.4*dpr);
      const tape={x:strip.x+strip.w*.08,y:strip.y+strip.h-.85,w:strip.w*.84,h:.67};rect(tape,strip.channel===3?'#c9c4a5':'#aeb79a');text(item.legend,tape.x+tape.w/2,tape.y+tape.h/2,tape.w-.1,'#272e22',.5);
      if(strip.channel===3){ctx.strokeStyle='#3d4734';ctx.lineWidth=1.25*dpr;ctx.beginPath();ctx.moveTo(px(tape.x+.12),py(tape.y+tape.h*.56));ctx.lineTo(px(tape.x+tape.w-.12),py(tape.y+tape.h*.39));ctx.stroke();}
    }
    ctx.restore();
  });return l;
}
