import { uiDraw,uiSize,uiText,uiWrap,uiFill } from './ui.js';
import { drawHardwareScrew,drawHardwarePrint } from './hardware-faceplate.js';
import { drawPromptParts } from './prompt-glyphs.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function radioSceneLayout({cols=120,rows=38}={},view={}){
  const width=Math.max(16,Math.min(72,cols-8)),x=Math.max(2,(cols-width)/2);
  const options=view.pending?.options||[];
  const choices=options.map((c,index)=>({x,y:rows-3.3-(options.length-index)*2.15,w:width,h:1.9,choice:c}));
  const text=String(view.line?.text||'');
  const lines=uiWrap(text,width-2);
  const bottom=choices[0]?.y||rows-3;
  const textY=Math.max(2,bottom-Math.max(2,lines.length)*1.1-1.8);
  return{x,w:width,textY,lines,choices,footerY:rows-1.5};
}

function rounded(ctx,x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}

// Authored case geometry, not the blue inventory still. The mould seam, spring
// latch and carrier lamp each have a physical state across the decision.
export function drawRadioScene(view,{reducedMotion=false}={}){
  const radio=view.radio||{},stage=radio.stage||'live',age=radio.age||0;
  const gone=stage==='break'||stage==='after',reseat=stage==='reseat';
  const lit=!gone&&(reducedMotion||stage!=='decision'||Math.floor(age*1.7)%3!==0);
  const layout=radioSceneLayout(uiSize(),view);
  uiDraw(({ctx,cellW,cellH,dpr,cols,rows})=>{
    const W=cols*cellW*dpr,H=rows*cellH*dpr;
    const wash=ctx.createLinearGradient(0,0,0,H);
    wash.addColorStop(0,'rgba(2,5,8,.10)');wash.addColorStop(.42,'rgba(2,5,8,.18)');wash.addColorStop(.72,'rgba(2,5,8,.89)');wash.addColorStop(1,'rgba(2,5,8,.98)');
    ctx.fillStyle=wash;ctx.fillRect(0,0,W,H);
    const size=Math.min(H*.46,W*.32),s=size/270;
    const arrival=reducedMotion?1:Math.min(1,radio.time/1.2);
    const settle=gone?(reducedMotion?1:Math.min(1,age/2.6)):0;
    const drift=reducedMotion?0:(Math.sin((radio.time||0)*.65)*.006);
    const impact=reducedMotion?0:reseat?Math.sin(Math.min(1,age/.75)*Math.PI)*.11:stage==='break'?Math.sin(age*15)*Math.exp(-age*7)*.065:0;
    ctx.save();ctx.translate(W*.68,H*.22+(1-arrival)*H*.45+settle*H*.075);
    ctx.rotate(-.12+drift+impact+(reducedMotion?0:settle*.11));ctx.scale(s,s);
    // Hand behind the set: the thumb stays on the battery shoe throughout the
    // hold. It pushes home on reseat and withdraws without impact on 'still'.
    const skin=ctx.createLinearGradient(-65,50,80,200);skin.addColorStop(0,'#777165');skin.addColorStop(.5,'#46483f');skin.addColorStop(1,'#242d2b');
    rounded(ctx,-68,118,130,115,32,skin);
    for(let i=0;i<3;i++)rounded(ctx,37,111+i*22,36,26,12,skin);
    rounded(ctx,-28,206,84,90,12,'#1a2628');
    // Whip, selector and rubber guard.
    rounded(ctx,-46,-91,10,112,4,'#101a1e');rounded(ctx,-45,-90,2,110,1,'#485a5f');
    rounded(ctx,24,-7,26,24,4,'#141e20');
    for(let i=0;i<6;i++)rounded(ctx,25+i*4,-6,1,18,.3,'#55605c');
    rounded(ctx,-63,13,128,203,14,'#080d0f');
    const body=ctx.createLinearGradient(-60,30,70,160);body.addColorStop(0,'#566363');body.addColorStop(.12,'#303d40');body.addColorStop(.65,'#172429');body.addColorStop(1,'#080f14');
    rounded(ctx,-58,16,119,193,12,body);
    rounded(ctx,-57,22,3,173,1,'#667372');rounded(ctx,55,27,3,166,1,'#060b0c');
    // Contact shoe physically separates before the decision.
    const gap=gone?4:stage==='decision'?2.7:reseat?(reducedMotion?0:Math.max(0,2.7-age*9)):.7;
    rounded(ctx,-52,171+gap,108,35,4,'#182126');rounded(ctx,-48,172+gap,99,1,.4,'#829084');
    rounded(ctx,-13,166+gap,29,7,2,'#7b8073');rounded(ctx,-11,166+gap,25,2,.5,'#b2b09b');
    // Channel card behind smoked polycarbonate.
    rounded(ctx,-44,42,89,43,4,'#040a0c');rounded(ctx,-40,46,81,34,2,lit?'#626f59':'#202b29');
    drawHardwarePrint(ctx,'CH 02',-33,53,{width:64,height:16,color:lit?'#152620':'#101a18',finish:'faceplate'});
    rounded(ctx,37,27,9,5,2,lit?'#dcb76a':'#342d20');
    if(lit){const glow=ctx.createRadialGradient(41,30,1,41,30,27);glow.addColorStop(0,'rgba(236,175,66,.2)');glow.addColorStop(1,'rgba(236,175,66,0)');ctx.fillStyle=glow;ctx.fillRect(14,4,54,54);}
    for(let i=0;i<10;i++){rounded(ctx,-43,96+i*5.4,84,3,1,'#060e13');rounded(ctx,-41,96+i*5.4,79,.7,.3,'#465451');}
    drawHardwarePrint(ctx,'AUDIOCORP',-43,153,{width:61,height:7,color:'#a0a69a',finish:'faceplate'});
    drawHardwarePrint(ctx,'4417-C',-38,186+gap,{width:64,height:9,color:'#909887',finish:'faceplate'});
    for(const [x,y] of [[-44,31],[44,197]])drawHardwareScrew(ctx,x,y,3,{seed:`radio:${x}`,dpr:1,darkPanel:true});
    const thumb=reducedMotion?0:stage==='still'?clamp(age/1.3,0,1)*22:reseat?-Math.sin(clamp(age/.8,0,1)*Math.PI)*9:0;
    rounded(ctx,-76-thumb,137+gap,47,29,13,skin);rounded(ctx,-61-thumb,140+gap,25,16,7,'#858276');
    ctx.restore();
    // The interruption travels out into the room once. No flashing field or
    // generic glitch texture; just the transmitted reflection losing its set.
    if(stage==='relay'&&!reducedMotion&&age<1.5){ctx.strokeStyle=`rgba(139,176,173,${.10*(1-age/1.5)})`;ctx.lineWidth=dpr;ctx.beginPath();ctx.ellipse(W*.68,H*.35,W*age*.65,H*age*.34,0,0,Math.PI*2);ctx.stroke();}
  });
  const vtext=String(view.line?.text||'').slice(0,view.typed??Infinity);
  const who=['radio','martin'].includes(String(view.who).toLowerCase())?'MARTIN':['me','you'].includes(String(view.who).toLowerCase())?'YOU':'';
  if(who)uiText(layout.x,layout.textY-1.1,who,'ui-blue',.85);
  uiWrap(vtext,layout.w-2).forEach((line,index)=>uiText(layout.x,layout.textY+index*1.1,line,'ui-primary',1));
  layout.choices.forEach((r,index)=>{
    const selected=view.pending.index===index;
    uiFill(r.x-.5,r.y-.15,r.w+1,r.h,selected?'rgba(71,95,91,.42)':'rgba(8,17,20,.65)');
    if(selected)uiFill(r.x-.5,r.y-.15,.22,r.h,'#aeb49b');
    uiWrap(r.choice.text,r.w-3).slice(0,2).forEach((text,i)=>uiText(r.x+1,r.y+i*.9,text,selected?'ui-primary':'ui-secondary',selected?1:.85));
    if(selected&&radio.hold>0)uiFill(r.x,r.y+r.h-.25,r.w*Math.min(1,radio.hold/.65),.12,'#d8b36c');
  });
  const parts=radio.contact?[{action:'select',label:'CHOOSE'},{action:'confirm',label:'HOLD TO COMMIT'}]
    :[{action:'continue',label:radio.ready?'CONTINUE':'LISTEN'},...(!radio.terminal?[{action:'radio',label:'LOWER'}]:[])];
  drawPromptParts(layout.x,layout.footerY,parts,{cols:uiSize().cols,role:'ui-secondary'});
}
