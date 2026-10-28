import {SOURCE_PUB,sourcePubRound,sourcePubStretch,sourcePubStations,sourcePubTask,sourcePubFloorHoles,sourcePubFallProgress} from '../data/source-pub.js';
import {uiSize,uiText,uiCenter,uiFill} from '../render/ui.js';

const clone=value=>JSON.parse(JSON.stringify(value)),clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const heading=value=>Math.atan2(Math.sin(value),Math.cos(value));
const pose=value=>{
  if(!value||!finite(value.x)||!finite(value.y))return null;
  if(['z','yaw','pitch','facing','floorH','eyeHeight'].some(key=>value[key]!=null&&!finite(value[key])))return null;
  try{return clone(value);}catch{return null;}
};
export function freshSourcePubCheckpoint({runId='',returnPose=null}={}){
  return{version:2,encounterId:SOURCE_PUB.encounterId,runId:String(runId),status:'not-started',returnPose:pose(returnPose),
    ...SOURCE_PUB.spawn,stage:0,task:0,layer:0,carried:null,fall:null,itemFall:null,fallenItem:null,caption:null,elapsed:0,completed:false};
}
export function normalizeSourcePubCheckpoint(value,{runId,returnPose}={}){
  const fresh=freshSourcePubCheckpoint({runId:runId??value?.runId??'',returnPose});
  if(!value||![1,2].includes(value.version)||value.encounterId!==SOURCE_PUB.encounterId||runId!=null&&String(runId)!==String(value.runId))return fresh;
  if(value.version===1){
    const oldStage=value.stage,oldTask=value.task;
    if(!Number.isInteger(oldStage)||oldStage<0||oldStage>3||!Number.isInteger(oldTask)||oldTask<0||oldTask>2)return fresh;
    const stage=[0,2,3,SOURCE_PUB.rounds.length][oldStage],task=oldStage===2?6+oldTask:oldStage===3?0:oldTask,oldStretch=[1,1.35,1.8,1.8][oldStage],stretch=sourcePubStretch({stage});
    value={...value,version:2,stage,task,x:value.x/oldStretch*stretch,layer:oldStage>=2?2:0,fall:null,itemFall:null,fallenItem:null,
      carried:oldTask===1?(oldStage===0?'waters':'empty-tray'):oldTask===2?'empty-tray':null};
    if(oldStage===1&&oldTask===2)value={...value,carried:null,fallenItem:{kind:'tray',layer:1,x:1.8*stretch+1.4,z:1.25}};
  }
  const savedPose=pose(value.returnPose),stage=value.stage,task=value.task;
  if(!['not-started','active','returned'].includes(value.status)||!Number.isInteger(stage)||stage<0||stage>SOURCE_PUB.rounds.length||!Number.isInteger(task)||task<0||task>=(stage===SOURCE_PUB.rounds.length?1:sourcePubRound(stage).tasks.length)
    ||![value.x,value.z,value.yaw,value.pitch].every(finite)||value.status!=='not-started'&&!savedPose)return fresh;
  const stretch=sourcePubStretch(value),normalized={...fresh,status:value.status,returnPose:savedPose||fresh.returnPose,
    x:clamp(value.x,.40,16*stretch-.40),z:clamp(value.z,.40,5.02),yaw:heading(value.yaw),pitch:clamp(value.pitch,-.80,.75),
    stage,task,layer:Number.isInteger(value.layer)&&value.layer>=0&&value.layer<=2?value.layer:sourcePubRound(stage).layer,
    carried:[null,'waters','empty-tray','barrel'].includes(value.carried)?value.carried:null,
    caption:typeof value.caption==='string'?value.caption.slice(0,280):null,
    elapsed:clamp(value.elapsed,0,1e8),completed:value.status==='returned'&&stage===SOURCE_PUB.rounds.length&&value.completed===true};
  const landing=(point,layer)=>finite(point?.x)&&finite(point?.z)&&sourcePubCanOccupy(point.x,point.z,{...normalized,layer})?{x:point.x,z:point.z}:null;
  const transition=(v,item=false)=>{
    if(!v||!Number.isInteger(v.fromLayer)||!Number.isInteger(v.toLayer)||v.fromLayer<0||v.toLayer>2||v.toLayer!==v.fromLayer+1||!finite(v.elapsed)||!(item?['tray','barrel'].includes(v.kind):v.kind==='player')||!item&&v.fromLayer!==normalized.layer)return null;
    const at=landing(v.landing,v.toLayer);if(!at)return null;
    const duration=item?SOURCE_PUB.itemFallDuration:SOURCE_PUB.fallDuration;
    const result={elapsed:clamp(v.elapsed,0,duration),duration,fromLayer:v.fromLayer,toLayer:v.toLayer,landing:at,kind:v.kind};
    if(!item){const origin=v.origin||normalized;if(!finite(origin.x)||!finite(origin.z)||!sourcePubCanOccupy(origin.x,origin.z,{...normalized,fall:result}))return null;result.origin={x:origin.x,z:origin.z};}
    return result;
  };
  normalized.fall=transition(value.fall);normalized.itemFall=transition(value.itemFall,true);
  // Valid falls own their bounded trajectory through the opening. All other
  // checkpoints must stand on actual floor rather than inside a void or wall.
  if(normalized.fall){const f=normalized.fall,p=sourcePubFallProgress(f).crossing;normalized.x=f.origin.x+(f.landing.x-f.origin.x)*p;normalized.z=f.origin.z+(f.landing.z-f.origin.z)*p;}
  else if(!sourcePubCanOccupy(normalized.x,normalized.z,normalized)){normalized.x=SOURCE_PUB.spawn.x*stretch;normalized.z=SOURCE_PUB.spawn.z;}
  const fallen=value.fallenItem,at=landing(fallen,fallen?.layer);if(at&&['tray','barrel'].includes(fallen.kind)&&Number.isInteger(fallen.layer)&&fallen.layer>=0&&fallen.layer<=2)normalized.fallenItem={kind:fallen.kind,layer:fallen.layer,...at};
  return normalized;
}
function hasFlag(flags,name){return flags instanceof Set?flags.has(name):Array.isArray(flags)?flags.includes(name):flags?.[name]===true;}
export function sourcePubEligible({flags,checkpoint,runId}={}){
  if(!hasFlag(flags,SOURCE_PUB.unlockFlag))return false;
  return !normalizeSourcePubCheckpoint(checkpoint,{runId}).completed;
}
export function sourcePubEntry(options={}){
  if(!sourcePubEligible(options))return null;
  const saved=normalizeSourcePubCheckpoint(options.checkpoint,{runId:options.runId,returnPose:options.returnPose});
  const returnPose=pose(options.returnPose)||saved.returnPose;if(!returnPose)return null;
  return{...saved,status:'active',returnPose,completed:false};
}
export function sourcePubCanOccupy(x,z,state){
  if(!finite(x)||!finite(z))return false;
  const scale=sourcePubStretch(state),radius=SOURCE_PUB.bodyRadius;
  if(x<.40||x>16*scale-.40||z<.40||z>5.02)return false;
  // The closed WC is a memory here; its actual partitions remain visible.
  if(x>14*scale-radius&&z>2.64-radius)return false;
  const layer=Number.isInteger(state?.layer)?state.layer:sourcePubRound(state?.stage).layer;
  if(!state?.fall&&sourcePubFloorHoles(state).some(h=>h.layer===layer&&Math.abs(x-h.x)<h.radius+radius&&Math.abs(z-h.z)<h.radius+radius))return false;
  return !SOURCE_PUB.furniture.some(f=>{
    const b=f.bounds,x0=(b.z0+32)*scale,x1=(b.z1+32)*scale,z0=-b.x1,z1=-b.x0;
    return x>x0-radius&&x<x1+radius&&z>z0-radius&&z<z1+radius;
  });
}
export function focusedSourcePubStation(state){
  if(!state||state.status!=='active'||state.fall)return null;
  let best=null;
  for(const station of sourcePubStations(state)){
    const dx=station.x-state.x,dz=station.z-state.z,distance=Math.hypot(dx,dz);
    const dot=(Math.sin(state.yaw)*dx-Math.cos(state.yaw)*dz)/Math.max(.001,distance);
    const targetPitch=Math.atan2(station.y-(SOURCE_PUB.floor+SOURCE_PUB.eyeHeight),Math.max(.1,distance));
    if(distance>2.50||distance<.1||dot<.72||Math.abs(state.pitch-targetPitch)>.65)continue;
    const score=(1-dot)*3+distance*.08;if(!best||score<best.score)best={...station,distance,score};
  }
  return best;
}
export function stepSourcePub(value,input={}){
  let state=normalizeSourcePubCheckpoint(value),event=null;
  if(state.status!=='active')return{state,event};
  const dt=clamp(input.dt,0,.25),look=input.look;
  if(look&&finite(look.yaw)&&finite(look.pitch)){state.yaw=heading(look.yaw);state.pitch=clamp(look.pitch,-.80,.75);}
  if(!input.paused){
    state.elapsed+=dt;
    if(state.itemFall){state.itemFall.elapsed=Math.min(state.itemFall.duration,state.itemFall.elapsed+dt);if(state.itemFall.elapsed>=state.itemFall.duration){state.fallenItem={kind:state.itemFall.kind,layer:state.itemFall.toLayer,...state.itemFall.landing};state.itemFall=null;}}
    if(state.fall){
      state.fall.elapsed=Math.min(state.fall.duration,state.fall.elapsed+dt);
      const f=state.fall,p=sourcePubFallProgress(f).crossing;state.x=f.origin.x+(f.landing.x-f.origin.x)*p;state.z=f.origin.z+(f.landing.z-f.origin.z)*p;
      if(state.fall.elapsed>=state.fall.duration){const fall=state.fall;state.layer=fall.toLayer;state.x=fall.landing.x;state.z=fall.landing.z;state.fall=null;event={type:'fall-land',layer:state.layer};}
      // A fall is bounded physical motion. It never consumes look or grants a
      // service action, and normal movement resumes on the following frame.
      return{state,event};
    }
    const forward=clamp(input.forward,-1,1),side=clamp(input.side,-1,1),length=Math.max(1,Math.hypot(forward,side)),speed=SOURCE_PUB.walkSpeed*dt/length;
    const carryScale=state.carried==='barrel'?SOURCE_PUB.barrelSpeed/SOURCE_PUB.walkSpeed:1;
    const dx=(Math.sin(state.yaw)*forward+Math.cos(state.yaw)*side)*speed*carryScale,dz=(-Math.cos(state.yaw)*forward+Math.sin(state.yaw)*side)*speed*carryScale;
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.075));
    for(let i=0;i<steps;i++){
      if(sourcePubCanOccupy(state.x+dx/steps,state.z,state))state.x+=dx/steps;
      if(sourcePubCanOccupy(state.x,state.z+dz/steps,state))state.z+=dz/steps;
    }
  }
  if(input.interact&&!input.paused){
    const station=focusedSourcePubStation(state);
    if(station?.id==='exit')event={type:'exit-request',completed:state.stage===SOURCE_PUB.rounds.length};
    else if(station){
      const round=sourcePubRound(state.stage),action=sourcePubTask(state);
      if(action.recover&&state.layer!==action.toLayer)return{state,event:null};
      event={type:'service',station:station.id,stage:state.stage,orders:round.orders,text:action.text,caption:action.caption||null};state.caption=action.caption||null;
      if(action.dropItem){const landing={x:1.8*sourcePubStretch(state)+1.4,z:1.25};state.itemFall={elapsed:0,duration:SOURCE_PUB.itemFallDuration,fromLayer:state.layer,toLayer:action.toLayer,landing,kind:action.dropItem};state.fallenItem=null;}
      if(action.descend){state.fall={elapsed:0,duration:SOURCE_PUB.fallDuration,fromLayer:state.layer,toLayer:action.toLayer,origin:{x:state.x,z:state.z},landing:{x:1.8*sourcePubStretch(state),z:1.25},kind:'player'};}
      if(action.recover){
        // Item physics cannot trap an impatient helper at an empty station.
        // A deliberate recovery after landing settles the same object safely.
        state.itemFall=null;state.fallenItem=null;
      }
      if(Object.hasOwn(action,'carry'))state.carried=action.carry;
      state.task++;
      if(state.task>=round.tasks.length){const oldScale=sourcePubStretch(state);state.stage++;state.task=0;state.x=state.x/oldScale*sourcePubStretch(state);}
    }
  }
  return{state,event};
}

