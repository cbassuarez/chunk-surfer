import {ENDING_DRIVE_OFF,createEndingDriveOff} from './ending-drive-off.js';
import {createEndingDriveOffRenderer} from '../render/ending-drive-off-renderer.js';
import {SourceDriveAcoustics} from './source-drive/acoustics.js';
import {assetUrl} from '../platform/paths.js';

const KEYS=Object.freeze({w:'forward',arrowup:'forward',s:'reverse',arrowdown:'reverse',a:'left',arrowleft:'left',d:'right',arrowright:'right',' ':'brake'});
const ACTIONS=Object.freeze({forward:'forward',moveForward:'forward',reverse:'reverse',backward:'reverse',moveBackward:'reverse',left:'left',moveLeft:'left',strafeLeft:'left',right:'right',moveRight:'right',strafeRight:'right',brake:'brake'});
const HINT_SECONDS=6;
// It can never strand the player: if the picture or its assets fail, the ending goes
// straight on to the credits it was already owed.
export function makeEndingDriveOffScene({context,destinationAudio,reducedMotion=false,isHeld=()=>false,paintCover=()=>{},paintHint=()=>{},onRestore=()=>{},onDone=()=>{},onPause=()=>{},onError=()=>{},
  fetcher=globalThis.fetch?.bind(globalThis),createRenderer=createEndingDriveOffRenderer,createAudio=options=>new SourceDriveAcoustics(options),createController=createEndingDriveOff}={}){
  const controller=createController({reducedMotion});
  let metrics=null,renderer=null,audio=null,ready=false,presented=false,closed=false,completed=false,restored=false,paused=false,blurred=false,audioDisposed=false,skipHeld=false,drag=null;
  const frozen=()=>paused||blurred||isHeld();
  function disposeAudio(){if(!audio||audioDisposed)return;audioDisposed=true;audio.dispose?.();}
  function restore(){if(restored)return;restored=true;disposeAudio();renderer?.dispose?.();onRestore();}
  function finish(error=null){if(closed||completed)return;completed=true;paintCover(1);restore();onDone({error});}
  function fail(reason){onError(reason);finish(String(reason?.message||reason));}
  const scene={id:'ending-drive-off',blocksWorld:true,blocksInput:true,suppressesHud:true,allowsLook:false,handlesEscape:true,worldPresentation:'hidden',faceplate:false,
    async initialize(){
      try{
        const response=await fetcher(assetUrl('assets/source-drive/geometry/metrics.json'));if(closed)return false;
        if(!response?.ok)throw Error('The van geometry could not be prepared.');
        metrics=await response.json();if(closed)return false;
        renderer=createRenderer();
        if(await renderer.initialize()===false)throw Error('The road could not be prepared.');if(closed)return false;
        audio=createAudio({context,destination:destinationAudio,gain:.48,fetcher});audio.setPaused(true);await audio.initialize();
        if(closed){disposeAudio();return false;}
        ready=true;return true;
      }catch(reason){if(!closed)fail(reason);return false;}
    },
    update(dt){
      if(closed||completed)return;
      const hold=frozen();audio?.setPaused(hold||!ready||!presented||restored);
      if(hold){drag=null;controller.releaseInput();controller.update(0,{held:true});return;}
      if(!ready||!presented)return;
      if(controller.update(dt,{skipHeld}).done)finish();
    },
    render(){
      if(closed||completed)return;
      if(!ready){paintCover(1);return;}
      presented=renderer.render(controller,metrics)!==false;
      if(!presented){audio?.setPaused(true);paintCover(1);return;}
      const actual=renderer.last?.(),v=controller.view();
      if(actual)audio?.sync(actual.driveState,[],actual.weather,actual.evolution,[]);
      audio?.setPaused(frozen());paintCover(v.cover);
      const early=(v.phase==='road'||v.phase==='walk')&&v.phaseTime<HINT_SECONDS;
      if(v.skipTime>.12||early)paintHint(v.skipTime>.12?Math.min(1,v.skipTime/ENDING_DRIVE_OFF.skipSeconds):Math.min(1,v.phaseTime/1.4,(HINT_SECONDS-v.phaseTime)/1.4)*.55);
    },
    key(event={}){
      const k=String(event.key||'').toLowerCase();
      if(k==='escape'||event.controllerAction==='back'){onPause();return true;}
      if(k==='e'||event.code==='KeyE'||event.controllerAction==='interact'){skipHeld=true;return true;}
      const action=KEYS[k]||ACTIONS[event.controllerAction];
      if(action&&!event.repeat&&!frozen())controller.input(action,true);
      return true;
    },
    keyup(event={}){
      const k=String(event.key||'').toLowerCase();
      if(k==='e'||event.code==='KeyE'||event.controllerAction==='interact')skipHeld=false;
      const action=KEYS[k]||ACTIONS[event.controllerAction];
      if(action)controller.input(action,false);
      return true;
    },
    pointer(event){
      if(closed||!ready||frozen())return true;
      if(event.type==='pointerdown')drag={x:event.clientX,y:event.clientY};
      if(event.type==='pointerup'||event.type==='pointercancel')drag=null;
      if(event.type==='pointermove'){
        const dx=Number.isFinite(event.movementX)&&event.buttons?event.movementX:drag?event.clientX-drag.x:0,dy=Number.isFinite(event.movementY)&&event.buttons?event.movementY:drag?event.clientY-drag.y:0;
        controller.lookDelta(dx,dy);if(drag)drag={x:event.clientX,y:event.clientY};
      }
      return true;
    },
    pause(){paused=true;controller.releaseInput();audio?.setPaused(true);},resume(){paused=false;},blur(){blurred=true;controller.releaseInput();audio?.setPaused(true);},focus(){blurred=false;},
    exit(){if(closed)return;closed=true;restore();},
    view:()=>({ready,presented,completed,...controller.snapshot()}),
    review:{controller},
  };
  return scene;
}
