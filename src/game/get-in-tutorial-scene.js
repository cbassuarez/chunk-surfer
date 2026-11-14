import {makeSetupLevelHoldScene} from './setup-handoff-scene.js';

export const GET_IN_TUTORIAL_REQUESTED='setup.tutorial.requested';

export function getInTutorialFinished(flags={}){
  return flags['setup.levels']===true&&flags['combat.trained']===true
    &&(flags['setup.case.skills-closed']===true||flags['setup.case.skills-done']===true&&flags['setup.case.closed']===true)
    &&flags['setup.waypoint']===true&&flags['setup.case.closed']===true;
}

// One world lease spans recorder instruction, the real level check, the
// existing imagined encounter and the case lesson. Only its real calibration
// transport advances while the outside world is held. Pause remains available.
export function makeGetInTutorialScene({
  runId='',getRunId=()=>runId,isActive=()=>true,getReading=()=>({}),
  isComplete=()=>false,isForeground=()=>false,advanceRecording=()=>{},
  onCalibrated=()=>{},onInterrupted=()=>{},onResume=()=>{},onRelease=()=>{},
}={}){
  let closed=false,calibrated=false;
  const newHold=()=>makeSetupLevelHoldScene({getReading,onReady:()=>{
    if(!calibrated){calibrated=true;onCalibrated();}
  },onInterrupted:()=>{onInterrupted();hold=newHold();}});
  let hold=newHold();
  const finish=()=>{if(closed)return;closed=true;hold.exit();onRelease();};
  return{
    id:'get-in-tutorial',blocksInput:true,blocksWorld:true,allowsLook:false,suppressesHud:true,
    update(dt){
      if(closed)return;
      if(getRunId()!==runId){finish();return;}
      if(!isActive())return;
      if(isComplete()){finish();return;}
      const reading=getReading();
      if(!reading.levelChecked&&reading.recording){
        advanceRecording(Math.min(.25,Math.max(0,Number(dt)||0)));
        hold.update();
      }
      if(!closed&&isForeground())onResume();
    },
    key(e){return e.key!=='Escape'&&e.code!=='Escape';},
    keyup(){return true;},pointer(){return true;},
    render(){if(!closed&&isForeground()&&getReading().recording)hold.render();},
    exit:finish,
  };
}
