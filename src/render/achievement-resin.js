// A normally-open cast-resin key: captive socket, deep pigment, a recessed
// diffuse lamp and a polished meniscus. This isolated material does not alter
// the recorder's existing STOP, keycap, or fixed-lens rendering paths.
import {hardwareCapGeometry} from './hardware-material.js';

export const ACHIEVEMENT_RESIN_TONES=Object.freeze({
 all:Object.freeze({pigment:'#e4ddbf',signal:'#eee4be',ink:'#292a20',name:'ivory'}),
 work:Object.freeze({pigment:'#e9b25e',signal:'#efc48a',ink:'#322514',name:'amber'}),
 disclosures:Object.freeze({pigment:'#8edbb7',signal:'#b0e8ce',ink:'#173126',name:'mint'}),
 returns:Object.freeze({pigment:'#87afe6',signal:'#aecdf6',ink:'#1a283e',name:'blue'}),
 method:Object.freeze({pigment:'#b69ae4',signal:'#d2bdf4',ink:'#302242',name:'violet'}),
});
const cache=new Map(),MAX_PIXELS=2*1024*1024,MAX_ENTRIES=32;
let pixels=0;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const linear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const srgb=x=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
const round=(ctx,x,y,w,h,r)=>{ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();};
const vertical=(ctx,y,h,stops)=>{const g=ctx.createLinearGradient(0,y,0,y+h);for(const[p,c]of stops)g.addColorStop(p,c);return g;};

function fields(ctx,w,h,pigment){
 w=Math.max(1,Math.ceil(w));h=Math.max(1,Math.ceil(h));const key=`${w}:${h}:${pigment}`;
 if(cache.has(key)){const hit=cache.get(key);cache.delete(key);cache.set(key,hit);return hit;}
 const owner=ctx.canvas?.ownerDocument||(typeof document!=='undefined'?document:null);
 if(!owner?.createElement||w*h*2>MAX_PIXELS)return null;
 const off=owner.createElement('canvas'),on=owner.createElement('canvas');off.width=on.width=w;off.height=on.height=h;
 const a=off.getContext('2d'),b=on.getContext('2d');if(!a?.createImageData||!b?.createImageData)return null;
 const dark=a.createImageData(w,h),lit=b.createImageData(w,h),stock=rgb(pigment).map(v=>linear(v/255));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=(x+.5)/w,v=(y+.5)/h,edge=Math.min(u,1-u,v,1-v);
  // Greater optical path at the rolled perimeter absorbs the lamp. The hot
  // region stays below the front surface; it is not an outer software glow.
  const path=1+1.8*Math.exp(-edge*20),lamp=Math.exp(-(((u-.46)/.49)**2+((v-.61)/.76)**2)*1.9);
  const ambient=.25+.045*Math.cos((v-.22)*Math.PI),i=(y*w+x)*4;
  for(let k=0;k<3;k++){
   const transmission=Math.exp(-(-Math.log(Math.max(.025,stock[k])))*path*.42);
   const offLinear=stock[k]*ambient*transmission+.008;
   const onLinear=offLinear+transmission*lamp*.63+stock[k]*.06;
   dark.data[i+k]=Math.round(255*clamp(srgb(offLinear),0,1));lit.data[i+k]=Math.round(255*clamp(srgb(onLinear),0,1));
  }
  dark.data[i+3]=lit.data[i+3]=255;
 }
 a.putImageData(dark,0,0);b.putImageData(lit,0,0);
 const entry={off,on,pixels:w*h*2};
 while(cache.size&&(cache.size>=MAX_ENTRIES||pixels+entry.pixels>MAX_PIXELS)){const key=cache.keys().next().value;pixels-=cache.get(key).pixels;cache.delete(key);}
 cache.set(key,entry);pixels+=entry.pixels;return entry;
}

/** Device pixels, like the shared instrument materials. `pressed` is actual
 * actuation only. A remembered selection can light a key but cannot sink it. */
