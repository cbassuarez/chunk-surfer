import * as scenes from './scenes.js';
import {makeColdOpenScene} from './coldopen.js';
import {sourceRestConversation} from '../data/source-rest-conversation.js';
import {createSourceRestClock,SOURCE_REST_CUES,SOURCE_REST_CATCH_CLOCK_OPTIONS} from './source-rest-pacing.js';
import {sourceRestPresentationView} from './source-rest-presentation.js';
import {sourceRestInterfacePresentation,sourceRestInterfaceView} from './source-rest-interface.js';

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
  audio,getAudio,cue,fx,replay,allowsLook=true,getMusicState,onPause=null}={}){
  const authored=sourceRestColdOpenNodes(story);
  const sourcePhase=story.phase||phase,automatic=(sourcePhase==='wrong-return'||story.timed===true)&&typeof getMusicState==='function',
    chapterCues=story.cues||SOURCE_REST_CUES;
  const clock=automatic?createSourceRestClock(getMusicState,sourcePhase==='catch'?SOURCE_REST_CATCH_CLOCK_OPTIONS:undefined):null;
  // A silent first beat lets each chapter wait for its musical moment without
  // making the player press a Continue button or cutting off the last line.
  const opening=automatic?Object.fromEntries(Object.entries(authored).map(([id,node])=>[id,
    Object.hasOwn(chapterCues,id)?{...node,lines:[{who:'direction',text:'',voice:false,say:false,
      sourceId:`source-rest-cue:${id}`},...node.lines]}:node])):authored;
  // Choosing and delivering are separate states. The ordinary conversation
  // commits the choice now, while a silent node retains the musical space
  // before the chosen player's words are actually presented.
  if(automatic)for(const [id,node] of Object.entries(opening))node.choices=(node.choices||[]).map((choice,index)=>{
    if(!choice.goto)return choice;
    const gate=`source-rest-delivery:${id}:${index}`;
    const first=authored[choice.goto]?.lines?.[0],same=first?.who==='me'&&first.text===choice.text;
    opening[gate]={lines:[{who:'direction',text:'',voice:false,say:false,sourceId:gate},
      ...(!same?[{who:'me',text:choice.text,voice:false,say:false,sourceId:`source-rest-response:${choice.contentId}`}]:[])],choices:[],goto:choice.goto};
    return {...choice,goto:gate,restDeliveryTarget:choice.goto};
  });
  let outcome=null,delivered=false,exited=false,locked=false,lineKey='',lineAt=0,choiceKey='',choiceAt=0,nodeKey='',nodeAt=0,queuedReply=null,decisionHeld=false,interfaceAfterInterruption=false;
  const interruptionNode=sourcePhase==='catch'?'electronics':'interruption',
    interruption=()=>automatic&&nodeKey===interruptionNode&&clock.snapshot().heardSeconds-nodeAt<2.4;
  const deliver=value=>{if(delivered)return;delivered=true;onDone(value);};
  const scene=makeColdOpenScene({
    id:`source-rest:${story.phase||phase}`,opening,startAt:story.entry,slate:story.title||'',
    ambient:false,blocksWorld:false,allowsLook,worldUnderlay:true,presentation:'cinematic',voiceEnabled:false,
    automatic,presentationView:automatic?view=>{
      const shown={...view,restQueuedReply:queuedReply?{...queuedReply}:null,
        restCanLeave:!exited&&!delivered&&!(locked&&!clock.snapshot().failed)&&!view.pending};
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
          releaseAt:Math.max(choiceAt+8,heard+1.2)};
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
    // This is the same immediate choice commit/confirmation used elsewhere:
    // pending options close, replay/onChoice fire once, and later input cannot
    // change what was selected. Only the delivery node waits.
    const result=baseKey({key:'Enter'});choiceKey='';return result;
  }
  scene.update=dt=>{
    if(!automatic){baseUpdate(dt);return;}
    const timing=clock.update(dt);let media;try{media=getMusicState();}catch{media={failed:true};}
    const flowing=timing.failed||!!media?.playing&&!media?.paused&&!media?.protected;
    baseUpdate(flowing?dt:0);if(!flowing||exited||delivered)return;
    let view=baseView();noteLock(view);
    if(view.nodeId===interruptionNode)interfaceAfterInterruption=true;
    if(nodeKey!==view.nodeId){nodeKey=view.nodeId;nodeAt=timing.heardSeconds;}
    const key=`${view.nodeId}:${view.lineSerial}:${view.pending?.kind||''}`;
    if(view.pending?.kind==='branch'){
      // A response is never silently invented. Time for reading belongs to
      // the player, while the same performance continues around them.
      holdChoice(view);
      return;
    }
    choiceKey='';
    if(queuedReply){
      if(view.nodeId===queuedReply.gateId&&timing.heardSeconds>=queuedReply.releaseAt){queuedReply=null;baseKey({key:' '});}
      return;
    }
    if(lineKey!==key){lineKey=key;lineAt=timing.heardSeconds;}
    if(view.lineSourceId?.startsWith('source-rest-cue:')){
      if(timing.progress>=(chapterCues[view.nodeId]??0))baseKey({key:' '});
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
  scene.restInterruption=()=>interruption();
  scene.restInterface=()=>sourceRestInterfacePresentation(clock?.snapshot().progress||0,{afterInterruption:interfaceAfterInterruption});
  scene.view=()=>{const view=baseView();return automatic?{...view,restProgress:clock.snapshot().progress,restLocked:locked&&!clock.snapshot().failed,
    restCanLeave:!exited&&!delivered&&!(locked&&!clock.snapshot().failed)&&!view.pending,
    restQueuedReply:queuedReply?{...queuedReply}:null,restDecisionHeld:decisionHeld,restTiming:clock.snapshot()}:view;};
  scene.handlesEscape=true;
  // Source continues to render and advance beneath the modal transcript;
  // no separate audio or soundtrack is started by this wrapper.
  scene.sourcePressureLive=true;
  scene.exit=()=>{if(exited)return;exited=true;queuedReply=null;baseExit();if(!outcome)deliver('leave');};
  scene.key=event=>{
    if(exited||delivered)return true;
    if(automatic)noteLock(baseView());
    if(event?.key==='Escape'||event?.code==='Escape'||event?.controllerAction==='back'){
      if(typeof onPause==='function'){onPause();return true;}
      if(automatic&&locked&&!clock.snapshot().failed)return true;
      outcome='leave';scenes.remove(scene);deliver('leave');return true;
    }
    if(automatic){
      const view=baseView();noteLock(view);const pending=view.pending;
      const interact=event?.key?.toLowerCase()==='e'||event?.code==='KeyE'||event?.controllerAction==='interact';
      if(interact&&!pending&&!(locked&&!clock.snapshot().failed)){
        outcome='leave';scenes.remove(scene);deliver('leave');return true;
      }
      if(!pending)return true;
      holdChoice(view);
      const options=pending.options||[],raw=event?.key||'',number=Number(raw);
      if(number>=1&&number<=options.length){const index=number-1;
        select(index,view);return confirm(baseView());}
      if(['Enter',' ','z'].includes(raw)||event?.controllerAction==='confirm'){
        return confirm(view);
      }
      return baseKey(event);
    }
    return baseKey(event);
  };
  return scene;
}
