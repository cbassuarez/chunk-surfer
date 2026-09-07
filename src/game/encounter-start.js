import * as scenes from './scenes.js';
import { flashMode, shakeMode } from './access.js';
import { drawEncounterSplash } from '../render/encounter-view.js';

export const ENCOUNTER_PHASE = Object.freeze({ HOLD:'hold', IMPACT:'impact', VERSUS:'versus', DONE:'done' });
export const ENCOUNTER_TIMING = Object.freeze({ hold:.48, impact:.20, versus:.94 });

// The splash ends automatically. Equipment belongs to the revealed battle.
export function makeEncounterStartScene({ battle = {}, onConfirm = () => {}, fx = {}, audio = {} } = {}) {
  let phase=ENCOUNTER_PHASE.HOLD,elapsed=0,entered=false,finished=false,cancelled=false;
  const scene={
    id:'encounter-start',blocksInput:true,blocksWorld:true,freezesBelow:true,suppressesHud:true,
    lookProfile:'battle',
    enter(){if(entered)return;entered=true;fx.hold?.(180);},
    exit(){cancelled=!finished;},
    update(dt){
      if(cancelled||finished)return;
      elapsed+=Math.max(0,Math.min(.08,Number(dt)||0));
      if(elapsed<(ENCOUNTER_TIMING[phase]||0))return;
      elapsed=0;
      if(phase===ENCOUNTER_PHASE.HOLD){
        phase=ENCOUNTER_PHASE.IMPACT;
        if(shakeMode()==='full')fx.shake?.(110,3);
        audio.menuConfirm?.();
      }else if(phase===ENCOUNTER_PHASE.IMPACT)phase=ENCOUNTER_PHASE.VERSUS;
      else {phase=ENCOUNTER_PHASE.DONE;finished=true;scenes.remove(scene);onConfirm();}
    },
    key(e){return e.key!=='Escape';},keyup(){return true;},pointer(){return true;},
    view(){return {id:scene.id,phase,elapsed,started:finished};},
    render(){if(!finished)drawEncounterSplash(battle,{phase,progress:elapsed/(ENCOUNTER_TIMING[phase]||1),reducedMotion:shakeMode()!=='full'||flashMode()!=='full'});},
  };
  return scene;
}