// The host retains pause/audio/save ownership. This scene holds only this
// room's motion, look and resumable service sequence. No global input listeners.
export function createSourcePubScene({checkpoint,runId,returnPose,renderer,onCheckpoint=()=>{},onReturn=()=>{},say=()=>{},getLook=null,onError=()=>{},onExit=()=>{}}={}){
  let state=normalizeSourcePubCheckpoint(checkpoint,{runId,returnPose}),ready=false,closed=false,paused=false,leaving=false,error=null,loadPromise=null,drag=null,exitPrompt=false,saveClock=0;
  const keys=new Set();
  if(typeof renderer?.render!=='function')throw Error('A game-owned Source pub renderer is required.');
  if(!state.returnPose)throw Error('Capture the exact Source pose before entering The Lyric.');
  if(state.completed)throw Error('The Source bar has already been completed in this run.');
  state.status='active';
  const snapshot=()=>clone(state);
  const report=err=>{error=String(err?.message||err);try{onError(err);}catch{/* Reporting cannot take away the way out. */}};
  const save=reason=>{const value=snapshot();try{onCheckpoint(value,{reason});}catch(err){report(err);}return value;};
  function clearMotion(){keys.clear();drag=null;}
  const renderReady=()=>ready&&!closed&&renderer.ready?.()!==false;
  function leave(){
    if(closed||leaving)return false;leaving=true;clearMotion();state.status='returned';state.completed=state.stage===SOURCE_PUB.rounds.length;
    const value=save(state.completed?'completed':'left-early');
    const failed=err=>{if(closed)return;leaving=false;state.status='active';state.completed=false;report(err);save('return-failed');};
    try{const result=onReturn({returnPose:clone(state.returnPose),checkpoint:value,completed:state.completed});
      if(result?.then)Promise.resolve(result).then(ok=>{if(ok===false)throw Error('The road could not be restored. Try returning again.');}).catch(failed);
      else if(result===false){failed(Error('The road could not be restored. Try returning again.'));return false;}
    }catch(err){failed(err);return false;}
    return true;
  }
  function interact(){
    if(closed||paused||leaving)return;
    if(exitPrompt){leave();return;}
    if(!renderReady()){clearMotion();if(error)leave();return;}
    const result=stepSourcePub(state,{interact:true});state=result.state;
    if(result.event?.type==='exit-request'){exitPrompt=true;clearMotion();return;}
    if(result.event?.text){say({who:'unknown',voiceSpeaker:'pub-iona',sourceLabel:'IONA',text:result.event.text});save('service');}
  }
  const scene={
    id:'source-pub',blocksWorld:true,blocksInput:true,suppressesHud:true,get allowsLook(){return !closed&&!paused&&!leaving&&!exitPrompt&&renderReady();},handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){
      if(loadPromise)return loadPromise;
      save('loading');
      loadPromise=Promise.resolve().then(()=>renderer?.initialize?.()).then(ok=>{if(closed||leaving)return false;if(ok===false)throw Error('The Source bar could not be loaded.');ready=true;save('entry-or-resume');return true;}).catch(err=>{if(!closed)report(err);return false;});return loadPromise;
    },
    enter(){void scene.initialize();},
    update(dt){
      if(closed||paused||leaving||exitPrompt)return;
      if(!renderReady()){clearMotion();return;}
      const hostLook=typeof getLook==='function'?getLook():null;
      const result=stepSourcePub(state,{dt,forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')),look:hostLook});state=result.state;
      saveClock+=Math.max(0,Number(dt)||0);if(saveClock>=1){saveClock=0;save('position');}
    },
    view(){const live=renderReady();return{...snapshot(),ready:live,closed,paused,leaving,error,exitPrompt,focus:live?focusedSourcePubStation(state):null,orders:state.stage<SOURCE_PUB.rounds.length?sourcePubRound(state.stage).orders:null};},
    checkpoint:()=>save('requested'),serialize:snapshot,
    pause(){if(closed)return false;paused=true;clearMotion();if(ready)save('pause');return true;},
    resume(){paused=false;clearMotion();return !closed;},
    lookAngles:()=>({yaw:state.yaw,pitch:state.pitch}),
    lookBy(yawDelta=0,pitchDelta=0){return scene.setLook({yaw:state.yaw+(Number(yawDelta)||0),pitch:state.pitch+(Number(pitchDelta)||0)});},
    setLook(look){if(!scene.allowsLook||!finite(look?.yaw)||!finite(look?.pitch))return false;state.yaw=heading(look.yaw);state.pitch=clamp(look.pitch,-.8,.75);return true;},
    key(e={}){
      const key=String(e.key||e.code||'').toLowerCase().replace(/^key/,'');
      if(key==='escape'||e.controllerAction==='back'){clearMotion();if(ready)save('pause-request');return false;}
      if(e.ctrlKey||e.metaKey||e.altKey||closed||leaving)return true;
      if(!e.repeat&&key==='x'&&!renderReady()){leave();return true;}
      if(key==='x'&&exitPrompt){exitPrompt=false;clearMotion();return true;}
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){if(!renderReady())clearMotion();else if(!exitPrompt)keys.add(key);return true;}
      if(!e.repeat&&(key==='e'||key==='enter'||e.controllerAction==='interact'||e.controllerAction==='confirm'))interact();
      return true;
    },
    keyup(e={}){keys.delete(String(e.key||e.code||'').toLowerCase().replace(/^key/,''));return true;},
    pointer(e={}){
      if(closed||paused||leaving||exitPrompt)return true;
      if(!renderReady()){clearMotion();return true;}
      if(e.type==='pointerdown'&&(e.button===2||e.buttons===2)){drag={x:Number(e.clientX??e.x)||0,y:Number(e.clientY??e.y)||0,id:e.pointerId};e.preventDefault?.();return true;}
      if(e.type==='pointercancel'||e.type==='pointerup'){drag=null;return true;}
      if(e.type==='pointermove'&&drag){const x=Number(e.clientX??e.x)||0,y=Number(e.clientY??e.y)||0;
        state.yaw=heading(state.yaw+(x-drag.x)*.004);state.pitch=clamp(state.pitch-(y-drag.y)*.003,-.8,.75);drag={...drag,x,y};}
      return true;
    },
    render(){
      if(ready&&!closed){try{if(renderer.render(state)===false)throw Error('The Source bar renderer is unavailable.');}catch(err){ready=false;clearMotion();report(err);}}
      const live=renderReady();
      if(!live){clearMotion();try{renderer?.clear?.();}catch(err){report(err);}}
      const{cols,rows}=uiSize();
      if(!live){uiCenter(Math.floor(rows/2),error?'THE DOOR IS STILL HERE':'THE LYRIC','ui-primary');if(error)uiCenter(Math.floor(rows/2)+2,error.slice(0,Math.max(20,cols-4)),'ui-secondary');uiCenter(rows-3,error||exitPrompt?'E / X · RETURN TO THE ROAD':'X · RETURN TO THE ROAD','ui-primary');}
      else if(exitPrompt){uiFill(0,rows-6,cols,6,'rgba(4,4,6,.88)');uiCenter(rows-4,state.stage>=SOURCE_PUB.rounds.length?'THE DOOR OPENS TO THE ROAD.':'LEAVE THIS ROUND UNFINISHED?','ui-primary');uiCenter(rows-2,'E · LEAVE   X · STAY','ui-secondary');}
      else{const focus=focusedSourcePubStation(state),round=sourcePubRound(state.stage);
        uiText(2,2,state.stage>=SOURCE_PUB.rounds.length?'NO MORE ORDERS':`${round.title} / ${state.stage+1}`,'ui-secondary');
        if(state.caption)uiText(2,4,state.caption,'ui-dim');
        if(state.fall)uiCenter(rows-3,'THE ROOM BELOW · YOU CAN STILL LOOK','ui-secondary');
        if(focus)uiCenter(rows-3,`E · ${focus.label}`,'ui-primary');
        uiCenter(rows-1,'WASD · WALK   MOUSE · LOOK   ESC · PAUSE','ui-dim');}
    },
    exit(){if(closed)return false;closed=true;clearMotion();if(!leaving)save('interrupted');renderer?.dispose?.();onExit({checkpoint:snapshot(),completed:state.completed});return true;},
  };
  return scene;
}
