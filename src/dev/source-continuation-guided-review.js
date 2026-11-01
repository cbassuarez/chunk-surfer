// Explicitly installed authoring aid. No production import or automatic start.
// It steers the public scene controls; the real game owns every physics tick.
import {SOURCE_CONTINUATION as C, SOURCE_CONTINUATION_ROUTES as ROUTES,
  CONTINUATION_SIGHTLINES, CONTINUATION_CATCH_STAGES as STAGES,
  CONTINUATION_DROP_LIPS, CONTINUATION_ALTERNATE_LIPS, CONTINUATION_RETURN_CATCHES, continuationRadialPoint, continuationRefugeAt, continuationDoors, continuationSurfaces} from '../data/source-continuation.js';
import {JOURNEY_ROUTES,JOURNEY_SIGHTLINES,JOURNEY_PORTALS} from '../data/source-continuation-journey.js';

export function sourceContinuationGuidedPlan({alternates=false,topologyLoop=false}={}) {
  const chosen=alternates?CONTINUATION_ALTERNATE_LIPS:CONTINUATION_DROP_LIPS;
  const plan = [], walk = (x, z, label = 'Walk authored support',options={}) => plan.push({kind:'walk', x, z, label,...options});
  const path = (rows, label) => rows.forEach(([x,z]) => walk(x,z,label));
  const look = (yaw,pitch,seconds,label,options={}) => plan.push({kind:'look',yaw,pitch,seconds,label,...options});
  const door = (id,label,options={}) => plan.push({kind:'door',id,label,...options});
  const arc = (stage,from,to,label) => {
    const r=(stage.innerRadius+stage.outerRadius)/2;
    const n=Math.max(1,Math.ceil(Math.abs(to-from)/.12));
    for(let k=0;k<=n;k++){const p=continuationRadialPoint(r,from+(to-from)*k/n);walk(p.x,p.z,label);}
  };
  // Follow the declared raised return. Optional loops and free jumps have
  // separate trials; this guide proves its own supported physical route.
  if(topologyLoop){
    walk(0,-19,'Recognize the declared upper refuge',{feet:8.4,chartId:0,tolerance:.15});
    walk(0,-12,'Leave the upper refuge by its supported route',{feet:8.4,chartId:0});
    walk(-16.8,-12,'Reach the outward doorway',{feet:8.4,chartId:0});
    door('wrong-onward','Open the outward doorway');
  }else{
  path(ROUTES.main.slice(1,16),'Read the interlocked return');
  door('wrong-false-return','Try the remembered door');
  walk(3.85,3,'West edge of the overlook',{tolerance:.06});
  const sight=CONTINUATION_SIGHTLINES.upperReturn,dx=sight.target.x-sight.eye.x,dz=sight.target.z-sight.eye.z;
  look(Math.atan2(dx,-dz),Math.atan2(sight.target.y-sight.eye.y,Math.hypot(dx,dz)),1.5,'Observe the original entry below',{lookTarget:sight.target});
  path(ROUTES.main.slice(17),'Follow the supported altered return');
  door('wrong-onward','Leave the original return by its physical doorway');
  }
  const journeyRows=topologyLoop?JOURNEY_ROUTES.main.slice(0,JOURNEY_ROUTES.main.findIndex((row,index,rows)=>row.chartId===2&&!row.foldSide&&rows[index-1]?.chartId===2&&row.x!==rows[index-1]?.x)+1):JOURNEY_ROUTES.main;
  let recognition=[];
  for(let index=0;index<journeyRows.length;index++){
    const row=journeyRows[index],options={feet:row.feet,chartId:row.chartId,phase:row.phase,tolerance:.12};
    if(row.foldSide==='a'){
      const exit=journeyRows[index+1];
      if(exit?.foldSide!=='b'||exit.foldId!==row.foldId)throw Error('The journey portal route is not paired: '+row.foldId);
      if(row.foldId==='catch-closure')door('journey-catch-gate','Open the physical Catch gate in this chart',{chartId:row.chartId,feet:row.feet});
      plan.push({kind:'fold',x:row.x,z:row.z,...options,id:row.foldId,side:'a',exit:{...exit},label:'Cross the authored '+row.foldId+' aperture'});
    }else if(row.foldSide==='b'){
      // The closure changes to a fixed compass after the real body clears
      // the threshold. Its broad receiving pad accepts half a 10 FPS stride;
      // the observed Catch phase below still proves full physical clearance.
      walk(row.x,row.z,'Stand on the receiving plane',{...options,...(row.foldId==='catch-closure'?{transition:true,tolerance:.18}:{})});
      recognition=JOURNEY_SIGHTLINES.filter(view=>view.foldId===row.foldId&&view.side==='b'&&!view.forwardRecognition).sort((a,b)=>a.id.localeCompare(b.id));
    }else{
      const last=recognition.at(-1),atRecognition=last&&row.chartId===last.chartId&&Math.hypot(row.x-last.eye.x,row.z-last.eye.z)<.01;
      if(atRecognition){
        for(const view of recognition){const target=view.presentedTarget;
          walk(view.eye.x,view.eye.z,'Read the earlier route on its actual new plane',{feet:view.feet,chartId:view.chartId,tolerance:.12,recognitionId:view.id,portalId:view.portalId,targetChart:view.targetChart,lookTarget:{x:target[0],y:target[1],z:target[2]}});
        }
        recognition=[];
      }else walk(row.x,row.z,'Walk the outward chart',{...options});
    }
  }
  if(topologyLoop){
    const portal=JOURNEY_PORTALS.find(row=>row.id==='earlier-upper-return'),views=JOURNEY_SIGHTLINES.filter(row=>row.portalId===portal.id&&row.side==='a').sort((a,b)=>a.id.localeCompare(b.id));
    for(const view of views){const target=view.presentedTarget;walk(view.eye.x,view.eye.z,'See the original refuge through the actual return aperture',{feet:view.feet,chartId:view.chartId,tolerance:.12,recognitionId:view.id,portalId:view.portalId,targetChart:view.targetChart,lookTarget:{x:target[0],y:target[1],z:target[2]}});}
    const pre={x:portal.a.x+portal.a.normal[0]*.4,z:portal.a.z+portal.a.normal[2]*.4,feet:portal.a.feet,chartId:portal.fromChart},exit={x:portal.b.x+portal.b.normal[0]*.4,z:portal.b.z+portal.b.normal[2]*.4,feet:portal.b.feet,chartId:portal.toChart};
    walk(pre.x,pre.z,'Approach the earlier refuge aperture',{...pre,tolerance:.12});
    plan.push({kind:'fold',id:portal.id,side:'a',x:portal.a.x-portal.a.normal[0]*.4,z:portal.a.z-portal.a.normal[2]*.4,feet:pre.feet,chartId:pre.chartId,exit,label:'Physically close the non-Euclidean loop'});
    walk(0,-19,'Return to the same supported upper refuge',{feet:8.4,chartId:0,tolerance:.15});
    plan.push({kind:'stop',label:'closed-loop-complete',feet:8.4,chartId:0});
  }else{
  walk(C.catch.center.x+STAGES[0].outerRadius-1.5,C.catch.center.z,'Enter the overhead Catch',{feet:C.catch.top,chartId:0});
  for(const stage of STAGES){
    let from=stage.level?chosen[stage.level-1].approachAngle:0;
    if(alternates&&stage.level){
      const branch=CONTINUATION_RETURN_CATCHES.find(b=>b.level===stage.level),r=stage.outerRadius-.7;
      const pocket=continuationRadialPoint(branch.landingRadius,branch.angle);
      walk(pocket.x,pocket.z,'Centre on the actual alternate catch',{tolerance:.12});
      // The digital compass follows the authored tread centres. A single long
      // diagonal can drift across the narrow spoke and now correctly step off.
      const prefix=`catch-${stage.level}-wrong-neck-`,treads=continuationSurfaces().filter(row=>row.id.startsWith(prefix)).sort((a,b)=>Number(a.id.slice(prefix.length))-Number(b.id.slice(prefix.length)));
      for(const tread of treads.slice(1))walk((tread.minX+tread.maxX)/2,(tread.minZ+tread.maxZ)/2,'Follow the alternate catch neck',{tolerance:.12});
      const n=Math.ceil(Math.abs(branch.joinAngle-branch.angle)/.08);
      for(let k=1;k<=n;k++){const p=continuationRadialPoint(r,branch.angle+(branch.joinAngle-branch.angle)*k/n);walk(p.x,p.z,'Rejoin by the longer outer return',{tolerance:.21});}
      from=branch.joinAngle;
    }
    const target=stage.level===STAGES.length-1?0:chosen[stage.level].approachAngle;
    arc(stage,from,target,`Catch ${stage.level}: predict the receiving support`);
    if(stage.level===STAGES.length-1)break;
    const lip=chosen[stage.level];walk(lip.x,lip.z,'Approach the release edge',{tolerance:.3});
    plan.push({kind:'drop',id:lip.id,level:stage.level,label:`Choose descent ${stage.level+1}`});
  }
  walk(C.catch.finalApproach.x,C.catch.finalApproach.z,'Reach the supported final balcony');door('catch-final','Approach the original onward door');
  walk(C.catch.finalDoor.x+1,C.catch.finalDoor.z,'Physically cross the final threshold');
  }
  let phase='wrong-return',level=0;return plan.map(step=>{const checked={...step,expectedPhase:step.transition?null:step.phase||phase,expectedChart:step.chartId??0,expectedLevel:phase==='catch'?level:null};if(step.transition)phase='catch';if(step.kind==='drop')level=step.level+1;return checked;});
}

