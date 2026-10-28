// Explicitly installed authoring aid. No production import or automatic start.
// It steers the public scene controls; the real game owns every physics tick.
import {SOURCE_CONTINUATION as C, SOURCE_CONTINUATION_ROUTES as ROUTES,
  CONTINUATION_SIGHTLINES, CONTINUATION_CATCH_STAGES as STAGES,
  CONTINUATION_DROP_LIPS, continuationRadialPoint, continuationRefugeAt, continuationDoors} from '../data/source-continuation.js';

export function sourceContinuationGuidedPlan() {
  const plan = [], walk = (x, z, label = 'Walk authored support',options={}) => plan.push({kind:'walk', x, z, label,...options});
  const path = (rows, label) => rows.forEach(([x,z]) => walk(x,z,label));
  const look = (yaw,pitch,seconds,label,options={}) => plan.push({kind:'look',yaw,pitch,seconds,label,...options});
  const door = (id,label) => plan.push({kind:'door',id,label});
  const arc = (stage,from,to,label) => {
    const r=(stage.innerRadius+stage.outerRadius)/2;
    const n=Math.max(1,Math.ceil(Math.abs(to-from)/.12));
    for(let k=0;k<=n;k++){const p=continuationRadialPoint(r,from+(to-from)*k/n);walk(p.x,p.z,label);}
  };
  look(Math.PI,1.05,2,'Observe the retained upper ruin');
  walk(0,-3,'Receiving route'); path(ROUTES.groundBranch.slice(1),'Optional ground branch');
  path(ROUTES.main.slice(4),'First two real stair flights');
  walk(-16,-30,'Alternate stair connection'); path(ROUTES.stairLoop.slice(1),'Walk the third stair and rejoin');
  path(ROUTES.main.slice(8),'Return through the interlocked stairs');
  walk(6,-12,'Upper return arm'); walk(6,3,'Try the remembered door'); door('wrong-false-return','Open the optional false return');
  walk(3.85,3,'West edge of the overlook',{tolerance:.06});
  const sight=CONTINUATION_SIGHTLINES.upperReturn,dx=sight.target.x-sight.eye.x,dz=sight.target.z-sight.eye.z;
  look(Math.atan2(dx,-dz),Math.atan2(sight.target.y-sight.eye.y,Math.hypot(dx,dz)),3,'Observe the real entry below the open rail',{lookTarget:sight.target});
  walk(6,3); walk(6,-12); walk(0,-12); walk(0,-19,'Inspect the upper refuge');
  look(-Math.PI/2,.12,2,'Observe the spindle from the refuge');
  walk(0,-12); walk(-16.5,-12,'Onward approach'); door('wrong-onward','Open the actual II–III threshold');
  walk(-26.5,-12,'Walk the bridge into III',{transition:true});
  for(const stage of STAGES){
    const from=stage.level?CONTINUATION_DROP_LIPS[stage.level-1].approachAngle:0;
    arc(stage,from,stage.refugeAngle,`Catch ${stage.level}: inspect the partial support`);
    const refuge=continuationRefugeAt({phase:'catch',level:stage.level}); walk(refuge.x,refuge.z,`Catch ${stage.level}: visit the genuine refuge`);
    look(Math.atan2(C.catch.center.x-refuge.x,-(C.catch.center.z-refuge.z)),-.12,2,'Observe the operating apparatus');
    const outer=continuationRadialPoint(stage.outerRadius-1,stage.refugeAngle);walk(outer.x,outer.z,'Leave the refuge by its supported neck');
    if(stage.level===STAGES.length-1){arc(stage,stage.refugeAngle,0,'Final dish and balcony');break;}
    const lip=CONTINUATION_DROP_LIPS[stage.level];arc(stage,stage.refugeAngle,lip.approachAngle,'Read the lower supporting catch');walk(lip.x,lip.z,'Approach the release edge');
    look(Math.atan2(lip.dx,-lip.dz),-.9,1,'Look at the real lower support');
    plan.push({kind:'drop',id:lip.id,level:stage.level,label:`Choose descent ${stage.level+1}`});
  }
  walk(C.catch.finalApproach.x,C.catch.finalApproach.z,'Reach the supported final balcony');door('catch-final','Open the original onward door');
  walk(C.catch.finalDoor.x+1,C.catch.finalDoor.z,'Physically cross the final threshold');
  let phase='wrong-return',level=0;return plan.map(step=>{const checked={...step,expectedPhase:step.transition?null:phase,expectedLevel:phase==='catch'?level:null};if(step.transition)phase='catch';if(step.kind==='drop')level=step.level+1;return checked;});
}

