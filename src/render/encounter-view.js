import { uiSize, uiFill, uiDraw } from './ui.js';
import { drawSignalBeing, drawOpponentCombatArt } from './combat-view.js';

export function drawEncounterSplash(battle, { phase, progress = 0, reducedMotion = false } = {}) {
  const {cols,rows}=uiSize();
  if(phase==='hold'){uiFill(0,0,cols,rows,`rgba(0,0,0,${.2+progress*.77})`);return;}
  uiFill(0,0,cols,rows,'#020503');
  const impact=phase==='impact';
  const box=impact&&!reducedMotion?{x:cols*.12,y:-rows*.60,w:cols*1.36,h:rows*2.2}
    :{x:cols*.41,y:rows*.08,w:cols*.66,h:rows*.9};
  const art=battle.art||battle.combat?.art,artId=typeof art==='string'?art:art?.id;
  if(['surfer','guard'].includes(artId))drawOpponentCombatArt(art,{...box,coherence:1,maxCoherence:1,snr:'signal',reduceFlash:true});
  else drawSignalBeing(battle.combat?.id||battle.id,{...box,now:0,snr:'signal',reducedMotion:true});
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const w=cols*cellW*dpr,h=rows*cellH*dpr;
    const gradient=ctx.createLinearGradient(0,0,w,0);gradient.addColorStop(0,'#020503');gradient.addColorStop(.37,'#020503cc');gradient.addColorStop(1,'#02050300');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    if(impact){if(!reducedMotion){ctx.fillStyle='#000';ctx.fillRect(0,h*.24,w,h*.04);ctx.fillRect(w*.7,h*.57,w*.3,h*.012);}return;}
    const name=String(battle.enemy||battle.combat?.enemy||'').trim();
    const x=w*.06,available=w*.80;
    ctx.fillStyle='#b9bba6';ctx.font=`600 ${Math.round(Math.min(15*dpr,h*.027))}px "Hardware Sans", sans-serif`;
    ctx.fillText('THE RECORDIST  /  VS',x,h*.32);
    let size=Math.min(w*.09,h*.17),words=name.split(/\s+/),out=[];
    const wrap=()=>{out=[];let line='';for(const word of words){if(line&&ctx.measureText(line+' '+word).width>available){out.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)out.push(line);};
    ctx.font=`700 ${Math.round(size)}px "Hardware Sans", sans-serif`;wrap();
    while(size>8*dpr&&(out.length>3||out.some(s=>ctx.measureText(s).width>available))){size*=.9;ctx.font=`700 ${Math.round(size)}px "Hardware Sans", sans-serif`;wrap();}
    ctx.fillStyle='#dddcc6';out.forEach((s,i)=>ctx.fillText(s,x,h*.48+i*size*.98));
    ctx.fillStyle='#a2a88e';ctx.fillRect(x,h*.23,w*.06,Math.max(1,dpr*2));
  });
}
