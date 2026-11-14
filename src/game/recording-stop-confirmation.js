const NOTICE_MS=4200;

function earlyTake(take){
  return !!take?.recording&&!!take.id&&!take.calibration&&!take.slating&&!take.stalled
    &&!take.interrupted&&!take.spoiled&&Number.isFinite(take.minimum)&&take.minimum>0
    &&Number.isFinite(take.elapsed)&&take.elapsed<take.minimum;
}

export function recordingStopPrompt(take){
  return {
    start:{
      lines:[{who:'you',text:`Only ${take.elapsed.toFixed(1)} seconds. This setup needs ${take.minimum.toFixed(1)} for a usable take.`}],
      choices:[
        {text:'Keep recording.',goto:'done',recordingStop:'continue'},
        {text:'Stop. Discard this take.',goto:'done',recordingStop:'discard'},
      ],
    },
    done:{lines:[]},
  };
}

export function createRecordingStopConfirmation({readTake,openChoice,onDiscard,now=()=>performance.now()}={}){
  let pending=null,notice=null,serial=0;
  const current=()=>readTake?.()||{};
  function show(text,take=current(),afterEnd=false){
    notice={text,id:take.id||null,runId:take.runId,until:now()+NOTICE_MS,afterEnd};
  }
  function finish(request,discard=false){
    if(pending!==request)return false;
    pending=null;
    const take=current();
    if(take.id!==request.id||!take.recording)return false;
    if(discard&&take.active!==false&&earlyTake(take)){
      show('TAKE DISCARDED · ROOM NOT COMPLETE',take,true);
      onDiscard?.();
      return true;
    }
    show('RECORDING CONTINUES',take);
    return false;
  }
  return {
    request(){
      const take=current();
      if(pending&&pending.id===take.id&&take.recording)return true;
      pending=null;
      if(!earlyTake(take)||take.active===false)return false;
      show(`TOO SHORT · ${take.elapsed.toFixed(1)} / ${take.minimum.toFixed(1)}s MIN`,take);
      const request={id:take.id,serial:++serial,discard:false};
      pending=request;
      const scene=openChoice?.({
        nodes:recordingStopPrompt(take),
        onChoice:choice=>{if(pending===request)request.discard=choice?.recordingStop==='discard';},
        onDone:()=>finish(request,request.discard),
        onCancel:()=>finish(request,false),
      });
      if(!scene&&pending===request)pending=null;
      return true;
    },
    refuse(text){show(text);},
    notice(){
      if(!notice)return '';
      const take=current();
      const sameTake=take.recording&&take.id===notice.id;
      const sameRun=take.runId===notice.runId;
      // Finishing a short take removes it from the active room slot. The
      // acknowledgment still belongs to this run until the next roll.
      const owned=sameRun&&(sameTake||(notice.afterEnd&&!take.recording));
      const deciding=sameTake&&pending?.id===notice.id;
      if(!owned||(!deciding&&now()>=notice.until)){notice=null;return '';}
      return notice.text;
    },
    inspect(){return {pending:pending?{id:pending.id,serial:pending.serial}:null,notice:notice?{...notice}:null};},
  };
}
