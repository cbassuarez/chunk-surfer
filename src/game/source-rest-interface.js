// Failures belong to real, already-visible fields. The measurements, dialogue
// decisions, controls and persistence remain authoritative beneath them.
import {sourceRestInstrumentStory} from '../render/source-rest-instrument-story.js';
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
export const SOURCE_REST_INTERFACE_THRESHOLDS=Object.freeze([.19,.25,.33,.43,.55,.70,.92]);
// Existing physical instruments use `label || ordinaryLabel`. An intentional
// blank must stay truthy so a lost field cannot resurrect its clean default.
export const SOURCE_REST_INTERFACE_BLANK=' ';
const protectedFields=new Set(['choice','response','confirmation','control','navigation','binding','warning']);
function erode(value,stage){
  let ordinal=0;
  return Array.from(String(value)).map(char=>{
    if(!/[\p{L}\p{N}]/u.test(char))return char;
    const n=ordinal++;
    if(stage===2)return n%5===3?'·':char;
    if(stage===3)return n%3===1?'·':char;
    if(stage===4)return n%3===0?char:'·';
    return n===0?char:'·';
  }).join('');
}

/** Shared by existing surfaces. A transient pain spike cannot invent a new
 * chronology; a live owner may retain its prior stage with minimumStage. */
export function sourceRestInterfacePresentation(progress,{affliction=null,afterInterruption=false,interruption=false,minimumStage=0,effects=true}={}){
  const p=effects?clamp(Math.max(Number(progress)||0,clamp(affliction?.destruction)*.86)):0;
  let stage=effects?SOURCE_REST_INTERFACE_THRESHOLDS.filter(at=>p>=at).length:0;
  if(effects&&(afterInterruption||interruption))stage=Math.max(1,stage);
  stage=effects?Math.max(stage,Math.min(7,Math.max(0,Math.floor(Number(minimumStage)||0)))):0;
  return{active:stage>0,progress:p,stage,suppressPeripheral:stage>=6,empty:stage>=7,
    names:{you:['YOU','YOU','Y O U','Y · U','· O ·','· · U','·',SOURCE_REST_INTERFACE_BLANK][stage],
      other:['HERE','HEAR','H E A R','H E · R','· E · ·','· · ·','·',SOURCE_REST_INTERFACE_BLANK][stage]},
    choiceHeading:['YOU / REPLY ▐','YOU / REPLY ▐','Y O U / REPLY ▐','Y · U / REPLY ▐','· / REPLY ▐','REPLY ▐','REPLY ▐',''][stage],
    presentationOnly:true};
}

/** Transform a display value, never the semantic state behind that value. */
export function sourceRestInterfaceText(field,value,progress,options={}){
  const input=String(value??''),role=String(field||'parameter').toLowerCase().replace(/[ _]/g,'-'),
    frame=sourceRestInterfacePresentation(progress,options),stage=frame.stage;
  if(!stage||protectedFields.has(role)||!input)return input;
  if(stage>=7)return SOURCE_REST_INTERFACE_BLANK;
  if(role==='name-you')return frame.names.you;
  if(role==='name-other')return frame.names.other;
  if(role==='counter'){
    if(stage===1)return input.replace(':','·');
    const chars=Array.from(input),indices=chars.flatMap((char,i)=>/\d/.test(char)?[i]:[]),keep=Math.max(0,indices.length-(stage-1));
    for(let i=keep;i<indices.length;i++)chars[indices[i]]='·';
    return stage>=6?input.replace(/\S/g,'·'):chars.join('');
  }
  if(stage>=6)return role==='status'?'·':SOURCE_REST_INTERFACE_BLANK;
  if(role==='counter-total')return stage>=3?input.replace(/[0-9]/g,'·'):input;
  if(stage===1){
    if(role==='counter-label')return input.replace(/TAPE/,'T A P E');
    if(role==='status')return input.replace(/READY/,'R E A D Y').replace(/TRACE/,'T R A C E');
    return input.replace(/\s\/\s/g,' /  ');
  }
  if(stage===2&&role==='counter-label')return erode(input.replace(/\s+/g,' / '),stage);
  const worn=erode(input,stage);
  return stage===2&&['name','header','heading','location','status'].includes(role)?worn.replace(/\s+/g,' ').split('').join(' '):worn;
}

/** Input may be recorderMachineState or sourceTraceReadout. Only their existing
 * face strings change; numeric state, targets, actions and availability do not. */
export function sourceRestInterfaceMachine(machine,progress,options={}){
  if(!machine)return machine;
  const presentation=sourceRestInterfacePresentation(progress,options);
  if(!presentation.active)return machine;
  const text=(role,value)=>sourceRestInterfaceText(role,value,progress,options),face=machine.face;
  return{...machine,
    ...(typeof machine.note==='string'?{note:text('note',machine.note)}:{}),
    ...(machine.signal?{signal:{...machine.signal,label:text('meter-label',machine.signal.label)}}:{}),
    ...(face?{face:{...face,
      ...(face.lamp?{lamp:{...face.lamp,text:text('status',face.lamp.text)}}:{}),
      ...Object.fromEntries([['counter','counter'],['counterLabel','counter-label'],['counterTotal','counter-total'],['meterLabel','meter-label']]
        .filter(([key])=>typeof face[key]==='string').map(([key,role])=>[key,text(role,face[key])])),
    }}:{}),restInterface:presentation};
}

/** Metadata-only transcript adapter. A queued selection keeps its YOU receipt;
 * pending option IDs, exact words and destinations remain the ordinary picker. */
export function sourceRestInterfaceView(view,progress,{originalView=null,...options}={}){
  if(!view)return view;
  const frame=sourceRestInterfacePresentation(progress,options),source=originalView||view;
  if(!frame.active)return{...view,restInterface:frame};
  const story=sourceRestInstrumentStory(frame,{conversationView:source,sarahNamed:!!options.sarahNamed,musicTime:options.musicTime,phase:options.phase}),
    name=who=>who==='me'||who==='you'?frame.names.you:story?.sourceLabel??frame.names.other;
  const line=view.line?{...view.line,sourceLabel:name(view.who||view.line.who)}:view.line,
    history=Array.isArray(view.history)?view.history.map(entry=>({...entry,sourceLabel:name(entry.who)})):view.history,
    pending=view.pending?{...view.pending,options:(view.pending.options||[]).map((choice,index)=>({...choice,
      ...(typeof source.pending?.options?.[index]?.text==='string'?{text:source.pending.options[index].text}:{}),
    }))}:view.pending;
  // Undefined uses coldopen's standard SELECT / REPLY prompt. A failed key
  // legend would turn a presentation failure into a functional control bug.
  return{...view,line,history,pending,choiceHeading:story?.choiceHeading??frame.choiceHeading,presentationPrompt:undefined,restInterface:frame,
    ...(source.restQueuedReply?{restQueuedReply:source.restQueuedReply}:{})};
}

// Compatibility for old runtime callers: Source's intentionally empty corners
// do not gain invented telemetry merely so it can be damaged again.
export function sourceRestInterfaceFrame(){return[];}
