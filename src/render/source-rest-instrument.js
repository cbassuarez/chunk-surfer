// The same physical recorder used during ordinary play, held read-only beneath
// the existing subtitle strip. There is no second HUD or recorder state here.
import {drawRecorderFace,liveTakePanelRect,TRANSPORT} from './recorder-view.js';
import {sourceRestSubtitleLayout} from './source-rest-subtitle.js';
import {layoutTranscriptChoices,fitTranscriptChoices} from './transcript.js';
import {uiWithAlpha} from './ui.js';
import {sourceRestInterfaceText} from '../game/source-rest-interface.js';
import {sourceRestInstrumentStory} from './source-rest-instrument-story.js';

const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const subtitleScale=1.55;
const disabledKeys=Object.freeze(['REC','STOP','TAKES'].map((label,index)=>Object.freeze({
  id:['rec','stop','takes'][index],label,enabled:false,lit:false,controlId:`rest-readonly:${label.toLowerCase()}`,
})));

/** Geometry uses the exact existing subtitle and live-recorder layouts. */
export function sourceRestInstrumentFrame({machine,presentation,transitionProgress=1,conversationView=null,sarahNamed=false,musicTime=0,phase=null,cols=0,rows=0}={}){
  if(!machine||!presentation||presentation.suppressPeripheral||presentation.empty||conversationView?.restBlack||clamp(transitionProgress)<=.001||cols<20||rows<12)return null;
  let subtitleTop=rows-5,subtitle=null,choiceLayout=null;
  if(conversationView){
    const localCols=Math.floor(cols/subtitleScale),localRows=Math.floor(rows/subtitleScale),width=Math.max(18,Math.min(86,localCols-8));
    choiceLayout=fitTranscriptChoices(layoutTranscriptChoices(conversationView,width-4,{label:conversationView.choiceHeading??null}),
      Math.max(1,localRows-8),{selectedOffset:conversationView.choiceScrollOffset||0});
    subtitle=sourceRestSubtitleLayout(conversationView,{cols:localCols,rows:localRows,choiceRows:choiceLayout.height?choiceLayout.height+2:0});
    subtitleTop=Math.max(0,(subtitle.y-1)*subtitleScale);
  }
  const clearBottom=Math.max(5,Math.ceil(rows-subtitleTop+1)),
    rect=liveTakePanelRect({cols,rows,progress:machine.progress||0,clearBottom});
  // No squeezing, alternate panel, moving dialogue or cropped control surface
  // on smaller views. When both real surfaces cannot fit, the words win.
  if(rect.x<0||rect.y<0||rect.x+rect.w>cols||rect.y+rect.h>subtitleTop-.5)return null;
  const mode=machine.trace?TRANSPORT.TRACE:TRANSPORT.MONITOR,baseLabel=machine.face?.label||(machine.trace?'TRACE':'MONITOR'),
    story=sourceRestInstrumentStory(presentation,{conversationView,sarahNamed,musicTime,phase});
  return{rect,subtitleTop,clearBottom,subtitle,choiceLayout,alpha:clamp(transitionProgress),
    view:{...(machine.face||{}),rect,mode,sourceRestFieldStory:story,
      sourceRestPresentation:{stage:presentation.stage,progress:presentation.progress,...(story?{voiceBanks:story.voiceBanks}:{})},
      ...(story?{counter:story.counter,counterLabel:story.counterLabel,lamp:{...(machine.face?.lamp||{}),text:story.output.clip}}:{}),
      label:sourceRestInterfaceText('header',baseLabel,presentation.progress,{minimumStage:presentation.stage}),
      source:machine.source||null,note:story?.note??machine.note??' ',progress:machine.face?.progress??machine.progress??0,
      recording:false,playing:false,browsing:false,spin:0,buttons:{keys:disabledKeys.map(key=>({...key}))}}};
}

/** Returns whether the ordinary recorder surface was submitted for drawing. */
export function drawSourceRestInstrument(input,{drawFace=drawRecorderFace,withAlpha=uiWithAlpha}={}){
  const frame=sourceRestInstrumentFrame(input);if(!frame)return false;
  withAlpha(frame.alpha,()=>drawFace(frame.view));
  return true;
}
