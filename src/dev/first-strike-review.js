// Evidence-only controls. Staging changes the initial save/clock. All later
// clearance travel uses normal movement/look inputs and production physics.
export function createFirstStrikeReview(api){
 const panel=document.createElement('aside');panel.id='first-strike-review';panel.setAttribute('aria-label','Developer First Strike review');
 panel.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:10000;display:flex;gap:6px;flex-wrap:wrap;padding:6px;background:#101b22ed;color:#e0e7df;font:12px system-ui';
 panel.dataset.busy='false';panel.dataset.recording='false';const status=document.createElement('output');status.id='first-strike-review-status';panel.append(document.createTextNode('DEV · staged initial clock / ordinary inputs'),status);
 const receipt=document.createElement('pre');receipt.id='first-strike-review-receipt';receipt.style.cssText='display:none;position:fixed;bottom:95px;left:0;right:0;z-index:10001;max-height:150px;overflow:auto;background:#101b22ed;color:#e0e7df;font:11px monospace';
 for(const event of['pointerdown','pointerup','click','keydown','keyup'])panel.addEventListener(event,e=>e.stopPropagation());
 let recording=null,busy=false,guide=false,walkHeld=false,lookedBack=false,lastSample=0;const errors=[];
 addEventListener('error',e=>errors.push(String(e.message)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
 // Observe only game control codes; never retain typed text or manufacture
 // trusted delivery. DEV routed inputs remain separately marked in inputs.
 const receivedKeys=[],reviewKeyCodes=new Set(['KeyE','KeyR','KeyS','Space','KeyF','KeyV','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
 for(const type of ['keydown','keyup'])addEventListener(type,event=>{
  if(!reviewKeyCodes.has(event.code))return;
  receivedKeys.push({type,code:event.code,repeat:!!event.repeat,trusted:event.isTrusted===true,withinReview:panel.contains(event.target),wall:performance.now()});
  if(receivedKeys.length>80)receivedKeys.splice(0,receivedKeys.length-80);
 },true);
 const inspect=()=>({...api.inspect(),reviewKeyEvents:receivedKeys.slice()});
 const press=(code,down)=>{if(recording)recording.inputs.push({wall:performance.now(),code,down});(down?api.press:api.release)(code);};
 const walking=enabled=>{if(enabled!==walkHeld){walkHeld=enabled;press('KeyW',enabled);}};
 const observeFor=ms=>new Promise(resolve=>{const until=performance.now()+ms;const frame=()=>{if(performance.now()>=until)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);});
 const button=(label,action)=>{const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;panel.dataset.busy='true';try{await action();}catch(error){errors.push(String(error.stack||error));receipt.style.display='block';receipt.textContent=JSON.stringify({errors,inspect:inspect()},null,2);}finally{busy=false;b.disabled=false;panel.dataset.busy='false';document.getElementById('map')?.focus();}};panel.append(b);return b;};
 const post=async(name,blob)=>{const response=await fetch('/__first-strike/'+name,{method:'POST',body:blob});if(!response.ok)throw Error(await response.text());};
 function composite(canvas,ctx){const host=document.getElementById('wrap'),box=host.getBoundingClientRect();if(canvas.width!==Math.round(box.width)||canvas.height!==Math.round(box.height)){canvas.width=Math.round(box.width);canvas.height=Math.round(box.height);}ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
  const layers=[...host.querySelectorAll('canvas')].filter(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width&&r.height&&s.visibility!=='hidden'&&s.display!=='none';}).sort((a,b)=>(parseFloat(getComputedStyle(a).zIndex)||0)-(parseFloat(getComputedStyle(b).zIndex)||0));for(const c of layers){const r=c.getBoundingClientRect();ctx.globalAlpha=Number(getComputedStyle(c).opacity||1);ctx.drawImage(c,r.left-box.left,r.top-box.top,r.width,r.height);}ctx.globalAlpha=1;
 }
 async function stop(){if(!recording)return;const r=recording;recording=null;guide=false;walking(false);panel.dataset.recording='false';r.live=false;r.recorder.stop();await r.ended;r.unobserve?.();r.audio?.dispose();for(const t of r.stream.getTracks())t.stop();
  const name='first-strike-'+Date.now(),type=r.recorder.mimeType.includes('mp4')?'mp4':'webm';await post(name+'.'+type,new Blob(r.chunks,{type:r.recorder.mimeType}));await post(name+'.png',await new Promise(ok=>r.canvas.toBlob(ok,'image/png')));
  await post(name+'.json',new Blob([JSON.stringify({kind:'first-strike-production-review',fixture:true,disclosure:'Initial location, equipment and night time explicitly staged; guide uses normal walking/look after staging. Actual WebGL/final dither and game output audio; not participant or packaged-native acceptance.',...r.metadata,video:name+'.'+type,width:r.canvas.width,height:r.canvas.height,wallSeconds:(performance.now()-r.started)/1000,sourceManifest:r.manifest,inputs:r.inputs,traces:r.traces,frames:r.frames,checks:r.checks,errors,final:inspect()},null,2)],{type:'application/json'}));panel.dataset.saved=name;status.textContent='Saved '+name;
 }
 async function captureCurrent(kind='current-view',{protect=false,walk=false}={}){
  if(recording)throw Error('A capture is already running.');walking(false);guide=false;lookedBack=false;errors.length=0;
  const manifest=await fetch('/__first-strike/manifest').then(r=>r.json()),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');composite(canvas,ctx);
  const audio=api.captureAudio(),video=canvas.captureStream(30),stream=new MediaStream([...video.getVideoTracks(),...(audio?.stream.getAudioTracks()||[])]),mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3000000,audioBitsPerSecond:160000}),r={canvas,ctx,audio,stream,recorder,chunks:[],traces:[],frames:[],inputs:[],checks:[],manifest,started:performance.now(),live:true,metadata:{scenario:kind,protectedTake:protect,scriptedGuide:walk}};
  r.ended=new Promise(ok=>recorder.onstop=ok);recorder.ondataavailable=e=>{if(e.data.size)r.chunks.push(e.data);};r.unobserve=api.observePresentation(wall=>{if(r.live)r.frames.push(wall);});recording=r;recorder.start(250);panel.dataset.recording='true';
  status.textContent='Recording '+kind;
 }
 async function start(kind,{protect=false,walk=true,elapsedSeconds=30177}={}){
  // Source holds the clock, so these two can't run up to the deadline: stage them past it.
  if(['source-II','drive'].includes(kind)&&elapsedSeconds>=30177)elapsedSeconds=30180;
  walking(false);guide=false;lookedBack=false;errors.length=0;await api.stage(kind,{elapsedSeconds});
  if(protect)api.startRecording();
  await captureCurrent(kind,{protect,walk});const r=recording;
  if(protect){await observeFor(6500);const held=inspect();r.checks.push({id:'protected-deadline',observation:held});if(held.deadline.phase!=='pending'||held.firstStrike||!held.recording.active)throw Error('The in-progress recording was not protected at the boundary.');api.stopRecording();await observeFor(1200);}
  guide=walk;status.textContent='Recording '+kind;
 }
 button('Stage get-in lighting',()=>api.stage('get-in',{elapsedSeconds:0}));button('Stage masonry lighting',()=>api.stage('basement-corridor',{elapsedSeconds:0}));
 button('Stage damp joints',()=>api.stage('basement-corridor',{elapsedSeconds:27720}));button('Stage late deterioration',()=>api.stage('basement-corridor',{elapsedSeconds:29700}));
 for(const mode of['baseline','marks-only','complete'])button('Light '+mode,()=>api.lightMode(mode));
 button('Look left',()=>api.lookBy(-.65,0));button('Look right',()=>api.lookBy(.65,0));button('Look down',()=>api.lookBy(0,-.35));
 button('Save matched frame',async()=>{const canvas=document.createElement('canvas');composite(canvas,canvas.getContext('2d'));const name='first-strike-'+Date.now();await post(name+'.png',await new Promise(ok=>canvas.toBlob(ok,'image/png')));await post(name+'.json',new Blob([JSON.stringify({kind:'world-light-matched-frame',fixture:true,inspect:inspect(),sourceManifest:await fetch('/__first-strike/manifest').then(r=>r.json()),errors},null,2)],{type:'application/json'}));panel.dataset.saved=name;});
 button('Measure light modes',async()=>{
  if(recording)throw Error('Stop video capture before measuring.');const runs=[];
  for(const mode of['baseline','complete','complete','baseline']){api.lightMode(mode);await observeFor(600);const frames=[],before=inspect(),unobserve=api.observePresentation(wall=>frames.push(wall));await observeFor(2400);unobserve();runs.push({mode,before,after:inspect(),frames});}
  api.lightMode('complete');const name='first-strike-'+Date.now();await post(name+'.json',new Blob([JSON.stringify({kind:'world-light-frame-pacing',disclosure:'Stationary matched camera; video capture stopped. Lightweight actual-render submission observer. Includes browser/main-thread scheduling; not a GPU timer or native OS compositor measurement.',runs,errors},null,2)],{type:'application/json'}));panel.dataset.saved=name;
 });
 button('Record masonry motion',async()=>{
  await start('basement-corridor',{walk:false,elapsedSeconds:0});await observeFor(1200);press('KeyW',true);await observeFor(1400);press('KeyW',false);
  for(const sign of[1,-1])for(let i=0;i<28;i++){api.lookBy(sign*.018,0);await observeFor(35);}await observeFor(700);await stop();
 });
 button('Record B3 escape',()=>start('studio-b3-control'));button('Record B3 stay',()=>start('studio-b3-control',{walk:false}));
 button('Record protected take',()=>start('studio-b3-control',{protect:true}));button('Record Source II escape',()=>start('source-II'));
 button('Record hands and STOP',async()=>{
  await start('studio-b3-control',{walk:false,elapsedSeconds:0});api.startRecording();
  await observeFor(1200);api.finishSlate();
  await observeFor(38000);recording?.checks.push({id:'before-authored-stop',observation:inspect()});
  api.stopRecording();await observeFor(1800);await stop();
 });
 button('Record full hands take',async()=>{
  await start('studio-b3-control',{walk:false,elapsedSeconds:0});api.startRecording();
  await observeFor(1200);api.finishSlate();
  await observeFor(63000);recording?.checks.push({id:'timed-take-observation',observation:inspect()});await stop();
 });
 button('Stage II first CONTACT',async()=>{await api.stage('source-II',{elapsedSeconds:0});await api.contactFixture('II',false);});
 button('Stage II repeat CONTACT',async()=>{await api.stage('source-II',{elapsedSeconds:0});await api.contactFixture('II',true);});
 button('Stage III CONTACT',async()=>{await api.stage('source-II',{elapsedSeconds:0});await api.contactFixture('III',false);});
 button('Seed labelled review take',()=>api.seedReviewTake());
 button('Stage recording return',()=>api.contactFixture(api.contactReturnChapter()||'II',true,{recovery:true}));
 if(api.intrusion){
  button('Record intrusion take',async()=>{
   await start('studio-b3-control',{walk:false,elapsedSeconds:0});api.startRecording();
   await observeFor(1200);api.finishSlate();
  });
  button('Stage warned STOP seizure',api.armIntrusionPressure);
  button('Begin instrument HOLD',()=>api.intrusionHold(true));
  button('Resume instrument HOLD',()=>api.intrusionHold(false));
  button('Room traction off',()=>api.intrusionStudy(false));
  button('Room traction on',()=>api.intrusionStudy(true));
 }
 button('Save current checkpoint',async()=>{await api.persist();status.textContent='Checkpoint saved';});
 button('Resume saved run',async()=>{await api.resumeSaved();status.textContent='Saved run resumed';});
 button('Open failed-night recordings',()=>api.archive());
 button('Record yard escape',()=>start('yard-road'));button('Stop and save',stop);
 button('Record moving drive failure',()=>start('drive',{walk:false}));
 button('Record current view',()=>captureCurrent());
 button('Pause / resume',api.pause);button('Inspect receipts',()=>{receipt.style.display=receipt.style.display==='none'?'block':'none';receipt.textContent=JSON.stringify(inspect(),null,2);});
 button('Hide controls · F8 restores',()=>{panel.style.visibility='hidden';receipt.style.display='none';});
 addEventListener('keydown',event=>{if(event.code!=='F8')return;panel.style.visibility=panel.style.visibility==='hidden'?'visible':'hidden';receipt.style.display='none';event.preventDefault();event.stopImmediatePropagation();document.getElementById('map')?.focus();},true);
 let goalIndex=1,finishedAt=0;
 function tick(now){
  if(recording?.live){composite(recording.canvas,recording.ctx);const s=inspect();
   if(now-lastSample>100){lastSample=now;recording.traces.push({wall:now,...s});status.textContent=`${s.deadline.phase} · ${s.firstStrike?.state?.elapsed?.toFixed(1)||s.clock.value}`;}
   if(guide&&s.firstStrike?.ready){const p=s.firstStrike.state,route=s.entry?.route||[];while(goalIndex<route.length-1&&Math.hypot(p.x-route[goalIndex].x,p.z-route[goalIndex].z)<.25)goalIndex++;
    const target=route[goalIndex];if(target&&!p.safeReached){api.lookAt(target);walking(true);}else{walking(false);if(!lookedBack&&s.entry?.origin){api.lookAt(s.entry.origin);lookedBack=true;}}
   }else walking(false);
   if(s.run?.status==='failed-night'){finishedAt||=now;if(now-finishedAt>1800)void stop();}
   else if(now-recording.started>75000){recording.checks.push({id:'operator-capture-ceiling',passed:false});void stop();}
  }else{goalIndex=1;finishedAt=0;}
  if(receipt.style.display!=='none')receipt.textContent=JSON.stringify(inspect(),null,2);
  requestAnimationFrame(tick);
 }
 document.body.append(panel,receipt);requestAnimationFrame(tick);
 addEventListener('pagehide',()=>{walking(false);if(recording)void stop();},{once:true});
}
