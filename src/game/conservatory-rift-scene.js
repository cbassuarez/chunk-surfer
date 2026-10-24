import {freshConservatoryRift,stepConservatoryRift,conservatoryRiftFrame,candidateStudyFrame} from './conservatory-rift.js';

// The selectable studies and the eventual in-world encounter share this owner.
// Study frames use the same frame producer; they never advance the real night.
export function createConservatoryRiftScene({optionId,sites,renderer,audio=null,
  runId='',returnPose=null,study=false,onReturn=()=>{},onError=()=>{},onTrace=()=>{}}={}){
  let state=freshConservatoryRift({optionId,sites,runId,returnPose}),ready=false,closed=false,paused=false,
    studyBeat=study?0:null,studyFrame=null,error=null,drag=null,loading=null,lastFrame=null,leaving=false;
  const keys=new Set(),clear=()=>{keys.clear();drag=null;};
  const key=e=>String(e?.key||'').toLowerCase();
  const frame=()=>studyBeat===null?conservatoryRiftFrame(state,{sites}):(studyFrame||=candidateStudyFrame(optionId,studyBeat,sites));
  function handoff(){
    if(closed||leaving||error)return false;
    leaving=true;clear();audio?.stop?.();
    const failed=e=>{if(!closed){leaving=false;error=String(e?.message||e);onError(e);}};
    try{Promise.resolve(onReturn({checkpoint:state})).catch(failed);}catch(e){failed(e);}
    return true;
  }
  function apply(input){
    const result=stepConservatoryRift(state,input,{sites});state=result.state;
    for(const event of result.events||[]){audio?.event?.(event,frame());onTrace({type:'event',event,state});}
    // Preview beats remain inspectable. Play switches to this same live owner,
    // including when the scene originally entered through the study controls.
    if(studyBeat===null&&state.status==='completed')handoff();
  }
  const scene={id:'conservatory-rift',blocksWorld:true,blocksInput:true,suppressesHud:true,
    allowsLook:false,handlesEscape:false,worldPresentation:'hidden',lookProfile:'explore',
    initialize(){if(closed)return Promise.resolve(false);return loading||=(async()=>{try{
      const available=await renderer.initialize();if(closed)return false;
      if(available===false)throw Error('The rift view is unavailable.');ready=true;return true;}
      catch(e){if(!closed){error=String(e?.message||e);onError(e);}return false;}})();},
    enter(){void scene.initialize();},
    preview(beat){if(closed||leaving||error)return frame();clear();audio?.stop?.();studyBeat=Math.max(0,Math.min(3,Math.trunc(Number(beat)||0)));studyFrame=null;return frame();},
    play(){if(closed||leaving||error)return frame();clear();audio?.stop?.();state=freshConservatoryRift({optionId,sites,runId,returnPose});studyBeat=null;studyFrame=null;return frame();},
    update(dt){
      if(!ready||closed||paused||error||leaving||studyBeat!==null)return;
      apply({dt:Math.min(.1,Math.max(0,dt||0)),forward:Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),
        side:Number(keys.has('d'))-Number(keys.has('a')),turn:Number(keys.has('arrowright'))-Number(keys.has('arrowleft')),held:keys.has('e')});
      if(!closed&&!leaving&&!error)audio?.update?.(frame(),{dt});
    },
    key(e={}){
      if(closed||leaving||error)return true;
      const k=key(e);if(k==='escape'){clear();return false;}
      if(!ready||closed||paused||error)return true;
      if(k==='x'&&!e.repeat){if(studyBeat===null)apply({dt:0,stop:true});else handoff();return true;}
      if(studyBeat!==null)return true;
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright','e'].includes(k)){
        if(!e.repeat)keys.add(k);
        if(k==='e'&&!e.repeat)apply({dt:0,interact:true,held:true});
      }return true;
    },
    keyup(e={}){keys.delete(key(e));return true;},
    pointer(e={}){
      if(!ready||closed||paused||error||leaving||studyBeat!==null)return true;
      if(e.type==='pointerdown'&&e.button===2)drag={x:e.clientX,y:e.clientY};
      if(e.type==='pointerup'||e.type==='pointercancel')drag=null;
      if(e.type==='pointermove'&&drag){const f=frame();apply({dt:0,lookYaw:f.camera.yaw+(e.clientX-drag.x)*.004,
        lookPitch:Math.max(-1.35,Math.min(.7,f.camera.pitch-(e.clientY-drag.y)*.003))});drag={x:e.clientX,y:e.clientY};}return true;
    },
    render(){if(ready&&!closed&&!error){lastFrame=frame();try{if(renderer.render(lastFrame)===false)throw Error('The rift frame is unavailable.');}
      catch(e){error=String(e?.message||e);onError(e);}}},
    pause(){if(closed)return;paused=true;clear();audio?.stop?.();},resume(){if(closed)return;paused=false;clear();},
    view:()=>({ready,closed,paused,error,leaving,studyBeat,optionId,state:JSON.parse(JSON.stringify(studyBeat===null?state:frame().studyState)),frame:frame(),renderedFrame:lastFrame,renderer:renderer.diagnostics?.()}),
    exit(){if(closed)return;closed=true;ready=false;clear();audio?.destroy?.();renderer.dispose?.();},
  };return scene;
}
