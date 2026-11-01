// Explicit review of the production scene, with unearned history labeled.
import {freshSourceFalseReturn,normalizeSourceFalseReturn} from '../game/source-false-return.js';
import {freshThresholdGag} from '../game/threshold-gag.js';
import {thresholdGagTiming,THRESHOLD_GAG,thresholdGagViewPoints,thresholdGagPoint} from '../data/threshold-gag.js';
export function thresholdReviewCheckpoint({runId,returnPose,mode='arrival',saved=null}={}){
  if(mode==='saved'&&saved)return normalizeSourceFalseReturn(saved,{runId});
  const base=freshSourceFalseReturn({runId,returnPose});
  if(mode==='return')base.thresholdGag={...freshThresholdGag(),available:true};
  return base;
}
export function installThresholdGagReview(api){
  const panel=document.createElement('aside');panel.id='threshold-gag-review';panel.setAttribute('aria-label','Threshold gag developer review');
  panel.style.cssText='position:fixed;z-index:2147483000;top:0;left:0;right:0;background:#111b13ee;color:#d4ddc8;padding:5px;font:12px monospace;display:flex;gap:5px;flex-wrap:wrap';
  const mark=document.createElement('strong');mark.textContent='DEV STAGING · HISTORY UNEARNED';panel.append(mark);
  const status=document.createElement('pre');status.id='threshold-review-receipt';status.style.cssText='position:fixed;bottom:0;left:0;right:0;margin:0;padding:5px;max-height:95px;overflow:auto;z-index:2147483001;background:#101810ee;color:#d3ddc9;font:11px monospace';
  for(const type of['pointerdown','pointerup','click','keydown','keyup'])panel.addEventListener(type,e=>e.stopPropagation());
  const inputLog=[];const noteInput=e=>{inputLog.push({type:e.type,key:e.key,code:e.code,target:e.target?.id||e.target?.tagName});if(inputLog.length>8)inputLog.shift();};addEventListener('keydown',noteInput,true);addEventListener('keyup',noteInput,true);
  let stagedBudget=false,freezeStop=false,stopFrozen=false,capture=null,frameId=null,observations=[],busy=false,active=false;
  const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='font:inherit;padding:3px 6px';b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();active=true;}catch(e){status.textContent=String(e?.stack||e);}finally{busy=false;b.disabled=false;document.getElementById('map')?.focus();}};panel.append(b);return b;};
  button('Stage Ellery arrival',()=>{stopFrozen=false;return api.stage('arrival');});button('Stage Ellery return',()=>{stopFrozen=false;return api.stage('return');});
  button('Stage Earthfall Ellery',()=>{stopFrozen=false;return api.stage('earthfall');});
  button('DEV: synthetic player noise',()=>api.playerNoise?.());
  button('DEV: walk to first gag',()=>api.walk?.('first-gag'));
  button('DEV: walk + synthetic reaction',()=>api.walk?.('first-trap'));
  button('DEV: walk Ellery loop',()=>api.walk?.('earthfall-loop'));
  button('DEV: chase circuit + synthetic noise',()=>api.walk?.('earthfall-chase'));
  button('DEV: use quiet exit',()=>api.walk?.('earthfall-quiet'));
  button('Reload checkpoint',()=>{stopFrozen=false;return api.stage('saved');});button('Resume scene',()=>{stopFrozen=false;api.scene()?.resume();});
  for(const[name,yaw,pitch]of[['Look north',0,0],['Look west',-Math.PI/2,0],['Look at face','face',.02],['Look down',null,-.65]])button(name,()=>{const scene=api.scene(),v=scene?.view();scene?.setLook({yaw:yaw==='face'?Math.atan2(thresholdGagViewPoints()[1][0]-v.x,-(thresholdGagViewPoints()[1][2]-v.z)):yaw??v.yaw,pitch});});
  button('Look at mechanism',()=>{const scene=api.scene(),v=scene?.view(),p=thresholdGagPoint([-.68,0,.05]);scene?.setLook({yaw:Math.atan2(p.x-v.x,v.z-p.z),pitch:Math.atan2(p.y-(v.feet+1.62),Math.hypot(p.x-v.x,p.z-v.z))});});
  button('Look at inscription',()=>{const scene=api.scene(),v=scene?.view(),p=thresholdGagPoint(THRESHOLD_GAG.inscription.target);scene?.setLook({yaw:Math.atan2(p.x-v.x,v.z-p.z),pitch:Math.atan2(p.y-(v.feet+THRESHOLD_GAG.eyeHeight),Math.hypot(p.x-v.x,p.z-v.z))});});
  button('Look at Earthfall gag',()=>{const scene=api.scene(),v=scene?.view()?.aside,p=v?.gag?.mount;if(!p)return;scene.setLook({yaw:Math.atan2(p.x-.45-v.x,v.z-(p.z+.45)),pitch:Math.atan2(p.y-.25-(v.feet+1.62),Math.hypot(p.x-.45-v.x,p.z+.45-v.z))});});
  button('Turn around',()=>{const scene=api.scene(),v=scene?.lookAngles?.()||scene?.view();scene?.setLook({yaw:v.yaw+Math.PI,pitch:0});});
  button('Yaw −15°',()=>api.scene()?.lookBy(-Math.PI/12,0));button('Yaw +15°',()=>api.scene()?.lookBy(Math.PI/12,0));
  const check=(label,fn)=>{const l=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.onchange=()=>{fn(box.checked);document.getElementById('map')?.focus();};l.append(box,label);panel.append(l);};
  check('Freeze at stop (inspection)',v=>{freezeStop=v;stopFrozen=false;});check('Reduced motion',v=>api.reduceMotion(v));check('DEV: allow inspection scare (staged budget)',v=>{stagedBudget=v;api.allowInspectionBudget(v);});
  const download=(name,type,data)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  const recordButton=button('Record game + audio',()=>{
    if(capture){capture.recorder.stop();capture=null;recordButton.textContent='Record game + audio';return;}
    const source=document.querySelector('canvas.r3d'),uiLayer=[...document.querySelectorAll('#map > canvas')].find(c=>c.style.zIndex==='8');if(!source)throw Error('The production raster is unavailable');
    const canvas=document.createElement('canvas');canvas.width=Math.min(960,source.width);canvas.height=Math.round(source.height*canvas.width/source.width);const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    const audio=api.captureAudio(),stream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...audio.stream.getAudioTracks()]);
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:3500000,audioBitsPerSecond:128000}),chunks=[],clocks=[],start=performance.now(),audioStart=audio.clock();
    const state={recorder,live:true};capture=state;observations=[];
    const draw=stamp=>{if(!state.live)return;ctx.drawImage(source,0,0,canvas.width,canvas.height);if(uiLayer)ctx.drawImage(uiLayer,0,0,canvas.width,canvas.height);ctx.fillStyle='#142016';ctx.fillRect(0,0,canvas.width,22);ctx.fillStyle='#d7e0cb';ctx.font='12px monospace';ctx.fillText('DEV STAGING · GAME + OUTPUT AUDIO · SYNTHETIC REACTION · SCRIPTED INPUT'+(stagedBudget?' · SCARE BUDGET STAGED':''),8,15);clocks.push({wall:(stamp-start)/1000,audio:audio.clock()-audioStart});requestAnimationFrame(draw);};requestAnimationFrame(draw);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{state.live=false;stream.getTracks().forEach(t=>t.stop());audio.dispose();observations.push({captureClocks:clocks});download('threshold-gag-game.webm',mime,new Blob(chunks,{type:mime}));};
    recorder.start(250);recordButton.textContent='Stop + save video';
  });
  button('Save receipt',()=>download('threshold-gag-receipt.json','application/json',JSON.stringify({fixture:true,reference:'Approved three-view hinged wooden apparatus',observations,trace:api.trace()},null,2)));
  document.body.append(panel,status);let lastAt=-Infinity;
  function inspect(now){
    frameId=requestAnimationFrame(inspect);if(!active||now-lastAt<75)return;lastAt=now;
    const v=api.inspect();if(!v)return;
    const gag=v.state?.thresholdGag;
    if(freezeStop&&!stopFrozen&&gag?.phase==='running'&&gag.elapsed>=thresholdGagTiming(gag.reduced).contact){api.scene()?.pause();stopFrozen=true;}
    observations.push({at:now,...v});if(observations.length>4000)observations.shift();status.textContent=JSON.stringify({...v,input:inputLog});
  }frameId=requestAnimationFrame(inspect);
  addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);removeEventListener('keydown',noteInput,true);removeEventListener('keyup',noteInput,true);if(capture?.recorder.state==='recording')capture.recorder.stop();panel.remove();status.remove();},{once:true});
  return{panel,status};
}
