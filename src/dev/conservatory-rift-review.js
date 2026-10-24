import {CONSERVATORY_RIFT_OPTIONS} from '../data/conservatory-rift.js';

// Explicit local QA controls, excluded from the game's production raster.
export function installConservatoryRiftReview({stage,play,getState,exit,floorReview,floorState}={}){
  const panel=document.createElement('aside');panel.id='rift-review-tools';
  panel.style.cssText='position:fixed;top:8px;right:8px;z-index:100000;background:#111e;color:#eee;border:1px solid #888;padding:8px;max-width:340px;font:12px monospace';
  const status=document.createElement('div');status.style.whiteSpace='pre-wrap';
  let optionId=CONSERVATORY_RIFT_OPTIONS[0].id,beat=0,queue=Promise.resolve(),kind='rift',floorIndex=0;
  const row=()=>{const r=document.createElement('div');panel.append(r);return r;};
  const button=(parent,label,run)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:5px;margin:2px';b.onclick=e=>{
    e.stopPropagation();queue=queue.then(async()=>{try{await run();}catch(error){status.textContent=String(error?.message||error);}finally{document.getElementById('map')?.focus();}});};parent.append(b);};
  const show=()=>{const s=getState?.();status.textContent=s?`${s.optionId} · ${s.frame?.phase}\nReady ${s.ready} · beat ${s.studyBeat??'play'}\n${s.error||'Production renderer · candidate study'}`:'Choose a candidate.';};
  const options=row();for(const option of CONSERVATORY_RIFT_OPTIONS)button(options,option.title,async()=>{kind='rift';optionId=option.id;beat=0;await stage(optionId,beat);show();});
  const phases=row();for(const [i,label]of ['Approach','Embodiment','Source leak','Return'].entries())button(phases,label,async()=>{beat=i;await stage(optionId,beat);show();});
  const actions=row();button(actions,'Play candidate',()=>{play();show();});button(actions,'Leave study',()=>{exit();show();});
  button(actions,'Save production frame',async()=>{
    const s=kind==='floor'?{...floorState?.(),ready:true,optionId:'third-floor',studyBeat:floorIndex}:getState?.();if(!s?.ready)throw Error('Wait for the scene to resolve.');
    const canvas=document.querySelector('canvas.r3d');if(!canvas)throw Error('The production canvas is missing.');
    const stem=`rift-${s.optionId}-${s.studyBeat??'play'}`;
    const save=async(name,body,type)=>{const r=await fetch('/__rift-review/'+name,{method:'POST',headers:{'Content-Type':type},body});if(!r.ok)throw Error('Frame save failed: '+r.status);};
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    await save(stem+'.png',blob,'image/png');await save(stem+'.json',JSON.stringify(s,null,2),'application/json');
    status.textContent=`Saved ${stem}.png + actual frame receipt.`;
  });
  const floors=row();for(let i=0;i<=3;i++)button(floors,`Floor: ${i===0?'first visit':'return '+i}`,async()=>{kind='floor';floorIndex=i;exit();await floorReview(i);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const s=floorState?.();status.textContent=`Third floor · return ${i}\n${s?.presentActorIds?.length??s?.present?.length??'?'} bodies present\nSaved-night progression fixture`;});
  panel.append(status);document.body.append(panel);show();return()=>panel.remove();
}
