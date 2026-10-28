import * as scenes from './scenes.js';
import {createSamDialogVoice} from '../audio/sam-voice.js';
import {uiSize,uiText,uiWrap} from '../render/ui.js';
import {machinePanelBody,withMachinePanel} from '../render/presentation.js';
import {reviewKey,reviewTarget,reviewText,registerReviewRegion} from './local-text-review.js';

function reviewedBouncerText(line,{nodeId='',collection='lines',index}={}){
  if(!line)return line;
  let target=line.reviewTarget;
  if(!target){
    const sceneId='academic-bouncers',sourceId=String(line.sourceId||line.id||'');
    const original=String(line.text||''),key=reviewKey({sceneId,nodeId,sourceId,collection,index},original);
    target=reviewTarget({id:key,sceneId,nodeId,sourceId,speaker:line.who||'me',
      fields:[{key,label:collection==='choices'?'Choice text':'Spoken text',original}]});
  }
  const field=target.fields[0];
  return{...line,text:reviewText(field.key,field.original),reviewTarget:target};
}
function reviewedBouncerAttempt(attempt){
  if(!attempt)return attempt;
  const nodeId=[attempt.phase,attempt.reason||''].join(':');
  const line=reviewedBouncerText(attempt.currentLine,{nodeId,
    // Player replies have no authored source ID; their original copy supplies
    // identity rather than the attempt serial or the currently selected index.
    index:attempt.phase==='player'?undefined:attempt.index});
  return{...attempt,line,currentLine:line,
    options:(attempt.options||[]).map(option=>reviewedBouncerText(option,{nodeId:'interjections',collection:'choices'}))};
}

// Measure the same wrapped rows that are painted. At the usual 86-column
// shell this leaves both doorkeepers visible above a 13–14 row bottom panel.
export function academicBouncerPanelLayout(current,{cols,rows}={}){
  const attempt=reviewedBouncerAttempt(current?.attempt);if(!attempt||cols<12||rows<8)return null;
  const width=Math.min(86,cols-4),x=Math.floor((cols-width)/2);
  const footer=attempt.phase==='terminal'
    ?attempt.outcome==='success'?'[ENTER] PASS THEM · [ESC] STEP BACK':'[ENTER] STEP BACK · [ESC] LEAVE'
    :'[1-3] INTERJECT · [SPACE] FINISH LINE · [ESC] LEAVE';
  const probe=machinePanelBody(0,0,width,100,{footer});
  const chromeRows=100-probe.h;
  const content=[];
  const write=(text,cls='ui-counter',extra={})=>{
    for(const part of uiWrap(text,probe.w))content.push({text:part,cls,...extra});
  };
  const line=attempt.currentLine;
  if(line){write(line.sourceLabel,'ui-label');write(line.text,'ui-counter',{reviewTarget:line.reviewTarget,active:true});}
  else if(attempt.phase==='window'){write('[Both attendants pause.]','ui-marker');write('Neither has the floor.','ui-label');}
  else if(attempt.phase==='terminal'){
    write(attempt.outcome==='success'?'Vera and Hugh wait for you to pass.':'Neither attendant has moved.');
  }
  if(attempt.phase!=='terminal'){
    content.push({text:'',cls:'ui-counter'});
    attempt.options.forEach((option,index)=>write(`${current.selected===index?'›':' '} ${index+1}. ${option.text}`,
      current.selected===index?'ui-amber':'ui-counter',{choiceId:option.id,reviewTarget:option.reviewTarget,selected:current.selected===index}));
    if(!current.knowsPhrase)write('There may be advice downstairs.','ui-label');
  }
  // Glyphs descend below their logical row. Leave a full unused row above the
  // lower hardware rim so the last choice clears the glass aperture in pixels.
  const bottomSafetyRows=1;
  const height=Math.min(rows-2,Math.max(8,content.length+chromeRows+bottomSafetyRows));
  const y=Math.max(1,rows-height-1),body=machinePanelBody(x,y,width,height,{footer});
  return{x,y,width,height,body,footer,content,chromeRows,bottomSafetyRows,
    fits:content.length+bottomSafetyRows<=body.h};
}

