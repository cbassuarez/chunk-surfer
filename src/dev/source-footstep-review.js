// Explicit DEV-only controls around real gameplay. Staging is delegated to the
// host's existing Source presets. This module never supplies movement, poses,
// scene time, contact events, recording transactions or artificial ground.
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const copy=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}};

function waveBlob(blocks,sampleRate,channels){
  const frames=blocks.reduce((sum,block)=>sum+block[0].length,0);
  const bytes=new ArrayBuffer(44+frames*channels*2),view=new DataView(bytes);
  const text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+frames*channels*2,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*2,true);
  view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');
  view.setUint32(40,frames*channels*2,true);
  let offset=44,peak=0,sumSquares=0,clippedSamples=0;
  for(const block of blocks)for(let frame=0;frame<block[0].length;frame++)for(let channel=0;channel<channels;channel++){
    const value=block[channel]?.[frame]??block[0][frame];
    peak=Math.max(peak,Math.abs(value));sumSquares+=value*value;if(Math.abs(value)>1)clippedSamples++;
    const limited=Math.max(-1,Math.min(1,value));
    view.setInt16(offset,Math.round(limited*(limited<0?32768:32767)),true);offset+=2;
  }
  return {blob:new Blob([bytes],{type:'audio/wav'}),frames,channels,sampleRate,
    seconds:frames/sampleRate,peak,rms:Math.sqrt(sumSquares/Math.max(1,frames*channels)),clippedSamples,
    processing:'Direct PCM16 quantization; no gain, normalization, fade or resampling applied.'};
}

function createPcmTap(context,source,{maxSeconds=90,channels=2}={}){
  if(!context?.createScriptProcessor||!source?.connect)return null;
  const processor=context.createScriptProcessor(4096,channels,channels),mute=context.createGain();
  mute.gain.value=0;
  const blocks=[],times=[];
  let frames=0,active=true;
  processor.onaudioprocess=event=>{
    for(let channel=0;channel<event.outputBuffer.numberOfChannels;channel++)event.outputBuffer.getChannelData(channel).fill(0);
    if(!active||frames>=maxSeconds*context.sampleRate)return;
    const block=Array.from({length:channels},(_,channel)=>new Float32Array(event.inputBuffer.getChannelData(Math.min(channel,event.inputBuffer.numberOfChannels-1))));
    blocks.push(block);frames+=block[0].length;
    times.push({playbackTime:event.playbackTime,deliveredAt:context.currentTime,frames:block[0].length});
  };
  try{source.connect(processor);processor.connect(mute);mute.connect(context.destination);}
  catch(error){try{source.disconnect(processor);}catch{}try{processor.disconnect();mute.disconnect();}catch{}throw error;}
  return {
    stop(){
      if(active){active=false;processor.onaudioprocess=null;
        try{source.disconnect(processor);}catch{}
        try{processor.disconnect();mute.disconnect();}catch{}
      }
      const wave=waveBlob(blocks,context.sampleRate,channels);
      return {...wave,blocks:times,method:'Diagnostic ScriptProcessor4096 stereo tap; main-thread callback delivery is instrumented, not normal gameplay performance.'};
    },
  };
}

function percentile(values,p){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];
}

