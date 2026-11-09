import {createOpeningCrashAftermathAudio,OPENING_CRASH_AFTERMATH} from '../audio/opening-crash-aftermath.js';

// The wreck has gone dark; allow the intimate sounds to settle before the
// complete title arrives. The host removes this owner before pushing the card.
export function makeOpeningCrashAftermathScene({context,destination,
  duration=OPENING_CRASH_AFTERMATH.seconds,isHeld=()=>false,
  createAudio=createOpeningCrashAftermathAudio,paintCover=()=>{},onDone=()=>{},onPause=()=>{},onExit=()=>{},
}={}){
  let elapsed=0,done=false,closed=false,held=false,audio=null,audioRetired=false;
  function setPaused(value){held=!!value;audio?.setPaused(held);}
  function retireAudio(){if(audioRetired)return;audioRetired=true;audio?.dispose();}
  return{
    id:'opening-crash-aftermath',blocksInput:true,blocksWorld:true,suppressesHud:true,allowsLook:false,worldPresentation:'hidden',
    enter(){audio=createAudio({context,destination});setPaused(isHeld());},
    update(dt){
      if(done||closed)return;setPaused(isHeld());if(held)return;
      elapsed=Math.min(duration,elapsed+Math.max(0,Math.min(.1,Number(dt)||0)));audio?.update(elapsed);
      if(elapsed>=duration){done=true;retireAudio();onDone();}
    },
    render(){setPaused(isHeld());paintCover(1);},
    key(event){if(event.key==='Escape'&&!event.repeat){setPaused(true);onPause();}return true;},
    setPaused,blur(){setPaused(true);},focus(){setPaused(isHeld());},resume(){setPaused(isHeld());},
    exit(){if(closed)return;closed=true;retireAudio();onExit();},
    view(){return{elapsed,duration,done,closed,held,audio:audio?.snapshot?.()||null};},
  };
}