// The ordinary thought shell reserves a fixed transcript history band. Six
// reply rows then cover the doorkeepers' faces. This local presenter keeps the
// same real conversation and keys, showing only its current line or picker.
export function academicBouncerSocialPanelLayout(current,{cols,rows}={}){
  if(!current||cols<12||rows<8)return null;
  const width=Math.min(86,cols-4),x=Math.floor((cols-width)/2);
  const options=current.pending?.options||[];
  const footer=options.length?'[1-6] REPLY · [↑/↓] SELECT · [ENTER] CONFIRM · [ESC] LEAVE'
    :'[SPACE] CONTINUE · [ESC] LEAVE';
  const probe=machinePanelBody(0,0,width,100,{footer}),chromeRows=100-probe.h;
  const content=[];
  const write=(text,cls='ui-counter',extra={})=>{
    for(const part of uiWrap(String(text||''),probe.w))content.push({text:part,cls,...extra});
  };
  if(options.length){
    write('YOUR REPLY','ui-label');content.push({text:'',cls:'ui-counter'});
    options.forEach((option,index)=>write(`${current.pending.index===index?'›':' '} ${index+1}. ${option.text||option.label||''}`,
      current.pending.index===index?'ui-amber':'ui-counter',{choiceIndex:index,reviewTarget:option.reviewTarget,selected:current.pending.index===index}));
  }else if(current.line){
    write(current.line.sourceLabel||'VERA / HUGH','ui-label');
    const text=String(current.line.text||'');
    write(current.typing?text.slice(0,current.typed):text,'ui-counter',{reviewTarget:current.line.reviewTarget,active:true});
  }
  const bottomSafetyRows=1,height=Math.min(rows-2,Math.max(8,content.length+chromeRows+bottomSafetyRows));
  const y=Math.max(1,rows-height-1),body=machinePanelBody(x,y,width,height,{footer});
  return{x,y,width,height,body,footer,content,chromeRows,bottomSafetyRows,
    fits:content.length+bottomSafetyRows<=body.h};
}
export function renderAcademicBouncerSocialScene(current){
  const layout=academicBouncerSocialPanelLayout(current,uiSize());if(!layout)return;
  const {x,y,width,height,footer,content}=layout;
  withMachinePanel(x,y,width,height,{label:'MONITOR',source:current.pending?'YOUR REPLY':current.line?.sourceLabel||'THIRD FLOOR',
    meter:false,footer},panel=>{
    content.slice(0,panel.h).forEach((entry,index)=>{
      if(entry.text){
        uiText(panel.x,panel.y+index,entry.text,entry.cls,1,panel.w);
        registerReviewRegion(entry.reviewTarget,{x:panel.x,y:panel.y+index,w:Math.min(entry.text.length,panel.w),h:1,active:entry.active,selected:entry.selected});
      }
    });
  });
}

