// Installed only by the dedicated local review server. Staging is disclosed;
// route following sends ordinary key events and never assigns dialogue state.
const panel=document.createElement('aside');panel.setAttribute('aria-label','Ophanim verification');
panel.style.cssText='position:fixed;z-index:20000;left:8px;top:8px;right:8px;padding:5px;background:#101711eb;color:#ddd;font:12px monospace;display:flex;gap:6px;align-items:center;flex-wrap:wrap';
document.body.append(panel);
const label=document.createElement('input');label.value=new URL(location.href).searchParams.get('capture')||'before';label.setAttribute('aria-label','Capture label');label.style.width='100px';panel.append(label);
for(const type of['keydown','keyup'])panel.addEventListener(type,e=>e.stopPropagation());
const status=document.createElement('output');status.setAttribute('aria-label','Opening trace');status.style.cssText='max-width:800px;overflow:hidden;white-space:nowrap';
const api=()=>window.__probe?.sixLoop?.prologue,view=()=>api()?.view(),top=()=>window.__scenes?.top();
const recordKey=(key)=>{for(const type of['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key,code:key==='Enter'?'Enter':`Digit${key}`,bubbles:true}));};
let recording=null,pendingCapture=null,route=null,recordOnOpening=new URL(location.href).searchParams.has('capture'),errors=[];
addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const button=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{try{await fn();}catch(e){panel.dataset.error=String(e);status.textContent=String(e);errors.push(String(e));}};panel.append(b);return b;};
button('Stage production opening',async()=>{await window.__probe.testRun();window.__probe.tutSkip();api().begin();});
button('Follow to Ellery',()=>{route={stop:'ellery',started:performance.now()};});
button('Follow to first address',()=>{route={stop:'there',started:performance.now()};});
button('Follow to single reply',()=>{route={stop:'job',started:performance.now()};});
button('Follow to school account',()=>{route={stop:'school-told',started:performance.now()};});
button('Follow to margin',()=>{route={stop:'margin',started:performance.now()};});
button('Stop route',()=>{route=null;});
button('Record next opening',()=>{recordOnOpening=true;});
button('Measure speech alternatives',async()=>{
  const {renderSamSamples,VOICE_PROFILES}=await import('../audio/sam-voice.js'),{OPENING_PROLOGUE}=await import('../data/opening-prologue.js');
  const results=[];
  for(const[id,index]of[['there',0],['ellery',2],['school-told',0]]){
    const text=OPENING_PROLOGUE.nodes[id].lines[index].text,{samples,sampleRate,provider}=await renderSamSamples(text,{speaker:'other'});
    for(const multiplier of[1,1.125,1.25]){
      const rate=VOICE_PROFILES.other.rate*multiplier,hz=Math.round(sampleRate*rate),bytes=new ArrayBuffer(44+samples.length*2),v=new DataView(bytes),str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
      str(0,'RIFF');v.setUint32(4,36+samples.length*2,true);str(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,hz,true);v.setUint32(28,hz*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,samples.length*2,true);samples.forEach((s,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,s))*32767),true));
      const name=`speech-${id}-${String(multiplier).replace('.','-')}.wav`,seconds=samples.length/hz,words=text.split(/\s+/).length;
      const response=await fetch('/__ophanim-capture/'+name,{method:'POST',body:bytes});if(!response.ok)throw Error('Speech capture failed');results.push({id,text,provider,multiplier,effectiveRate:rate,seconds,wpm:60*words/seconds,file:name});
    }
  }
  await fetch('/__ophanim-capture/speech-comparison.json',{method:'POST',body:JSON.stringify({disclosure:'Actual local synthesis provider, raw mono samples at three playback rates. These WAVs isolate delivery rate; production EQ, smear, mix and captions are in the gameplay captures.',results})});panel.dataset.speech='saved';
});
const sample=()=>{const v=view(),f=top()?.physicalFrame?.(),w=f?.weather,grid=w?.wetness?.data;
  return{wall:performance.now(),scene:top()?.id,node:v?.nodeId,line:v?.line?.text,who:v?.who,typed:v?.typed,voice:v?.voice,lineAge:v?.lineAge,serial:v?.lineSerial,pending:v?.pending,paused:v?.paused,
    roadBreath:v?.roadBreath,roadBreathsCompleted:v?.roadBreathsCompleted,journey:v?.journey,drive:v?.drive?{time:v.drive.timeSec,state:v.drive.driveState,embodiment:v.drive.embodiment}:null,
    weather:w?{rain:w.rain,fog:w.fog,extinction:w.extinction,wiperMoving:w.wiperMoving,wiperAngles:w.wiperAngles,paneRain:w.paneRain,beads:w.wetness.beadData?Array.from(w.wetness.beadData).filter(v=>v>30).length:null,wetness:grid?{min:Math.min(...grid)/255,max:Math.max(...grid)/255,mean:grid.reduce((a,b)=>a+b,0)/grid.length/255}:null}:null};};
