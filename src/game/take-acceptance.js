// WHAT THE CLIENT WILL ACCEPT.
//
// docs/plans/work-order.md. The client rejects weak takes: a minute that ran
// to the end but has the engineer on it is not the room. "Weak" is measured
// from what the recorder already logs, the noise events of the take, each with
// how close it came to the spoil line (ratio 1 spoils). The floor follows the
// shift's recording forgiveness, so Story forgives nearly anything that did not
// spoil and the strict shifts forgive far less.
//
// Pure: the recorder and main.js call it; nothing here touches state.
export const TAKE_REJECT_FLOOR=Object.freeze({pause:.85,standard:.6,strict:.45});
// A take called off this early never reached tape worth a cassette: the
// transport was still coming up to speed. Anything later is an attempt.
export const TAKE_FREE_ABORT_SECONDS=2;

/** The cause he writes on the sheet, from the recorder's reason and metadata. */
export function takeNoiseCause(reason='',meta={}){
  const text=`${reason} ${meta?.sourceId||''} ${meta?.sourceKind||''}`.toLowerCase();
  if(/presence|hush|apparition|it reached you|hunter/.test(text))return'PRESENCE';
  if(/breath/.test(text))return'BREATH';
  if(/handl|rummage|page|sheet|key|radio|patch|lead|torch|switch|drawer|cabinet|felt|stillson|bag/.test(text))return'HANDLING';
  if(/moved|step|crouch|lean|seating|cloth/.test(text))return'CLOTHING';
  return'NOISE';
}

/**
 * The outcome of one attempt, or null when it used no cassette.
 * `result` is REC.stopRecording()'s; `events` are REC.takeEvents().
 */
export function classifyTakeAttempt(result,{events=[],forgiveness='standard'}={}){
  if(!result)return null;
  const elapsed=Math.max(0,Number(result.elapsed)||0),list=Array.isArray(events)?events:[];
  if(result.spoiled){
    const at=list.filter(e=>e?.kind==='spoil').at(-1);
    return{outcome:'spoilt',atSec:Number(at?.atSec??elapsed)||0,cause:at?.cause||takeNoiseCause(result.reason,result.spoilMeta||{})};
  }
  if(!result.completed){
    if(elapsed<TAKE_FREE_ABORT_SECONDS)return null;
    return{outcome:'spoilt',atSec:elapsed,cause:'STOPPED'};
  }
  const floor=TAKE_REJECT_FLOOR[forgiveness]??TAKE_REJECT_FLOOR.standard;
  const worst=list.filter(e=>e?.kind==='near'&&Number(e.ratio)>=floor).sort((a,b)=>b.ratio-a.ratio||a.atSec-b.atSec)[0];
  if(worst)return{outcome:'rejected',atSec:Number(worst.atSec)||0,cause:worst.cause||'NOISE'};
  return{outcome:'clean',atSec:0,cause:null};
}