// The gap begins when the actual cue utterance ends, or when a fresh Space
// deliberately finishes that utterance. No voice-duration estimate runs it.
export function makeAcademicBouncerScene({controller,getAudio,isActive=()=>true,
  onLine,onDone,onCancel,onState,createVoice=createSamDialogVoice}={}){
  if(!controller)throw Error('Academic bouncer scene requires a controller');
  const voice=createVoice({volume:.24,getAudio});
  let scene,handle=null,lineKey=null,selected=0,entered=false,settled=false;
  let externalSuspended=false,suspended=false,replayLine=false;
  let reviewSilencedLine=null;
  const held=new Set();
  const view=()=>{
    const state=controller.view(),attempt=reviewedBouncerAttempt(state.attempt);
    return {...state,attempt,...(attempt||{}),currentLine:attempt?.currentLine||null,
      voice:!!handle&&!suspended,selected,suspended,
      instruction:attempt?.phase==='window'?'Both attendants pause.':null};
  };
  const publish=()=>onState?.(view());
  function stopVoice(){voice.stop?.();handle=null;}
  function deliver(){
    const attempt=reviewedBouncerAttempt(controller.view().attempt);
    const line=attempt?.currentLine;
    lineKey=attempt?.lineKey||null;
    if(!line){stopVoice();onLine?.(null);return;}
    if(suspended){replayLine=true;return;}
    replayLine=false;
    if(reviewSilencedLine===lineKey)return;
    onLine?.(line);
    if(settled)return;
    handle=voice.start(line.text,{speaker:line.voiceSpeaker});
  }
  function reconcileSuspension(){
    const next=externalSuspended||!isActive();
    if(next===suspended)return;
    suspended=next;held.clear();
    if(suspended){replayLine=!!controller.view().attempt?.currentLine;stopVoice();onLine?.(null);}
    else if(replayLine)deliver();
    publish();
  }
  function sync(){
    const key=controller.view().attempt?.lineKey||null;
    if(key!==lineKey)deliver();
    const count=controller.view().attempt?.options?.length||0;
    selected=Math.max(0,Math.min(selected,Math.max(0,count-1)));
    publish();
  }
  function settle(success){
    if(settled)return;
    settled=true;stopVoice();onLine?.(null);
    if(!success)controller.cancelAttempt();
    scenes.remove(scene);
    if(success)onDone?.();else onCancel?.();
  }
  function choose(index){
    const option=controller.view().attempt?.options?.[index];
    if(!option)return false;
    const result=controller.interject(option.id);
    if(!result)return false;
    stopVoice();sync();return true;
  }
  scene={
    id:'academic-bouncers',blocksInput:true,blocksWorld:true,allowsLook:true,handlesEscape:true,
    enter(){
      if(entered)return;entered=true;voice.warm?.();
      if(!controller.beginAttempt()){settle(false);return;}
      suspended=externalSuspended||!isActive();deliver();publish();
    },
    exit(){
      stopVoice();voice.dispose?.();held.clear();
      if(!settled){settled=true;controller.cancelAttempt();onLine?.(null);onCancel?.();}
    },
    setSuspended(value){externalSuspended=!!value;reconcileSuspension();},
    textReviewSuspend(){reviewSilencedLine=lineKey;stopVoice();},
    update(dt){
      if(settled||!entered)return;
      reconcileSuspension();if(suspended)return;
      const before=controller.view().attempt;
      controller.tick(dt);
      if(before?.currentLine&&handle?.done?.()){
        stopVoice();controller.finishLine();
      }
      sync();
    },
    keyup(event){held.delete(event.key);return false;},
    key(event){
      if(settled)return true;
      reconcileSuspension();
      if(suspended)return true;
      if(event.repeat||held.has(event.key))return true;
      held.add(event.key);
      if(event.key==='Escape'){settle(false);return true;}
      const attempt=controller.view().attempt;if(!attempt)return true;
      if(attempt.phase==='terminal'){
        if(event.key==='Enter'||event.key===' '){const admitted=controller.acknowledge();settle(admitted);}
        return true;
      }
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        const length=attempt.options.length;
        if(length)selected=(selected+(event.key==='ArrowDown'?1:length-1))%length;
        publish();return true;
      }
      if(/^[1-3]$/.test(event.key)){choose(Number(event.key)-1);return true;}
      if(event.key==='Enter'){choose(selected);return true;}
      if(event.key===' '&&attempt.currentLine){
        stopVoice();controller.finishLine();sync();
      }
      return true;
    },
    view,
    render(){
      const layout=academicBouncerPanelLayout(view(),uiSize());if(!layout)return;
      const {x,y,width,height,footer,content}=layout;
      withMachinePanel(x,y,width,height,{label:'MONITOR',source:'THIRD FLOOR',meter:false,
        footer},panel=>{
        content.slice(0,panel.h).forEach((entry,index)=>{
          if(entry.text){
            uiText(panel.x,panel.y+index,entry.text,entry.cls,1,panel.w);
            registerReviewRegion(entry.reviewTarget,{x:panel.x,y:panel.y+index,w:Math.min(entry.text.length,panel.w),h:1,active:entry.active,selected:entry.selected});
          }
        });
      });
    },
  };
  return scene;
}
