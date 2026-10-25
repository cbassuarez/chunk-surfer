// Explicit development review UI. Records this game's raster and output bus;
// never requests a screen, camera, microphone or other application's contents.
export function installStandingTearReview({getAudio,getTrace,getState,stageApproach,resumeSaved,pilot,look}={}){
  const panel=document.createElement('aside');panel.id='tear-review-tools';
  panel.style.cssText='position:fixed;right:8px;top:8px;z-index:100000;background:#111e;color:#eee;padding:7px;font:12px monospace;border:1px solid #888;max-width:290px';
  const make=(text,run)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='padding:6px;margin:2px';b.onclick=async e=>{e.stopPropagation();try{await run();}catch(error){status.textContent=String(error.message||error);}document.getElementById('map')?.focus();};panel.append(b);return b;};
  const status=document.createElement('div'),telemetry=document.createElement('div');telemetry.style.cssText='white-space:pre-wrap;color:#b8cdb7;margin-top:5px';let recorder=null,recorded=[],stream=null,sink=null,source=null,meter=null,raf=0,started=0,meterPeak=0,meterSquares=0,meterCount=0,lastTelemetryAt=0;
  const inputs=[];const input=e=>{if(recorder?.state==='recording'&&/^(Key[WASDE]|Arrow|Escape|Enter)/.test(e.code||''))inputs.push({at:performance.now()-started,type:e.type,key:e.key,repeat:e.repeat});};
  addEventListener('keydown',input,true);addEventListener('keyup',input,true);
  async function save(name,body,type){const response=await fetch('/__tear-review/'+name,{method:'POST',headers:{'Content-Type':type},body});if(!response.ok)throw Error('Review save failed: '+response.status);return response.json();}
  let captured=new Set();
  async function captureBeat(beat){
    const canvas=document.querySelector('canvas.r3d'),s=getState?.(),copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
    const c=copy.getContext('2d');c.drawImage(canvas,0,0);for(const overlay of canvas.parentElement.querySelectorAll('canvas'))if(overlay!==canvas&&getComputedStyle(overlay).zIndex==='8')c.drawImage(overlay,0,0,copy.width,copy.height);
    const id='tear-final-'+beat;await save(id+'.png',await new Promise(r=>copy.toBlob(r,'image/png')),'image/png');await save(id+'.json',JSON.stringify(s,null,2),'application/json');
  }
  const cleanup=()=>{cancelAnimationFrame(raf);try{source?.disconnect(sink);}catch{}try{source?.disconnect(meter);}catch{}try{meter?.disconnect();}catch{}for(const track of stream?.getTracks()||[])track.stop();stream=null;sink=null;meter=null;source=null;};
  make('Stage conservatory approach',async()=>{if(recorder?.state==='recording')throw Error('Stop recording before staging.');await stageApproach();status.textContent='Conservatory approach staged. Cross the physical tear with ordinary movement.';});
  make('Resume saved encounter',async()=>{await resumeSaved();status.textContent='Saved encounter resumed through the development entry.';});
  make('Record encounter + audio',async()=>{
    if(recorder?.state==='recording')return;
    const canvas=document.querySelector('canvas.r3d'),audio=getAudio?.();
    if(!canvas?.captureStream||!audio?.ctx||!audio?.output)throw Error('Start the game audio before recording.');
    // Bound review files independently of the display's Retina backing size.
    // The source remains the production raster, including its final dither.
    const capture=document.createElement('canvas');capture.width=Math.min(640,canvas.width);capture.height=Math.round(canvas.height*capture.width/canvas.width);
    const captureContext=capture.getContext('2d');captureContext.imageSmoothingEnabled=false;captureContext.drawImage(canvas,0,0,capture.width,capture.height);
    await audio.ctx.resume();stream=capture.captureStream(12);source=audio.output;sink=audio.ctx.createMediaStreamDestination();source.connect(sink);
    for(const track of sink.stream.getAudioTracks())stream.addTrack(track);
    meter=audio.ctx.createAnalyser();meter.fftSize=2048;source.connect(meter);
    const samples=new Float32Array(meter.fftSize);meterPeak=0;meterSquares=0;meterCount=0;
    captured=new Set();
    const sample=()=>{captureContext.drawImage(canvas,0,0,capture.width,capture.height);for(const overlay of canvas.parentElement.querySelectorAll('canvas'))if(overlay!==canvas&&getComputedStyle(overlay).zIndex==='8')captureContext.drawImage(overlay,0,0,capture.width,capture.height);meter.getFloatTimeDomainData(samples);for(const v of samples){meterPeak=Math.max(meterPeak,Math.abs(v));meterSquares+=v*v;meterCount++;}
      const s=getState?.(),f=s?.scene?.frame;
      const beats=[];if(!s?.scene&&!s?.lastReturn)beats.push('approach');if(f?.phase==='arrival'&&s.scene.ready&&s.scene.renderedFrame)beats.push('arrival');
      if(f?.entryFold<.95&&Math.abs(f?.camera?.yaw||0)<.15&&s?.scene?.renderedFrame?.camera?.yaw===f.camera.yaw)beats.push('closure');
      const memories=f?.memories||[],active=memories.filter(m=>m.awake);
      if(active.length&&active.some(m=>m.pressure<1))beats.push('working');
      if(active.some(m=>m.live))beats.push('performed');if(active.length&&active.every(m=>!m.live))beats.push('released');
      if(active.some(m=>m.id==='solo')&&Math.abs(f?.camera?.yaw||0)<.4)beats.push('writing');
      if(f?.fullConfinementSeconds>.5&&f?.fullConfinementSeconds<5)beats.push('fully-confined');
      if(f?.completed&&f?.phase==='ending'&&f?.endingSeconds<.3)beats.push('stopped');if(f?.fade>.999)beats.push('black');if(s?.lastReturn&&!s?.scene)beats.push('returned');
      for(const beat of beats)if(!captured.has(beat)){captured.add(beat);void captureBeat(beat).catch(error=>status.textContent=error.message);if(beat==='returned')setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},1000);}
      if(performance.now()-lastTelemetryAt>500){lastTelemetryAt=performance.now();const s=getState?.();const p=s?.scene?.state?.pose;telemetry.textContent=JSON.stringify({phase:s?.scene?.state?.phase,pose:p,return:s?.lastReturn?.actual},null,1);}
      raf=requestAnimationFrame(sample);};
    const mimeType=['video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    recorded=[];inputs.length=0;started=performance.now();const traceStart=getTrace?.().length||0;
    recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:600000,audioBitsPerSecond:128000});
    recorder.ondataavailable=e=>{if(e.data.size)recorded.push(e.data);};
    recorder.onstop=async()=>{
      const duration=(performance.now()-started)/1000;cleanup();
      const id='tear-route-'+new Date().toISOString().replace(/[:.]/g,'-'),blob=new Blob(recorded,{type:mimeType});
      try{await save(id+'.json',JSON.stringify({durationSeconds:duration,videoSource:'production canvas.r3d plus real UI fade, nearest-neighbour downsample to at most 640 pixels wide',videoWidth:capture.width,videoHeight:capture.height,audioSource:'actual game outGain, after limiter and volume, before output-monitor coloration',audioTracks:1,finalState:getState?.(),peak:meterPeak,rms:Math.sqrt(meterSquares/Math.max(1,meterCount)),inputs,trace:(getTrace?.()||[]).slice(traceStart)},null,2),'application/json');await save(id+'.webm',blob,mimeType);status.textContent='Saved '+id+' ('+duration.toFixed(1)+'s).';}catch(error){status.textContent=error.message;}
      recorded=[];recorder=null;
    };
    recorder.start(1000);sample();status.textContent='Recording raster + actual mixed audio. Stop to save locally.';
  });
  make('Stop + save',async()=>{if(recorder?.state==='recording'){status.textContent='Saving…';recorder.stop();}});
  make('Save frame + state',async()=>{const canvas=document.querySelector('canvas.r3d'),s=getState?.(),copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;const c=copy.getContext('2d');c.drawImage(canvas,0,0);for(const overlay of canvas.parentElement.querySelectorAll('canvas'))if(overlay!==canvas&&getComputedStyle(overlay).zIndex==='8')c.drawImage(overlay,0,0,copy.width,copy.height);const id='tear-frame-'+String(s?.scene?.state?.phase||'approach')+'-'+Date.now();await save(id+'.png',await new Promise(r=>copy.toBlob(r,'image/png')),'image/png');await save(id+'.json',JSON.stringify(s,null,2),'application/json');status.textContent='Saved '+id;});
  make('Run music route',async()=>{status.textContent='Scripted controller route; not a human trial.';await pilot();status.textContent='Controller route finished.';});
  for(const [leg,label]of [['solo','Walk into solo memory'],['couperin','Walk into Couperin memory'],['ensemble','Walk into ensemble memory'],['writing','Look at made writing'],['witness','Look back at made Source']])make(label,async()=>{await pilot(leg);status.textContent='Controller leg: '+leg;});
  make('Look back',()=>look?.(0,0));make('Look forward',()=>look?.(Math.PI,0));make('Look down',()=>look?.(getState?.()?.scene?.state?.pose?.yaw??Math.PI,-.65));
  make('Look at folded course',()=>look?.(Math.PI-.38,.48));make('Look at side wall',()=>look?.(Math.PI/2,.12));
  panel.append(status,telemetry);document.body.append(panel);status.textContent='Development review only. Not present in ordinary play.';
  addEventListener('pagehide',()=>{cleanup();panel.remove();},{once:true});
  return()=>{if(recorder?.state==='recording')recorder.stop();cleanup();panel.remove();removeEventListener('keydown',input,true);removeEventListener('keyup',input,true);};
}