export function installSourceFootstepReview({
  stages=[],stage,snapshot,captureAudio,ensureAudio=async()=>{},
  captureMetadata=()=>({}),getCanvases=()=>[...document.querySelectorAll('#wrap canvas')],
  endpoint='/__source-footsteps/',maximumSeconds=90,
}={}){
  if(typeof stage!=='function'||typeof snapshot!=='function'||typeof captureAudio!=='function')throw Error('Source footstep review requires the production host adapters.');
  if(document.getElementById('source-footstep-review'))throw Error('Source footstep review is already installed.');
  const panel=document.createElement('aside');panel.id='source-footstep-review';
  panel.setAttribute('aria-label','Developer Source footstep review');
  panel.style.cssText='position:fixed;inset:0 0 auto;z-index:2147483000;background:#111a17ed;color:#e3eadd;border-bottom:1px solid #a9bfa8;padding:7px 10px;display:flex;gap:7px;align-items:center;flex-wrap:wrap;font:12px/1.45 system-ui';
  const title=document.createElement('strong');title.textContent='DEV · SOURCE FOOTSTEPS';panel.append(title);
  const select=document.createElement('select');select.id='source-footstep-stage';select.setAttribute('aria-label','Source footstep section');
  for(const entry of stages){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label||entry.id;option.disabled=entry.available===false;select.append(option);}
  panel.append(select);
  const status=document.createElement('output');status.id='source-footstep-status';status.setAttribute('role','status');status.textContent='Stage a real Source section, then use ordinary movement. F8 starts/stops capture.';
  const report=document.createElement('pre');report.id='source-footstep-receipt';
  report.style.cssText='position:fixed;inset:auto 10px 10px;z-index:2147482999;max-height:240px;overflow:auto;background:#0d1612ed;color:#d5e4d5;padding:10px;margin:0;font:11px/1.5 monospace;display:none;pointer-events:auto';
  const disclosure=document.createElement('span');disclosure.style.cssText='flex-basis:100%;font-size:10px;color:#b1c1b3';
  disclosure.textContent='Unearned developer staging is explicit. Capture uses the actual game render and output mix; ordinary controls afterward. No microphone. Browser evidence is separate from packaged-native and human acceptance.';
  for(const type of ['pointerdown','pointerup','click','keydown','keyup'])panel.addEventListener(type,event=>event.stopPropagation());
  const buttons=[],errors=[];
  let busy=false,disposed=false,recording=null,currentStage=null,stageReceipt=null,lastSample=-Infinity;
  const focusGame=()=>document.getElementById('map')?.focus?.({preventScroll:true});
  const sync=()=>{for(const entry of buttons)entry.button.disabled=busy||entry.disabled?.()===true;select.disabled=busy||!!recording;};
  function button(id,label,action,disabled=()=>false){
    const element=document.createElement('button');element.id=id;element.textContent=label;
    element.style.cssText='font:inherit;padding:4px 7px;border:1px solid #809c83;background:#23352a;color:#edf4e9;border-radius:3px;cursor:pointer';
    element.addEventListener('click',async()=>{
      if(busy||disabled())return;
      busy=true;sync();
      try{await action();}
      catch(error){errors.push({message:String(error.stack||error),wall:performance.now()});status.textContent=String(error.message||error);report.style.display='block';report.textContent=JSON.stringify({errors},null,2);}
      finally{busy=false;sync();focusGame();}
    });
    panel.append(element);buttons.push({button:element,disabled});return element;
  }
  function safeSnapshot(){try{return copy(snapshot());}catch(error){return {reviewSnapshotError:String(error.message||error)};}}
  function timedSnapshot(){return {wall:performance.now(),audioTime:recording?.audio?.context?.currentTime??null,state:safeSnapshot()};}
  function noteInput(event){
    if(!recording||panel.contains(event.target))return;
    recording.inputs.push({wall:performance.now(),audioTime:recording.audio.context?.currentTime??null,
      type:event.type,key:event.key,code:event.code,repeat:!!event.repeat,trusted:!!event.isTrusted,
      button:event.button,buttons:event.buttons,movementX:event.movementX,movementY:event.movementY});
    if(recording.inputs.length>12000)recording.inputs.shift();
  }
  const inputTypes=['keydown','keyup','pointerdown','pointerup','pointermove'];
  for(const type of inputTypes)window.addEventListener(type,noteInput,{capture:true});
  const gameError=event=>{
    const message=event.type==='unhandledrejection'?String(event.reason?.stack||event.reason):String(event.error?.stack||event.message);
    errors.push({type:event.type,message,wall:performance.now(),duringCapture:!!recording});
    if(errors.length>80)errors.shift();
  };
  window.addEventListener('error',gameError);window.addEventListener('unhandledrejection',gameError);
  async function post(name,blob){
    const response=await fetch(endpoint+name,{method:'POST',body:blob});
    if(!response.ok)throw Error(`Could not save ${name}: ${await response.text()}`);
    return response.json();
  }
  function composite(canvas,context){
    const host=document.getElementById('wrap')||document.body,rect=host.getBoundingClientRect();
    const width=Math.max(2,Math.round(rect.width)),height=Math.max(2,Math.round(rect.height));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    context.fillStyle='#000';context.fillRect(0,0,width,height);
    const layers=getCanvases().map(element=>({element,rect:element.getBoundingClientRect(),style:getComputedStyle(element)}))
      .filter(row=>row.rect.width>0&&row.rect.height>0&&row.style.display!=='none'&&row.style.visibility!=='hidden')
      .sort((a,b)=>(Number.parseFloat(a.style.zIndex)||0)-(Number.parseFloat(b.style.zIndex)||0));
    for(const row of layers){
      context.globalAlpha=Number(row.style.opacity||1);
      if('filter'in context)context.filter=row.style.filter||'none';
      context.drawImage(row.element,row.rect.left-rect.left,row.rect.top-rect.top,row.rect.width,row.rect.height);
    }
    context.globalAlpha=1;if('filter'in context)context.filter='none';
    return layers.map(row=>({id:row.element.id,width:row.element.width,height:row.element.height,
      cssWidth:row.rect.width,cssHeight:row.rect.height,opacity:row.style.opacity,filter:row.style.filter}));
  }
  async function setStage(id){
    if(recording)throw Error('Stop and save the capture before staging a different section.');
    if(!stages.some(entry=>entry.id===id&&entry.available!==false))throw Error('This Source section has no production staging adapter.');
    await ensureAudio();
    status.textContent='Staging the existing '+(stages.find(entry=>entry.id===id)?.label||id)+'…';
    const before=safeSnapshot(),result=await stage(id);
    if(result===false)throw Error('The production staging adapter did not enter that section.');
    currentStage=id;stageReceipt={id,wall:performance.now(),result:copy(result??null),before,after:safeSnapshot(),
      disclosure:'Developer preset/position/state before capture; not earned progression. No pose/time/state writes are supplied by this review tool afterward.'};
    status.textContent='Ready · '+id+' · walk with ordinary controls. F8 records.';
    panel.dataset.stage=id;return stageReceipt;
  }
  async function start(){
    if(recording)return false;
    await ensureAudio();
    const manifest=await fetch(endpoint+'manifest').then(response=>{if(!response.ok)throw Error('The dedicated Source review server is required to save evidence.');return response.json();});
    const audio=await captureAudio();
    if(!audio?.context||!audio?.stream?.getAudioTracks?.().length)throw Error('The production output-mix capture tap is unavailable.');
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    if(!context){audio.dispose?.();throw Error('The actual game canvas composite is unavailable.');}
    const layers=composite(canvas,context),video=canvas.captureStream(30);
    const stream=new MediaStream([...video.getVideoTracks(),...audio.stream.getAudioTracks()]);
    const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm']
      .find(candidate=>MediaRecorder.isTypeSupported(candidate));
    if(!mimeType){video.getTracks().forEach(track=>track.stop());audio.dispose?.();throw Error('This runtime cannot record the final game picture and output mix.');}
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3000000,audioBitsPerSecond:192000});
    const r={audio,canvas,context,stream,recorder,chunks:[],inputs:[],traces:[],footEvents:[],eventKeys:new Set(),
      started:performance.now(),audioStarted:audio.context.currentTime,manifest,layers,frames:[],composeMs:[],live:true,stage:copy(stageReceipt),
      before:safeSnapshot(),metadata:copy(captureMetadata()),pcm:null,stemPcm:null,errorStart:errors.length};
    try{
      r.pcm=createPcmTap(audio.context,audio.source,{maxSeconds:maximumSeconds});
      r.stemPcm=createPcmTap(audio.context,audio.footstepSource,{maxSeconds:maximumSeconds});
    }catch(error){errors.push({message:'PCM tap unavailable: '+String(error.message||error),wall:performance.now()});}
    r.ended=new Promise(resolve=>{recorder.onstop=resolve;});
    recorder.ondataavailable=event=>{if(event.data.size)r.chunks.push(event.data);};
    recorder.onerror=event=>errors.push({message:String(event.error?.message||event.error||'MediaRecorder error'),wall:performance.now()});
    try{recorder.start(250);}
    catch(error){r.pcm?.stop();r.stemPcm?.stop();for(const track of stream.getTracks())track.stop();audio.dispose?.();throw error;}
    recording=r;lastSample=-Infinity;
    r.timer=setTimeout(()=>{
      if(recording===r)void stop('capture-duration-limit').catch(error=>{errors.push({message:String(error.message||error)});status.textContent=String(error.message||error);});
    },maximumSeconds*1000);
    sync();
    status.textContent='RECORDING · actual game + mixed output · use W/A/S/D; F8 stops and saves.';
    panel.dataset.recording='true';return true;
  }
  async function stop(reason='explicit-stop'){
    if(!recording)return false;
    const r=recording;recording=null;r.live=false;clearTimeout(r.timer);panel.dataset.recording='false';sync();
    const after=safeSnapshot(),endedAt=performance.now();
    if(r.recorder.state!=='inactive')r.recorder.stop();
    const mixed=r.pcm?.stop(),stem=r.stemPcm?.stop();
    let stopTimer;const stopped=await Promise.race([r.ended.then(()=>true),new Promise(resolve=>{stopTimer=setTimeout(()=>resolve(false),2000);})]);
    clearTimeout(stopTimer);
    if(!stopped)errors.push({message:'MediaRecorder stop event was not delivered within2seconds; capture completeness needs inspection.',wall:performance.now()});
    for(const track of r.stream.getTracks())track.stop();r.audio.dispose?.();
    const name='footsteps-'+Date.now()+(currentStage?'-'+currentStage.replace(/[^\w-]/g,'-'):''),files={};
    const extension=r.recorder.mimeType.includes('mp4')?'mp4':'webm';
    files.video=(await post(name+'.'+extension,new Blob(r.chunks,{type:r.recorder.mimeType}))).name;
    if(mixed)files.mixedWave=(await post(name+'.wav',mixed.blob)).name;
    if(stem)files.footstepDiagnosticWave=(await post(name+'-footsteps.wav',stem.blob)).name;
    files.still=(await post(name+'.png',await new Promise(resolve=>r.canvas.toBlob(resolve,'image/png')))).name;
    const stripPcm=pcm=>pcm?Object.fromEntries(Object.entries(pcm).filter(([key])=>key!=='blob')):null;
    const evidence={kind:'source-footstep-gameplay-capture',version:1,reason,
      runtime:r.metadata.runtime||'browser-gameplay-unclassified',fixture:!!r.stage,earnedProgression:false,
      reviewToolWritesDuringCapture:{automaticMovement:false,pose:0,simulationTime:0},
      disclosure:r.stage?'Declared developer staging before capture; ordinary controls and production game simulation afterward. Not continuous earned progression or human acceptance.'
        :'Current game position captured without staging in this session; earlier progression is unverified. No automatic movement or simulation-time writes.',
      audioCapture:{mixed:'Game output-mix tap supplied by host. No microphone or added capture gain.',
        footstepDiagnostic:'Optional separate footstep bus BEFORE HUSH/glass/world attenuation. Diagnostic stem, not the final mix.',
        mixedPcm:stripPcm(mixed),footstepPcm:stripPcm(stem),audioStarted:r.audioStarted},
      rendering:{source:'Visible production game canvas layers composited at30fps, preserving supplied final dither/VFD pixels and canvas CSS filters where supported.',
        limitation:'Review controls and other DOM overlays excluded. No GPU-completion, OS compositor, display-latency or packaged-native acceptance claim.',
        layers:r.layers,compositeFrameTicks:r.frames,compositeCpuMs:{samples:r.composeMs.length,mean:r.composeMs.reduce((sum,n)=>sum+n,0)/Math.max(1,r.composeMs.length),p95:percentile(r.composeMs,.95),max:Math.max(0,...r.composeMs)}},
      files,width:r.canvas.width,height:r.canvas.height,seconds:(endedAt-r.started)/1000,
      metadata:r.metadata,sourceManifest:r.manifest,stage:r.stage,before:r.before,after,inputs:r.inputs,
      traces:r.traces,footEvents:r.footEvents,errors:errors.filter(error=>!finite(error.wall)||error.wall>=r.started),priorErrorCount:r.errorStart,
      captureOverhead:'Video encoding, canvas copying and optional ScriptProcessor4096 PCM taps instrument this run. Compare timing outside capture before claiming ordinary performance.'};
    const saved=await post(name+'.json',new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));
    panel.dataset.saved=name;status.textContent='Saved '+name+' · mixed WAV + video + receipts.';
    report.style.display='block';report.textContent=JSON.stringify({saved:saved.name,files,seconds:evidence.seconds,
      contacts:r.footEvents.filter(event=>event.kind==='plant').length,errors:evidence.errors},null,2);
    return evidence;
  }
  async function saveStill(){
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),layers=composite(canvas,context);
    const name='footsteps-still-'+Date.now();
    await post(name+'.png',await new Promise(resolve=>canvas.toBlob(resolve,'image/png')));
    await post(name+'.json',new Blob([JSON.stringify({kind:'source-footstep-gameplay-still',fixture:!!stageReceipt,
      stage:stageReceipt,snapshot:timedSnapshot(),metadata:captureMetadata(),layers},null,2)],{type:'application/json'}));
    status.textContent='Saved '+name;panel.dataset.saved=name;
  }
  button('source-footstep-enter','Stage selected section',()=>setStage(select.value),()=>!!recording);
  button('source-footstep-record','Record current play',start,()=>!!recording);
  button('source-footstep-stop','Stop + save',()=>stop(),()=>!recording);
  button('source-footstep-still','Save game still',saveStill,()=>!!recording);
  button('source-footstep-inspect','Inspect receipts',()=>{report.style.display=report.style.display==='none'?'block':'none';report.textContent=JSON.stringify(timedSnapshot(),null,2);});
  panel.append(status,disclosure);document.body.append(panel,report);sync();
  function tick(now){
    if(disposed)return;
    if(recording?.live){
      const begin=performance.now();composite(recording.canvas,recording.context);
      recording.composeMs.push(performance.now()-begin);recording.frames.push({wall:now,audioTime:recording.audio.context.currentTime});
      if(now-lastSample>=100){
        lastSample=now;const sample=timedSnapshot();recording.traces.push(sample);
        for(const event of sample.state.audio?.events||[]){
          const key=JSON.stringify([event.serial,event.owner,event.kind,event.time,event.plantIndex,event.dryId,event.responseId,event.reason]);
          if(recording.eventKeys.has(key)||finite(event.time)&&event.time<recording.audioStarted-.01)continue;
          recording.eventKeys.add(key);recording.footEvents.push(copy(event));
        }
      }
      if(now-recording.started>=maximumSeconds*1000)void stop('capture-duration-limit').catch(error=>{errors.push({message:String(error.message||error)});status.textContent=String(error.message||error);});
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  const hotkey=event=>{
    if(event.code!=='F8'||event.repeat||busy)return;
    event.preventDefault();event.stopImmediatePropagation();
    busy=true;sync();
    Promise.resolve(recording?stop('F8'):start()).catch(error=>{errors.push({message:String(error.message||error)});status.textContent=String(error.message||error);})
      .finally(()=>{busy=false;sync();focusGame();});
  };
  const blur=()=>{if(recording)recording.inputs.push({type:'focus-lost',wall:performance.now(),audioTime:recording.audio.context.currentTime});};
  window.addEventListener('keydown',hotkey,{capture:true});window.addEventListener('blur',blur);
  const api={stage:setStage,start,stop,inspect:()=>({recording:!!recording,currentStage,stageReceipt,snapshot:safeSnapshot(),errors:[...errors]}),
    async dispose(){
      if(disposed)return;if(recording)await stop('review-disposed');disposed=true;
      for(const type of inputTypes)window.removeEventListener(type,noteInput,{capture:true});
      window.removeEventListener('keydown',hotkey,{capture:true});window.removeEventListener('blur',blur);
      window.removeEventListener('error',gameError);window.removeEventListener('unhandledrejection',gameError);
      panel.remove();report.remove();
    }};
  return api;
}