export function drawAchievementResinKey(ctx,x,y,w,h,{category='all',pressed=false,light=0,focused=false,enabled=true,alpha=1,dpr=1}={}){
 const tone=ACHIEVEMENT_RESIN_TONES[category]||ACHIEVEMENT_RESIN_TONES.all,travel=pressed&&enabled?.88:0;
 const g=hardwareCapGeometry(w,h,travel,{dpr,finish:'lens'}),f=g.face,heat=enabled?clamp(light,0,1):0;
 const r=Math.min(4*dpr,f.h*.22),opacity=clamp(alpha,0,1),inherited=ctx.globalAlpha*opacity;
 ctx.save();ctx.globalAlpha=inherited;ctx.translate(x,y);
 // A thin black captive socket, not a broad brushed-metal key face.
 round(ctx,0,0,w,h,r+1.2*dpr);ctx.fillStyle='#121a16';ctx.fill();
 round(ctx,.7*dpr,.7*dpr,w-1.4*dpr,h-1.4*dpr,r+dpr);ctx.fillStyle='#050b09';ctx.fill();
 ctx.strokeStyle='#a1aaa04a';ctx.lineWidth=.55*dpr;ctx.stroke();
 // Deep coloured skirt and a fixed shadow reveal actual millimetres of travel.
 round(ctx,f.x-.8*dpr,f.y+2*dpr,f.w+1.6*dpr,f.h+g.distance*(1-travel)+1.6*dpr,r);
 ctx.fillStyle=vertical(ctx,f.y,f.h+5*dpr,[[0,tone.pigment],[.15,'#354135'],[.85,'#18251e'],[1,'#070e0a']]);ctx.fill();
 ctx.fillStyle=`rgba(0,0,0,${.38+travel*.24})`;ctx.fillRect(f.x,g.rim,f.w,Math.max(dpr,f.y-g.rim));
 ctx.save();round(ctx,f.x,f.y,f.w,f.h,r);ctx.clip();
 const field=fields(ctx,f.w,f.h,tone.pigment);
 if(field){ctx.drawImage(field.off,f.x,f.y,f.w,f.h);if(heat){ctx.save();ctx.globalAlpha*=heat;ctx.drawImage(field.on,f.x,f.y,f.w,f.h);ctx.restore();}}
 else{ctx.fillStyle=tone.pigment;ctx.fillRect(f.x,f.y,f.w,f.h);}
 // One broad, smooth meniscus and a narrow front-surface reflection. No grain
 // or scratches counterfeit translucency; the lamp and the reflection occupy
 // different planes and respond independently to selection and depression.
 ctx.fillStyle=vertical(ctx,f.y,f.h,[[0,'#ffffff96'],[.025,'#fffffff0'],[.06,'#ffffff58'],[.20,'#ffffff06'],[.56,'#07120e12'],[.82,'#00000025'],[.95,'#ffffff12'],[1,'#ffffff65']]);ctx.fillRect(f.x,f.y,f.w,f.h);
 const reflection=ctx.createRadialGradient(f.x+f.w*.25,f.y-f.h*.15,0,f.x+f.w*.25,f.y-f.h*.15,f.w*.8);
 reflection.addColorStop(0,'#ffffff30');reflection.addColorStop(.55,'#ffffff0a');reflection.addColorStop(1,'#ffffff00');ctx.fillStyle=reflection;ctx.fillRect(f.x,f.y,f.w,f.h);
 ctx.restore();
 // The lower cast edge refracts the recessed lamp as a separate small caustic.
 round(ctx,f.x+.5*dpr,f.y+.5*dpr,f.w-dpr,f.h-dpr,Math.max(.3,r-.5*dpr));ctx.strokeStyle='#ffffff54';ctx.lineWidth=.65*dpr;ctx.stroke();
 ctx.beginPath();ctx.moveTo(f.x+r,f.y+f.h-1.4*dpr);ctx.quadraticCurveTo(f.x+f.w*.5,f.y+f.h+.2*dpr,f.x+f.w-r,f.y+f.h-1.4*dpr);
 ctx.strokeStyle=tone.signal;ctx.lineWidth=(.65+heat*.65)*dpr;ctx.globalAlpha*=.35+heat*.55;ctx.stroke();
 if(focused){ctx.globalAlpha=inherited;ctx.fillStyle=tone.signal;const mark=Math.min(6*dpr,w*.14);ctx.fillRect(w*.5-mark/2,h-1.1*dpr,mark,.8*dpr);}
 ctx.restore();return{...g,tone,travel,light:heat,content:{x:x+g.content.x,y:y+g.content.y,w:g.content.w,h:g.content.h}};
}

export function achievementResinCacheStats(){return{entries:cache.size,pixels,maxEntries:MAX_ENTRIES,maxPixels:MAX_PIXELS,estimatedRgbaBytes:pixels*4};}
