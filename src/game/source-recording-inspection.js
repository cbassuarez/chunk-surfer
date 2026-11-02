import * as scenes from './scenes.js';

export const SOURCE_RECORDING_INSPECTION='source-recording-inspection';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const number=(n,f=0)=>typeof n==='number'&&Number.isFinite(n)?n:f;
const copy=value=>JSON.parse(JSON.stringify(value));
const keyOf=e=>String(e?.key||e?.code||'').toLowerCase().replace(/^key/,'');
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const CONTROLS=new Set(['play','stop','rewind','forward','flip','take','put-back','rec','takes','shutter','device']);
const movement=new Set(['arrowleft','arrowright','arrowup','arrowdown','q','c']);

export function sourceRecordingInspectionIdentity(recording){
 if(!recording||typeof recording.id!=='string'||typeof recording.takeId!=='string'||typeof recording.takeKey!=='string'
  ||!recording.destination||!['II','III'].includes(recording.destination.chapter))throw Error('The cassette has no matching Source recording receipt.');
 const original=recording.take||{},metadata={id:original.id,ordinal:original.ordinal,roomId:original.roomId,
  startSeconds:original.startSeconds,endSeconds:original.endSeconds,durationSeconds:original.durationSeconds,slate:original.slate||null};
 const row=copy({...recording,take:metadata}),take=row.take||{},slate=row.slate||take.slate||null;
 const slateText=[slate?.text,slate?.spokenText,slate?.label].find(value=>typeof value==='string'&&value.trim())||'';
 return{...row,slate,slateText,takeOrdinal:Math.max(1,Math.floor(number(row.takeOrdinal,number(take.ordinal,1)))),
  place:typeof row.place==='string'?row.place:typeof take.place==='string'?take.place:'',roomId:row.roomId||take.roomId||'',
  durationSeconds:Math.max(0,number(row.durationSeconds,number(take.durationSeconds))),
  tapeId:row.takeId,side:'INDEX',format:'AUDIOCORP FIELD CARTRIDGE',sourceChapter:row.chapter||null};
}

