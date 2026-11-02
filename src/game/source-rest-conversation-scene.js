import * as scenes from './scenes.js';
import {makeColdOpenScene} from './coldopen.js';
import {sourceRestConversation} from '../data/source-rest-conversation.js';
import {createSourceRestClock,SOURCE_REST_CUES,SOURCE_REST_CATCH_CLOCK_OPTIONS} from './source-rest-pacing.js';
import {sourceRestPresentationView} from './source-rest-presentation.js';
import {sourceRestInterfacePresentation,sourceRestInterfaceView} from './source-rest-interface.js';

export const SOURCE_REST_REPLY_SECONDS=8;

// Adapt authored rest choices to the same transcript and picker the rest of
// the game uses. The local player has already chosen what to say at each
// branch: do not add a second one-option confirmation for every spoken line.
export function sourceRestColdOpenNodes(story){
  if(!story?.nodes||!story?.entry||!story.nodes[story.entry])throw Error('A complete Source rest conversation is required.');
  return Object.fromEntries(Object.entries(story.nodes).map(([id,node])=>[id,{
    lines:(node.lines||[]).map((entry,index)=>({
      who:entry.who==='you'?'me':'unknown',say:false,voice:false,text:entry.text,
      sourceId:`${story.id}:${id}:line:${index}`,
    })),
    choices:(node.choices||[]).filter(choice=>!node.lockExit||choice.action!=='leave').map(choice=>({
      text:choice.label,contentId:`${story.id}:${id}:${choice.id}`,
      ...(choice.next?{goto:choice.next}:{restAction:choice.action}),
    })),
    ...(node.next?{goto:node.next}:{}),
  }]));
}

/** A transcript layered on the existing Source scene: it owns no music or
 * world clock. `onDone` receives exactly one `leave` or `commit`; caller owns
 * the bodily transition and ending. Escape leaves until the authored lock. */
