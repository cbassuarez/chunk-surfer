import * as scenes from './scenes.js';
import {createSamDialogVoice} from '../audio/sam-voice.js';
import {uiSize,uiText,uiWrap} from '../render/ui.js';
import {machinePanelBody,withMachinePanel} from '../render/presentation.js';
import {layoutTranscriptChoices,fitTranscriptChoices,drawTranscriptChoices} from '../render/transcript.js';
import {reviewKey,reviewTarget,reviewText,registerReviewRegion} from './local-text-review.js';
import {activeInputPromptDevice,promptLine} from './bindings.js';

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

function choicePageDirection(event){
  if(event.key==='PageDown'||event.controllerAction==='tabNext')return 1;
  if(event.key==='PageUp'||event.controllerAction==='tabPrev')return -1;
  return 0;
}
function controllerFooter({read=false,verb='SAY',compact=false}={}){
  const actions=[...(read?[{action:'tabPrev'},{action:'tabNext',label:'READ'}]:[]),
    ...(!compact?[{action:'select',label:'SELECT'}]:[]),
    {action:'confirm',label:verb},{action:'back',...(compact?{}:{label:'LEAVE'})}];
  return promptLine(actions,compact?{separator:' '}:{});
}

// Both exchanges use the conversation picker's choice grammar while keeping a
// compact low panel: the attendants' faces and their live conversation matter.
// The body is measured before drawing so keyboard selection remains visible on
// smaller displays; the controller, not this layout, owns the interruption.
function bouncerPickerRows(view,width,maxRows,label,selectedOffset=0){
  const source=view?.pending?.options||[];
  const layout=layoutTranscriptChoices(view,width,{lane:{x:0,w:width,align:'left'},label});
  const fitted=fitTranscriptChoices(layout,maxRows,{selectedOffset});
  return {...fitted,rows:fitted.rows.map(row=>({...row,pickerRow:true,
    cls:row.selected?'ui-amber':'ui-counter',
    choiceId:Number.isInteger(row.choiceIndex)?source[row.choiceIndex]?.id:undefined}))};
}
function renderBouncerRows(content,panel){
  content.slice(0,panel.h).forEach((entry,index)=>{
    if(entry.pickerRow){
      drawTranscriptChoices({rows:[entry],lane:{x:0,w:panel.w,align:'left'}},{x:panel.x,y:panel.y+index,width:panel.w,maxRows:1});
    }else if(entry.text){
      uiText(panel.x,panel.y+index,entry.text,entry.cls,1,panel.w);
      registerReviewRegion(entry.reviewTarget,{x:panel.x,y:panel.y+index,w:Math.min(entry.text.length,panel.w),h:1,active:entry.active,selected:entry.selected});
    }
  });
}
export function academicBouncerPanelLayout(current,{cols,rows}={}){
  const attempt=reviewedBouncerAttempt(current?.attempt);if(!attempt||cols<12||rows<8)return null;
  const width=Math.min(86,cols-4),x=Math.floor((cols-width)/2),options=attempt.options||[],controller=activeInputPromptDevice()==='controller';
  let footer=attempt.phase==='terminal'
    ?attempt.outcome==='success'?'[ENTER] PASS THEM · [ESC] STEP BACK':'[ENTER] STEP BACK · [ESC] LEAVE'
    :options.length?`[1-${Math.min(3,options.length)}] INTERJECT · [SPACE] FINISH LINE · [ESC] LEAVE`:'[SPACE] CONTINUE · [ESC] LEAVE';
  const probe=machinePanelBody(0,0,width,100,{footer}),chromeRows=100-probe.h;
  const maxBody=machinePanelBody(0,0,width,rows-2,{footer}).h,bottomSafetyRows=1;
  const content=[];
  let choiceWindow=null;
  const write=(text,cls='ui-counter',extra={})=>{
    for(const part of uiWrap(String(text||''),probe.w))content.push({text:part,cls,...extra});
  };
  const line=attempt.currentLine;
  if(line){write(line.sourceLabel,'ui-label');write(line.text,'ui-counter',{reviewTarget:line.reviewTarget,active:true});}
  else if(attempt.phase==='window'){write('[Both attendants pause.]','ui-marker');write('Neither has the floor.','ui-label');}
  else if(attempt.phase==='terminal')write(attempt.outcome==='success'?'Vera and Hugh wait for you to pass.':'Neither attendant has moved.');
  if(attempt.phase!=='terminal'&&options.length){
    const hint=!current.knowsPhrase?'There may be advice downstairs.':null;
    // Keep the selection available even if a caption grows to fill the pane.
    const reserved=(hint?1:0)+bottomSafetyRows+2;
    if(content.length>maxBody-reserved)content.splice(Math.max(0,maxBody-reserved));
    const available=Math.max(1,maxBody-content.length-bottomSafetyRows-(hint?1:0));
    choiceWindow=bouncerPickerRows({pending:{kind:'branch',options,index:current.selected||0}},probe.w,available,'INTERJECT',current.choiceScrollOffset||0);
    content.push(...choiceWindow.rows);
    if(choiceWindow.selectedScroll)footer=`[PGUP/PGDN] READ · [1-${Math.min(3,options.length)}] INTERJECT · [SPACE] FINISH LINE · [ESC] LEAVE`;
    if(hint)write(hint,'ui-label');
  }
  if(controller)footer=attempt.phase==='terminal'
    ?promptLine([{action:'confirm',label:attempt.outcome==='success'?'PASS THEM':'STEP BACK'},{action:'back',label:'LEAVE'}])
    :controllerFooter({read:!!choiceWindow?.selectedScroll,verb:options.length?'INTERJECT':'CONTINUE'});
  if(footer.length>width-4&&attempt.phase!=='terminal')footer=controller
    ?controllerFooter({read:!!choiceWindow?.selectedScroll,verb:options.length?'CUT':'NEXT',compact:true})
    :choiceWindow?.selectedScroll?`[1-${Math.min(3,options.length)}] CUT [PG↑↓] [SPC] NEXT [ESC]`
    :options.length?`[1-${Math.min(3,options.length)}] INTERJECT [SPC] NEXT [ESC]`:'[SPC] NEXT [ESC]';
  const height=Math.min(rows-2,Math.max(8,content.length+chromeRows+bottomSafetyRows));
  const y=Math.max(1,rows-height-1),body=machinePanelBody(x,y,width,height,{footer});
  return{x,y,width,height,body,footer,content,chromeRows,bottomSafetyRows,choiceWindow,
    fits:content.length+bottomSafetyRows<=body.h};
}

