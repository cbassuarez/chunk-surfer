import {assetUrl} from '../platform/paths.js';
const unit=n=>Math.max(0,Math.min(1,Number(n)||0));

// These are recognizer estimates from the player's actual prepared recording,
// never a synthetic score, a beat grid or a substitute for unavailable audio.
export function parseSourceRestNoteScore(raw){
  if(!raw||!Array.isArray(raw.notes)||!Number.isFinite(raw.duration)||raw.duration<=0)throw Error('Invalid recorded-note score.');
  const notes=raw.notes.map((n,index)=>{
    if(!Number.isInteger(n.midi)||n.midi<21||n.midi>108||!Number.isFinite(n.onset)||n.onset<0||n.onset>=raw.duration
      ||!Number.isFinite(n.duration)||n.duration<=0)throw Error(`Invalid recorded note ${index}.`);
    return Object.freeze({id:`recorded-note-${index}`,midi:n.midi,onset:n.onset,duration:Math.min(n.duration,raw.duration-n.onset),
      velocity:unit(n.velocity),confidence:unit(n.confidence)});
  }).sort((a,b)=>a.onset-b.onset||a.midi-b.midi);
  return Object.freeze({version:raw.version||1,duration:raw.duration,sourceSha256:raw.sourceSha256||null,
    timebase:raw.timebase||'prepared playback seconds',method:raw.method||'automatic note estimates',notes:Object.freeze(notes)});
}

export function createSourceRestNoteAsset({fetcher=globalThis.fetch,resolveAsset=assetUrl,url='audio/source-rest/seb-bach-chaconne-notes.json'}={}){
  let state='unloaded',score=null,error=null,pending=null;
  const snapshot=()=>({state,score,error});
  function load(){
    if(pending)return pending;
    state='loading';
    pending=Promise.resolve().then(async()=>{
      const response=await fetcher(resolveAsset(url));
      if(!response.ok)throw Error(`Recorded-note asset unavailable (${response.status}).`);
      score=parseSourceRestNoteScore(await response.json());state='ready';return score;
    }).catch(reason=>{state='unavailable';error=String(reason?.message||reason);return null;});
    return pending;
  }
  return Object.freeze({load,snapshot});
}
