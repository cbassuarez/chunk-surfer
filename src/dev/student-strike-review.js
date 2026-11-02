// DEV-only transparent controls around the production conversation and film.
// This module never chooses dialogue, advances the game clock or creates audio.
export function createStudentStrikeReview(api){
  const panel=document.createElement('aside');panel.id='student-strike-review';panel.setAttribute('aria-label','Student strike game review');
  panel.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;padding:9px 12px;background:#17201ded;color:#e8dec8;font:12px system-ui;display:flex;gap:9px;align-items:center;flex-wrap:wrap';
  const title=document.createElement('strong');title.textContent='DEV · Odette / production film';panel.append(title);
  const status=document.createElement('output');status.textContent='Place, talk, then choose whether to listen.';panel.append(status);
  for(const type of['click','dblclick','pointerdown','pointerup','mousedown','mouseup','keydown','keyup','keypress','wheel'])panel.addEventListener(type,event=>event.stopPropagation());
  let armed=null,recording=null,busy=false,disposed=false,lastPoll=0,raf=0,pauseWanted=false;
  const errors=[],listeners=[];
  const listen=(target,type,callback)=>{target.addEventListener(type,callback);listeners.push(()=>target.removeEventListener(type,callback));};
  listen(window,'error',event=>errors.push(String(event.message||event.error)));
  listen(window,'unhandledrejection',event=>errors.push(String(event.reason?.stack||event.reason)));
  const message=text=>{status.textContent=text;};
  const post=async(name,body)=>{const response=await fetch('/__student-strike-review/'+name,{method:'POST',body});if(!response.ok)throw Error(await response.text());return response.json();};
  const manifest=async()=>{const response=await fetch('/__student-strike-review/manifest',{cache:'no-store'});if(!response.ok)throw Error('The local review evidence server is unavailable.');return response.json();};
  const json=value=>new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
  const png=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No composed game image.')),'image/png'));
  const safeRead=()=>{try{return api.inspect();}catch(error){message(String(error.message||error));return null;}};
  const quiet=state=>{if(state?.silentOutput!==true)throw Error('Silent output is required for this review. Open the game with silentReview=1.');};
  const vector=value=>Array.isArray(value)?value.slice(0,4).map(n=>Number.isFinite(n)?n:null):null;
  function small(value,depth=0){
    if(value==null||typeof value==='boolean'||typeof value==='string')return typeof value==='string'?value.slice(0,400):value;
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(depth>3)return null;
    if(Array.isArray(value))return value.slice(0,12).map(item=>small(item,depth+1));
    if(typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!['joints','bones','matrix','frame','traces'].includes(key)).slice(0,20).map(([key,item])=>[key,small(item,depth+1)]));
    return null;
  }
  function articulation(value){
    const a=value?.strikeArticulation||value?.articulation||value;if(!a)return null;
    return{kind:a.kind,seconds:a.seconds,rootUnchanged:a.rootUnchanged,
      plate:a.plate?{phase:a.plate.phase,weight:a.plate.weight,position:vector(a.plate.position),handWorld:vector(a.plate.handWorld)}:null,
      contacts:(a.contacts||[]).slice(0,3).map(c=>({side:c.side,kind:c.kind,active:c.active,weight:c.weight,actualWorld:vector(c.actualWorld),errorM:c.errorM,worldReachErrorM:c.worldReachErrorM}))};
  }
  function compact(state){
    const scene=state?.scene,hand=state?.rendered?.handArticulation;
    return{silentOutput:state?.silentOutput===true,
      scene:scene?{phase:scene.phase,elapsed:scene.elapsed,shotId:scene.frame?.shotId,black:scene.black,paused:scene.paused,blurred:scene.blurred,
        held:scene.held,presentationHeld:scene.presentationHeld,restored:scene.restored,complete:scene.complete,done:scene.done,skipped:scene.skipped,error:scene.error}:null,
      canonical:small(state?.canonical),saved:small(state?.saved),lastReturn:small(state?.lastReturn),
      contact:small(state?.contact),consent:state?.consent,watched:state?.watched,returns:small(state?.returns),
      rendered:{plate:small(state?.rendered?.plate),handArticulation:(Array.isArray(hand)?hand:[hand]).filter(Boolean).map(articulation)},display:small(state?.display)};
  }
  function composite(canvas){
    const host=document.getElementById('wrap');if(!host)throw Error('The game picture is not available.');
    const box=host.getBoundingClientRect();if(box.width<1||box.height<1)throw Error('The game picture is hidden.');
    if(!canvas.width||!canvas.dataset.captureSized){canvas.width=Math.round(box.width);canvas.height=Math.round(box.height);canvas.dataset.captureSized='true';}
    const ctx=canvas.getContext('2d',{alpha:false}),scale=Math.min(canvas.width/box.width,canvas.height/box.height),x=(canvas.width-box.width*scale)/2,y=(canvas.height-box.height*scale)/2;
    ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    const layers=[...host.querySelectorAll('canvas')].filter(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';})
      .sort((a,b)=>(parseFloat(getComputedStyle(a).zIndex)||0)-(parseFloat(getComputedStyle(b).zIndex)||0));
    if(!layers.length)throw Error('No visible game canvas layers.');
    for(const layer of layers){const r=layer.getBoundingClientRect();ctx.globalAlpha=Number(getComputedStyle(layer).opacity||1);
      ctx.drawImage(layer,x+(r.left-box.left)*scale,y+(r.top-box.top)*scale,r.width*scale,r.height*scale);}
    ctx.globalAlpha=1;return canvas;
  }
  async function savePoint(){
    if(busy||disposed)return;busy=true;
    try{const state=safeRead();quiet(state);const sourceManifest=await manifest(),canvas=composite(document.createElement('canvas')),name='student-strike-point-'+Date.now();
      await post(name+'.png',await png(canvas));const receipt=await post(name+'.json',json({kind:'student-strike-production-point',fixture:true,earnedProgression:false,
        sourceManifest,inspect:compact(state),errors:[...errors],scope:'Explicit developer placement, ordinary production scene and current rendered game layers. No listening, unfamiliar-player or packaged-native acceptance.'}));
      panel.dataset.saved=name;message('Saved '+name+(receipt.sourceDrift?.length?' · source changed during evidence':''));
    }catch(error){message(String(error.message||error));}finally{busy=false;}
  }
  async function finish(reason='returned'){
    const r=recording;if(!r||r.finishing)return;recording=null;r.finishing=true;busy=true;panel.dataset.state='saving';
    try{
      if(r.recorder.state!=='inactive')r.recorder.stop();await r.stopped;r.stream.getTracks().forEach(track=>track.stop());
      const final=safeRead();if(final?.silentOutput!==true)r.failures.push('Silent output was lost.');
      await Promise.all(r.pending);
      await post(r.name+'.webm',new Blob(r.chunks,{type:r.recorder.mimeType}));
      await post(r.name+'.png',await png(r.canvas));
      const receipt=await post(r.name+'.json',json({kind:'student-strike-production-capture',fixture:true,earnedProgression:false,
        video:r.name+'.webm',poster:r.name+'.png',mimeType:r.recorder.mimeType,width:r.canvas.width,height:r.canvas.height,
        wallSeconds:(performance.now()-r.started)/1000,audioTracks:r.stream.getAudioTracks().length,sourceManifest:r.sourceManifest,
        reason,traces:r.traces,stills:[...r.stills],failures:r.failures,errors:[...errors],final:compact(final),
        scope:'Explicit placement only; the operator opened the actual Odette conversation and chose its production watch option. Production clock, camera, native world/actors/dither, in-game subtitles and player return; composed game canvases, zero audio tracks and guarded silent output. No participant, listening, earned-route or packaged-native acceptance.'}));
      panel.dataset.saved=r.name;panel.dataset.state=receipt.sourceDrift?.length||r.failures.length?'saved-with-limits':'saved';
      message('Saved '+r.name+(receipt.sourceDrift?.length?' · source changed during capture':''));
    }catch(error){errors.push(String(error.message||error));message('Capture could not be saved: '+String(error.message||error));panel.dataset.state='error';}
    finally{r.stream.getTracks().forEach(track=>track.stop());busy=false;}
  }
  async function startRecording(state){
    const arm=armed;if(!arm||recording||busy||disposed)return;armed=null;busy=true;
    try{
      quiet(state);const canvas=composite(document.createElement('canvas')),stream=canvas.captureStream(30);
      if(stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());throw Error('The review stream unexpectedly contains audio.');}
      const mimeType=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType){stream.getTracks().forEach(t=>t.stop());throw Error('This browser cannot record a silent WebM review.');}
      const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6000000}),r={name:'student-strike-'+Date.now(),canvas,stream,recorder,sourceManifest:arm.sourceManifest,
        baselineReturn:arm.baselineReturn,started:performance.now(),lastSample:0,traces:[],chunks:[],stills:new Set(),pending:[],failures:[],doneAt:null,finishing:false};
      r.stopped=new Promise(resolve=>{recorder.onstop=resolve;});recorder.ondataavailable=event=>{if(event.data.size)r.chunks.push(event.data);};
      recorder.onerror=event=>{r.failures.push(String(event.error?.message||event.error||'Recorder error'));void finish('recorder-error');};
      recording=r;recorder.start(250);panel.dataset.state='recording';message('Recording the chosen viewing · silent');
    }catch(error){message(String(error.message||error));panel.dataset.state='error';}finally{busy=false;}
  }
  async function arm(){
    if(armed||recording||busy||disposed)return;busy=true;
    try{const state=safeRead();quiet(state);if(state?.scene)throw Error('Finish this viewing before arming another.');
      const sourceManifest=await manifest();armed={sourceManifest,baselineReturn:JSON.stringify(small(state?.lastReturn))};errors.length=0;
      panel.dataset.state='armed';message('Armed · talk to Odette and choose Tell me yourself.');
    }catch(error){message(String(error.message||error));}finally{busy=false;}
  }
  function button(text,callback){const button=document.createElement('button');button.type='button';button.textContent=text;button.style.cssText='font:inherit;color:inherit;background:#27342f;border:1px solid #758079;padding:5px 8px';
    button.onclick=()=>Promise.resolve().then(callback).catch(error=>message(String(error.message||error))).finally(()=>{if(!disposed)document.getElementById('map')?.focus();});panel.append(button);return button;}
  button('Place at Odette',async()=>{if(recording||busy)return;quiet(safeRead());message(await api.stage()?'Placed · talk normally.':'Odette placement unavailable.');});
  button('Talk to Odette',()=>{quiet(safeRead());message(api.talk()?'Conversation opened · choose whether to listen.':'Conversation unavailable here.');});
  button('Record next viewing (silent)',arm);
  button('Skip',()=>api.withdraw());
  const pauseButton=button('Pause',()=>{pauseWanted=!pauseWanted;api.pause(pauseWanted);pauseButton.textContent=pauseWanted?'Resume':'Pause';});
  button('Save evidence',savePoint);
  button('Clear review',async()=>{armed=null;if(recording)await finish('review-cleared');pauseWanted=false;pauseButton.textContent='Pause';await api.clear();panel.dataset.state='idle';message('Review cleared.');});
  function tick(now){
    if(disposed)return;
    const r=recording;
    try{
      if(r)composite(r.canvas);
      if(now-lastPoll>=100){
        lastPoll=now;const state=safeRead();
        if(armed&&state?.scene)void startRecording(state);
        if(r){
          const seconds=(now-r.started)/1000;r.traces.push({seconds,...compact(state)});
          if(state?.silentOutput!==true){r.failures.push('Silent output lost while recording.');void finish('silent-output-lost');}
          const shot=state?.scene?.frame?.shotId,elapsed=state?.scene?.elapsed;
          const key=shot==='S05'&&elapsed>=38.6?'meal-released':shot||(!state?.scene?'returned':null);
          if(key&&!r.stills.has(key)){r.stills.add(key);const copy=document.createElement('canvas');copy.width=r.canvas.width;copy.height=r.canvas.height;copy.getContext('2d').drawImage(r.canvas,0,0);
            r.pending.push(png(copy).then(blob=>post(r.name+'-'+key+'.png',blob)));}
          const returned=JSON.stringify(small(state?.lastReturn))!==r.baselineReturn;
          if(!state?.scene||returned&&state?.scene?.done)r.doneAt??=seconds;
          message(seconds.toFixed(1)+'s · '+(state?.scene?.phase||'returned')+' · '+(shot||'ordinary view'));
          if(seconds>=180){r.failures.push('Capture reached the180-second bound.');void finish('timeout');}
          else if(r.doneAt!==null&&seconds-r.doneAt>=1)void finish('returned');
        }
      }
    }catch(error){errors.push(String(error.message||error));message(String(error.message||error));if(r){r.failures.push(String(error.message||error));void finish('capture-error');}}
    raf=requestAnimationFrame(tick);
  }
  document.body.append(panel);raf=requestAnimationFrame(tick);
  function dispose(){if(disposed)return;disposed=true;armed=null;cancelAnimationFrame(raf);listeners.forEach(remove=>remove());
    if(recording){const r=recording;recording=null;if(r.recorder.state!=='inactive')r.recorder.stop();r.stream.getTracks().forEach(t=>t.stop());}panel.remove();}
  listen(window,'pagehide',dispose);
  return{arm,finish,save:savePoint,dispose,panel};
}