export function academicBouncerSocialPanelLayout(current,{cols,rows}={}){
  if(!current||cols<12||rows<8)return null;
  const width=Math.min(86,cols-4),x=Math.floor((cols-width)/2),controller=activeInputPromptDevice()==='controller';
  const options=current.pending?.options||[];
  let footer=options.length?`[1-${Math.min(9,options.length)}] REPLY · [↑/↓] SELECT · [ENTER] SAY · [ESC] LEAVE`
    :'[SPACE] CONTINUE · [ESC] LEAVE';
  const probe=machinePanelBody(0,0,width,100,{footer}),chromeRows=100-probe.h;
  const maxBody=machinePanelBody(0,0,width,rows-2,{footer}).h,bottomSafetyRows=1;
  const content=[];let choiceWindow=null;
  const write=(text,cls='ui-counter',extra={})=>{
    for(const part of uiWrap(String(text||''),probe.w))content.push({text:part,cls,...extra});
  };
  if(options.length){
    choiceWindow=bouncerPickerRows(current,probe.w,Math.max(1,maxBody-bottomSafetyRows),'YOUR REPLY',current.choiceScrollOffset||0);
    content.push(...choiceWindow.rows);
    if(choiceWindow.selectedScroll)footer=`[PGUP/PGDN] READ · [1-${Math.min(9,options.length)}] REPLY · [↑/↓] SELECT · [ENTER] SAY · [ESC] LEAVE`;
  }else if(current.line){
    write(current.line.sourceLabel||'VERA / HUGH','ui-label');
    const text=String(current.line.text||'');
    write(current.typing?text.slice(0,current.typed):text,'ui-counter',{reviewTarget:current.line.reviewTarget,active:true});
  }
  if(controller)footer=controllerFooter({read:!!choiceWindow?.selectedScroll,verb:options.length?'SAY':'CONTINUE'});
  if(footer.length>width-4)footer=controller
    ?controllerFooter({read:!!choiceWindow?.selectedScroll,verb:options.length?'SAY':'NEXT',compact:true})
    :choiceWindow?.selectedScroll?`[1-${Math.min(9,options.length)}] SAY [PG↑↓] [↑↓] [ENTER] [ESC]`
    :options.length?`[1-${Math.min(9,options.length)}] SAY [↑↓] [ENTER] [ESC]`:'[SPC] NEXT [ESC]';
  const height=Math.min(rows-2,Math.max(8,content.length+chromeRows+bottomSafetyRows));
  const y=Math.max(1,rows-height-1),body=machinePanelBody(x,y,width,height,{footer});
  return{x,y,width,height,body,footer,content,chromeRows,bottomSafetyRows,choiceWindow,
    fits:content.length+bottomSafetyRows<=body.h};
}
export function renderAcademicBouncerSocialScene(current){
  const layout=academicBouncerSocialPanelLayout(current,uiSize());if(!layout)return;
  const {x,y,width,height,footer,content}=layout;
  withMachinePanel(x,y,width,height,{label:'MONITOR',source:current.pending?'YOUR REPLY':current.line?.sourceLabel||'THIRD FLOOR',
    meter:false,footer},panel=>renderBouncerRows(content,panel));
}

