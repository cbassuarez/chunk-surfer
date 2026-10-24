// Explicit development review UI. Records this game's raster and output bus;
// never requests a screen, camera, microphone or other application's contents.
export function installSourceContinuationReview({getAudio,getTrace,stageApproach}={}){
  const panel=document.createElement('aside');panel.id='source-review-tools';
  panel.style.cssText='position:fixed;right:8px;top:8px;z-index:100000;background:#111e;color:#eee;padding:7px;font:12px monospace;border:1px solid #888;max-width:290px';
  const make=(text,run)=>{const b=document.createElement('button');b.textContent=text;b.style.cssText='padding:6px;margin:2px';b.onclick=async e=>{e.stopPropagation();try{await run();}catch(error){status.textContent=String(error.message||error);}document.getElementById('map')?.focus();};panel.append(b);return b;};
  const status=document.createElement('div'),telemetry=document.createElement('div');telemetry.style.cssText='white-space:pre-wrap;color:#b8cdb7;margin-top:5px';let recorder=null,recorded=[],stream=null,sink=null,source=null,meter=null,raf=0,started=0,meterPeak=0,meterSquares=0,meterCount=0,lastTelemetryAt=0;
  const inputs=[];const input=e=>{if(recorder?.state==='recording'&&/^(Key[WASDE]|Arrow|Escape|Enter)/.test(e.code||''))inputs.push({at:performance.now()-started,type:e.type,key:e.key,repeat:e.repeat});};
  addEventListener('keydown',input,true);addEventListener('keyup',input,true);
  async function save(name,body,type){const response=await fetch('/__source-review/'+name,{method:'POST',headers:{'Content-Type':type},body});if(!response.ok)throw Error('Review save failed: '+response.status);return response.json();}
  const cleanup=()=>{cancelAnimationFrame(raf);try{source?.disconnect(sink);}catch{}try{source?.disconnect(meter);}catch{}try{meter?.disconnect();}catch{}for(const track of stream?.getTracks()||[])track.stop();stream=null;sink=null;meter=null;source=null;};
  make('Stage grey-door approach',async()=>{if(recorder?.state==='recording')throw Error('Stop recording before staging.');await stageApproach();status.textContent='Original Source grey-door approach staged.';});
  make('Record game + audio',async()=>{
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
    const sample=()=>{captureContext.drawImage(canvas,0,0,capture.width,capture.height);meter.getFloatTimeDomainData(samples);for(const v of samples){meterPeak=Math.max(meterPeak,Math.abs(v));meterSquares+=v*v;meterCount++;}
      if(performance.now()-lastTelemetryAt>500){lastTelemetryAt=performance.now();const trace=getTrace?.()||[];let p=null;for(let i=trace.length-1;i>=0&&i>trace.length-30;i--)if(trace[i].type==='pose'){p=trace[i];break;}
        if(p)telemetry.textContent=`Review pose: ${p.sequence||p.phase||'Source'}\nx ${Number(p.x).toFixed(2)} z ${Number(p.z).toFixed(2)} feet ${Number(p.feet).toFixed(2)}\nyaw ${Number(p.yaw).toFixed(2)} · doors ${p.opened?.length??'—'}\nfocus ${p.focus||'—'}`;}
      raf=requestAnimationFrame(sample);};
    const mimeType=['video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    recorded=[];inputs.length=0;started=performance.now();const traceStart=getTrace?.().length||0;
    recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:600000,audioBitsPerSecond:128000});
    recorder.ondataavailable=e=>{if(e.data.size)recorded.push(e.data);};
    recorder.onstop=async()=>{
      const duration=(performance.now()-started)/1000;cleanup();
      const id='source-route-'+new Date().toISOString().replace(/[:.]/g,'-'),blob=new Blob(recorded,{type:mimeType});
      try{await save(id+'.json',JSON.stringify({durationSeconds:duration,videoSource:'production canvas.r3d, nearest-neighbour downsample to at most 640 pixels wide',videoWidth:capture.width,videoHeight:capture.height,audioSource:'actual game outGain, after limiter and volume, before output-monitor coloration',audioTracks:1,peak:meterPeak,rms:Math.sqrt(meterSquares/Math.max(1,meterCount)),inputs,trace:(getTrace?.()||[]).slice(traceStart)},null,2),'application/json');await save(id+'.webm',blob,mimeType);status.textContent='Saved '+id+' ('+duration.toFixed(1)+'s).';}catch(error){status.textContent=error.message;}
      recorded=[];recorder=null;
    };
    recorder.start(1000);sample();status.textContent='Recording raster + actual mixed audio. Stop to save locally.';
  });
  make('Stop + save',async()=>{if(recorder?.state==='recording'){status.textContent='Saving…';recorder.stop();}});
  panel.append(status,telemetry);document.body.append(panel);status.textContent='Development review only. Not present in ordinary play.';
  addEventListener('pagehide',()=>{cleanup();panel.remove();},{once:true});
  return()=>{if(recorder?.state==='recording')recorder.stop();cleanup();panel.remove();removeEventListener('keydown',input,true);removeEventListener('keyup',input,true);};
}
