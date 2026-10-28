// Development-only recording controls; the game owns every battle/input rule.
export function installBattleStudy({state,audio,stage}){
 const panel=document.createElement('aside');panel.style.cssText='position:fixed;left:8px;top:8px;z-index:100000;background:#0c1416ec;color:#eee;padding:8px;font:12px monospace;max-width:300px';
 panel.dataset.noPointerLock='';let recorder,stream,sink,source,raf,started,fixture='none',events=[],samples=[],chunks=[];
 const status=document.createElement('output');status.style.cssText='display:block;max-width:280px;margin-top:5px';
 const save=async(name,body,type)=>{const r=await fetch('/__battle-study/'+name,{method:'POST',headers:{'Content-Type':type},body});if(!r.ok)throw Error('Save '+r.status);};
 const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='padding:5px;margin:2px';b.onclick=async e=>{e.stopPropagation();try{await fn();}catch(e){status.textContent=e.message;}document.getElementById('map')?.focus();};panel.append(b);return b;};
 const compact=()=>{const s=state(),b=s.battle,v=b?.state;return{scene:s.scene,position:s.position,source:s.source,paused:s.paused,focused:s.focused,hidden:s.hidden,hands:s.hands,rec:{battery:s.rec.battery,composure:s.rec.composure,injuries:s.rec.injuries},battle:b?{phase:b.phase,turnClock:b.turnClock,resolution:b.resolution?{side:b.resolution.side,elapsed:b.resolution.elapsed,duration:b.resolution.duration}:null,state:v?{composure:v.composure,maxComposure:v.maxComposure,battery:v.battery,charge:v.charge,take:v.take,turns:v.turns,movementIndex:v.movementIndex,movementCoherence:v.movementCoherence,phase:v.phase,read:v.read,committed:v.committed,pendingEnemy:v.pendingEnemy,actionLog:v.actionLog?.slice(-4),last:v.last,result:v.result,sourceDesktop:v.sourceDesktop}:null}:null};};
 for(const[id,label]of [['hall','Stage Hall'],['source','Stage Source'],['source-approach','Stage grey-door approach'],['prep','Stage preparation fixture']])button(label,async()=>{if(recorder)throw Error('Stop capture before staging.');window.__battlePreparationStudy?.dispose();window.__battlePreparationStudy=null;fixture=id;await stage(id);status.textContent='Declared '+id+' fixture. Ordinary controls from here.';});
 button('Save state',async()=>{const id='battle-'+fixture+'-'+Date.now();await save(id+'.json',JSON.stringify({qualification:'Developer fixture; actual runtime thereafter. No human trial claimed.',state:state()},null,2),'application/json');status.textContent='Saved '+id;});
 for(const mode of ['before','after'])button('Preparation '+mode,async()=>{const m=await import('/tools/chunk_surfer/battle-study-preparation-view.mjs');window.__battlePreparationStudy?.dispose();m.mountNativePreparationComparison(mode);status.textContent='Actual-scene '+mode+' preparation adapter; independent draft.';});
 // The real preparation is an accessible modal, so its study toolbar correctly
 // disappears from the accessibility tree. These disclosed review shortcuts
 // switch the adapter without making the production modal non-modal.
 window.addEventListener('keydown',async e=>{
  if(e.repeat||!['F7','F8'].includes(e.key))return;
  e.preventDefault();e.stopImmediatePropagation();
  try{window.__battlePreparationStudy?.dispose();window.__battlePreparationStudy=null;
   if(e.key==='F8'){const m=await import('/tools/chunk_surfer/battle-study-preparation-view.mjs');m.mountNativePreparationComparison('after');}
   status.textContent=e.key==='F8'?'Compact study adapter; F7 restores production.':'Production preparation restored.';
  }catch(error){status.textContent=error.message;}
 },true);
 button('Record game + sound',async()=>{
  if(recorder)return;const a=audio();if(!a.ctx||!a.output)throw Error('Stage a view first');await a.ctx.resume();
  const map=document.getElementById('map'),copy=document.createElement('canvas');copy.width=960;copy.height=Math.round(map.clientHeight/map.clientWidth*960);const ctx=copy.getContext('2d');ctx.imageSmoothingEnabled=false;
  stream=copy.captureStream(15);sink=a.ctx.createMediaStreamDestination();source=a.output;source.connect(sink);for(const t of sink.stream.getAudioTracks())stream.addTrack(t);
  const meter=a.ctx.createAnalyser();meter.fftSize=1024;source.connect(meter);const waveform=new Float32Array(1024);let peak=0,squared=0,n=0,last=0;
  const sample=()=>{const box=map.getBoundingClientRect();ctx.fillStyle='#000';ctx.fillRect(0,0,copy.width,copy.height);
   const canvases=[...map.querySelectorAll('canvas')].filter(c=>c.width&&c.height&&getComputedStyle(c).visibility!=='hidden'&&getComputedStyle(c).display!=='none').sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
   for(const c of canvases){const b=c.getBoundingClientRect();if(b.width&&b.height)try{ctx.drawImage(c,(b.left-box.left)/box.width*copy.width,(b.top-box.top)/box.height*copy.height,b.width/box.width*copy.width,b.height/box.height*copy.height);}catch{}}
   meter.getFloatTimeDomainData(waveform);for(const v of waveform){peak=Math.max(peak,Math.abs(v));squared+=v*v;n++;}
   const now=performance.now();if(now-last>100){last=now;samples.push({at:now-started,...compact()});}raf=requestAnimationFrame(sample);
  };
  chunks=[];events=[];samples=[];started=performance.now();const initial=state();
  const mimeType=['video/webm;codecs=vp8,opus','video/webm'].find(v=>MediaRecorder.isTypeSupported(v));recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:1800000,audioBitsPerSecond:128000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=async()=>{cancelAnimationFrame(raf);source.disconnect(sink);source.disconnect(meter);stream.getTracks().forEach(t=>t.stop());const id='battle-'+fixture+'-'+Date.now();await save(id+'.webm',new Blob(chunks,{type:mimeType}),mimeType);await save(id+'.json',JSON.stringify({qualification:'Developer-staged starting state, uninterrupted operator inputs thereafter. Actual game canvas/dither and mixed sound; HTML preparation is separately inspected. Not native OS-window or unbriefed-player proof.',seconds:(performance.now()-started)/1000,initial,final:state(),events,samples,audio:{peak,rms:Math.sqrt(squared/Math.max(1,n))}},null,2),'application/json');recorder=null;status.textContent='Saved '+id;};
  recorder.start(1000);sample();status.textContent='Recording '+fixture+'; actual inputs and state.';
 });
 button('Stop + save',()=>{if(recorder?.state==='recording')recorder.stop();});
 const event=e=>{if(recorder?.state==='recording')events.push({at:performance.now()-started,type:e.type,key:e.key,repeat:e.repeat,button:e.button,x:e.clientX,y:e.clientY,target:e.composedPath?.()[0]?.dataset?.command||null});};for(const type of ['keydown','keyup','pointerdown'])window.addEventListener(type,event,true);
 panel.append(status);document.body.append(panel);status.textContent='Isolated study origin. Fixture starts are disclosed.';
}
