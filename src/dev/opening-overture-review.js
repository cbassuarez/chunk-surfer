// DEV-only evidence controls around the production opening and renderer.
// The guide sends normal press/release events; it never assigns vehicle poses,
// camera poses, film time, parking success or story completion.
export function createOpeningOvertureReview(api){
  const panel=document.createElement('aside');panel.id='opening-review';panel.setAttribute('aria-label','Developer opening review');
  panel.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;background:#101b22ee;color:#dce5e4;padding:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;font:12px system-ui';
  panel.append(document.createTextNode('DEV · unearned opening staging'+(api.silentOutput?' · silent local output':'')));
  panel.dataset.busy='false';panel.dataset.recording='false';
  const status=document.createElement('output');status.id='opening-review-status';panel.append(status);
  const report=document.createElement('pre');report.id='opening-review-receipt';report.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:10001;max-height:130px;overflow:auto;background:#0c151bee;color:#dce5e4;font:11px monospace;margin:0;display:none';
  for(const event of['pointerdown','pointerup','click','keydown','keyup'])panel.addEventListener(event,e=>e.stopPropagation());
  const traces=[],errors=[],inputReceipts=[],pressed=new Set();let recording=null,guide=null,busy=false,lastSample=0;
  const inputReceipt=(code,pressed,origin='guide',trusted=false)=>{if(recording)inputReceipts.push({wall:performance.now(),code,pressed,origin,trusted,phase:api.inspect().montage?.phase||api.inspect().vehicle?.phase||'world'});};
  for(const type of['keydown','keyup'])addEventListener(type,e=>inputReceipt(e.code,type==='keydown','dom',e.isTrusted),{capture:true});
  const press=code=>{inputReceipt(code,true);api.press(code);},releaseKey=code=>{inputReceipt(code,false);api.release(code);};
  addEventListener('error',e=>errors.push({type:'error',message:e.message}));
  addEventListener('unhandledrejection',e=>errors.push({type:'rejection',message:String(e.reason?.stack||e.reason)}));
  const setControls=wanted=>{for(const code of['KeyW','KeyS','KeyA','KeyD','Space','KeyE']){
    if(wanted.has(code)&&!pressed.has(code)){press(code);pressed.add(code);}
    else if(!wanted.has(code)&&pressed.has(code)){releaseKey(code);pressed.delete(code);}
  }};
  const release=()=>setControls(new Set());
  const button=(label,action)=>{const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{if(busy)return;busy=true;panel.dataset.busy='true';b.disabled=true;try{await action();}catch(error){errors.push({message:String(error.stack||error)});report.style.display='block';report.textContent=JSON.stringify(errors,null,2);}finally{busy=false;panel.dataset.busy='false';b.disabled=false;document.getElementById('map')?.focus();}};panel.append(b);return b;};
  const sample=()=>{const s=api.inspect(),v=s.vehicle,m=s.montage;return{revision:s.revision,wall:performance.now(),scene:s.scene,position:s.position,view:s.renderCamera,
    vehicle:v?{phase:v.phase,reveal:v.reveal,anchor:v.anchor,eye:v.eye,yaw:v.yaw,pitch:v.pitch,drive:v.drive,parked:v.parked,canExit:v.canExit,focus:v.focus}:null,
    montage:m?{phase:m.phase,elapsed:m.elapsed,paused:m.paused,presentationHeld:m.presentationHeld,shotId:m.frame?.shotId,eye:m.frame?.eye,yaw:m.frame?.yaw,pitch:m.frame?.pitch,lens:m.frame?.lens}:null,
    score:s.score,audio:s.audio,flags:s.flags,assets:s.assets,silentOutput:s.silentOutput,staging:s.staging,cabInspection:s.cabInspection,cabObjects:s.cabObjects,nightClock:s.nightClock,playDuration:s.playDuration};};
  const post=async(name,blob)=>{const response=await fetch('/__opening-overture/'+name,{method:'POST',body:blob});if(!response.ok)throw Error(await response.text());return response.json();};
  function composite(canvas,ctx){
    const host=document.getElementById('wrap'),rect=host.getBoundingClientRect();
    if(canvas.width!==Math.round(rect.width)||canvas.height!==Math.round(rect.height)){canvas.width=Math.round(rect.width);canvas.height=Math.round(rect.height);}
    ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    const layers=[...host.querySelectorAll('canvas')].filter(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width&&r.height&&s.display!=='none'&&s.visibility!=='hidden';}).sort((a,b)=>(parseFloat(getComputedStyle(a).zIndex)||0)-(parseFloat(getComputedStyle(b).zIndex)||0));
    for(const layer of layers){const r=layer.getBoundingClientRect();ctx.globalAlpha=Number(getComputedStyle(layer).opacity||1);ctx.drawImage(layer,r.left-rect.left,r.top-rect.top,r.width,r.height);}ctx.globalAlpha=1;
  }
  async function stop(){
    if(!recording)return;const r=recording;recording=null;panel.dataset.recording='false';guide=null;release();r.live=false;r.recorder.stop();
    await r.ended;for(const t of r.stream.getTracks())t.stop();r.audio?.dispose();r.unobserve?.();
    const name='opening-final-'+Date.now(),blob=new Blob(r.chunks,{type:r.recorder.mimeType}),extension=r.recorder.mimeType.includes('mp4')?'mp4':'webm';
    await post(name+'.'+extension,blob);await post(name+'.png',await new Promise(ok=>r.canvas.toBlob(ok,'image/png')));
    await post(name+'.json',new Blob([JSON.stringify({kind:r.kind,fixture:true,
      disclosure:r.kind==='production-night-clock-capture'?'Developer staging at 21:38:55. Ordinary game movement and pause inputs afterward; production clock, collision and final HUD. No pose or time writes after staging. Not human/native-package acceptance.':'Developer initial staging. Ordinary game press/release inputs afterward; production physics, score, montage and first-step handoff. No pose or time writes after staging. Not human/native acceptance.',
      ...api.captureMetadata(),sourceManifest:r.manifest,videoFile:name+'.'+extension,
      width:r.canvas.width,height:r.canvas.height,seconds:(performance.now()-r.started)/1000,guide:r.guideResult,clockCheck:r.clockCheck||null,errors,traces,inputReceipts,
      rendererFramePacing:{source:'renderer-submit-cpu-clock',disclosure:'Intervals between actual post-pass draw submissions in this runtime; excludes GPU completion and OS compositor timing.',frames:r.frames},
    },null,2)],{type:'application/json'}));
    status.textContent='Saved '+name;panel.dataset.saved=name;
  }
  async function startRecording({holdCab=false,parkedCab=false,nightClock=false}={}){
    release();traces.length=0;errors.length=0;inputReceipts.length=0;
    const manifest=await fetch('/__opening-overture/manifest').then(r=>r.json());if(nightClock)await api.stageNightClock();else if(parkedCab)await api.stageParkedCab();else await api.stage();
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');composite(canvas,ctx);
    const audio=api.captureAudio(),video=canvas.captureStream(30),stream=new MediaStream([...video.getVideoTracks(),...(audio?.stream.getAudioTracks()||[])]);
    const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm'].find(s=>MediaRecorder.isTypeSupported(s));
    if(!mimeType)throw Error('This runtime cannot record the game canvas and sound.');
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:3000000,audioBitsPerSecond:160000}),r={canvas,ctx,audio,stream,recorder,chunks:[],started:performance.now(),live:true,guideResult:null,manifest,frames:[],kind:nightClock?'production-night-clock-capture':'production-opening-guided-capture'};
    r.unobserve=api.observePresentation(wall=>{if(r.live)r.frames.push({wall,phase:api.inspect().montage?.frame?.shotId||api.inspect().vehicle?.phase||'world'});});
    r.ended=new Promise(ok=>recorder.onstop=ok);recorder.ondataavailable=e=>{if(e.data.size)r.chunks.push(e.data);};recording=r;recorder.start(250);panel.dataset.recording='true';
    guide=parkedCab||nightClock?null:{waypoint:0,exitSent:false,firstStepAt:null,doneAt:null,holdCab};status.textContent=nightClock?'Recording staged night clock · 21:38:55':parkedCab?'Recording staged parked cab · manual input':'Recording ordinary-input route';
  }
  button('Stage opening',async()=>{release();guide=null;await api.stage();});
  button('Record guided arrival',startRecording);button('Stop and save',stop);
  button('Record arrival / hold cab',()=>startRecording({holdCab:true}));
  button('Record parked cab (QA)',()=>startRecording({parkedCab:true}));
  button('Record night clock (QA)',()=>startRecording({nightClock:true}));
  button('Stage parked cab (QA)',async()=>{release();guide=null;await api.stageParkedCab?.();});
  button('Look at job paper (QA)',()=>api.lookAtCabPaper?.());
  const cabObjectSelect=document.createElement('select');cabObjectSelect.setAttribute('aria-label','Cab object to inspect');
  for(const object of api.getCabObjects?.()||[]){const option=document.createElement('option');option.value=object.id;option.textContent=object.label;cabObjectSelect.append(option);}panel.append(cabObjectSelect);
  button('Look at selected object (QA)',()=>api.lookAtCabObject?.(cabObjectSelect.value));
  button('E · inspect / exit',()=>{press('KeyE');releaseKey('KeyE');});
  const observeFor=milliseconds=>new Promise(resolve=>{const until=performance.now()+milliseconds;function frame(){if(performance.now()>=until)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  button('Check clock walk / pause (QA)',async()=>{
    if(recording?.kind!=='production-night-clock-capture')throw Error('Start a night-clock recording first.');
    const r=recording,check=r.clockCheck={};
    try{
      await observeFor(500);check.before=sample();
      press('KeyW');await observeFor(1800);releaseKey('KeyW');check.walked=sample();
      if(Math.hypot(check.walked.position.x-check.before.position.x,check.walked.position.y-check.before.position.y)<.03){
        check.blockedForward=check.walked;press('KeyS');await observeFor(1800);releaseKey('KeyS');check.walked=sample();
      }
      if(Math.hypot(check.walked.position.x-check.before.position.x,check.walked.position.y-check.before.position.y)<.03)throw Error('Ordinary movement did not change the player position.');
      if(check.walked.nightClock.rate<1.2)throw Error('Accepted walking did not accelerate the clock.');
      await observeFor(3000);check.settled=sample();
      api.pause();await observeFor(400);check.paused=sample();
      if(!check.paused.nightClock.paused)throw Error('The ordinary pause menu did not pause.');
      await observeFor(1700);check.held=sample();
      if(check.held.nightClock.elapsedSeconds!==check.paused.nightClock.elapsedSeconds)throw Error('Night time advanced while paused.');
      press('Escape');releaseKey('Escape');await observeFor(1400);check.resumed=sample();
      if(check.resumed.nightClock.paused||check.resumed.nightClock.elapsedSeconds<=check.held.nightClock.elapsedSeconds)throw Error('Night time did not resume.');
      r.guideResult='completed-clock-walk-pause';
    }catch(error){r.guideResult='failed-clock-check';throw error;}
    finally{releaseKey('KeyW');await stop();}
  });
  button('Tour cab objects (QA)',async()=>{
    if(!recording)throw Error('Start a parked-cab recording first.');
    for(const object of api.getCabObjects?.()||[]){
      if(api.inspect().cabInspection){press('KeyE');releaseKey('KeyE');await observeFor(250);}
      if(api.inspect().vehicle?.phase!=='parked'||!api.lookAtCabObject?.(object.id))throw Error('Cab is not parked for '+object.id);
      await observeFor(650);
      if(api.inspect().vehicle?.focus?.id!==object.id)throw Error('The visible aim did not focus '+object.id);
      press('KeyE');releaseKey('KeyE');await observeFor(350);
      if(api.inspect().cabInspection?.objectId!==object.id)throw Error('E did not inspect '+object.id);
      await observeFor(1200);press('KeyE');releaseKey('KeyE');await observeFor(250);
    }
    if(recording)recording.guideResult='completed-direct-physical-object-tour';
  });
  const shotTime=id=>{const shot=api.shots?.find(s=>s.id===id);return shot?shot.start+Math.min(.5,shot.duration/2):0;};
  let studyStage='post-print',studyTime=shotTime('room-b3');
  const lensSelect=document.createElement('select');lensSelect.setAttribute('aria-label','Lens study treatment');
  for(const [value,label]of[['off','Lens: sharp'],['pre-print','Lens: before print'],['post-print','Lens: after print']]){const o=document.createElement('option');o.value=value;o.textContent=label;lensSelect.append(o);}lensSelect.value=studyStage;lensSelect.onchange=()=>{studyStage=lensSelect.value;};panel.append(lensSelect);
  button('Lens study B3',()=>{release();guide=null;studyTime=shotTime('room-b3');return api.stageShot(studyTime,studyStage);});
  button('Lens study pub',()=>{release();guide=null;studyTime=shotTime('pub-evening');return api.stageShot(studyTime,studyStage);});
  button('Save study frame',async()=>{const canvas=document.createElement('canvas');composite(canvas,canvas.getContext('2d'));const name='opening-lens-'+(studyTime<4.5?'pub':'b3')+'-'+studyStage+'-'+Date.now();
    await post(name+'.png',await new Promise(ok=>canvas.toBlob(ok,'image/png')));await post(name+'.json',new Blob([JSON.stringify({kind:'matched-gameplay-lens-study',fixture:true,time:studyTime,treatment:studyStage,receipt:sample(),errors},null,2)],{type:'application/json'}));panel.dataset.saved=name;});
  for(const shot of api.shots||[])button(shot.id+' shot',()=>{release();guide=null;return api.stageShot(shotTime(shot.id));});
  button('Pause / resume',()=>api.pause());
  button('Inspect receipts',()=>{report.style.display=report.style.display==='none'?'block':'none';report.textContent=JSON.stringify(sample(),null,2);});
  const waypoints=[[-8,18],[-7.7,15.6],[-6.5,12.9],[-4,10.8],[-1,10],[7,10],[16,8]];
  function drive(s){
    const v=s.vehicle,m=s.montage;
    if(guide.firstStepAt){
      if(performance.now()-guide.firstStepAt<80)setControls(new Set(['KeyW']));
      else{release();guide.doneAt??=performance.now();}
      if(guide.doneAt&&performance.now()-guide.doneAt>1300){if(recording)recording.guideResult='completed-through-first-person-step';void stop();}return;
    }
    if(v?.drive&&v.reveal>=1&&['driving','parked'].includes(v.phase)){
      if(v.canExit){release();if(guide.holdCab){guide=null;status.textContent='Parked · optional cab inspection';return;}if(!guide.exitSent){press('KeyE');releaseKey('KeyE');guide.exitSent=true;}return;}
      const d=v.drive;
      while(guide.waypoint<waypoints.length-1&&Math.hypot(d.x-waypoints[guide.waypoint][0],d.z-waypoints[guide.waypoint][1])<1.8)guide.waypoint++;
      const target=waypoints[guide.waypoint],yaw=Math.atan2(target[0]-d.x,-(target[1]-d.z)),error=Math.atan2(Math.sin(yaw-d.heading),Math.cos(yaw-d.heading));
      // Finish inside the real bay before the deliberate stop. A fixed early
      // braking point previously left the guide15cm short at another frame
      // cadence. The production parking gate correctly refused that pose.
      const brake=guide.waypoint===waypoints.length-1&&d.x>14.7||Math.abs(error)>.32&&d.speed>3;
      setControls(new Set([brake?'Space':'KeyW',...(error>.035?['KeyD']:error<-.035?['KeyA']:[])]));return;
    }
    release();
    if(m?.phase==='held'&&!guide.firstStepAt){guide.firstStepAt=performance.now();press('KeyW');pressed.add('KeyW');}
    if(guide.doneAt&&performance.now()-guide.doneAt>1300){if(recording)recording.guideResult='completed-through-first-person-step';void stop();}
  }
  function tick(now){
    if(recording?.live)composite(recording.canvas,recording.ctx);
    if(now-lastSample>100){lastSample=now;const s=sample();if(recording)traces.push(s);status.textContent=s.vehicle?'Vehicle · '+s.vehicle.phase:s.montage?'Film · '+s.montage.shotId+' · '+s.montage.elapsed.toFixed(2):s.scene||'First person';panel.dataset.phase=s.vehicle?.phase||s.montage?.phase||s.scene||'world';if(report.style.display!=='none')report.textContent=JSON.stringify(s,null,2);if(guide)drive(s);}
    if(recording&&now-recording.started>100000){recording.guideResult='timeout';void stop();}
    requestAnimationFrame(tick);
  }
  document.body.append(panel,report);requestAnimationFrame(tick);
  addEventListener('pagehide',()=>{release();if(recording)void stop();},{once:true});
}
