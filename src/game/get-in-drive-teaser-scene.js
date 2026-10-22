// One transient opening vision. It borrows the finished vehicle renderer and
// existing audio context, never the Source journey or physical-tape transport.
import {createSourceDriveRenderer} from './source-drive-renderer.js';
import {SourceDriveAcoustics} from './source-drive/acoustics.js';
import {createDoorDriveTeaser} from './source-drive/door-teaser.js';
import {assetUrl} from '../platform/paths.js';

const clamp=n=>Math.max(0,Math.min(1,n));
export function makeGetInDriveTeaserScene({
  context,destination,fetcher=globalThis.fetch,
  createRenderer=createSourceDriveRenderer,
  createAcoustics=options=>new SourceDriveAcoustics(options),
  createController=createDoorDriveTeaser,
  isHeld=()=>false,paintCover=()=>{},onPause=()=>{},
  onRestore=()=>{},onDoorsClose=()=>{},onReturnTick=()=>{},onDone=()=>{},onError=()=>{},onExit=()=>{},
}={}){
  let disposed=false,restored=false,completed=false,ready=false,preparing=false;
  let prelude=0,prepareSeconds=0,error=null,current=null,doorsClosed=false,wasHeld=true,impact=false;
  const renderer=createRenderer(),controller=createController();
  let audio=null,metrics=null,pending=null,audioDisposed=false;
  function setHeld(value){
    const held=!!value;if(held===wasHeld)return;
    audio?.setPaused(held||restored);controller.setPaused(held);wasHeld=held;
    if(ready)current=controller.frame(metrics);
  }
  function disposeAudio(){if(!audio||audioDisposed)return;audioDisposed=true;audio.dispose();}
  function restore(){
    if(restored)return;restored=true;
    audio?.setPaused(true);renderer.dispose();onRestore();
  }
  function finish(){
    if(completed||disposed)return;completed=true;restore();onDone({skipped:!!current?.skipped,error});
  }
  function fail(reason){
    if(disposed||completed)return;
    error=String(reason?.message||reason);onError(reason);restore();finish();
  }
  async function prepare(){
    if(preparing||disposed)return pending;preparing=true;
    pending=(async()=>{
      const response=await fetcher(assetUrl('assets/source-drive/geometry/metrics.json'));
      if(disposed)return false;if(!response?.ok)throw Error('The opening vehicle could not be prepared.');
      metrics=await response.json();if(disposed)return false;
      const acquired=await renderer.initialize();if(disposed)return false;
      if(acquired===false)throw Error('The opening vehicle renderer could not be initialized.');
      audio=createAcoustics({context,destination,gain:.5,fetcher});
      audio.setPaused(true);
      await audio.initialize();if(disposed){disposeAudio();return false;}
      renderer.setRecorderReadout({counter:'00:00',mode:'idle',note:'FIELD TAKE · READY'});
      ready=true;controller.start();wasHeld=!!isHeld();controller.setPaused(wasHeld);audio.setPaused(wasHeld);current=controller.frame(metrics);
      return true;
    })().catch(reason=>{fail(reason);return false;});
    return pending;
  }
  function renderFrame(){
    if(!current?.renderFrame||restored)return;
    const f=current.renderFrame;
    audio?.sync(f.driveState,f.scene.cut.sources,f.weather,f.evolution,f.scene.predicaments.sources);
    if(renderer.render({...f,cinematicLook:true})===false)fail(Error('The opening drive frame could not be presented.'));
  }
  const scene={
    id:'get-in-drive-teaser',blocksWorld:true,blocksInput:true,suppressesHud:true,allowsLook:false,
    // The world-title card hands us an already black image. Keep that cover
    // continuous while acquiring the car; revealing the room here is a flash.
    get worldPresentation(){return restored?'visible':'hidden';},
    enter(){},
    update(dt){
      if(disposed||completed)return;
      const held=!!isHeld(),step=Math.max(0,Math.min(.1,Number(dt)||0));
      setHeld(held);
      if(held)return;
      if(prelude<.28){prelude+=step;if(prelude>=.28)void prepare();return;}
      if(!ready){prepareSeconds+=step;if(prepareSeconds>25)fail(Error('The opening vehicle did not become ready.'));return;}
      if(!restored)audio?.setPaused(false);
      controller.update(step);current=controller.frame(metrics);
      if(current.phase==='impact-black'&&!impact){impact=true;audio?.joint({strength:1});}
      if(current.worldOwner==='return'&&!restored)restore();
      if(restored&&!doorsClosed){doorsClosed=true;onDoorsClose();}
      if(restored)onReturnTick(step);
      renderFrame();
      if(current.finished)finish();
    },
    render(){
      // Run-level pause freezes update() below its scene. Audio and the
      // diagnostic snapshot must still follow that lifecycle immediately.
      setHeld(!!isHeld());
      const alpha=prelude<.28||!ready?1:clamp(current?.coverAlpha??1);
      if(alpha>.001)paintCover(alpha);
    },
    key(event){
      if(event.repeat)return true;
      if(event.key==='Escape'){setHeld(true);onPause();}
      return true;
    },
    pointer(){return true;},keyup(){return true;},
    setPaused:setHeld,
    blur(){setHeld(true);},focus(){setHeld(!!isHeld());},
    resume(){setHeld(!!isHeld());},
    exit(){
      if(disposed)return;disposed=true;restore();controller.dispose();disposeAudio();onExit();
    },
    view(){return{prelude,preparing,ready,restored,completed,disposed,error,...(current||{})};},
    audioDiagnostics(){return audio?.diagnostics()||null;},
    pending:()=>pending,
  };
  return scene;
}