export function installSourceContinuationGuidedReview({window:win=window,document:doc=document,
  requestFrame=callback=>win.requestAnimationFrame(callback),cancelFrame=id=>win.cancelAnimationFrame(id),
  now=()=>win.performance.now(),stuckSeconds=30,maximumSeconds=1200}={}){
  if(win.__sourceGuidedReview)throw Error('The guided author route is already installed.');
  const panel=doc.createElement('aside');panel.id='source-guided-author-route';
  panel.style.cssText='position:fixed;left:10px;top:10px;z-index:2147483000;max-width:330px;padding:10px;background:#160f18ee;border:1px solid #e0a2c1;color:#fff;font:12px/1.5 monospace;pointer-events:none;white-space:pre-wrap';
  doc.body.append(panel);
  const plan=sourceContinuationGuidedPlan(),receipts=[];
  let running=false,disposed=false,finished=false,index=0,frameId=null,owner=null,held=false,startedAt=null,lastProgressAt=0,stepStartedAt=0,stepSent=false,lastPose=null,lastPanelAt=-Infinity,lastWalkDistance=null,precisionLeg=false,reason='Ready; native F6 starts after capture begins.';
  function receipt(type,extra={}){receipts.push({type,at:now(),step:index,...extra});if(receipts.length>2000)receipts.shift();}
  function release(){if(held&&owner){owner.keyup?.({key:'w',code:'KeyW'});held=false;}}
  function pressMove(scene){if(owner!==scene){release();owner=scene;}if(!held){scene.key({key:'w',code:'KeyW',repeat:false});held=true;}}
  function tap(scene,key){release();scene.key({key,code:'Key'+key.toUpperCase(),repeat:false});scene.keyup?.({key,code:'Key'+key.toUpperCase()});receipt('scene-key',{key,native:false});}
  function current(){const scene=win.__scenes?.top?.();return scene?.id==='source-continuation'?{scene,view:scene.view?.()}:null;}
  function focused(){const native=win.__chunkSurferPointer?.status?.()?.nativeBackend?.focused;return !doc.hidden&&doc.visibilityState!=='hidden'&&(native??doc.hasFocus?.()??true);}
  function protectedInput(view){const rec=win.__probe?.rec?.(),playback=win.__probe?.playback?.();return !!(view.protected||view.protectedHold||rec?.recording||rec?.listening||playback?.playing);}
  function hold(message){release();running=false;reason=message;receipt('held',{reason:message});paint(true);}
  function advance(){release();receipt('step-complete',{kind:plan[index]?.kind,label:plan[index]?.label});index++;stepStartedAt=now();lastProgressAt=now();stepSent=false;lastPose=null;precisionLeg=false;}
  function paint(force=false){if(!force&&now()-lastPanelAt<250)return;lastPanelAt=now();panel.textContent=`Guided author route — not a player test\nF6 · start / stop / resume\n${running?'RUNNING':finished?'FINISHED':'STOPPED'} · ${index}/${plan.length}\n${plan[index]?.label||reason}\n${reason}\nProgrammatic scene keys + guided camera\nNative route input: no · body teleports: 0`;}
  function start(){
    const active=current();if(!active?.view?.ready||active.view.paused||active.view.closed||active.view.leaving){reason='Enter the ready Source II scene before starting.';paint(true);return;}
    if(finished){reason='The recorded route is complete; reload a separately declared fixture to repeat it.';paint(true);return;}
    if(!focused()){reason='Focus the isolated game before starting.';paint(true);return;}
    if(startedAt==null&&active.view.phase!=='wrong-return'){reason='This guide begins at the declared Source II receiving route; it will not stage or relocate a body.';paint(true);return;}
    owner=active.scene;running=true;startedAt??=now();stepStartedAt=now();lastProgressAt=now();reason='Game physics and time remain authoritative.';receipt('native-F6-start',{trustedGesture:true});paint(true);
  }
  function fraction(view,id){const m=view.doorMotion?.[id];if(!m)return view.doorOpen?.[id]?1:0;const t=m.duration>0?Math.max(0,Math.min(1,(view.elapsed-m.startedAt)/m.duration)):1;return m.from+((m.to?1:0)-m.from)*t;}
  function tick(){
    if(disposed)return;frameId=requestFrame(tick);if(!running){paint();return;}
    const active=current(),time=now();
    if(!focused()){hold('Focus lost; movement released. F6 resumes.');return;}
    if(!active){release();if(lastPose?.completed){running=false;finished=true;reason='The game released the completed scene to its own onward handoff.';receipt('handoff-observed',{scene:win.__scenes?.top?.()?.id||null});paint(true);}else hold('Scene owner changed; stopped without staging or warping.');return;}
    const{scene,view}=active;
    if(view.error){hold('The game reports a scene error: '+view.error);return;}
    if(protectedInput(view)){hold('A protected recorder/listening/playback hold is active; movement released. F6 resumes.');return;}
    if(view.completed||view.status==='completed'){if(index!==plan.length-1){hold('Unexpected completion before the authored final crossing; no success claim.');return;}release();lastPose={...view};running=false;finished=true;reason='Physical final crossing observed; the game owns its normal handoff.';receipt('completion-observed',{exitReceipt:view.exitReceipt,simulationElapsed:view.elapsed});paint(true);return;}
    if(view.paused||!view.ready||view.closed){hold('The game is paused or unready; F6 resumes after it is ready.');return;}
    if(time-startedAt>maximumSeconds*1000){hold('Maximum inspection duration reached; no automatic recovery or warp.');return;}
    const step=plan[index];if(!step){hold('Route exhausted without the game reporting completion.');return;}
    const expectedDropLanding=step.kind==='drop'&&stepSent&&view.level===step.expectedLevel+1;
    if(step.expectedPhase&&view.phase!==step.expectedPhase||step.expectedLevel!=null&&view.level!==step.expectedLevel&&!expectedDropLanding){hold(`Unexpected phase or catch level at ${step.label}; no route correction or warp.`);return;}
    if(view.fall&&step.kind!=='drop'){hold('An unrequested fall interrupted the authored route; stopped without correction.');return;}
    if(view.fall||view.recovery||view.handoff||view.leaving){release();lastProgressAt=time;lastPose={...view};paint();return;}
    if(lastPose){const moved=Math.hypot(view.x-lastPose.x,view.z-lastPose.z);if(moved>.02||Math.abs(view.feet-lastPose.feet)>.02)lastProgressAt=time;if(held&&moved>.02&&moved<1.2&&Math.abs(view.feet-lastPose.feet)<.05)lastWalkDistance=moved;}
    lastPose={x:view.x,z:view.z,feet:view.feet,completed:view.completed};
    if(time-lastProgressAt>stuckSeconds*1000){hold(`Stuck at ${step.label}; recorded failure, no automatic correction.`);return;}
    if(step.kind==='walk'){
      const dx=step.x-view.x,dz=step.z-view.z;
      const distance=Math.hypot(dx,dz),tolerance=step.tolerance??.43;
      if(distance<tolerance){advance();return;}
      let yaw=Math.atan2(dx,-dz);
      // Two ordinary equal-length moves can resolve a short residual even at
      // four FPS. The first makes a supported side-step, the next returns to
      // the target. This changes heading only, never velocity or body state.
      if(tolerance<.1&&lastWalkDistance&&distance<lastWalkDistance*.85&&!precisionLeg){yaw+=Math.acos(Math.max(-1,Math.min(1,distance/(2*lastWalkDistance))));precisionLeg=true;}else precisionLeg=false;
      scene.setLook({yaw,pitch:-.12});pressMove(scene);
    }else if(step.kind==='look'){
      release();let yaw=step.yaw,pitch=step.pitch;if(step.lookTarget){const dx=step.lookTarget.x-view.x,dz=step.lookTarget.z-view.z;yaw=Math.atan2(dx,-dz);pitch=Math.atan2(step.lookTarget.y-(view.feet+C.eyeHeight),Math.hypot(dx,dz));if(!stepSent){receipt('actual-eye-look',{eye:{x:view.x,y:view.feet+C.eyeHeight,z:view.z},target:step.lookTarget,yaw,pitch});stepSent=true;}}scene.setLook({yaw,pitch});lastProgressAt=time;
      if(time-stepStartedAt>=step.seconds*1000)advance();
    }else if(step.kind==='door'){
      const descriptor=continuationDoors().find(d=>d.id===step.id);if(!descriptor){hold('The authored door is missing; no fallback target.');return;}const dx=descriptor.x-view.x,dz=descriptor.z-view.z;
      scene.setLook({yaw:Math.atan2(dx,-dz),pitch:-.04});
      if(!stepSent&&Math.hypot(dx,dz)>1.35){pressMove(scene);return;}
      release();
      if(!stepSent){if(scene.view?.().focus?.id!==step.id){hold(`The actual handle ${step.id} is not in reach; no state bypass.`);return;}if(!view.doorOpen?.[step.id])tap(scene,'e');stepSent=true;receipt('door-requested',{id:step.id});}
      if(fraction(scene.view(),step.id)>=C.doorPassFraction)advance();
    }else if(step.kind==='drop'){
      release();
      if(!stepSent){if(scene.view?.().focus?.id!==step.id){hold(`The actual release ${step.id} is not in reach; no state bypass.`);return;}tap(scene,'e');stepSent=true;receipt('descent-requested',{id:step.id});}
      if(scene.view().level>step.level&&!scene.view().fall)advance();
    }
    paint();
  }

  function key(event){if(event.code!=='F6'&&event.key!=='F6')return;if(event.repeat||!event.isTrusted)return;event.preventDefault?.();event.stopImmediatePropagation?.();if(running)hold('Stopped by native F6; movement released.');else start();}
  const onBlur=()=>{if(running)hold('Window lost focus; movement released. F6 resumes.');};
  win.addEventListener('keydown',key,{capture:true});win.addEventListener('blur',onBlur);doc.addEventListener?.('visibilitychange',onBlur);
  const api={status:()=>({developerGuided:true,nativeInputs:false,cameraGuided:true,bodyTeleports:0,running,finished,step:index,totalSteps:plan.length,stepLabel:plan[index]?.label||null,elapsed:startedAt==null?0:(now()-startedAt)/1000,reason,receipts:receipts.map(r=>({...r}))}),stop:()=>hold('Explicit review stop; movement released.'),dispose(){release();disposed=true;running=false;cancelFrame(frameId);win.removeEventListener('keydown',key,{capture:true});win.removeEventListener('blur',onBlur);doc.removeEventListener?.('visibilitychange',onBlur);panel.remove();if(win.__sourceGuidedReview===api)delete win.__sourceGuidedReview;}};
  win.__sourceGuidedReview=api;paint(true);frameId=requestFrame(tick);return api;
}
