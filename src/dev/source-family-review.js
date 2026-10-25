// Explicit local development fixtures and production-raster/audio receipts.
export function installSourceFamilyReview({stage,getState,getAudio,getTrace,look,exposure}){
 const panel=document.createElement('aside');panel.id='source-family-review';
 panel.style.cssText='position:fixed;right:8px;top:8px;z-index:100000;background:#111e;color:#eee;padding:8px;font:12px monospace;width:260px';
 const status=document.createElement('div');let busy=false,recorder=null,stream=null,raf=0,sink=null,source=null,meter=null,started=0,stageId='none';
 const button=(label,run)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:6px;margin:2px';b.onclick=async e=>{e.preventDefault();e.stopPropagation();if(busy)return;busy=true;for(const item of panel.querySelectorAll('button'))item.disabled=true;try{await run();}catch(error){status.textContent=String(error.message||error);}finally{busy=false;for(const item of panel.querySelectorAll('button'))item.disabled=false;document.getElementById('map')?.focus();}};panel.append(b);};
 const frame=()=>new Promise(requestAnimationFrame);
 const save=async(name,body,type)=>{const r=await fetch('/__source-family/'+name,{method:'POST',headers:{'Content-Type':type},body});if(!r.ok)throw Error('Capture save '+r.status);};
 for(const[id,label]of [['field','I: field lift'],['i-door','I: exit approach'],['false','False Ellery return'],['earthfall','Descent approach'],['wrong','II: Wrong Return'],['catch','III: The Catch'],['catch-exit','III: final approach'],['iv','IV: entry'],['iv-piano','IV: under piano'],['iv-door','IV: far door'],['proto','Proto-Source rift']])button(label,async()=>{
   if(recorder)throw Error('Stop the recording before staging.');status.textContent='Staging '+id;await stage(id);await frame();await frame();stageId=id;status.textContent='Staged '+id;
 });
 for(const[p,label]of [[0,'Level view'],[.65,'Look up'],[-.65,'Look down']])button(label,()=>{const s=getState(),v=s.scene?.state?.pose||s.scene||s.body.look;look(v.yaw??0,p);});
 for(const[value,label]of [[1,'Exposure 1'],[1.6,'Exposure 1.6'],[2.1,'Exposure 2.1'],[null,'Authored exposure']])button(label,()=>exposure(value));
 button('Save frame + state',async()=>{
   const c=document.querySelector('canvas.r3d'),copy=document.createElement('canvas');copy.width=c.width;copy.height=c.height;const ctx=copy.getContext('2d');await frame();ctx.drawImage(c,0,0);
   for(const overlay of c.parentElement.querySelectorAll('canvas'))if(overlay!==c&&getComputedStyle(overlay).zIndex==='8')ctx.drawImage(overlay,0,0,copy.width,copy.height);
   const id='family-'+stageId+'-'+Date.now();await save(id+'.png',await new Promise(r=>copy.toBlob(r,'image/png')),'image/png');
   await save(id+'.json',JSON.stringify({qualification:'Developer viewpoint, actual production raster; not a human discovery trial.',state:getState(),trace:getTrace?.(),width:copy.width,height:copy.height},null,2),'application/json');status.textContent='Saved '+id;
 });
 const cleanup=()=>{cancelAnimationFrame(raf);try{source?.disconnect(sink);source?.disconnect(meter);}catch{}for(const t of stream?.getTracks()||[])t.stop();stream=null;sink=null;source=null;meter=null;};
 const inputs=[];const input=e=>{if(recorder?.state==='recording')inputs.push({at:performance.now()-started,type:e.type,key:e.key,repeat:e.repeat});};addEventListener('keydown',input,true);addEventListener('keyup',input,true);
 button('Record game + audio',async()=>{
   if(recorder)return;const c=document.querySelector('canvas.r3d'),a=getAudio();if(!a.ctx||!a.output)throw Error('Stage a playable view first.');await a.ctx.resume();
   const copy=document.createElement('canvas');copy.width=960;copy.height=Math.round(c.height*960/c.width);const ctx=copy.getContext('2d');ctx.imageSmoothingEnabled=false;
   stream=copy.captureStream(15);source=a.output;sink=a.ctx.createMediaStreamDestination();source.connect(sink);for(const t of sink.stream.getAudioTracks())stream.addTrack(t);
   meter=a.ctx.createAnalyser();meter.fftSize=2048;source.connect(meter);const samples=new Float32Array(2048),poses=[];let peak=0,squares=0,count=0,last=0;const chunks=[];
   const sample=()=>{ctx.drawImage(c,0,0,copy.width,copy.height);for(const overlay of c.parentElement.querySelectorAll('canvas'))if(overlay!==c&&getComputedStyle(overlay).zIndex==='8')ctx.drawImage(overlay,0,0,copy.width,copy.height);
     meter.getFloatTimeDomainData(samples);for(const v of samples){peak=Math.max(peak,Math.abs(v));squares+=v*v;count++;}
     if(performance.now()-last>200){last=performance.now();const s=getState(),v=s.scene?.state?.pose||s.scene||s.body;poses.push({at:last-started,scene:s.sceneId,phase:v.phase,x:v.x,z:v.z,feet:v.feet,yaw:v.yaw,pitch:v.pitch,paused:s.paused,hidden:s.hidden,focused:s.focused,threat:v.counterweight,recovery:v.recovery,door:v.exitDoor});}
     raf=requestAnimationFrame(sample);};
   const type=['video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));started=performance.now();inputs.length=0;const traceStart=getTrace?.()?.length||0;
   recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:1600000,audioBitsPerSecond:128000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   recorder.onstop=async()=>{const duration=(performance.now()-started)/1000;cleanup();const id='family-'+stageId+'-route-'+Date.now();try{
     await save(id+'.webm',new Blob(chunks,{type}),type);await save(id+'.json',JSON.stringify({qualification:'Actual raster and mixed game audio; developer fixture start, recorded input thereafter.',duration,peak,rms:Math.sqrt(squares/Math.max(1,count)),inputs,poses,trace:(getTrace?.()||[]).slice(traceStart),finalState:getState()},null,2),'application/json');status.textContent='Saved '+id;
   }catch(e){status.textContent=e.message;}recorder=null;};recorder.start(1000);sample();status.textContent='Recording '+stageId;
 });
 button('Stop + save',()=>{if(recorder?.state==='recording'){status.textContent='Saving recording';recorder.stop();}});
 panel.append(status);document.body.append(panel);status.textContent='Developer fixtures; production view and sound.';
 addEventListener('pagehide',()=>{cleanup();panel.remove();removeEventListener('keydown',input,true);removeEventListener('keyup',input,true);},{once:true});
}
