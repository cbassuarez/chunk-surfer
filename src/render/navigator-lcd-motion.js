// Presentation history only. Current digits, warnings and active meter cells
// always remain exact supplied truth. The caller owns every animation clock.
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function sampleNavigatorLcdMotion(previous,state,{nowMs=0,paused=false,reducedMotion=false}={}){
  const now=Math.max(0,finite(nowMs)),initial=!previous||previous.version!==2||now<previous.lastNowMs;
  const dt=initial||paused||now<previous.lastNowMs?0:clamp(now-previous.lastNowMs,0,80);
  const clock=(initial?0:previous.clockMs)+dt;
  const takesEnabled=(state.takesEnabled??state.takesVisible)!==false;
  const previousTakesEnabled=(previous?.takesEnabled??previous?.takesVisible)!==false;
  const takesChanged=!initial&&takesEnabled&&previousTakesEnabled&&state.takes!==previous.takes;
  const takesIncreased=takesChanged&&state.takes>previous.takes;
  const resetting=takesChanged&&state.takes<previous.takes;
  const injuryChanged=!initial&&state.injuries>previous.injuries;
  const warningChanged=!initial&&state.monitor.warning&&state.monitor.status!==previous.monitorStatus;
  const takeAt=takesIncreased?clock:initial||resetting||!takesEnabled||!previousTakesEnabled?-Infinity:previous.takeAt;
  const alertKind=injuryChanged?'injury':warningChanged?'warning':initial||resetting?null:previous.alertKind;
  const alertAt=!state.monitor.available&&alertKind==='warning'?-Infinity
    :injuryChanged||warningChanged?clock:initial||resetting?-Infinity:previous.alertAt;
  const takeResponse=reducedMotion?0:Math.max(0,1-(clock-takeAt)/360);
  const alertResponse=reducedMotion?0:Math.max(0,1-(clock-alertAt)/460);
  const afterimage=Array.from({length:24},(_,index)=>{
    if(!state.monitor.available||reducedMotion)return 0;
    if(index<state.monitor.segments)return 1;
    return Math.max(0,(initial||resetting?0:previous.afterimage[index]||0)-dt/110);
  });
  return {version:2,lastNowMs:now,clockMs:clock,takesEnabled,takesVisible:takesEnabled,takes:state.takes,injuries:state.injuries,
    monitorStatus:state.monitor.status,takeAt,alertAt,alertKind,takeResponse,alertResponse,afterimage,
    illumination:Math.max(takeResponse*.12,alertResponse*.09),
    changedSlot:takesIncreased?state.takes-1
      :takeResponse>0?previous?.changedSlot??-1:-1};
}
