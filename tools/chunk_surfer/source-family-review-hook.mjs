// Injected by the task-local review server only; never a release entry point.
export const sourceFamilyReviewHook=String.raw`
if(import.meta.env.DEV&&params().has('familyReview')){
  const {installSourceFamilyReview}=await import('./dev/source-family-review.js');
  let familyStage='un-staged';
  const familyState=()=>({fixture:familyStage,scene:sourceContinuationScene?.view?.()||standingTearScene?.view?.()||null,
    sceneId:sourceContinuationScene?.id||standingTearScene?.id||null,
    renderer:sourceContinuationRenderer?.diagnostics?.()||null,
    source:chunkSurfRuntime?{phase:chunkSurfRuntime.state().phase,continuation:chunkSurfRuntime.state().sourceContinuation,
      falseReturn:chunkSurfRuntime.state().sourceFalseReturn,earthfall:chunkSurfRuntime.state().sourceEarthfall}:null,
    body:{x:px,y:py,look:R3.r3dLookAngles()},lighting:R3.r3dLightingDebug(),recording:R3.r3dPixelMeshStatus(),sd:stableDiffusionReport(),
    audio:{continuation:sourceContinuationAudio?.snapshot?.(),earthfall:sourceEarthfallAudio?.snapshot?.()},
    paused,hidden:document.hidden,focused:document.hasFocus()});
  installSourceFamilyReview({getState:familyState,getAudio:()=>({ctx:actx,output:outGain}),
    getTrace:()=>standingTearScene?.trace?.()||sourceContinuationTrace,
    exposure:value=>R3.r3dSetCaptureExposureOverride(value),
    look:(yaw,pitch)=>{const scene=sourceContinuationScene||standingTearScene;if(scene?.setLook)scene.setLook({yaw,pitch});else R3.r3dSetLookAngles({yaw,pitch,immediate:true});},
    stage:async id=>{
      releaseSourceContinuation({restore:false});R3.r3dSetCaptureExposureOverride(null);
      if(!await godEnsureTestRun())throw Error('Test run unavailable');
      if(getSave().run?.status!=='active')saveCommit({run:{...getSave().run,status:'active'}});
      while(buildingLoadPromise){if(!await buildingLoadPromise)throw Error('Building unavailable');}
      godReleaseViewForWarp();ensureCtx();sourceContinuationTrace.length=0;familyStage=id;
      if(id==='proto'){
        const site=STANDING_TEAR_LAYOUT.site,p=FP.logicalAtPhysical((site.x-3)/CELL-.5,site.z/CELL-.5,{group:'upper',floor:site.feet});
        px=p.x;py=p.y;trail=[];renderMove=null;motionRig=null;syncBuildingRender();
        const returnPose={x:px,y:py,floor:site.feet,yaw:Math.PI/2,pitch:0};
        await beginStandingTear({returnPose});
      }else if(id.startsWith('iv')){
        const {freshSourceIV}=await import('./game/source-iv.js');
        const base=freshSourceIV({runId:getSave().run.id,returnPose:{x:px,y:py,yaw:0,pitch:0}});
        const pose=id==='iv-piano'?{x:2,z:-40,yaw:-.24,pitch:.75}:id==='iv-door'?{x:0,z:-101.8,yaw:0,pitch:0}:{};
        if(!await beginEndingSourceIV({...base,...pose}))throw Error('IV review scene did not acquire ownership');
      }else{
        godEnterSourcePreset(id==='field'?CHUNK_SURF_GOD_PRESET.FIRST_LIFT:CHUNK_SURF_GOD_PRESET.FINAL,{apertureComplete:true});
        if(id==='i-door'){
          const at=chunkSurfRuntime.edgeDoorApproach();px=at.x;py=at.y;chunkSurfRuntime.setPlayerPosition(at);
          trail=[];renderMove=null;motionRig=null;R3.r3dSetLookAngles({yaw:at.yaw??0,pitch:0,immediate:true});syncSourceRender({force:true});
        }else if(['false','earthfall','wrong','catch','catch-exit'].includes(id)){
          const entry=chunkSurfRuntime.sourceContinuationEntry('forward',{runId:getSave().run.id});
          if(id==='false')await beginSourceFalseReturn(entry);
          else if(id==='earthfall')await beginSourceEarthfall(entry);
          else{
            entry.checkpoint={...entry.checkpoint,elapsed:.1,status:'active'};
            if(id==='catch'||id==='catch-exit')Object.assign(entry.checkpoint,{phase:'catch',x:-16,z:-1,feet:3,level:0,lastSafe:{x:-16,z:-1,feet:3,level:0,yaw:0,pitch:0}});
            if(id==='catch-exit')Object.assign(entry.checkpoint,{x:-25.2,z:0,feet:-15,level:5,yaw:Math.PI/2,lastSafe:{x:-25.2,z:0,feet:-15,level:5,yaw:Math.PI/2,pitch:0}});
            chunkSurfRuntime.setContinuationCheckpoint(entry.checkpoint);
            await beginSourceContinuation({checkpoint:entry.checkpoint,skipFalseReturn:true});
          }
        }
      }
      resetMotionInput('source-family-fixture',{stopRenderMove:true});ensureInteractionFocus();
      return familyState();
    }});
}
`;