export function makeSourceRestConversationScene({phase,sarahNamed=false,story=sourceRestConversation(phase,{sarahNamed}),onDone=()=>{},onChoice,onLine,
  audio,getAudio,cue,fx,replay,allowsLook=true,getMusicState,getPresentationActive=null,onPause=null,onRecorder=null,getRecorderState=()=>null,resumeFrom=null}={}){
  const authored=sourceRestColdOpenNodes(story);
  const sourcePhase=story.phase||phase,automatic=(sourcePhase==='wrong-return'||story.timed===true)&&typeof getMusicState==='function',
    chapterCues=story.cues||SOURCE_REST_CUES;
  const clock=automatic?createSourceRestClock(getMusicState,{...(sourcePhase==='catch'?SOURCE_REST_CATCH_CLOCK_OPTIONS:{}),resumeFrom:resumeFrom?.clock}):null;
  // A silent first beat lets each chapter wait for its musical moment without
  // making the player press a Continue button or cutting off the last line.
  const opening=automatic?Object.fromEntries(Object.entries(authored).map(([id,node])=>[id,
    Object.hasOwn(chapterCues,id)?{...node,lines:[{who:'direction',text:'',voice:false,say:false,
      sourceId:`source-rest-cue:${id}`},...node.lines]}:node])):authored;
  // Choosing, committing and delivering are separate states. The wrapper
  // leaves a selected answer undoable; the silent delivery node is entered
  // only after that visible window has completed.
  if(automatic)for(const [id,node] of Object.entries(opening))node.choices=(node.choices||[]).map((choice,index)=>{
    if(!choice.goto)return choice;
    const gate=`source-rest-delivery:${id}:${index}`;
    const first=authored[choice.goto]?.lines?.[0],same=first?.who==='me'&&first.text===choice.text;
    opening[gate]={lines:[{who:'direction',text:'',voice:false,say:false,sourceId:gate},
      ...(!same?[{who:'me',text:choice.text,voice:false,say:false,sourceId:`source-rest-response:${choice.contentId}`}]:[])],choices:[],goto:choice.goto};
    return {...choice,goto:gate,restDeliveryTarget:choice.goto};
  });
  let outcome=null,delivered=false,exited=false,locked=!!resumeFrom?.locked,lineKey='',lineAt=0,choiceKey='',choiceAt=0,nodeKey='',nodeAt=0,
    queuedReply=resumeFrom?.queuedReply?{...resumeFrom.queuedReply}:null,
    replySelection=resumeFrom?.replySelection?{...resumeFrom.replySelection}:null,
    decisionHeld=false,interfaceAfterInterruption=!!resumeFrom?.interfaceAfterInterruption;
  const resumedNode=resumeFrom?.nodeId&&opening[resumeFrom.nodeId]?resumeFrom.nodeId:null;
  if(replySelection){
    const options=opening[replySelection.nodeId]?.choices||[],index=options.findIndex(option=>option.contentId===replySelection.contentId),
      remaining=Number(replySelection.remaining??replySelection.releaseAt-(resumeFrom?.clock?.heardSeconds||0));
    replySelection=index>=0&&!queuedReply?{...replySelection,index,remaining:Number.isFinite(remaining)?Math.max(0,Math.min(SOURCE_REST_REPLY_SECONDS,remaining)):SOURCE_REST_REPLY_SECONDS,
      resumeHold:true}:null;
  }
  if(resumedNode&&resumeFrom.lineSourceId){
    const index=opening[resumedNode].lines.findIndex(line=>line.sourceId===resumeFrom.lineSourceId);
    if(index>0)opening[resumedNode]={...opening[resumedNode],lines:opening[resumedNode].lines.slice(index)};
  }
  if(queuedReply&&opening[queuedReply.gateId]?.lines?.[1])opening[queuedReply.gateId].lines[1].text=queuedReply.text;
  const interruptionNode=sourcePhase==='catch'?'electronics':'interruption',
    interruption=()=>automatic&&nodeKey===interruptionNode&&clock.snapshot().heardSeconds-nodeAt<2.4;
  const deliver=value=>{if(delivered)return;delivered=true;onDone(value);};
  const selectionView=()=>{
    const remaining=replySelection?Math.max(0,replySelection.remaining??replySelection.releaseAt-clock.snapshot().heardSeconds):0;
    return replySelection?{...replySelection,remaining,fraction:Math.min(1,remaining/SOURCE_REST_REPLY_SECONDS)}:null;
  };
  const offeredView=view=>({...view,restReplySelection:selectionView(),
    restChoiceTimer:view.pending?.kind==='branch'?{active:!!replySelection,resumeHold:!!replySelection?.resumeHold,remaining:selectionView()?.remaining||0,
      fraction:selectionView()?.fraction||0,duration:SOURCE_REST_REPLY_SECONDS}:null,
    restQueuedReply:queuedReply?{...queuedReply}:null,
    restRecorderPrompt:typeof onRecorder==='function'&&!getRecorderState()?.requested&&clock.snapshot().progress<.65,
    restCanLeave:!exited&&!delivered&&!(locked&&!clock.snapshot().failed)});
  const scene=makeColdOpenScene({
    id:`source-rest:${story.phase||phase}`,opening,startAt:resumedNode||story.entry,slate:story.title||'',
    ambient:false,blocksWorld:false,allowsLook,worldUnderlay:true,presentation:'cinematic',voiceEnabled:false,
    automatic,presentationView:automatic?view=>{
      const shown=offeredView(view);
      const p=clock.snapshot().progress,presented=sourceRestInterfaceView(sourceRestPresentationView(shown,p),p,
        {originalView:shown,afterInterruption:interfaceAfterInterruption,interruption:interruption(),sarahNamed,phase:sourcePhase});
      if(!interruption()||!presented?.line)return presented;
      return {...presented,line:{...presented.line,sourceLabel:'· · ·',text:String(presented.line.text||'').replace(/[.,]/g,'·')}};
    }:null,
    audio,getAudio,cue,fx,replay,
    onLine,
    onChoice:choice=>{
      if(choice.restAction==='leave'||choice.restAction==='commit')outcome=choice.restAction;
      if(automatic&&choice.restDeliveryTarget){
        const heard=clock.snapshot().heardSeconds;
        const response=opening[choice.goto]?.lines?.[1];if(response)response.text=String(choice.text||'');
        queuedReply={text:String(choice.text||''),contentId:choice.contentId,gateId:choice.goto,targetNode:choice.restDeliveryTarget,
          releaseAt:heard+.25};
      }
      onChoice?.(choice.restDeliveryTarget?{...choice,goto:choice.restDeliveryTarget}:choice);
    },
    onDone:()=>deliver(outcome||'leave'),
  });
  const baseExit=scene.exit.bind(scene),baseKey=scene.key.bind(scene),baseUpdate=scene.update.bind(scene),baseView=scene.view.bind(scene);
  function noteLock(view){if(automatic&&story.nodes?.[view.nodeId]?.lockExit&&!clock.snapshot().failed)locked=true;}
  function select(index,view){
    const options=view.pending?.options||[],length=options.length;if(!length)return;
    let current=Number(view.pending.index)||0;
    while(current!==index){baseKey({key:'ArrowDown'});current=(current+1)%length;}
  }
  function holdChoice(view){
    if(view.pending?.kind!=='branch')return;
    const key=`${view.nodeId}:${view.lineSerial}:branch`;
    if(choiceKey!==key){choiceKey=key;choiceAt=clock.snapshot().heardSeconds;}
    if(!decisionHeld){clock.hold();decisionHeld=true;}
  }
  function confirm(view){
    const option=view.pending?.options?.[view.pending.index||0];if(!option)return true;
    if(option.restAction==='leave')return baseKey({key:'Enter'});
    if(decisionHeld){clock.resume();decisionHeld=false;}
    // Only the completed, undoable selection window commits to the ordinary
    // conversation. Replay/onChoice and its confirmation sound fire once.
    replySelection=null;
    const result=baseKey({key:'Enter'});choiceKey='';return result;
  }
  function selectReply(index,view){
    const option=view.pending?.options?.[index];if(!option)return true;
    select(index,view);
    if(option.restAction==='leave'){replySelection=null;return confirm(baseView());}
    if(replySelection?.nodeId===view.nodeId&&replySelection.contentId===option.contentId){
      if(replySelection.resumeHold){replySelection.resumeHold=false;return true;}
      replySelection=null;return true;
    }
    const heard=clock.snapshot().heardSeconds;
    replySelection={nodeId:view.nodeId,index,contentId:option.contentId,text:String(option.text||''),
      selectedAt:heard,remaining:SOURCE_REST_REPLY_SECONDS};
    return true;
  }
  scene.update=dt=>{
    if(!automatic){baseUpdate(dt);return;}
    const timing=clock.update(dt);let media;try{media=getMusicState();}catch{media={failed:true};}
    const flowing=timing.flowing??(timing.failed||!!media?.playing&&!media?.paused&&!media?.protected);
    let presentationActive=flowing;
    if(typeof getPresentationActive==='function'){
      try{presentationActive=getPresentationActive()===true&&!media?.protected&&!media?.buffering&&!media?.seeking;}catch{presentationActive=false;}
    }
    baseUpdate(flowing?dt:0);if(exited||delivered)return;
    let view=baseView();noteLock(view);
    if(view.nodeId===interruptionNode)interfaceAfterInterruption=true;
    if(nodeKey!==view.nodeId){nodeKey=view.nodeId;nodeAt=timing.heardSeconds;}
    const key=`${view.nodeId}:${view.lineSerial}:${view.pending?.kind||''}`;
    if(view.pending?.kind==='branch'){
      // A response is never silently invented. Time for reading belongs to
      // the player, while the same performance continues around them.
      holdChoice(view);
      if(replySelection?.nodeId===view.nodeId&&presentationActive&&!replySelection.resumeHold){
        replySelection.remaining=Math.max(0,selectionView().remaining-Math.min(.25,Math.max(0,Number(dt)||0)));
        if(replySelection.remaining<=.000001){select(replySelection.index,view);confirm(baseView());}
      }
      return;
    }
    if(!flowing)return;
    choiceKey='';
    if(queuedReply){
      if(view.nodeId===queuedReply.gateId&&timing.heardSeconds>=queuedReply.releaseAt){queuedReply=null;baseKey({key:' '});}
      return;
    }
    if(lineKey!==key){lineKey=key;lineAt=timing.heardSeconds;}
    if(view.lineSourceId?.startsWith('source-rest-cue:')){
      if(timing.presentationTail&&timing.progress<(chapterCues[view.nodeId]??0))clock.advanceTailCue?.(chapterCues[view.nodeId]);
      if(clock.snapshot().progress>=(chapterCues[view.nodeId]??0))baseKey({key:' '});
      return;
    }
    // The hold includes the type-on time, leaving a fully visible beat for
    // reading without allowing the musical passage to rush or skip a line.
    const text=String(view.line?.text||''),hold=Math.max(2.2,Math.min(7,.8+text.length/26));
    if(!view.typing&&timing.heardSeconds-lineAt>=hold){
      if(story.nodes?.[view.nodeId]?.action==='commit')outcome='commit';
      baseKey({key:' '});
    }
  };
  scene.restProgress=()=>clock?.snapshot().progress||0;
  scene.checkpoint=()=>{const view=baseView();return{nodeId:view.nodeId,lineSourceId:view.lineSourceId,
    clock:clock?.checkpoint?.()||clock?.snapshot(),locked,interfaceAfterInterruption,
    queuedReply:queuedReply?{...queuedReply}:null,replySelection:replySelection?{...replySelection}:null};};
  scene.restInterruption=()=>interruption();
  scene.restInterface=()=>sourceRestInterfacePresentation(clock?.snapshot().progress||0,{afterInterruption:interfaceAfterInterruption});
  scene.view=()=>{const view=baseView();return automatic?{...offeredView(view),restProgress:clock.snapshot().progress,restLocked:locked&&!clock.snapshot().failed,
    restDecisionHeld:decisionHeld,restTiming:clock.snapshot()}:view;};
  scene.handlesEscape=true;
  // Source continues to render and advance beneath the modal transcript;
  // no separate audio or soundtrack is started by this wrapper.
  scene.sourcePressureLive=true;
  scene.exit=()=>{if(exited)return;exited=true;queuedReply=null;replySelection=null;baseExit();if(!outcome)deliver('leave');};
  scene.key=event=>{
    if(exited||delivered)return true;
    if(typeof onRecorder==='function'&&!event?.ctrlKey&&!event?.altKey&&!event?.metaKey&&
      (event?.code==='KeyR'||String(event?.key||'').toLowerCase()==='r'||event?.controllerAction==='recorder')){
      if(!event.repeat)onRecorder();return true;
    }
    if(automatic)noteLock(baseView());
    if(event?.key==='Escape'||event?.code==='Escape'||event?.controllerAction==='back'){
      if(typeof onPause==='function'){onPause();return true;}
      if(automatic&&locked&&!clock.snapshot().failed)return true;
      outcome='leave';scenes.remove(scene);deliver('leave');return true;
    }
    if(automatic){
      const view=baseView();noteLock(view);const pending=view.pending;
      const interact=event?.key?.toLowerCase()==='e'||event?.code==='KeyE'||event?.controllerAction==='interact';
      if(interact&&!(locked&&!clock.snapshot().failed)){
        outcome='leave';scenes.remove(scene);deliver('leave');return true;
      }
      if(!pending)return true;
      holdChoice(view);
      const options=pending.options||[],raw=event?.key||'',number=Number(raw);
      if(['Backspace','Delete'].includes(raw)){replySelection=null;return true;}
      if(event.repeat)return true;
      if(number>=1&&number<=options.length){const index=number-1;
        return selectReply(index,view);}
      if(['Enter',' ','z'].includes(raw)||event?.controllerAction==='confirm'){
        return selectReply(pending.index||0,view);
      }
      if(['ArrowUp','ArrowDown','w','s'].includes(raw)||['selectPrevious','selectNext'].includes(event?.controllerAction))replySelection=null;
      return baseKey(event);
    }
    return baseKey(event);
  };
  return scene;
}
