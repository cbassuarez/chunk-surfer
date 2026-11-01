// These are display-only changes. The underlying dialogue, choice IDs, input
// bindings and saved state never become the thing the screen has imagined.
import {promptLine,activeInputPromptDevice} from './bindings.js';
const clamp=n=>Math.max(0,Math.min(1,Number.isFinite(Number(n))?Number(n):0));
function label(who,serial,progress){
  if(progress<.48)return who==='me'?'YOU':'HERE';
  if(progress>=.91)return '·';
  if(progress<.66)return who==='me'?'Y O U':'H E R E';
  return who==='me'?'Y · U':'H E A R';
}
function weather(text,progress){
  const value=String(text??'');
  // Preserve word and character positions as a line is typed; the surface
  // changes punctuation, not the meaning or the available action.
  return progress<.4?value:value.replace(/[.]/g,'·');
}
export function sourceRestPresentationView(view,progress,{effects=true}={}){
  if(!view)return view;
  if(!effects)return {...view,restSubtitle:true,restBlack:clamp(progress)>=.96};
  const p=clamp(progress),line=view.line?{...view.line,text:weather(view.line.text,p),
    sourceLabel:label(view.who,view.lineSerial,p)}:view.line;
  const history=Array.isArray(view.history)?view.history.map(entry=>({...entry,text:weather(entry.text,p),
    sourceLabel:label(entry.who,entry.serial,p)})):view.history;
  const pending=view.pending?{...view.pending,options:(view.pending.options||[]).map(choice=>({...choice,
    text:weather(choice.text??choice.label,p)}))}:view.pending;
  const choiceHeading=p<.35?'YOU / REPLY ▐':p<.68?'I / REPLY ▐':p<.9?'HERE / REPLY ▐':'· / REPLY ▐';
  let presentationPrompt;
  if(p>=.48&&pending?.options?.length){
    presentationPrompt=promptLine([{action:'select',label:p<.72?'S E L E C T':'SELECT'},{action:'confirm',label:p<.72?'RE / PLY':'R E P L Y'}]);
    if(activeInputPromptDevice()==='keyboard')presentationPrompt+=` · [1${pending.options.length>1?`–${Math.min(9,pending.options.length)}`:''}] R E P L Y`;
  }
  return {...view,line,history,pending,restSubtitle:true,restBlack:p>=.96,choiceHeading,...(presentationPrompt?{presentationPrompt}:{})};
}
