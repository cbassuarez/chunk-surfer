// DEV-only evidence around the real game. The host owns explicit staging and
// deliberate test actions. No movement, scene time or recording state is driven
// by this module; actions are logged before their host callback runs.
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const copy=value=>{try{return structuredClone(value);}catch{return JSON.parse(JSON.stringify(value));}};
const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor((values.length-1)*p))]:null;

// This tap runs on the audio thread. Its timestamped chunks may be delivered
// late during the deliberate UI stall, but the recorded samples are not created
// by a main-thread callback. The silent output keeps its graph live.
export const HEARTBEAT_REVIEW_PCM_WORKLET=`
class HeartbeatReviewPcmProcessor extends AudioWorkletProcessor {
  constructor(options){
    super();const p=options.processorOptions||{};
    this.channels=Math.max(1,Math.min(2,p.channels||2));
    this.maxFrames=Math.ceil(Math.max(1,Math.min(180,p.maximumSeconds||180))*sampleRate);
    this.chunkFrames=4096;this.chunk=new Int16Array(this.chunkFrames*this.channels);
    this.used=0;this.frames=0;this.firstFrame=null;this.chunkStart=null;
    this.peak=0;this.sumSquares=0;this.clippedSamples=0;this.stopping=false;this.ended=false;
    this.port.onmessage=({data})=>{if(data?.type==='stop')this.stopping=true;};
  }
  flush(){
    if(!this.used)return;
    const samples=this.chunk.slice(0,this.used*this.channels);
    this.port.postMessage({type:'pcm-chunk',startFrame:this.chunkStart,frames:this.used,
      channels:this.channels,samples:samples.buffer},[samples.buffer]);
    this.used=0;this.chunkStart=null;
  }
  end(reason){
    if(this.ended)return;this.ended=true;this.flush();
    this.port.postMessage({type:'pcm-ended',reason,firstFrame:this.firstFrame,frames:this.frames,
      sampleRate,channels:this.channels,peak:this.peak,sumSquares:this.sumSquares,clippedSamples:this.clippedSamples});
  }
  process(inputs,outputs){
    for(const channel of outputs[0]||[])channel.fill(0);
    if(this.stopping){this.end('stop-command');return false;}
    if(this.ended)return false;
    const input=inputs[0]||[],length=outputs[0]?.[0]?.length||input[0]?.length||0;
    for(let index=0;index<length;index++){
      if(this.frames>=this.maxFrames){this.end('duration-limit');return false;}
      const frame=currentFrame+index;if(this.firstFrame===null)this.firstFrame=frame;
      if(this.chunkStart===null)this.chunkStart=frame;
      for(let channel=0;channel<this.channels;channel++){
        const raw=input[Math.min(channel,input.length-1)]?.[index]||0,value=Number.isFinite(raw)?raw:0;
        this.peak=Math.max(this.peak,Math.abs(value));this.sumSquares+=value*value;
        if(Math.abs(value)>1)this.clippedSamples++;
        const limited=Math.max(-1,Math.min(1,value));
        this.chunk[this.used*this.channels+channel]=Math.round(limited*(limited<0?32768:32767));
      }
      this.frames++;this.used++;if(this.used===this.chunkFrames)this.flush();
    }
    return true;
  }
}
registerProcessor('chunk-surfer-heartbeat-review-pcm-v1',HeartbeatReviewPcmProcessor);
`;
const pcmModules=new WeakMap();
async function pcmModule(context){
  if(!context?.audioWorklet?.addModule||typeof AudioWorkletNode!=='function')return false;
  if(!pcmModules.has(context)){
    const url=URL.createObjectURL(new Blob([HEARTBEAT_REVIEW_PCM_WORKLET],{type:'text/javascript'}));
    const pending=context.audioWorklet.addModule(url).then(()=>true).catch(error=>{pcmModules.delete(context);throw error;}).finally(()=>URL.revokeObjectURL(url));
    pcmModules.set(context,pending);
  }
  return pcmModules.get(context);
}
export function encodeHeartbeatReviewWave(blocks,summary={}){
  const channels=summary.channels||blocks[0]?.channels||2,sampleRate=summary.sampleRate||48000;
  const frames=blocks.reduce((n,b)=>n+b.frames,0),buffer=new ArrayBuffer(44+frames*channels*2),view=new DataView(buffer);
  const text=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+frames*channels*2,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*channels*2,true);
  let offset=44,expected=null;const discontinuities=[];
  for(const block of blocks){
    if(expected!==null&&block.startFrame!==expected)discontinuities.push({expectedFrame:expected,actualFrame:block.startFrame});
    expected=block.startFrame+block.frames;
    const samples=block.samples instanceof Int16Array?block.samples:new Int16Array(block.samples);
    if(samples.length!==block.frames*channels)throw Error('PCM chunk length does not match its declared audio frames.');
    for(const value of samples){view.setInt16(offset,value,true);offset+=2;}
  }
  return{blob:new Blob([buffer],{type:'audio/wav'}),frames,channels,sampleRate,seconds:frames/sampleRate,
    firstFrame:summary.firstFrame??blocks[0]?.startFrame??null,lastFrame:expected,
    peak:summary.peak??null,rms:finite(summary.sumSquares)?Math.sqrt(summary.sumSquares/Math.max(1,frames*channels)):null,
    clippedSamples:summary.clippedSamples??null,discontinuities,
    complete:summary.frames===frames&&discontinuities.length===0,
    processing:'Audio-thread PCM16 quantization; no gain, normalization, fade or resampling. Timestamped chunks retain audio positions across main-thread stalls.'};
}
async function createPcmTap(context,source,{maximumSeconds=180,channels=2}={}){
  if(!source?.connect||!await pcmModule(context))return null;
  const node=new AudioWorkletNode(context,'chunk-surfer-heartbeat-review-pcm-v1',{
    numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[channels],channelCount:channels,
    channelCountMode:'explicit',channelInterpretation:'speakers',processorOptions:{channels,maximumSeconds}}),mute=context.createGain();
  mute.gain.value=0;
  const blocks=[],deliveries=[];let summary=null,disposed=false,resolveEnd;
  const ended=new Promise(resolve=>{resolveEnd=resolve;});
  node.port.onmessage=({data})=>{
    if(data?.type==='pcm-chunk'){
      blocks.push({startFrame:data.startFrame,frames:data.frames,channels:data.channels,samples:new Int16Array(data.samples)});
      deliveries.push({startFrame:data.startFrame,frames:data.frames,deliveredAudioTime:context.currentTime,deliveredWall:performance.now()});
    }else if(data?.type==='pcm-ended'){summary=data;resolveEnd(true);}
  };
  const disconnect=()=>{if(disposed)return;disposed=true;try{source.disconnect(node);}catch{}try{node.disconnect();mute.disconnect();}catch{}node.port.onmessage=null;try{node.port.close();}catch{}};
  try{source.connect(node);node.connect(mute);mute.connect(context.destination);}
  catch(error){disconnect();throw error;}
  return{async stop(){
    if(!summary)node.port.postMessage({type:'stop'});
    let timer;const completed=summary?true:await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1500);})]);clearTimeout(timer);
    disconnect();const wave=encodeHeartbeatReviewWave(blocks,summary||{channels,sampleRate:context.sampleRate});
    return{...wave,complete:completed&&wave.complete,summary,deliveries,
      method:'AudioWorklet PCM tap. Frame continuity and end acknowledgement are recorded; unsupported worklet capture has no ScriptProcessor fallback.'};
  },dispose:disconnect};
}
function mediaOwner(stream,{video=false,onError=()=>{}}={}){
  const candidates=video?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm']
    :['audio/webm;codecs=opus','audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm','video/mp4'];
  const mimeType=candidates.find(value=>MediaRecorder.isTypeSupported(value));
  if(!mimeType)throw Error('This runtime has no supported '+(video?'game video':'audio')+' capture codec.');
  const recorder=new MediaRecorder(stream,{mimeType,...(video?{videoBitsPerSecond:2500000}:{}),audioBitsPerSecond:192000});
  const chunks=[];let resolveEnd;const ended=new Promise(resolve=>{resolveEnd=resolve;});
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onstop=()=>resolveEnd(true);
  recorder.onerror=event=>onError(event.error||event);recorder.start(250);
  return{recorder,stream,mimeType,async stop(){
    if(recorder.state!=='inactive')recorder.stop();let timer;
    const complete=await Promise.race([ended,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),2500);})]);clearTimeout(timer);
    return{blob:new Blob(chunks,{type:recorder.mimeType}),mimeType:recorder.mimeType,complete,
      extension:recorder.mimeType.includes('mp4')?'mp4':'webm'};
  }};
}