// The social exchange shares the thought scene's dialogue machine but has its
// own low panel. Its page keys therefore use the low panel's actual capacity,
// not the (larger) ordinary monitor's geometry.
export function installAcademicBouncerSocialPresenter(scene){
  if(!scene?.view||!scene?.key)return scene;
  const originalKey=scene.key.bind(scene);
  let offset=0,signature=null;
  const current=()=>{
    const view=scene.view(),pending=view?.pending;
    const next=pending?JSON.stringify([pending.index,(pending.options||[]).map(option=>option.text||option.label||'')]):null;
    if(next!==signature){signature=next;offset=0;}
    return {...view,choiceScrollOffset:offset};
  };
  scene.render=()=>renderAcademicBouncerSocialScene(current());
  scene.key=event=>{
    const pageDirection=choicePageDirection(event);
    if(pageDirection){
      const view=current(),layout=academicBouncerSocialPanelLayout(view,uiSize());
      if(layout?.choiceWindow?.selectedScroll){
        offset=Math.max(0,Math.min(layout.choiceWindow.selectedMaxOffset,offset+pageDirection));
        return true;
      }
    }
    return originalKey(event);
  };
  return scene;
}

// The gap begins when the actual cue utterance ends, or when a fresh Space
// deliberately finishes that utterance. No voice-duration estimate runs it.
export function makeAcademicBouncerScene({controller,getAudio,isActive=()=>true,
  onLine,onDone,onCancel,onState,createVoice=createSamDialogVoice}={}){
  if(!controller)throw Error('Academic bouncer scene requires a controller');
  const voice=createVoice({volume:.24,getAudio});
  let scene,handle=null,lineKey=null,selected=0,choiceScrollOffset=0,entered=false,settled=false;
  let externalSuspended=false,suspended=false,replayLine=false;
  let reviewSilencedLine=null;
  const held=new Set();
  const view=()=>{
    const state=controller.view(),attempt=reviewedBouncerAttempt(state.attempt);
    return {...state,attempt,...(attempt||{}),currentLine:attempt?.currentLine||null,
      voice:!!handle&&!suspended,selected,choiceScrollOffset,suspended,
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
    if(key!==lineKey){choiceScrollOffset=0;deliver();}
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
        choiceScrollOffset=0;publish();return true;
      }
      const pageDirection=choicePageDirection(event);
      if(pageDirection){
        const window=academicBouncerPanelLayout(view(),uiSize())?.choiceWindow;
        if(window?.selectedScroll){
          choiceScrollOffset=Math.max(0,Math.min(window.selectedMaxOffset,choiceScrollOffset+pageDirection));
          publish();
        }
        return true;
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
        footer},panel=>renderBouncerRows(content,panel));
    },
  };
  return scene;
}