export function installSourceContinuationGuidedReview({window:win=window,document:doc=document,
  requestFrame=callback=>win.requestAnimationFrame(callback),cancelFrame=id=>win.cancelAnimationFrame(id),
  now=()=>win.performance.now(),stuckSeconds=30,maximumSeconds=1200,alternates=false,topologyLoop=false}={}){
  if(win.__sourceGuidedReview)throw Error('The guided author route is already installed.');
  const panel=doc.createElement('aside');panel.id='source-guided-author-route';
  panel.style.cssText='position:fixed;left:10px;top:10px;z-index:2147483000;max-width:330px;padding:10px;background:#160f18ee;border:1px solid #e0a2c1;color:#fff;font:12px/1.5 monospace;pointer-events:none;white-space:pre-wrap';
  doc.body.append(panel);
  const plan=sourceContinuationGuidedPlan({alternates,topologyLoop}),receipts=[];
  let running=false,disposed=false,finished=false,index=0,frameId=null,owner=null,held=new Set(),startedAt=null,lastProgressAt=0,stepStartedAt=0,stepSent=false,lastPose=null,lastPanelAt=-Infinity,lastWalkDistance=null,bestWalkDistance=null,precisionLeg=false,foldStartSerial=null,foldReceipt=null,foldObservedAt=null,reason='Ready; native F6 starts after capture begins.';
  function receipt(type,extra={}){receipts.push({type,at:now(),step:index,...extra});if(receipts.length>2000)receipts.shift();}
  function release(){if(owner)for(const key of held)owner.keyup?.({key,code:'Key'+key.toUpperCase()});held.clear();}
  function pressMove(scene,keys=['w']){
    if(owner!==scene){release();owner=scene;}
    const next=new Set(keys);
    for(const key of held)if(!next.has(key))scene.keyup?.({key,code:'Key'+key.toUpperCase()});
    for(const key of next)if(!held.has(key))scene.key({key,code:'Key'+key.toUpperCase(),repeat:false});
    held=next;
  }
  function tap(scene,key){release();scene.key({key,code:'Key'+key.toUpperCase(),repeat:false});scene.keyup?.({key,code:'Key'+key.toUpperCase()});receipt('scene-key',{key,native:false});}
  function current(){const scene=win.__scenes?.top?.();return scene?.id==='source-continuation'?{scene,view:scene.view?.()}:null;}
  function focused(){const native=win.__chunkSurferPointer?.status?.()?.nativeBackend?.focused;return !doc.hidden&&doc.visibilityState!=='hidden'&&(native??doc.hasFocus?.()??true);}
  function protectedInput(view){const rec=win.__probe?.rec?.(),playback=win.__probe?.playback?.();return !!(view.protected||view.protectedHold||rec?.recording||rec?.listening||playback?.playing);}
  function hold(message){release();running=false;reason=message;receipt('held',{reason:message});paint(true);}
  function advance(){release();receipt('step-complete',{kind:plan[index]?.kind,label:plan[index]?.label});index++;stepStartedAt=now();lastProgressAt=now();stepSent=false;lastPose=null;bestWalkDistance=null;precisionLeg=false;foldStartSerial=null;foldReceipt=null;foldObservedAt=null;}
  function paint(force=false){if(!force&&now()-lastPanelAt<250)return;lastPanelAt=now();panel.textContent=`Guided author route — not a player test\nF6 · start / stop / resume\n${running?'RUNNING':finished?'FINISHED':'STOPPED'} · ${index}/${plan.length}\n${plan[index]?.label||reason}\n${reason}\nProgrammatic scene keys + guided camera\nNative route input: no · authoring pose writes: 0`;}
  function start({trustedGesture=false,source='explicit-api'}={}){
    const active=current();if(!active?.view?.ready||active.view.paused||active.view.closed||active.view.leaving){reason='Enter the ready Source II scene before starting.';paint(true);return;}
    if(finished){reason='The recorded route is complete; reload a separately declared fixture to repeat it.';paint(true);return;}
    if(!focused()){reason='Focus the isolated game before starting.';paint(true);return;}
    if(startedAt==null&&active.view.phase!=='wrong-return'){reason='This guide begins at the declared Source II receiving route; it will not stage or relocate a body.';paint(true);return;}
    if(startedAt==null&&topologyLoop&&((active.view.chartId??0)!==0||Math.hypot(active.view.x,active.view.z+19)>.6||Math.abs(active.view.feet-8.4)>.15)){reason='The physical closed loop starts only at the separately declared upper-refuge fixture.';paint(true);return;}
    owner=active.scene;running=true;startedAt??=now();stepStartedAt=now();lastProgressAt=now();bestWalkDistance=null;reason='Game physics and time remain authoritative.';receipt(source==='native-F6'?'native-F6-start':'explicit-start',{trustedGesture,nativeInputs:false});paint(true);
  }
  function fraction(view,id){const m=view.doorMotion?.[id];if(!m)return view.doorOpen?.[id]?1:0;const t=m.duration>0?Math.max(0,Math.min(1,(view.elapsed-m.startedAt)/m.duration)):1;return m.from+((m.to?1:0)-m.from)*t;}
  function steerWalk(scene,view,step){
    const dx=step.x-view.x,dz=step.z-view.z,distance=Math.hypot(dx,dz),tolerance=step.tolerance??.43;
    let yaw=Math.atan2(dx,-dz);
    // Two ordinary equal-length moves resolve a short residual at coarse
    // sampling rates. Only the public look and digital keys change.
    if(lastWalkDistance&&tolerance<lastWalkDistance*.5&&distance<lastWalkDistance*.85&&!precisionLeg){yaw+=Math.acos(Math.max(-1,Math.min(1,distance/(2*lastWalkDistance))));precisionLeg=true;}else precisionLeg=false;
    if(view.phase==='catch'){
      const axisTolerance=Math.min(.18,tolerance*.5),keys=[];if(Math.abs(dx)>axisTolerance)keys.push(dx>0?'d':'a');if(Math.abs(dz)>axisTolerance)keys.push(dz>0?'s':'w');
      pressMove(scene,keys);
    }else if(step.lookTarget){
      const tx=step.lookTarget.x-view.x,tz=step.lookTarget.z-view.z,targetYaw=Math.atan2(tx,-tz),pitch=Math.atan2(step.lookTarget.y-(view.feet+C.eyeHeight),Math.hypot(tx,tz));
      scene.setLook({yaw:targetYaw,pitch});
      const forward=Math.sin(targetYaw)*dx-Math.cos(targetYaw)*dz,side=Math.cos(targetYaw)*dx+Math.sin(targetYaw)*dz,threshold=Math.max(.035,distance*.15),keys=[];
      if(Math.abs(forward)>threshold)keys.push(forward>0?'w':'s');if(Math.abs(side)>threshold)keys.push(side>0?'d':'a');pressMove(scene,keys);
    }else{scene.setLook({yaw,pitch:-.12});pressMove(scene);}
  }
  function steerNext(scene,view){const next=plan[index];if(next?.kind==='walk'&&(!next.expectedPhase||next.expectedPhase===view.phase)&&next.expectedChart===(view.chartId??0)&&(next.expectedLevel==null||next.expectedLevel===view.level)&&(next.feet==null||Math.abs(next.feet-view.feet)<.15))steerWalk(scene,view,next);}
  function tick(){
    if(disposed)return;frameId=requestFrame(tick);if(!running){paint();return;}
    const active=current(),time=now();
    if(!focused()){hold('Focus lost; movement released. F6 resumes.');return;}
    if(!active){release();if(lastPose?.completed){running=false;finished=true;reason='The game released the completed scene to its own onward handoff.';receipt('handoff-observed',{scene:win.__scenes?.top?.()?.id||null});paint(true);}else hold('Scene owner changed; stopped without staging or warping.');return;}
    const{scene,view}=active;
    if(lastPose?.phase&&lastPose.phase!==view.phase)release();
    if(view.error){hold('The game reports a scene error: '+view.error);return;}
    if(protectedInput(view)){hold('A protected recorder/listening/playback hold is active; movement released. F6 resumes.');return;}
    if(view.completed||view.status==='completed'){if(index!==plan.length-1){hold('Unexpected completion before the authored final crossing; no success claim.');return;}release();lastPose={...view};running=false;finished=true;reason='Physical final crossing observed; the game owns its normal handoff.';receipt('completion-observed',{exitReceipt:view.exitReceipt,simulationElapsed:view.elapsed});paint(true);return;}
    if(view.paused||!view.ready||view.closed){hold('The game is paused or unready; F6 resumes after it is ready.');return;}
    if(time-startedAt>maximumSeconds*1000){hold('Maximum inspection duration reached; no automatic recovery or warp.');return;}
    const step=plan[index];if(!step){hold('Route exhausted without the game reporting completion.');return;}
    if(view.recovery){receipt('physical-capture-observed',{reason:view.recovery.reason,phase:view.phase,level:view.level,simulationElapsed:view.elapsed,pose:{x:view.x,z:view.z,feet:view.feet}});hold(`Physical ${view.recovery.reason} capture interrupted the authored route; recorded failure, no automatic correction.`);return;}
    if(step.kind==='fold'){
      foldStartSerial??=view.foldSerial||0;
      const observed=view.lastFold;
      if(observed&&observed.serial>foldStartSerial&&!foldReceipt){
        if(observed.id!==step.id||observed.side!==step.side||observed.toChartId!==step.exit.chartId){hold('An unexpected chart crossing interrupted the authored route; no correction.');return;}
        foldReceipt=JSON.parse(JSON.stringify(observed));foldObservedAt=view.elapsed;release();
      }
      if(foldReceipt){
        if((view.chartId??0)!==step.exit.chartId){hold('The observed portal no longer owns the receiving chart; no correction.');return;}
        if(view.fall){
          if(view.fall.fromChartId!==foldReceipt.fromChartId||view.elapsed-foldObservedAt>3){hold('The actual portal alignment did not settle on its receiving plane; no correction.');return;}
          release();lastProgressAt=time;paint();return;
        }
        if(Math.abs(view.feet-step.exit.feet)>.15){hold('The portal did not land on the declared supported plane; no correction.');return;}
        receipt('fold-observed',{id:foldReceipt.id,side:foldReceipt.side,serial:foldReceipt.serial,from:foldReceipt.from,to:foldReceipt.to,chartId:view.chartId,landedFeet:view.feet,simulationElapsed:view.elapsed,physicsOwned:true,native:false});
        advance();steerNext(scene,view);paint();return;
      }
      if((view.chartId??0)!==step.chartId||Math.abs(view.feet-step.feet)>.15||view.fall){hold('The portal approach is on an unexpected physical plane; no correction.');return;}
      if(time-lastProgressAt>stuckSeconds*1000){hold('Stuck at the actual portal approach; no automatic crossing.');return;}
      steerWalk(scene,view,step);paint();return;
    }
    const expectedDropLanding=step.kind==='drop'&&stepSent&&view.level===step.expectedLevel+1;
    if(step.expectedPhase&&view.phase!==step.expectedPhase||step.expectedLevel!=null&&view.level!==step.expectedLevel&&!expectedDropLanding){hold(`Unexpected phase or catch level at ${step.label}; no route correction or warp.`);return;}
    if((view.chartId??0)!==step.expectedChart){hold('Unexpected chart at '+step.label+'; no cross-chart steering or pose correction.');return;}
    const requestedRelease=step.kind==='drop'&&stepSent&&(!view.fall?.trigger||view.fall.trigger==='release');
    if(view.fall&&!requestedRelease){receipt('physical-fall-observed',{trigger:view.fall.trigger||null,phase:view.phase,level:view.level,simulationElapsed:view.elapsed,pose:{x:view.x,z:view.z,feet:view.feet}});hold('An unrequested fall interrupted the authored route; stopped without correction.');return;}
    if(view.fall||view.handoff||view.leaving){release();lastProgressAt=time;lastPose={...view};paint();return;}
    if(step.feet!=null&&Math.abs(view.feet-step.feet)>.15){hold('Unexpected supported plane at '+step.label+'; no correction.');return;}
    if(lastPose){const moved=Math.hypot(view.x-lastPose.x,view.z-lastPose.z);if(step.kind!=='walk'&&(moved>.02||Math.abs(view.feet-lastPose.feet)>.02))lastProgressAt=time;if(held.size&&moved>.02&&moved<1.2&&Math.abs(view.feet-lastPose.feet)<.05)lastWalkDistance=moved;}
    lastPose={x:view.x,z:view.z,feet:view.feet,phase:view.phase,completed:view.completed};
    if(time-lastProgressAt>stuckSeconds*1000){hold(`Stuck at ${step.label}; recorded failure, no automatic correction.`);return;}
    if(step.kind==='walk'){
      const dx=step.x-view.x,dz=step.z-view.z;
      const distance=Math.hypot(dx,dz),tolerance=step.tolerance??.43;
      if(distance<tolerance&&(!step.transition||view.phase==='catch')){
        if(step.recognitionId)receipt('recognition-observed',{id:step.recognitionId,portalId:step.portalId,chartId:view.chartId,targetChart:step.targetChart,eye:{x:view.x,y:view.feet+C.eyeHeight,z:view.z},target:{...step.lookTarget},yaw:view.yaw,pitch:view.pitch,simulationElapsed:view.elapsed,native:false});
        advance();
        // Close tread centres are continuous walking. Releasing and pressing
        // the next keys in this same callback avoids an artificial idle tick
        // at every waypoint; doors, looks and descents still stop movement.
        steerNext(scene,view);
        return;
      }
      // Oscillating around a waypoint is not progress. Coarse digital frames
      // may fail a real chase; retain that failure instead of steering forever.
      if(bestWalkDistance==null||distance<bestWalkDistance-.02){bestWalkDistance=distance;lastProgressAt=time;}
      steerWalk(scene,view,step);
    }else if(step.kind==='stop'){
      release();running=false;finished=true;reason='closed-loop-complete';receipt('closed-loop-complete',{simulationElapsed:view.elapsed,chartId:view.chartId,pose:{x:view.x,z:view.z,feet:view.feet},physicsOwned:true,native:false});paint(true);return;
    }else if(step.kind==='look'){
      release();let yaw=step.yaw,pitch=step.pitch;if(step.lookTarget){const dx=step.lookTarget.x-view.x,dz=step.lookTarget.z-view.z;yaw=Math.atan2(dx,-dz);pitch=Math.atan2(step.lookTarget.y-(view.feet+C.eyeHeight),Math.hypot(dx,dz));if(!stepSent){receipt('actual-eye-look',{eye:{x:view.x,y:view.feet+C.eyeHeight,z:view.z},target:step.lookTarget,yaw,pitch});stepSent=true;}}scene.setLook({yaw,pitch});lastProgressAt=time;
      if(time-stepStartedAt>=step.seconds*1000)advance();
    }else if(step.kind==='door'){
      const descriptor=continuationDoors().find(d=>d.id===step.id);if(!descriptor){hold('The authored door is missing; no fallback target.');return;}const dx=descriptor.x-view.x,dz=descriptor.z-view.z;
      scene.setLook({yaw:Math.atan2(dx,-dz),pitch:-.04});
      if(!stepSent&&Math.hypot(dx,dz)>1.35){pressMove(scene,view.phase==='catch'?[dx>0?'d':'a']:['w']);return;}
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

  function key(event){if(event.code!=='F6'&&event.key!=='F6')return;if(event.repeat||!event.isTrusted)return;event.preventDefault?.();event.stopImmediatePropagation?.();if(running)hold('Stopped by native F6; movement released.');else start({trustedGesture:true,source:'native-F6'});}
  const onBlur=()=>{if(running)hold('Window lost focus; movement released. F6 resumes.');};
  win.addEventListener('keydown',key,{capture:true});win.addEventListener('blur',onBlur);doc.addEventListener?.('visibilitychange',onBlur);
  const api={status:({includeReceipts=true}={})=>({developerGuided:true,nativeInputs:false,cameraGuided:true,poseWrites:0,portalCrossings:receipts.filter(row=>row.type==='fold-observed').length,running,finished,step:index,totalSteps:plan.length,stepLabel:plan[index]?.label||null,elapsed:startedAt==null?0:(now()-startedAt)/1000,reason,...(includeReceipts?{receipts:receipts.map(r=>({...r}))}:{})}),start:()=>start(),stop:()=>hold('Explicit review stop; movement released.'),dispose(){release();disposed=true;running=false;cancelFrame(frameId);win.removeEventListener('keydown',key,{capture:true});win.removeEventListener('blur',onBlur);doc.removeEventListener?.('visibilitychange',onBlur);panel.remove();if(win.__sourceGuidedReview===api)delete win.__sourceGuidedReview;}};
  win.__sourceGuidedReview=api;paint(true);frameId=requestFrame(tick);return api;
}
