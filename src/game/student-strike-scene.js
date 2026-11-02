// The film borrows the picture, never the walking checkpoint. Its host owns
// ordinary-world rendering and must confirm restoration beneath full black.
// No progression, voice loan or Contact is read or changed by this owner.
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const keyOf=event=>String(event?.code||event?.key||'').toLowerCase().replace(/^key/,'');
const cueKey=cue=>cue?String(cue.id||`${cue.actorId||cue.speaker||''}:${cue.text||''}`):null;

export function createStudentStrikeScene({
  returnPose=null,getReturnPose=()=>null,checkpoint=null,revision='student-strike-refusal-1',
  durationSeconds=65,returnAtSeconds=59,sampleFilm,toWorldView=frame=>frame,
  prepare=async()=>true,getPresentationReady=()=>true,
  isPaused=()=>false,isHidden=()=>false,inputActive=()=>true,
  onRestore=async()=>true,onDone=()=>{},onExit=()=>{},onError=()=>{},
  onPause=()=>{},onResume=()=>{},onNarration=()=>{},onShot=()=>{},onCheckpoint=()=>{},
  getNarration=frame=>frame?.narration||frame?.dialogue||null,
  paintCover=()=>{},paintSubtitle=()=>{},
  preparationTimeoutSeconds=30,restoreTimeoutSeconds=30,recoveryRevealSeconds=.5,
  entryRevealSeconds=.18,reducedMotion=false,
}={}){
  if(typeof sampleFilm!=='function')throw Error('The student-strike film needs its authored timeline.');
  if(!(durationSeconds>0&&returnAtSeconds>=0&&returnAtSeconds<durationSeconds))throw Error('Invalid student-strike film duration or return threshold.');
  const resumable=checkpoint?.kind==='student-strike'&&checkpoint?.returnPose;
  let pose=returnPose==null?null:freeze(clone(returnPose));
  let phase='loading',elapsed=0,entered=false,closed=false,done=false,ready=false;
  let paused=false,blurred=false,reviewPaused=false,presentationHeld=false,heldState=false;
  let preparationSeconds=0,restoreSeconds=0,recoverySeconds=0,error=null,reportedError=null;
  let restored=false,normalReturn=false,skipped=false,reason=null,restoring=false;
  let preparingPromise=null,restorePromise=null,cachedFrame=null,cachedTime=null;
  let lastShot=null,lastCue=null,exitIssued=false,restoreAttempt=0,checkpointAt=-1,restoreController=null;
  const heldKeys=new Set(),lifetime=new AbortController();
  const live=()=>!closed&&!done;
  const snapshot=()=>({schema:1,kind:'student-strike',revision,phase,elapsed,
    returnPose:clone(pose),resumePolicy:'restore-entry',completed:done&&reason==='complete',skipped,restored,error});
  function report(cause){
    error=String(cause?.message||cause||'The student-strike film is unavailable.');
    if(error===reportedError)return;
    reportedError=error;
    try{onError(cause instanceof Error?cause:Error(error),{phase,elapsed,returnPose:clone(pose)});}catch{}
  }
  function call(callback,...args){
    try{const result=callback(...args);if(result?.catch)result.catch(cause=>{if(!closed)report(cause);});return result;}
    catch(cause){report(cause);return undefined;}
  }
  const hostHeld=()=>paused||blurred||reviewPaused||!!isPaused()||!!isHidden()||!inputActive();
  function syncHeld(){
    const held=hostHeld()||presentationHeld||phase==='restoring'||phase==='restore-failed';
    if(held!==heldState){heldState=held;heldKeys.clear();call(held?onPause:onResume);}
    return held;
  }
  function clearNarration(){if(lastCue!==null){lastCue=null;call(onNarration,null,{elapsed,frame:cachedFrame});}}
  function save(reason){call(onCheckpoint,snapshot(),{reason});}
  function finish(){
    if(!live())return false;
    done=true;clearNarration();heldKeys.clear();save('finished');
    call(onDone,{completed:reason==='complete',skipped,error,restored,returnPose:clone(pose),reason});
    return true;
  }
  function beginRestore(nextReason='complete'){
    if(!live()||restoring||phase==='restore-failed')return restorePromise;
    reason=nextReason;normalReturn=nextReason==='complete';
    skipped=nextReason==='skipped'||nextReason==='withdrawn';
    phase='restoring';restoring=true;ready=false;restoreSeconds=0;recoverySeconds=0;
    clearNarration();heldKeys.clear();syncHeld();save('restore-start');
    restoreController?.abort();restoreController=new AbortController();
    const attempt=++restoreAttempt;
    const isCurrent=()=>live()&&phase==='restoring'&&attempt===restoreAttempt&&!lifetime.signal.aborted;
    restorePromise=Promise.resolve().then(()=>{
      if(!isCurrent())return false;
      return onRestore({returnPose:clone(pose),elapsed,reason,completed:false,skipped,error,
        naturalReturn:normalReturn,signal:restoreController.signal,isCurrent});
    }).then(ok=>{
      if(!isCurrent())return false;
      if(ok===false)throw Error('The ordinary world has not confirmed the student-strike return.');
      // A successful body/view restoration and a presentable ordinary frame
      // are separate receipts. Even a short skip/error return waits for both.
      const presentationReady=!!getPresentationReady();
      restored=true;restoring=false;ready=true;phase='returning';cachedTime=null;
      presentationHeld=!presentationReady;
      syncHeld();save('restore-ready');
      return true;
    }).catch(cause=>{
      if(!isCurrent())return false;
      restoring=false;phase='restore-failed';restoreController.abort();report(cause);syncHeld();save('restore-failed');
      return false;
    });
    return restorePromise;
  }
  function fail(cause){
    if(!live())return;
    report(cause);
    if(phase==='restoring'||phase==='restore-failed')return;
    void beginRestore('error');
  }
  function frame(){
    if(cachedTime===elapsed)return cachedFrame;
    try{
      cachedFrame=sampleFilm(elapsed,{returnPose:clone(pose),reducedMotion});cachedTime=elapsed;
      if(!cachedFrame||typeof cachedFrame!=='object')throw Error('The student-strike timeline supplied no frame.');
      return cachedFrame;
    }catch(cause){cachedFrame=null;cachedTime=elapsed;fail(cause);return null;}
  }
  function notifyFrame(){
    const value=frame();if(!value||!live())return;
    if(value.shotId!==lastShot){lastShot=value.shotId;call(onShot,value,{elapsed});}
    const cue=getNarration(value),key=cueKey(cue);
    if(key!==lastCue){lastCue=key;call(onNarration,cue?clone(cue):null,{elapsed,frame:value});}
  }
  function alpha(){
    if(['loading','awaiting-frame','restoring','restore-failed'].includes(phase))return 1;
    if(phase==='returning'&&presentationHeld)return 1;
    if(phase==='returning'&&!normalReturn)return 1-smooth(recoverySeconds/Math.max(.001,recoveryRevealSeconds));
    const authored=clamp(Number(frame()?.black)||0);
    return phase==='playing'&&entryRevealSeconds>0?Math.max(authored,1-smooth(elapsed/entryRevealSeconds)):authored;
  }
  const scene={
    id:'student-strike',suppressesHud:true,handlesEscape:false,worldPresentation:'visible',lookProfile:'calm',
    get blocksInput(){return live();},get blocksWorld(){return live();},
    get allowsLook(){return live()?false:undefined;},
    get returning(){return ['restoring','restore-failed','returning'].includes(phase);},
    initialize(){
      if(preparingPromise)return preparingPromise;
      if(!live())return Promise.resolve(false);
      try{
        if(!pose)pose=freeze(clone(getReturnPose()||resumable&&checkpoint.returnPose));
        if(!pose||typeof pose!=='object')throw Error('The student-strike film needs the exact operator return pose.');
      }catch(cause){
        // Without an entry pose there is nothing the scene can truthfully
        // declare restored. Leave recovery to the host rather than invent one.
        phase='restore-failed';reason='error';report(cause);syncHeld();
        preparingPromise=Promise.resolve(false);return preparingPromise;
      }
      if(resumable){
        // A saved camera frame is not proof of residency in a new document.
        // Restore the saved body/view; never auto-replay a partial account.
        reason='reload';elapsed=clamp(Number(checkpoint.elapsed)||0,0,durationSeconds);
        preparingPromise=beginRestore('reload');return preparingPromise;
      }
      save('loading');
      preparingPromise=Promise.resolve().then(()=>{
        if(!live()||phase!=='loading')return false;
        return prepare({signal:lifetime.signal,isCurrent:()=>live()&&phase==='loading',returnPose:clone(pose)});
      }).then(ok=>{
        if(!live()||phase!=='loading')return false;
        if(ok===false||ok?.ready===false||ok?.error)throw Error(ok?.error||'The student-strike film could not be prepared.');
        ready=true;phase='awaiting-frame';save('prepared');return true;
      }).catch(cause=>{if(live()&&phase==='loading')fail(cause);return false;});
      return preparingPromise;
    },
    enter(){if(entered||closed)return;entered=true;void scene.initialize();},
    presented(){
      if(!live()||phase!=='awaiting-frame'||hostHeld())return false;
      try{if(!getPresentationReady())return false;}catch(cause){fail(cause);return false;}
      phase='playing';presentationHeld=false;syncHeld();notifyFrame();save('first-frame');return true;
    },
    update(dt){
      if(!live())return;
      const step=clamp(Number(dt)||0,0,.1);
      if(!hostHeld()&&(phase==='playing'||phase==='returning')){
        try{presentationHeld=!getPresentationReady();}catch(cause){fail(cause);}
      }
      if(!hostHeld()&&phase==='restoring'){
        restoreSeconds+=step;
        if(restoreSeconds>restoreTimeoutSeconds){
          restoreAttempt++;restoreController?.abort();restoring=false;phase='restore-failed';
          report(Error('The ordinary world did not become ready for the student-strike return.'));save('restore-failed');
        }
      }
      if(syncHeld())return;
      if(phase==='loading'||phase==='awaiting-frame'){
        preparationSeconds+=step;
        if(preparationSeconds>preparationTimeoutSeconds)fail(Error('The student-strike film did not become ready.'));
        return;
      }
      if(phase==='restoring')return;
      if(phase==='restore-failed'||phase==='awaiting-frame')return;
      if(phase==='playing'||phase==='returning'&&normalReturn){
        const next=Math.min(durationSeconds,elapsed+step);
        elapsed=phase==='playing'?Math.min(returnAtSeconds,next):next;cachedTime=null;
        const value=frame();
        if(!live()||phase==='restoring'||phase==='restore-failed')return;
        if(phase==='playing'&&(value?.nativeReturn===true||elapsed>=returnAtSeconds)){
          void beginRestore('complete');return;
        }
        notifyFrame();
        if(elapsed-checkpointAt>=1){checkpointAt=elapsed;save('position');}
        if(phase==='returning'&&elapsed>=durationSeconds)finish();
        return;
      }
      if(phase==='returning'){
        recoverySeconds=Math.min(recoveryRevealSeconds,recoverySeconds+step);
        if(recoverySeconds>=recoveryRevealSeconds)finish();
      }
    },
    worldView(){
      if(!live()||scene.returning||phase==='loading')return null;
      const value=frame();
      try{return value?toWorldView(value,{returnPose:clone(pose),elapsed,phase}):null;}
      catch(cause){fail(cause);return null;}
    },
    render(){
      if(!live())return;
      const value=frame(),black=alpha();
      if((phase==='playing'||phase==='returning'&&normalReturn)&&black<.999){
        const cue=getNarration(value);if(cue)paintSubtitle(clone(cue),{elapsed,frame:value});
      }
      if(black>.0001)paintCover(black);
    },
    key(event={}){
      const key=keyOf(event),identity=key||'action:'+String(event.controllerAction||'');
      if(key==='escape'||event.controllerAction==='back')return false;
      const fresh=!event.repeat&&!heldKeys.has(identity);heldKeys.add(identity);
      if(!live()||hostHeld()||event.ctrlKey||event.metaKey||event.altKey)return true;
      if(fresh&&(key==='x'||event.controllerAction==='skip'))scene.withdraw('skipped');
      return true;
    },
    keyup(event={}){heldKeys.delete(keyOf(event)||'action:'+String(event.controllerAction||''));return true;},
    pointer(){return true;},
    withdraw(nextReason='withdrawn'){
      if(!live()||scene.returning)return false;
      void beginRestore(nextReason==='skipped'?'skipped':'withdrawn');return true;
    },
    retryRestore(){
      if(!live()||phase!=='restore-failed')return Promise.resolve(false);
      if(!pose){
        try{pose=freeze(clone(getReturnPose()||resumable&&checkpoint.returnPose));
          if(!pose||typeof pose!=='object')throw Error('The student-strike film still has no operator return pose.');
        }catch(cause){report(cause);return Promise.resolve(false);}
      }
      phase='loading';return beginRestore(reason||'error');
    },
    pause(){if(!live())return false;paused=true;syncHeld();return true;},
    resume(){if(!live())return false;paused=false;syncHeld();return true;},
    setPaused(value){return value?scene.pause():scene.resume();},
    blur(){if(!live())return false;blurred=true;syncHeld();save('blur');return true;},
    focus(){if(!live())return false;blurred=false;syncHeld();return true;},
    textReviewSuspend(){reviewPaused=true;syncHeld();},
    textReviewResume(){reviewPaused=false;syncHeld();},
    serialize:snapshot,checkpoint:()=>{save('requested');return snapshot();},
    pending:()=>preparingPromise,returnPending:()=>restorePromise,
    view(){return {phase,elapsed,frame:frame(),black:alpha(),returning:scene.returning,ready,closed,
      paused,blurred,reviewPaused,presentationHeld,held:heldState,restored,complete:done&&reason==='complete',done,skipped,error,
      returnPose:clone(pose),checkpoint:snapshot(),reason};},
    exit(){
      if(closed)return false;
      closed=true;heldKeys.clear();clearNarration();lifetime.abort();restoreController?.abort();restoreAttempt++;
      if(!exitIssued){exitIssued=true;call(onExit,{completed:done&&reason==='complete',skipped,error,restored,
        returnPose:clone(pose),reason:reason||'interrupted',checkpoint:snapshot(),needsRestore:!restored&&!done});}
      return true;
    },
  };
  return scene;
}
