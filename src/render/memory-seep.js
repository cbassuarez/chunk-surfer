// A SEEP. Under a second of somewhere else, painted here and printed through the game's
// own look (r3dSetTableau) over whatever room it is. Nothing here is a likeness of a
// place he could name. The road's things, and then the field's.
const TAU=Math.PI*2;
const hash=n=>{let x=(n|0)^0x9e3779b9;x=Math.imul(x^(x>>>16),0x85ebca6b);x=Math.imul(x^(x>>>13),0xc2b2ae35);return((x^(x>>>16))>>>0)/4294967295;};
const surface=(w,h)=>{if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(w,h);const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const plates=new Map();

function road(ctx,w,h,light='#1a1c20'){const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#05060a');g.addColorStop(1,light);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);for(let k=0;k<2400;k++){ctx.fillStyle=`rgba(${hash(k)>.5?'200,200,210':'0,0,0'},${.03+hash(k*3)*.06})`;ctx.fillRect(hash(k*5)*w,h*.4+hash(k*7)*h*.6,1+hash(k*11)*3,1);}}
const PAINT=Object.freeze({
  // A wheel on its side, going round, with nothing above it.
  wheel(ctx,w,h){
    road(ctx,w,h);const x=w*.52,y=h*.56,r=h*.36;
    ctx.fillStyle='#0a0a0c';ctx.beginPath();ctx.ellipse(x,y,r,r*.82,.1,0,TAU);ctx.fill();
    ctx.strokeStyle='#24252a';ctx.lineWidth=r*.06;for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(x,y,r*(.98-k*.07),r*.82*(.98-k*.07),.1,0,TAU);ctx.stroke();}
    ctx.fillStyle='#8c8e92';ctx.beginPath();ctx.ellipse(x,y,r*.58,r*.48,.1,0,TAU);ctx.fill();
    for(let k=0;k<40;k++){const a=k/40*TAU;ctx.strokeStyle=`rgba(230,232,236,${.08+hash(k)*.22})`;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.14,y+Math.sin(a)*r*.11);ctx.lineTo(x+Math.cos(a)*r*.56,y+Math.sin(a)*r*.46);ctx.stroke();}
    ctx.fillStyle='#2a2b30';ctx.beginPath();ctx.ellipse(x,y,r*.13,r*.11,.1,0,TAU);ctx.fill();
  },
  hubcap(ctx,w,h){
    road(ctx,w,h,'#23252a');const x=w*.46,y=h*.62,r=h*.25;
    const g=ctx.createRadialGradient(x-r*.3,y-r*.3,r*.1,x,y,r);g.addColorStop(0,'#fafafa');g.addColorStop(.5,'#9a9ca0');g.addColorStop(1,'#34353a');
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,r,r*.62,-.2,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(20,20,24,.7)';ctx.lineWidth=3;for(let k=0;k<12;k++){const a=k/12*TAU;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*r*.2,y+Math.sin(a)*r*.12);ctx.lineTo(x+Math.cos(a)*r*.92,y+Math.sin(a)*r*.56);ctx.stroke();}
    ctx.fillStyle='rgba(255,255,255,.65)';ctx.beginPath();ctx.ellipse(x-r*.35,y-r*.2,r*.28,r*.08,-.5,0,TAU);ctx.fill();
  },
  'bent-metal'(ctx,w,h){
    ctx.fillStyle='#060608';ctx.fillRect(0,0,w,h);
    for(let k=0;k<26;k++){const x=hash(k)*w,y=hash(k*3)*h,s=h*(.12+hash(k*5)*.4),a=hash(k*7)*TAU,light=hash(k*11);
      ctx.fillStyle=light>.7?'#e9e7e0':light>.35?'#a8a8a4':'#46464a';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*s,y+Math.sin(a)*s);ctx.lineTo(x+Math.cos(a+1.1)*s*.7,y+Math.sin(a+1.1)*s*.7);ctx.closePath();ctx.fill();}
    const red=ctx.createRadialGradient(w*.7,h*.32,0,w*.7,h*.32,h*.6);red.addColorStop(0,'rgba(255,20,6,.75)');red.addColorStop(1,'rgba(255,20,6,0)');ctx.fillStyle=red;ctx.fillRect(0,0,w,h);
  },
  // A windscreen, from inside, gone to crazing, one lamp beyond it.
  glass(ctx,w,h){
    ctx.fillStyle='#07090d';ctx.fillRect(0,0,w,h);
    const lamp=ctx.createRadialGradient(w*.62,h*.42,0,w*.62,h*.42,h*.5);lamp.addColorStop(0,'rgba(255,240,205,.95)');lamp.addColorStop(.25,'rgba(255,214,150,.35)');lamp.addColorStop(1,'rgba(255,214,150,0)');ctx.fillStyle=lamp;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(235,240,245,.6)';ctx.lineWidth=1.2;
    const ox=w*.44,oy=h*.5;
    for(let k=0;k<40;k++){let x=ox,y=oy;const a=k/40*TAU+hash(k)*.1;ctx.beginPath();ctx.moveTo(x,y);for(let s=0;s<7;s++){x+=Math.cos(a+(hash(k*s+3)-.5)*.5)*w*.09;y+=Math.sin(a+(hash(k*s+5)-.5)*.5)*w*.09;ctx.lineTo(x,y);}ctx.stroke();}
    for(let r=1;r<6;r++){ctx.beginPath();for(let k=0;k<=40;k++){const a=k/40*TAU,d=r*w*.07*(.9+hash(k+r*41)*.25);ctx[k?'lineTo':'moveTo'](ox+Math.cos(a)*d,oy+Math.sin(a)*d);}ctx.stroke();}
  },
  'tail-lamps'(ctx,w,h){
    ctx.fillStyle='#030304';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#16171b';ctx.fillRect(w*.08,h*.26,w*.84,h*.62);
    for(const x of[w*.2,w*.8]){const g=ctx.createRadialGradient(x,h*.46,0,x,h*.46,h*.3);g.addColorStop(0,'rgba(255,60,30,1)');g.addColorStop(.3,'rgba(255,8,2,.8)');g.addColorStop(1,'rgba(255,8,2,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);ctx.fillStyle='#ff1a0a';ctx.fillRect(x-w*.07,h*.41,w*.14,h*.1);}
    ctx.fillStyle='#d8d8d0';ctx.fillRect(w*.42,h*.56,w*.16,h*.08);
  },
  // Close, on your knees or lying down. Daisies against the sky.
  daisies(ctx,w,h){
    const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#3b78cf');sky.addColorStop(.8,'#cfe4f4');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#3f7a22';ctx.fillRect(0,h*.72,w,h*.28);
    for(let k=0;k<600;k++){ctx.strokeStyle=hash(k)>.5?'#5c9a2e':'#2f6a1a';ctx.lineWidth=1+hash(k*3)*2;const x=hash(k*5)*w,y=h*(.62+hash(k*7)*.38);ctx.beginPath();ctx.moveTo(x,h);ctx.quadraticCurveTo(x+(hash(k*9)-.5)*40,y+40,x+(hash(k*11)-.5)*60,y);ctx.stroke();}
    for(let k=0;k<22;k++){const x=hash(k*13)*w,y=h*(.38+hash(k*17)*.48),r=h*(.035+hash(k*19)*.05);
      ctx.strokeStyle='#3a7a20';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,h);ctx.lineTo(x,y);ctx.stroke();
      for(let p=0;p<16;p++){const a=p/16*TAU;ctx.fillStyle='#fbfbf4';ctx.beginPath();ctx.ellipse(x+Math.cos(a)*r*.62,y+Math.sin(a)*r*.62*.8,r*.5,r*.17,a,0,TAU);ctx.fill();}
      ctx.fillStyle='#f2bf1c';ctx.beginPath();ctx.arc(x,y,r*.3,0,TAU);ctx.fill();}
  },
  // Straight into it, through the grass.
  sun(ctx,w,h){
    const sky=ctx.createRadialGradient(w*.58,h*.3,0,w*.58,h*.3,h*1.2);sky.addColorStop(0,'#ffffff');sky.addColorStop(.12,'#fff6cf');sky.addColorStop(.4,'#b8d8f0');sky.addColorStop(1,'#4d88d6');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    for(let k=0;k<14;k++){const a=hash(k)*TAU,l=h*(.4+hash(k*3)*.9);ctx.strokeStyle=`rgba(255,250,220,${.06+hash(k*5)*.12})`;ctx.lineWidth=2+hash(k*7)*7;ctx.beginPath();ctx.moveTo(w*.58,h*.3);ctx.lineTo(w*.58+Math.cos(a)*l,h*.3+Math.sin(a)*l);ctx.stroke();}
    for(let k=0;k<340;k++){const x=hash(k*9)*w,y=h*(.55+hash(k*11)*.45);ctx.strokeStyle=hash(k)>.5?'rgba(40,74,18,.95)':'rgba(84,120,30,.9)';ctx.lineWidth=2+hash(k*13)*3;ctx.beginPath();ctx.moveTo(x,h);ctx.quadraticCurveTo(x+(hash(k*15)-.5)*70,y+30,x+(hash(k*17)-.5)*110,y);ctx.stroke();}
  },
  // Eyes shut, face up. Everything is red and warm.
  lids(ctx,w,h){
    const g=ctx.createRadialGradient(w*.52,h*.36,0,w*.52,h*.36,h*1.1);g.addColorStop(0,'#ffc27a');g.addColorStop(.3,'#f26a2a');g.addColorStop(.7,'#a31f12');g.addColorStop(1,'#4c0a08');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(let k=0;k<22;k++){ctx.strokeStyle=`rgba(90,10,6,${.05+hash(k)*.08})`;ctx.lineWidth=1+hash(k*3)*2;const y=hash(k*5)*h;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.3,y+(hash(k*7)-.5)*h*.2,w*.7,y+(hash(k*9)-.5)*h*.2,w,y+(hash(k*11)-.5)*h*.1);ctx.stroke();}
  },
  // On your back, under it, looking up. The light is a long way off and moving.
  'under-water'(ctx,w,h){
    const deep=ctx.createLinearGradient(0,0,0,h);deep.addColorStop(0,'#bfe8ea');deep.addColorStop(.28,'#2f9aa8');deep.addColorStop(.72,'#0b4656');deep.addColorStop(1,'#031820');ctx.fillStyle=deep;ctx.fillRect(0,0,w,h);
    const sun=ctx.createRadialGradient(w*.5,h*.1,0,w*.5,h*.1,h*.62);sun.addColorStop(0,'rgba(255,255,240,1)');sun.addColorStop(.28,'rgba(220,250,240,.72)');sun.addColorStop(1,'rgba(180,240,240,0)');ctx.fillStyle=sun;ctx.fillRect(0,0,w,h);
    for(let k=0;k<18;k++){const a=-Math.PI/2+(hash(k)-.5)*1.9,l=h*(.7+hash(k*3)*.6),spread=.015+hash(k*5)*.04;ctx.fillStyle=`rgba(235,255,250,${.05+hash(k*7)*.13})`;ctx.beginPath();ctx.moveTo(w*.5,h*.06);ctx.lineTo(w*.5-Math.cos(a-spread)*l,h*.06-Math.sin(a-spread)*l);ctx.lineTo(w*.5-Math.cos(a+spread)*l,h*.06-Math.sin(a+spread)*l);ctx.closePath();ctx.fill();}
    for(let k=0;k<70;k++){const x=hash(k*9)*w,y=h*(.08+hash(k*11)*.3),r=w*(.012+hash(k*13)*.05);ctx.strokeStyle=`rgba(255,255,245,${.1+hash(k*15)*.3})`;ctx.lineWidth=1+hash(k*17)*2;ctx.beginPath();ctx.ellipse(x,y,r,r*.3,0,0,TAU);ctx.stroke();}
    for(let k=0;k<26;k++){const x=hash(k*19)*w,y=h*(.34+hash(k*21)*.6),r=2+hash(k*23)*7;ctx.strokeStyle='rgba(225,250,250,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();}
  },
  sky(ctx,w,h){
    const sky=ctx.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#2e6cc6');sky.addColorStop(1,'#a9d0ee');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    for(let k=0;k<9;k++){const x=hash(k*3)*w,y=hash(k*5)*h*.8;for(let p=0;p<14;p++){const r=h*(.03+hash(k*p+7)*.09);ctx.fillStyle=`rgba(255,255,255,${.5+hash(k*p+9)*.45})`;ctx.beginPath();ctx.arc(x+(hash(k*p+11)-.5)*h*.5,y+(hash(k*p+13)-.5)*h*.14,r,0,TAU);ctx.fill();}}
  },
});
export const SEEP_PLATES=Object.freeze(Object.keys(PAINT));
export function memorySeepPlate(id,{width=640,height=360}={}){
  const key=`${id}:${width}x${height}`;
  if(plates.has(key))return plates.get(key);
  const paint=PAINT[id];if(!paint)return null;
  const canvas=surface(width,height);paint(canvas.getContext('2d'),width,height);plates.set(key,canvas);
  return canvas;
}
export function releaseMemorySeeps(){plates.clear();}
