import {createThresholdGagAudio} from './threshold-gag.js';

// The borrowed room owns its cue clock. This adapter observes its earned
// edges; it never schedules a future joke or changes the demolition clock.
export function createSourceEarthfallGagAudio({getAudio=()=>null,fetcher,urlFor,
  createAudio=createThresholdGagAudio,maxEventAge=.16}={}){
  let allowed=false,observed=false,runId=null,disposed=false;
  const seen=new Set(),receipts=[];
  const sound=createAudio({getAudio,protectedAudio:()=>!allowed,
    ...(fetcher?{fetcher}:{}),...(urlFor?{urlFor}:{})});
  function ready(){return !disposed&&!!sound.snapshot().ready;}
  async function prepare(){if(disposed)return false;sound.resume();return await sound.prepare()===true;}
  function stop(){allowed=false;sound.pause();}
  function update(frame={},options={}){
    if(disposed)return snapshot();
    const nextRun=String(frame.runId??'earthfall-aside');
    if(nextRun!==runId){runId=nextRun;observed=false;seen.clear();receipts.length=0;}
    const gag=frame.gag,eye=frame.eye||[],listener={runId,x:Number(eye[0])||0,z:Number(eye[2])||0,
      feet:(Number(eye[1])||0)-1.62,yaw:Number(frame.yaw)||0,pitch:Number(frame.pitch)||0,chartId:0};
    let pair;try{pair=getAudio();}catch{}
    const context=pair?.ctx||pair?.context;
    const active=!!frame.active&&!!gag?.enabled&&Number(frame.blackoutAlpha||0)<.95
      &&!frame.protected&&!options.protected&&!options.suspended&&!options.hidden&&options.focused!==false
      &&!!context&&!['suspended','interrupted','closed'].includes(context.state);
    // Loading a checkpoint partway through the room does not earn its old
    // zero-age receipt again. Later newly crossed edges remain eligible.
    const restoredBatch=!observed&&Number(gag?.elapsed||0)>maxEventAge;
    if(frame.active&&gag?.enabled)observed=true;
    allowed=active;if(active)sound.resume();else sound.pause();
    sound.update(listener,null,gag?.soundPose||gag||{});
    for(const event of options.events||[]){
      if(!String(event?.type||'').startsWith('threshold-gag-'))continue;
      const key=String(event.id||'apparatus')+':'+event.type;
      if(seen.has(key))continue;seen.add(key);
      const age=Number.isFinite(event.age)?Math.max(0,event.age):Number.isFinite(event.at)
        ?Math.max(0,Number(gag?.elapsed||0)-event.at):0;
      const reason=!active?'protected-or-outside':restoredBatch||frame.restored||event.suppressed?'restored-baseline'
        :age>maxEventAge?'stale-no-backlog':!ready()?'bank-not-ready-no-backlog':null;
      // The shared helper consumes a suppressed semantic edge too. Opening
      // the gate later can never replay an edge missed during a protection.
      allowed=active&&!reason;const played=sound.event(event,listener);
      receipts.push({id:event.id,type:event.type,at:event.at??null,age,reason:played?'played':reason||'duplicate-or-invalid'});
      if(receipts.length>16)receipts.shift();
    }
    allowed=active;return snapshot();
  }
  function destroy(){if(disposed)return;stop();disposed=true;sound.dispose();}
  function snapshot(){return{...sound.snapshot(),runId,receipts:receipts.map(v=>({...v})),audibleGate:allowed};}
  return{prepare,ready,update,stop,destroy,snapshot};
}
