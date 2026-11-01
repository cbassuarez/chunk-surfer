// Existing credited CC0 physical material only. The source documentary panel
// recording and authored short reflections are not measured room responses or
// a newly recorded full-building demolition. The separate warning player uses
// a retained CC0 real industrial horn, not TTS or a synthesized siren.
import {createFirstStrikeWarningAudio} from './first-strike-warning.js';
import {createSourceDemolitionAudio} from './source-demolition.js';
import {SOURCE_DEMOLITION_AUDIO_SOURCES} from '../data/source-demolition-audio.js';
export const FIRST_STRIKE_AUDIO_PROVENANCE=Object.freeze({sources:SOURCE_DEMOLITION_AUDIO_SOURCES,processing:'Existing source-demolition bank, normal SFX bus, fixed-world HRTF/distance/low-pass and explicitly authored reflection taps.',horn:{title:'Industrial Air Horn',author:'mcpable',license:'CC0 1.0',url:'https://freesound.org/people/mcpable/sounds/131930/',source:'Retained licensed HQ MP3 preview; original WAV not held'},limitations:'No new documentary full-building fracture recording; visible construction remains complete when audio is unavailable.'});
export function createFirstStrikeAudio(options={}){
 const material=options.material||createSourceDemolitionAudio(options);let muted=true,history=[],lastBodyAt=-Infinity;const horn=options.horn||createFirstStrikeWarningAudio(options);
 return{ready:()=>Promise.all([material.ready?.(),horn.ready?.()]).then(r=>r.some(Boolean)),prepareWarnings:()=>horn.ready?.(),warning:(event,p)=>horn.warn?.(event,p),updateWarnings:p=>horn.update?.(p),update(frame={},presentation={}){
  const protectedAudio=!!(presentation.protected||presentation.paused||presentation.suspended||presentation.hidden||presentation.focused===false||presentation.foreground===false),events=[];
  for(const event of frame.events||[]){let type=event.type==='strain'?'strain':event.type==='first-strike'?'release':event.type==='joint-hang'?'course':event.type==='course-release'?'release':event.type==='final-settlement'?'course':event.type==='terminal'?'consumed':null;if(!type)continue;if(type==='release'){if(frame.elapsed-lastBodyAt<5.5)type='course';else lastBodyAt=frame.elapsed;}
   // Release events remain individually anchored; the original voice budget
   // rejects excess material instead of creating a louder synthetic monster.
   const mapped={...event,type,gain:event.type==='course-release'?.52:.70};events.push(mapped);history.push({id:event.id,semantic:event.type,type,protected:protectedAudio});
  }horn.update?.(presentation);if(history.length>128)history=history.slice(-128);muted=protectedAudio;
  return material.update({...frame,active:frame.active!==false,clock:frame.elapsed,blackness:frame.darkness,events},{...presentation,protected:protectedAudio,suspended:!!presentation.suspended,listener:presentation.listener});
 },stop(){muted=true;material.stop?.();horn.stop?.();},snapshot:()=>({...material.snapshot?.(),firstStrike:true,muted,horn:horn.snapshot?.(),history:[...history],provenance:FIRST_STRIKE_AUDIO_PROVENANCE}),destroy(){material.destroy?.();horn.dispose?.();},dispose(){material.destroy?.();horn.dispose?.();}};
}