export function installHeartbeatReview({stages=[],stage,snapshot,ensureAudio=async()=>{},captureAudio,
  getCanvases=()=>[...document.querySelectorAll('#wrap canvas')],captureMetadata=()=>({}),actions=[],
  endpoint='/__heartbeat-review/',maximumSeconds=180}={}){
  if(typeof stage!=='function'||typeof snapshot!=='function'||typeof captureAudio!=='function')throw Error('Heartbeat review requires production host adapters.');
  if(document.getElementById('heartbeat-review'))throw Error('Heartbeat review is already installed.');
  maximumSeconds=Math.max(1,Math.min(180,Number(maximumSeconds)||180));
  const panel=document.createElement('aside');panel.id='heartbeat-review';panel.setAttribute('aria-label','Developer heartbeat review');
  panel.style.cssText='position:fixed;inset:0 0 auto;z-index:2147483000;background:#141a17ed;color:#eeeade;border-bottom:1px solid #acb69d;padding:7px 10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font:12px/1.45 system-ui';
  const title=document.createElement('strong');title.textContent='DEV · HEARTBEAT';panel.append(title);
  const select=document.createElement('select');select.id='heartbeat-stage';select.setAttribute('aria-label','Heartbeat section');
  for(const entry of stages){const option=document.createElement('option');option.value=entry.id;option.textContent=entry.label||entry.id;option.disabled=entry.available===false;select.append(option);}panel.append(select);
  const status=document.createElement('output');status.id='heartbeat-status';status.setAttribute('role','status');status.textContent='Stage a real section, then use ordinary controls. F8 starts/stops capture.';
  const report=document.createElement('pre');report.id='heartbeat-receipt';report.style.cssText='position:fixed;inset:auto 10px 10px;z-index:2147482999;max-height:200px;overflow:auto;background:#101710ed;color:#d5e0cc;padding:10px;font:10px/1.5 monospace;display:none';
  const disclosure=document.createElement('span');disclosure.style.cssText='flex-basis:100%;font-size:10px;color:#b5c0ad';
  disclosure.textContent='Explicit developer staging and test actions are logged. No automatic movement, scene-time writes or microphone. Captures use the final game picture and mixed output; native and human acceptance remain separate.';
  for(const type of ['pointerdown','pointerup','click','keydown','keyup'])panel.addEventListener(type,event=>event.stopPropagation());
  const buttons=[],errors=[];let busy=false,disposed=false,recording=null,currentStage=null,stageReceipt=null,lastSample=-Infinity;
  const focusGame=()=>document.getElementById('map')?.focus?.({preventScroll:true});
  const safeSnapshot=()=>{try{return copy(snapshot());}catch(error){return{reviewSnapshotError:String(error.message||error)};}};
  const timedSnapshot=()=>({wall:performance.now(),audioTime:recording?.audio.context.currentTime??null,state:safeSnapshot()});
  const sync=()=>{select.disabled=busy||!!recording;for(const row of buttons)row.button.disabled=busy||row.disabled();};
  function button(id,label,run,disabled=()=>false){
    const node=document.createElement('button');node.id=id;node.textContent=label;node.style.cssText='font:inherit;padding:4px 7px;border:1px solid #849878;background:#2b3625;color:#edf0e3;border-radius:3px;cursor:pointer';
    node.addEventListener('click',async()=>{if(busy||disabled())return;busy=true;sync();try{await run();}catch(error){const row={message:String(error.stack||error),wall:performance.now()};errors.push(row);status.textContent=String(error.message||error);report.style.display='block';report.textContent=JSON.stringify(row,null,2);}finally{busy=false;sync();focusGame();}});
    panel.append(node);buttons.push({button:node,disabled});return node;
  }
  function noteInput(event){
    if(!recording||panel.contains(event.target))return;
    recording.inputs.push({wall:performance.now(),audioTime:recording.audio.context.currentTime,type:event.type,
      key:event.key,code:event.code,repeat:!!event.repeat,trusted:!!event.isTrusted,button:event.button,buttons:event.buttons,movementX:event.movementX,movementY:event.movementY});
    if(recording.inputs.length>18000)recording.inputs.shift();
  }
  const inputTypes=['keydown','keyup','pointerdown','pointerup','pointermove'];for(const type of inputTypes)window.addEventListener(type,noteInput,{capture:true});
  const gameError=event=>{errors.push({type:event.type,message:event.type==='unhandledrejection'?String(event.reason?.stack||event.reason):String(event.error?.stack||event.message),wall:performance.now(),duringCapture:!!recording});if(errors.length>100)errors.shift();};
  window.addEventListener('error',gameError);window.addEventListener('unhandledrejection',gameError);
  async function post(name,blob){const r=await fetch(endpoint+name,{method:'POST',body:blob});if(!r.ok)throw Error('Could not save '+name+': '+await r.text());return r.json();}
  function composite(canvas,context){
    const rect=(document.getElementById('wrap')||document.body).getBoundingClientRect();
    const w=Math.max(2,Math.round(rect.width)),h=Math.max(2,Math.round(rect.height));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    context.fillStyle='#000';context.fillRect(0,0,w,h);
    const layers=getCanvases().map(element=>({element,rect:element.getBoundingClientRect(),style:getComputedStyle(element)})).filter(row=>row.rect.width>0&&row.rect.height>0&&row.style.display!=='none'&&row.style.visibility!=='hidden').sort((a,b)=>(parseFloat(a.style.zIndex)||0)-(parseFloat(b.style.zIndex)||0));
    for(const row of layers){context.globalAlpha=Number(row.style.opacity||1);if('filter'in context)context.filter=row.style.filter||'none';context.drawImage(row.element,row.rect.left-rect.left,row.rect.top-rect.top,row.rect.width,row.rect.height);}
    context.globalAlpha=1;if('filter'in context)context.filter='none';return layers.map(row=>({id:row.element.id,width:row.element.width,height:row.element.height,cssWidth:row.rect.width,cssHeight:row.rect.height,opacity:row.style.opacity,filter:row.style.filter}));
  }
  async function setStage(id){
    if(recording)throw Error('Stop and save before staging another section.');
    if(!stages.some(value=>value.id===id&&value.available!==false))throw Error('This section has no production staging adapter.');
    panel.dataset.stage='';await ensureAudio();status.textContent='Staging '+(stages.find(value=>value.id===id)?.label||id)+'…';
    const before=safeSnapshot(),result=await stage(id);if(result===false)throw Error('The production staging adapter did not enter this section.');
    currentStage=id;stageReceipt={id,wall:performance.now(),before,result:copy(result??null),after:safeSnapshot(),disclosure:'Explicit preset/pose/state before capture, not earned progression. Subsequent test actions are separately logged.'};
    panel.dataset.stage=id;status.textContent='Ready · '+id+' · ordinary controls or declared test actions.';return stageReceipt;
  }
  async function start(){
    if(recording)return false;await ensureAudio();
    const response=await fetch(endpoint+'manifest');if(!response.ok)throw Error('The dedicated heartbeat review server is required.');const manifest=await response.json();
    const audio=await captureAudio();if(!audio?.context||!audio.stream?.getAudioTracks?.().length){audio?.dispose?.();throw Error('The production mixed-output tap is unavailable.');}
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context){audio.dispose?.();throw Error('Final game canvas capture is unavailable.');}
    const layers=composite(canvas,context),video=canvas.captureStream(30),stream=new MediaStream([...video.getVideoTracks(),...audio.stream.getAudioTracks()]);
    const r={audio,canvas,context,stream,layers,started:performance.now(),audioStarted:audio.context.currentTime,manifest,
      before:safeSnapshot(),metadata:copy(captureMetadata()),stage:copy(stageReceipt),inputs:[],actions:[],traces:[],events:[],eventKeys:new Set(),frames:[],composeMs:[],live:true,errorStart:errors.length,
      media:null,heartMedia:null,heartDestination:null,pcm:null,heartPcm:null};
    const captureError=error=>errors.push({message:String(error?.message||error),wall:performance.now(),duringCapture:true});
    try{
      r.pcm=await createPcmTap(audio.context,audio.source,{maximumSeconds});
      r.heartPcm=await createPcmTap(audio.context,audio.heartbeatSource,{maximumSeconds});
    }catch(error){captureError('Audio-thread PCM unavailable: '+String(error.message||error));}
    try{
      r.media=mediaOwner(stream,{video:true,onError:captureError});
      if(audio.heartbeatSource?.connect){r.heartDestination=audio.context.createMediaStreamDestination();audio.heartbeatSource.connect(r.heartDestination);r.heartMedia=mediaOwner(r.heartDestination.stream,{onError:captureError});}
    }catch(error){r.pcm?.dispose();r.heartPcm?.dispose();if(r.media)await r.media.stop();if(r.heartDestination){try{audio.heartbeatSource.disconnect(r.heartDestination);}catch{}for(const track of r.heartDestination.stream.getTracks())track.stop();}for(const track of stream.getTracks())track.stop();audio.dispose?.();throw error;}
    recording=r;lastSample=-Infinity;panel.dataset.recording='true';status.textContent='RECORDING · real game mix + final picture · test actions are logged.';sync();
    r.timer=setTimeout(()=>{if(recording===r)void stop('duration-limit').catch(captureError);},maximumSeconds*1000);return true;
  }
  async function stop(reason='explicit-stop'){
    if(!recording)return false;const r=recording;recording=null;r.live=false;clearTimeout(r.timer);panel.dataset.recording='false';sync();
    const after=safeSnapshot(),endedAt=performance.now();
    const [media,heartMedia,mixed,heart]=await Promise.all([r.media.stop(),r.heartMedia?.stop(),r.pcm?.stop(),r.heartPcm?.stop()]);
    for(const track of r.stream.getTracks())track.stop();if(r.heartDestination){try{r.audio.heartbeatSource.disconnect(r.heartDestination);}catch{}for(const track of r.heartDestination.stream.getTracks())track.stop();}r.audio.dispose?.();
    const name='heartbeat-'+Date.now()+(currentStage?'-'+currentStage.replace(/[^\w-]/g,'-'):''),files={};
    files.video=(await post(name+'.'+media.extension,media.blob)).name;
    if(heartMedia)files.heartbeatAudio=(await post(name+'-heartbeat.'+heartMedia.extension,heartMedia.blob)).name;
    if(mixed)files.mixedWave=(await post(name+'.wav',mixed.blob)).name;
    if(heart)files.heartbeatWave=(await post(name+'-heartbeat.wav',heart.blob)).name;
    files.still=(await post(name+'.png',await new Promise(resolve=>r.canvas.toBlob(resolve,'image/png')))).name;
    const strip=value=>value?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='blob')):null;
    const evidence={kind:'heartbeat-gameplay-capture',version:1,reason,runtime:r.metadata.runtime||'browser-gameplay-unclassified',fixture:!!r.stage,earnedProgression:false,
      disclosure:'Explicit developer start; ordinary controls and separately declared review actions afterward. Not earned progression, native-package acceptance or human listening sign-off.',
      reviewToolWritesDuringCapture:{automaticMovement:false,pose:0,simulationTime:0,declaredActions:r.actions},
      audioCapture:{primary:'MediaRecorder mixed audio track in game video. Encoding continues independently of canvas frame delivery; inspect extracted audio for stall continuity.',
        heartbeatDiagnostic:'Separate supplied heartbeat-output tap; this is not the final mixed output. It uses an independent audio-only MediaRecorder.',
        pcmMethod:'Optional AudioWorklet PCM taps, timestamped by audio frame. No ScriptProcessor fallback. Check complete and discontinuities before using WAV for continuity claims.',
        audioStarted:r.audioStarted,mixedMedia:strip(media),heartbeatMedia:strip(heartMedia),mixedPcm:strip(mixed),heartbeatPcm:strip(heart)},
      rendering:{source:'Visible final production canvas layers composited at30fps; CSS filters retained where supported.',limitation:'DOM review panel excluded. A deliberately stalled main thread freezes captured picture while its audio can continue. No GPU-completion/display-latency claim.',layers:r.layers,
        frameTicks:r.frames,compositeCpuMs:{samples:r.composeMs.length,mean:r.composeMs.reduce((n,v)=>n+v,0)/Math.max(1,r.composeMs.length),p95:percentile(r.composeMs,.95),max:Math.max(0,...r.composeMs)}},
      files,width:r.canvas.width,height:r.canvas.height,seconds:(endedAt-r.started)/1000,metadata:r.metadata,sourceManifest:r.manifest,stage:r.stage,before:r.before,after,
      inputs:r.inputs,actions:r.actions,traces:r.traces,events:r.events,errors:errors.filter(row=>!finite(row.wall)||row.wall>=r.started),priorErrorCount:r.errorStart,
      captureOverhead:'Canvas copying, video/audio encoding, audio-thread taps and20Hz snapshots instrument this run; do not claim normal frame cost from it.'};
    const saved=await post(name+'.json',new Blob([JSON.stringify(evidence,null,2)],{type:'application/json'}));
    panel.dataset.saved=name;status.textContent='Saved '+name+' · final mix + heartbeat + timing receipts.';report.style.display='block';report.textContent=JSON.stringify({saved:saved.name,files,seconds:evidence.seconds,events:r.events.length,pcmComplete:{mixed:mixed?.complete??null,heartbeat:heart?.complete??null},errors:evidence.errors},null,2);return evidence;
  }
  async function action(id){
    const entry=actions.find(value=>value.id===id);if(!entry||typeof entry.run!=='function')throw Error('Unknown review action.');
    const receipt={id,label:entry.label||id,type:'review-action',wall:performance.now(),audioTime:recording?.audio.context.currentTime??null,before:safeSnapshot()};
    if(recording)recording.actions.push(receipt);
    const result=await entry.run();receipt.endedWall=performance.now();receipt.endedAudioTime=recording?.audio.context.currentTime??null;receipt.result=copy(result??null);receipt.after=safeSnapshot();
    status.textContent=(recording?'RECORDING · ':'')+'Applied '+(entry.label||id)+' · action logged.';return receipt;
  }
  async function saveStill(){const canvas=document.createElement('canvas'),context=canvas.getContext('2d'),layers=composite(canvas,context),name='heartbeat-still-'+Date.now();await post(name+'.png',await new Promise(resolve=>canvas.toBlob(resolve,'image/png')));await post(name+'.json',new Blob([JSON.stringify({kind:'heartbeat-gameplay-still',stage:stageReceipt,snapshot:timedSnapshot(),metadata:captureMetadata(),layers},null,2)],{type:'application/json'}));panel.dataset.saved=name;status.textContent='Saved '+name;}
  button('heartbeat-enter','Stage selected section',()=>setStage(select.value),()=>!!recording);
  button('heartbeat-record','Record current play',start,()=>!!recording);button('heartbeat-stop','Stop + save',()=>stop(),()=>!recording);
  button('heartbeat-still','Save game still',saveStill,()=>!!recording);button('heartbeat-inspect','Inspect receipts',()=>{report.style.display=report.style.display==='none'?'block':'none';report.textContent=JSON.stringify(timedSnapshot(),null,2);});
  for(const row of actions)button('heartbeat-action-'+row.id,row.label||row.id,()=>action(row.id));
  panel.append(status,disclosure);document.body.append(panel,report);sync();
  function tick(now){
    if(disposed)return;
    if(recording?.live){const begin=performance.now();composite(recording.canvas,recording.context);recording.composeMs.push(performance.now()-begin);recording.frames.push({wall:now,audioTime:recording.audio.context.currentTime});
      if(now-lastSample>=50){
        lastSample=now;const row=timedSnapshot(),audio=row.state.audio;
        for(const event of audio?.events||[]){
          if(event.type==='cycle'&&finite(event.time)&&event.time+(Number(event.durationSeconds)||0)<recording.audioStarted-.01)continue;
          const key=JSON.stringify([event.generation,event.serial,event.type,event.kind,event.time,event.audioTime,event.cycleId,event.id]);
          if(recording.eventKeys.has(key))continue;recording.eventKeys.add(key);recording.events.push(copy(event));
        }
        // Events are deduplicated above. Repeating every historical event and
        // every static per-clip DSP audit20times/second adds no phase evidence
        // and can exceed the bounded artifact size on a long listening pass.
        if(audio){
          delete audio.events;
          if(audio.bitcrushing){const dsp=audio.bitcrushing;audio.bitcrushing={bitDepth:dsp.bitDepth,effectiveSampleRate:dsp.effectiveSampleRate,implementation:dsp.implementation,application:dsp.application,clipCount:dsp.clips?.length??null};}
        }
        recording.traces.push(row);
      }
      if(now-recording.started>=maximumSeconds*1000)void stop('duration-limit').catch(error=>errors.push({message:String(error.message||error),wall:performance.now()}));}
    requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
  const hotkey=event=>{if(event.code!=='F8'||event.repeat||busy)return;event.preventDefault();event.stopImmediatePropagation();busy=true;sync();Promise.resolve(recording?stop('F8'):start()).catch(error=>{errors.push({message:String(error.message||error),wall:performance.now()});status.textContent=String(error.message||error);}).finally(()=>{busy=false;sync();focusGame();});};
  const blur=()=>{if(recording)recording.inputs.push({type:'focus-lost',wall:performance.now(),audioTime:recording.audio.context.currentTime});};
  window.addEventListener('keydown',hotkey,{capture:true});window.addEventListener('blur',blur);
  return{stage:setStage,start,stop,action,inspect:()=>({recording:!!recording,currentStage,stageReceipt,snapshot:safeSnapshot(),errors:[...errors]}),async dispose(){if(disposed)return;if(recording)await stop('review-disposed');disposed=true;for(const type of inputTypes)window.removeEventListener(type,noteInput,{capture:true});window.removeEventListener('keydown',hotkey,{capture:true});window.removeEventListener('blur',blur);window.removeEventListener('error',gameError);window.removeEventListener('unhandledrejection',gameError);panel.remove();report.remove();}};
}
