// Explicit local DEV controls; no progression, dialogue choices or sound is
// fabricated by this panel. The host supplies all staged and observed state.
export const WORLD_INTEGRATION_STAGES=Object.freeze([
  ['pre-shift-map','Pre-shift map'],['lyric-camera-extract','Lyric · camera / extract'],
  ['ellery-record','Ellery · record'],['tower-record','Tower · record'],
  ['iona','Iona'],['ruth','Ruth'],['denise','Denise'],
  ['pool-no-coffee','Pool · no coffee'],['pool-coffee','Pool · coffee'],
]);
export function compactWorldIntegrationState(value,depth=0){
  if(value==null||typeof value==='boolean')return value;
  if(typeof value==='string')return value.slice(0,500);
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(depth>4)return null;
  if(Array.isArray(value))return value.slice(0,16).map(v=>compactWorldIntegrationState(v,depth+1));
  if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['bones','joints','matrix','matrices','traces','pixels'].includes(key)).slice(0,32).map(([key,v])=>[key,compactWorldIntegrationState(v,depth+1)]));
  return null;
}
export function createWorldIntegrationReview(api){
  const panel=document.createElement('aside');panel.id='world-integration-review';panel.setAttribute('aria-label','Local world integration review');
  panel.style.cssText='position:fixed;left:8px;top:8px;z-index:10000;max-width:760px;padding:9px 12px;background:#17201ded;color:#e8dec8;font:12px system-ui;display:flex;gap:7px;align-items:center;flex-wrap:wrap';
  const title=document.createElement('strong');title.textContent='DEV · silent world integration';panel.append(title);
  const select=document.createElement('select');select.setAttribute('aria-label','Review placement');
  for(const [id,label] of WORLD_INTEGRATION_STAGES){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option);}panel.append(select);
  const status=document.createElement('output');status.style.cssText='flex-basis:100%';status.textContent='Explicit placement; use the ordinary game afterward.';
  const snapshot=document.createElement('pre');snapshot.tabIndex=0;snapshot.style.cssText='display:none;flex-basis:100%;white-space:pre-wrap;max-height:210px;overflow:auto;margin:0;font:11px monospace';
  for(const type of['click','dblclick','pointerdown','pointerup','mousedown','mouseup','keydown','keyup','keypress','wheel'])panel.addEventListener(type,event=>event.stopPropagation());
  let disposed=false,busy=false,recording=null,raf=0,pauseWanted=false;
  const errors=[],listeners=[];
  const listen=(target,type,fn)=>{target.addEventListener(type,fn);listeners.push(()=>target.removeEventListener(type,fn));};
  listen(window,'error',event=>errors.push(String(event.message||event.error)));
  listen(window,'unhandledrejection',event=>errors.push(String(event.reason?.stack||event.reason)));
  const say=text=>{status.textContent=text;};
  const read=()=>api.inspect();
  const quiet=state=>{if(state?.silentOutput!==true)throw Error('Silent output is required. Open this local review with silentReview=1.');};
  const json=value=>new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
  const small=compactWorldIntegrationState;
  const post=async(name,body)=>{const response=await fetch('/__world-integration-review/'+name,{method:'POST',body});if(!response.ok)throw Error(await response.text());return response.json();};
  const manifest=async()=>{const response=await fetch('/__world-integration-review/manifest',{cache:'no-store'});if(!response.ok)throw Error('The local evidence server is unavailable.');return response.json();};
  const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No composed game image.')),'image/png'));
  const scope='Explicit developer placement and observed production state only. Canvas composition and zero-audio capture are evidence of the recorded view; no earned-route, participant, listening or packaged-native acceptance is inferred.';
  function trace(state){
    const keys=['poolMetric','natatoriumCoffee','coffeeStretch','body','canonical','faceplate','rendered','scene','dialogue','conversation','evidence','renderer','display','contact','flags','inventory','map','floor','zone'];
    return{silentOutput:state?.silentOutput===true,...Object.fromEntries(keys.filter(key=>state?.[key]!==undefined).map(key=>[key,small(state[key])]))};
  }
  function composite(canvas){
    const host=document.getElementById('wrap');if(!host)throw Error('The game picture is unavailable.');
    const box=host.getBoundingClientRect();if(box.width<1||box.height<1)throw Error('The game picture is hidden.');
    if(!canvas.dataset.sized){canvas.width=Math.round(box.width);canvas.height=Math.round(box.height);canvas.dataset.sized='true';}
    const context=canvas.getContext('2d',{alpha:false}),scale=Math.min(canvas.width/box.width,canvas.height/box.height),x=(canvas.width-box.width*scale)/2,y=(canvas.height-box.height*scale)/2;
    context.globalAlpha=1;context.fillStyle='#000';context.fillRect(0,0,canvas.width,canvas.height);
    const layers=[...host.querySelectorAll('canvas')].filter(layer=>{const r=layer.getBoundingClientRect(),s=getComputedStyle(layer);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';})
      .sort((a,b)=>(parseFloat(getComputedStyle(a).zIndex)||0)-(parseFloat(getComputedStyle(b).zIndex)||0));
    if(!layers.length)throw Error('No visible game canvas layers.');
    for(const layer of layers){const r=layer.getBoundingClientRect();context.globalAlpha=Number(getComputedStyle(layer).opacity||1);context.drawImage(layer,x+(r.left-box.left)*scale,y+(r.top-box.top)*scale,r.width*scale,r.height*scale);}context.globalAlpha=1;
    return canvas;
  }
  const fresh=canvas=>new Promise((resolve,reject)=>requestAnimationFrame(()=>{try{quiet(read());resolve(composite(canvas));}catch(error){reject(error);}}));
  async function save(){
    if(busy||disposed)return;busy=true;
    try{quiet(read());const sourceManifest=await manifest(),canvas=await fresh(document.createElement('canvas')),state=read();quiet(state);
      const name='world-integration-point-'+select.value+'-'+Date.now();await post(name+'.png',await png(canvas));
      const receipt=await post(name+'.json',json({kind:'world-integration-point',stage:select.value,fixture:true,earnedProgression:false,poster:name+'.png',sourceManifest,inspect:small(state),errors:[...errors],scope}));
      panel.dataset.saved=name;say('Saved '+name+(receipt.sourceDrift?.length?' · source changed':''));
    }catch(error){say(String(error.message||error));}finally{busy=false;}
  }
  async function stop(reason='manual-stop'){
    const r=recording;if(!r||r.finishing)return;recording=null;r.finishing=true;busy=true;panel.dataset.state='saving';
    try{if(r.recorder.state!=='inactive')r.recorder.stop();await r.stopped;r.stream.getTracks().forEach(t=>t.stop());
      const final=read();if(final?.silentOutput!==true)r.failures.push('Silent output was lost.');
      await post(r.name+'.webm',new Blob(r.chunks,{type:r.recorder.mimeType}));await post(r.name+'.png',await png(r.canvas));
      const receipt=await post(r.name+'.json',json({kind:'world-integration-capture',stage:r.stage,fixture:true,earnedProgression:false,
        video:r.name+'.webm',poster:r.name+'.png',mimeType:r.recorder.mimeType,width:r.canvas.width,height:r.canvas.height,
        wallSeconds:(performance.now()-r.started)/1000,audioTracks:r.stream.getAudioTracks().length,sourceManifest:r.sourceManifest,
        reason,traces:r.traces,failures:r.failures,errors:[...errors],final:small(final),scope}));
      panel.dataset.saved=r.name;panel.dataset.state=r.failures.length||receipt.sourceDrift?.length?'saved-with-limits':'saved';say('Saved '+r.name+(receipt.sourceDrift?.length?' · source changed':''));
    }catch(error){say('Capture could not be saved: '+String(error.message||error));panel.dataset.state='error';}
    finally{r.stream.getTracks().forEach(t=>t.stop());busy=false;}
  }
  async function record(){
    if(busy||recording||disposed)return;busy=true;let stream;
    try{quiet(read());const sourceManifest=await manifest(),canvas=await fresh(document.createElement('canvas'));quiet(read());stream=canvas.captureStream(30);
      if(stream.getAudioTracks().length)throw Error('Unexpected audio tracks; capture refused.');
      const mimeType=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));if(!mimeType)throw Error('Silent WebM capture is unavailable.');
      const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6000000}),r={name:'world-integration-'+select.value+'-'+Date.now(),stage:select.value,sourceManifest,canvas,stream,recorder,
        started:performance.now(),lastSample:-Infinity,traces:[],chunks:[],failures:[],finishing:false};
      r.stopped=new Promise(resolve=>{recorder.onstop=resolve;});recorder.ondataavailable=event=>{if(event.data.size)r.chunks.push(event.data);};
      recorder.onerror=event=>{r.failures.push(String(event.error?.message||event.error||'Recorder error'));void stop('recorder-error');};
      errors.length=0;recording=r;recorder.start(250);panel.dataset.state='recording';say('Recording silently · play normally, then Stop.');
    }catch(error){stream?.getTracks().forEach(t=>t.stop());say(String(error.message||error));panel.dataset.state='error';}finally{busy=false;}
  }
  function button(label,callback){const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='font:inherit;color:inherit;background:#27342f;border:1px solid #758079;padding:4px 7px';
    b.onclick=()=>Promise.resolve().then(callback).catch(error=>say(String(error.message||error))).finally(()=>{if(!disposed)document.getElementById('map')?.focus();});panel.append(b);return b;}
  button('Stage selected',async()=>{if(busy||recording)return;quiet(read());busy=true;try{say(await api.stage(select.value)?'Placed · ordinary controls are yours.':'Placement unavailable.');}finally{busy=false;}});
  button('Show map',()=>{quiet(read());say(api.map()?'Map opened.':'Map unavailable.');});
  button('Snapshot',()=>{const state=read();snapshot.textContent=JSON.stringify(small(state),null,2);snapshot.style.display='block';say('Read-only observed state.');});
  button('Save evidence',save);button('Record silent',record);button('Stop',()=>stop());
  const pauseButton=button('Pause',()=>{pauseWanted=!pauseWanted;api.pause(pauseWanted);pauseButton.textContent=pauseWanted?'Resume':'Pause';});
  panel.append(status,snapshot);document.body.append(panel);
  function tick(now){
    if(disposed)return;const r=recording;
    if(r)try{const state=read();quiet(state);composite(r.canvas);
      if(now-r.lastSample>=100){r.lastSample=now;r.traces.push({seconds:(now-r.started)/1000,...trace(state)});say(((now-r.started)/1000).toFixed(1)+'s · '+r.stage+' · silent');}
      if(now-r.started>=180000){r.failures.push('Reached the 180-second capture bound.');void stop('timeout');}
    }catch(error){r.failures.push(String(error.message||error));void stop('silent-output-or-capture-failure');}
    raf=requestAnimationFrame(tick);
  }
  raf=requestAnimationFrame(tick);
  function dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);listeners.forEach(remove=>remove());if(recording){const r=recording;recording=null;if(r.recorder.state!=='inactive')r.recorder.stop();r.stream.getTracks().forEach(t=>t.stop());}panel.remove();}
  listen(window,'pagehide',dispose);
  return{panel,record,stop,save,dispose};
}