function paint(canvas){const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const c of [...document.querySelectorAll('canvas')].filter(c=>c!==canvas).sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0))){const r=c.getBoundingClientRect(),s=getComputedStyle(c);if(r.width&&r.height&&s.display!=='none'&&s.visibility!=='hidden'){ctx.globalAlpha=Number(s.opacity);ctx.drawImage(c,r.x,r.y,r.width,r.height);}}ctx.globalAlpha=1;
}
const startCapture=button('Record game + audio',()=>{if(recording)return;const canvas=document.createElement('canvas');canvas.width=innerWidth;canvas.height=innerHeight;paint(canvas);
  const audio=window.__probe.stationFieldCaptureAudio(),video=canvas.captureStream(15),stream=new MediaStream([...video.getVideoTracks(),...(audio?.stream.getAudioTracks()||[])]),mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(s=>MediaRecorder.isTypeSupported(s));
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:1500000,audioBitsPerSecond:128000}),chunks=[],samples=[];
  const r={canvas,audio,stream,recorder,chunks,samples,started:performance.now(),name:label.value.replace(/[^a-z0-9-]/g,'-'),input:[]};recording=r;
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(500);
  const draw=()=>{if(recording!==r)return;paint(canvas);requestAnimationFrame(draw);};requestAnimationFrame(draw);
});
const stopCapture=button('Stop + save capture',async()=>{if(!recording&&!pendingCapture)return;const r=recording||pendingCapture;recording=null;route=null;pendingCapture=r;
  const blob=r.blob||await new Promise(done=>{r.recorder.onstop=()=>done(new Blob(r.chunks,{type:r.recorder.mimeType}));r.recorder.stop();});r.blob=blob;
  const post=(name,data)=>fetch('/__ophanim-capture/'+name,{method:'POST',body:data}).then(x=>{if(!x.ok)throw Error('Capture save failed');return x.json();});
  await post(r.name+'.webm',blob);await post(r.name+'.json',JSON.stringify({disclosure:'Developer-staged production opening; routes send ordinary untrusted key events. Manual browser keys are recorded separately. Final rendered canvases and actual mixed game-output audio share one MediaRecorder stream. Not packaged or independent-player acceptance.',seconds:(performance.now()-r.started)/1000,audioTracks:r.stream.getAudioTracks().length,samples:r.samples,input:r.input,errors}));
  r.audio?.dispose();r.stream.getTracks().forEach(t=>t.stop());pendingCapture=null;status.textContent='SAVED '+r.name;panel.dataset.saved=r.name;
});
panel.append(status);
for(const type of['keydown','keyup'])addEventListener(type,e=>{if(recording)recording.input.push({type,key:e.key,repeat:e.repeat,trusted:e.isTrusted,at:performance.now()-recording.started});},{capture:true});
setInterval(()=>{const v=view(),s=sample();if(recordOnOpening&&v?.phase==='film'&&v.presentationReady){recordOnOpening=false;startCapture.click();}if(recording){recording.samples.push(s);if(performance.now()-recording.started>60000)stopCapture.click();}status.textContent=`${s.scene} · ${s.node} · ${s.who} · ${v?.roadBreath?'ROAD '+v.roadBreath.id:v?.typing?'speaking/reveal':'ready'} · ${v?.pending?.options?.length||0} options · ${recording?'RECORDING':''}`;
  panel.dataset.node=s.node||'';panel.dataset.serial=s.serial||'';panel.dataset.typing=String(!!v?.typing);panel.dataset.pending=String(v?.pending?.options?.length||0);
  if(!route||!v||v.paused||v.phase!=='film')return;if(v.nodeId===route.stop||performance.now()-route.started>180000){route=null;return;}
  if(v.pending){if(v.pending.kind==='say'){recordKey('1');return;}const target={there:'driving',look:'interval-refuse',job:'job-rooms',ellery:'school',notice:'hearing'}[v.nodeId];const at=v.pending.options.findIndex(c=>c.goto===target);if(at<0){route=null;return;}recordKey(String(at+1));}else recordKey('Enter');
},250);