// The renderer owns the physical cartridge, DA-1000 and their final acquisition.
// This owner handles only temporary inspection intent. It never edits the tape
// or grants recovery by looking, rotating, scrubbing or auditioning a recording.
export function createSourceRecordingInspectionScene({recording:recordingValue,renderer,
 onAudition=()=>null,onRecover=()=>false,onExit=()=>{},onError=()=>{},onTrace=()=>{},presentation=()=>({})}={}){
 if(typeof renderer?.render!=='function')throw Error('The cassette inspection needs its physical renderer.');
 const recording=sourceRecordingInspectionIdentity(recordingValue);
 let ready=false,closed=false,paused=false,initializing=null,committing=false,recovered=false,exitReason='removed',exitDelivered=false,
  yaw=0,pitch=0,roll=0,zoom=1,positionSeconds=0,durationSeconds=recording.durationSeconds,available=null,playing=false,
  selectedControl=null,pressedControl=null,pressedAmount=0,notice='',error=null,elapsed=0,transport=null,auditionGeneration=0,
  loadingAudio=false,reelAngle=[0,0],flipTarget=null,drag=null,mediaDocked=false,dockProgress=0,shutterOpen=0,inspectDevice=false,deviceYaw=0,devicePitch=0,deviceRoll=0,auditionPreparation=null;
 const keys=new Set(),p=()=>presentation()||{},held=()=>{const v=p();return paused||v.paused||v.hidden||v.focused===false||v.foreground===false||v.protected===true;},
  deadlinePending=()=>p().deadlinePending===true,recorderAvailable=()=>p().recorderAvailable!==false,
  live=()=>ready&&!closed&&!committing&&!error&&!held()&&renderer.ready?.()!==false,
  trace=(type,extra={})=>onTrace({type,receiptId:recording.id,takeId:recording.takeId,...extra});
 const clear=()=>{keys.clear();drag=null;pressedControl=null;pressedAmount=0;};
 function report(err){error=String(err?.message||err);notice='VIEW UNAVAILABLE';clear();stopAudition();onError(err);}
 function readTransport(){
  if(!transport)return;
  let snapshot;
  try{snapshot=transport.snapshot?.()||{};}catch(err){stopAudition();available=false;notice='NO RECORDED SIGNAL';onError(err);return;}
  if(snapshot.available===false){stopAudition();available=false;playing=false;notice='NO RECORDED SIGNAL';return;}
  const prior=positionSeconds;positionSeconds=clamp(number(snapshot.positionSeconds,positionSeconds),0,Math.max(0,number(snapshot.durationSeconds,durationSeconds)));
  durationSeconds=Math.max(0,number(snapshot.durationSeconds,durationSeconds));playing=snapshot.playing===true&&!snapshot.paused;
  if(snapshot.available===true)available=true;
  const turns=(positionSeconds-prior)*2.6;reelAngle=[reelAngle[0]+turns,reelAngle[1]+turns];
 }
 function stopAudition(){
  auditionGeneration++;loadingAudio=false;
  const preparation=auditionPreparation;auditionPreparation=null;preparation?.abort();
  const old=transport;transport=null;playing=false;
  try{Promise.resolve(old?.stop?.()).catch(onError);}catch(err){onError(err);}
 }
 function suspendAudition(){
  readTransport();playing=false;
  if(transport?.pause){try{Promise.resolve(transport.pause()).catch(err=>{stopAudition();onError(err);});}catch(err){stopAudition();onError(err);}}
  else stopAudition();
 }
 function frame(){
  return{recording:copy(recording),yaw,pitch,roll,zoom,side:Math.abs(Math.cos(yaw)*Math.cos(pitch))<.24?'edge':Math.cos(yaw)*Math.cos(pitch)>=0?'front':'back',
   reelAngle:[...reelAngle],tapeFraction:durationSeconds>0?clamp(positionSeconds/durationSeconds,0,1):0,
   recorderAvailable:recorderAvailable(),mediaDocked,dockProgress,shutterOpen:Math.max(shutterOpen*(1-dockProgress),clamp((dockProgress-.7)/.3,0,1)),inspectDevice,deviceYaw,devicePitch,deviceRoll,
   playing,available,positionSeconds,durationSeconds,selectedControl,pressedControl,pressedAmount,notice,error,
   ready:ready&&!closed,paused:held(),deadlinePending:deadlinePending(),loadingAudio,committing,recovered,elapsed,showTransport:recorderAvailable()};
 }
 function finish(reason){
  if(closed)return false;exitReason=reason;stopAudition();clear();
  if(!scenes.remove(scene))scene.exit();return true;
 }
 async function toggleAudition(){
  if(!live())return false;
  if(!recorderAvailable()){recorderMissing();return false;}
  if(loadingAudio)return false;
  if(deadlinePending()){readTransport();finish('deadline');return true;}
  mediaDocked=true;shutterOpen=0;inspectDevice=true;
  if(transport){
   readTransport();if(playing){suspendAudition();notice='PAUSED';return true;}
   if(available===false){stopAudition();return false;}
   if(typeof transport.resume==='function'){
    try{await transport.resume();if(closed||held()||!recorderAvailable()){if(!recorderAvailable())recorderMissing();else suspendAudition();return false;}readTransport();notice='';return true;}catch(err){stopAudition();available=false;notice='NO RECORDED SIGNAL';onError(err);return false;}
   }
   stopAudition();
  }
  const generation=++auditionGeneration,preparation=new AbortController();auditionPreparation=preparation;loadingAudio=true;notice='';
  try{
   const result=await onAudition({recording:copy(recording),positionSeconds,readOnly:true,signal:preparation.signal});
   if(auditionPreparation===preparation)auditionPreparation=null;
   if(generation!==auditionGeneration||closed||held()||committing||!recorderAvailable()){result?.stop?.();if(!recorderAvailable()&&!closed)recorderMissing();return false;}
   loadingAudio=false;
   if(!result||result.available===false){result?.stop?.();available=false;playing=false;notice='NO RECORDED SIGNAL';return false;}
   transport=result;readTransport();trace('audition',{positionSeconds,available,playing});return true;
  }catch(err){if(auditionPreparation===preparation)auditionPreparation=null;if(generation===auditionGeneration&&!closed){loadingAudio=false;available=false;playing=false;notice='NO RECORDED SIGNAL';onError(err);}return false;}
 }
 function seekBy(seconds){
  if(!live()||deadlinePending())return false;
  const prior=positionSeconds;positionSeconds=clamp(positionSeconds+number(seconds),0,durationSeconds);const turns=(positionSeconds-prior)*2.6;reelAngle=[reelAngle[0]+turns,reelAngle[1]+turns];
  if(transport?.seek)try{Promise.resolve(transport.seek(positionSeconds)).catch(err=>{stopAudition();available=false;notice='NO RECORDED SIGNAL';onError(err);});}catch(err){stopAudition();available=false;notice='NO RECORDED SIGNAL';onError(err);}
  trace('reel-cue',{positionSeconds});return true;
 }
 async function retain(){
  if(!live())return false;if(deadlinePending()){finish('deadline');return false;}committing=true;notice='';clear();stopAudition();
  try{
   const result=await onRecover({receiptId:recording.id,takeId:recording.takeId,takeKey:recording.takeKey,chapter:recording.destination.chapter,locationId:recording.destination.locationId});
   if(closed)return false;
   if(result!==true&&result?.handled!==true){committing=false;notice='NOT RETURNED';return false;}
   recovered=true;committing=false;trace('retained');finish('recovered');return true;
  }catch(err){if(!closed){committing=false;notice='NOT RETURNED';onError(err);}return false;}
 }
 function activate(id){
  if(!CONTROLS.has(id)||!live())return false;selectedControl=id;pressedControl=id;pressedAmount=1;
  if(id==='take')return retain();if(id==='put-back')return finish('put-back');
  if(id==='play'||id==='takes')return toggleAudition();
  if(id==='rec'){notice=recorderAvailable()?'RETURNED TAKE · READ ONLY':'RECORDER MISSING';return true;}
  if(id==='device'){if(!recorderAvailable()){recorderMissing();return true;}inspectDevice=!inspectDevice;flipTarget=null;return true;}
  if(id==='shutter'){if(!mediaDocked&&dockProgress<.03)shutterOpen=shutterOpen?0:1;return true;}if(id==='stop'){stopAudition();notice='STOPPED';if(deadlinePending())finish('deadline');return true;}
  if(id==='rewind')return seekBy(-5);if(id==='forward')return seekBy(5);
  if(id==='flip'){if(!inspectDevice)withdraw();const target=(inspectDevice?deviceYaw:yaw)+Math.PI;if(p().reducedMotion){if(inspectDevice)deviceYaw=angle(target);else yaw=angle(target);flipTarget=null;}else flipTarget={angle:target,device:inspectDevice};return true;}
  return true;
 }
 function recorderMissing(){stopAudition();mediaDocked=false;dockProgress=0;inspectDevice=false;flipTarget=null;notice='RECORDER MISSING';}
 function withdraw(){if(mediaDocked){suspendAudition();mediaDocked=false;}return true;}
 function turn(dx,dy,dz=0){
  if(inspectDevice){deviceYaw=angle(deviceYaw+dx);devicePitch=angle(devicePitch+dy);deviceRoll=angle(deviceRoll+dz);}
  else{withdraw();yaw=angle(yaw+dx);pitch=angle(pitch+dy);roll=angle(roll+dz);}
 }
 const scene={id:SOURCE_RECORDING_INSPECTION,blocksWorld:true,blocksInput:true,freezesBelow:true,suppressesHud:true,
  worldPresentation:'hidden',handlesEscape:true,lookProfile:'inspect',allowsLook:false,
  initialize(){
   if(initializing)return initializing;
   initializing=Promise.resolve().then(()=>renderer.initialize?.(recording)).then(ok=>{if(closed)return false;if(ok===false)throw Error('The cassette model could not be held.');ready=true;trace('opened');return true;}).catch(err=>{if(!closed)report(err);return false;});return initializing;
  },enter(){void scene.initialize();},
  update(dt){
   if(closed)return;
   if(held()){clear();suspendAudition();return;}
   if(!recorderAvailable()){if(transport||loadingAudio||mediaDocked)recorderMissing();else{inspectDevice=false;dockProgress=0;notice='RECORDER MISSING';}}
   else if(notice==='RECORDER MISSING')notice='';
   readTransport();
   // Only an already sounding, admitted interval may finish across06:00. A
   // silent inspection or paused preview cannot hold the failed night forever.
   if(deadlinePending()&&!playing){finish('deadline');return;}
   if(!live())return;
   const step=clamp(number(dt),0,.1);elapsed+=step;pressedAmount=Math.max(0,pressedAmount-step*9);if(!pressedAmount)pressedControl=null;
   const targetDock=mediaDocked?1:0;dockProgress=p().reducedMotion?targetDock:dockProgress+Math.sign(targetDock-dockProgress)*Math.min(Math.abs(targetDock-dockProgress),step*1.65);
   const dx=(Number(keys.has('arrowright'))-Number(keys.has('arrowleft')))*step*1.65,
    dy=(Number(keys.has('arrowup'))-Number(keys.has('arrowdown')))*step*1.65,dz=(Number(keys.has('c'))-Number(keys.has('q')))*step*1.4;
   if(dx||dy||dz)turn(dx,dy,dz);
   if(flipTarget!==null){const current=flipTarget.device?deviceYaw:yaw,delta=angle(flipTarget.angle-current),amount=Math.min(Math.abs(delta),step*6.8),value=angle(current+Math.sign(delta)*amount);
    if(flipTarget.device)deviceYaw=value;else yaw=value;if(Math.abs(delta)<.005||amount===Math.abs(delta))flipTarget=null;}
  },
  view:()=>({...frame(),closed}),serialize:()=>({schema:1,receiptId:recording.id,takeId:recording.takeId,takeKey:recording.takeKey,yaw,pitch,roll,zoom,positionSeconds}),
  lookAngles:()=>({yaw,pitch}),lookBy(dx=0,dy=0){if(!live())return false;flipTarget=null;turn(number(dx),number(dy));return true;},
  setLook(value={}){if(!live())return false;flipTarget=null;if(inspectDevice){deviceYaw=angle(number(value.yaw,deviceYaw));devicePitch=angle(number(value.pitch,devicePitch));}else{withdraw();yaw=angle(number(value.yaw,yaw));pitch=angle(number(value.pitch,pitch));}return true;},
  pause(){if(closed)return false;paused=true;clear();suspendAudition();return true;},resume(){if(closed)return false;paused=false;clear();return true;},blur(){return scene.pause();},focus(){return scene.resume();},
  key(e={}){
   const key=keyOf(e);if((key==='escape'||e.controllerAction==='back')&&!committing){finish('put-back');return true;}
   if(!live()||e.ctrlKey||e.metaKey||e.altKey||e.repeat)return true;
   if(movement.has(key)){keys.add(key);flipTarget=null;return true;}
   const id=e.controllerAction==='confirm'?'take':e.controllerAction==='interact'?'take':key==='e'||key==='enter'?'take'
    :key===' '||key==='space'||key==='p'?'play':key==='v'?'device':key==='f'?'flip':key==='r'?'rewind':key==='t'?'forward':key==='s'?'stop':null;
   if(id)void activate(id);return true;
  },keyup(e={}){keys.delete(keyOf(e));return true;},
  pointer(e={}){
   if(!live()){drag=null;return true;}const x=number(e.clientX,number(e.x)),y=number(e.clientY,number(e.y)),hit=renderer.hitTest?.(x,y,frame()),id=typeof hit==='string'?hit:hit?.id;
   if(e.type==='pointermove'){
    if(drag){const dx=x-drag.x,dy=y-drag.y;scene.lookBy(dx*.008,-dy*.008);drag={...drag,x,y};}
    else selectedControl=CONTROLS.has(id)?id:null;
   }
   if(e.type==='pointerdown'&&(e.button??e.originalEvent?.button??0)===0){
    if(CONTROLS.has(id))void activate(id);else{flipTarget=null;drag={x,y,reel:null};}
   }
   if(e.type==='wheel'){zoom=clamp(zoom-number(e.deltaY)*.0015,.65,1.5);e.preventDefault?.();}
   if(e.type==='pointerup'||e.type==='pointercancel')drag=null;return true;
  },
  activate,seekBy,
  render(){if(closed)return;const value=frame();if(ready)try{if(renderer.render(value)===false)throw Error('The cassette view was interrupted.');renderer.drawUI?.(value);}catch(err){ready=false;report(err);}},
  exit(){if(closed)return;closed=true;stopAudition();clear();try{renderer.dispose?.();}finally{if(!exitDelivered){exitDelivered=true;onExit({reason:exitReason,recovered,recording:copy(recording)});}}},
 };return scene;
}
