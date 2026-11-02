// Read-only witnesses for ordinary play. No setters, scene staging, grants,
// clock changes or input synthesis belong in this observer.
import { getMeta, getSave } from '../game/save.js';
import { progressionEvents } from '../progression/runtime.js';
import { achievementCompletion } from '../progression/achievements.js';

const clone = value => JSON.parse(JSON.stringify(value));
const TRACE_KEY = 'chunk-surfer:completion-pass:trace:v1';
export function installCompletionPass({ runtime = () => ({}) } = {}) {
  let trace=[];
  try { trace=JSON.parse(sessionStorage.getItem(TRACE_KEY)||'[]'); } catch (_) {}
  if(!Array.isArray(trace))trace=[];
  const panel=document.createElement('aside');panel.id='completion-pass';
  panel.setAttribute('aria-label','Read-only ordinary-play completion observer');
  panel.style.cssText='position:fixed;inset:auto 8px 8px auto;z-index:2147483000;max-width:480px;color:#dce4d2;background:#10180eea;border:1px solid #67715d;padding:7px;font:11px/1.4 monospace';
  const title=document.createElement('strong');title.textContent='ORDINARY PLAY · READ-ONLY WITNESS';panel.append(title);
  const output=document.createElement('pre');output.id='completion-pass-state';output.style.cssText='margin:5px 0;max-height:180px;overflow:auto;white-space:pre-wrap';panel.append(output);
  let expanded=false,last='';
  function state(full=false){const save=getSave(),meta=getMeta();return clone({
    at:new Date().toISOString(),...runtime(),run:{id:save.run?.id,status:save.run?.status,
      eligible:save.run?.integrity?.achievements?.eligible!==false,preset:save.run?.rules?.startedPreset},
    achievements:achievementCompletion(meta),earned:Object.keys(meta.achievements||{}),
    ...(full?{save,meta,trace}:{events:trace.slice(-3)})});}
  function log(entry){trace.push({at:Date.now(),...entry});if(trace.length>18000)trace.splice(0,1000);try{sessionStorage.setItem(TRACE_KEY,JSON.stringify(trace));}catch(_){} }
  function refresh(){try{const s=state(expanded);const line=JSON.stringify({position:s.position,heading:s.heading,scene:s.scene,paused:s.paused,run:s.run,earned:s.earned,phase:s.view?.phase,node:s.view?.nodeId,lineSerial:s.view?.lineSerial,choice:s.view?.pending?.index});if(line!==last){log({kind:'state',runtime:s.position,scene:s.scene,run:s.run,earned:s.earned});last=line;}output.textContent=JSON.stringify(s,null,2);}catch(error){output.textContent=String(error);}}
  const button=(text,id,action)=>{const b=document.createElement('button');b.textContent=text;b.id=id;b.style.marginRight='6px';b.onclick=action;panel.append(b);return b;};
  button('Snapshot','completion-pass-snapshot',()=>{expanded=!expanded;refresh();});
  button('Export witness','completion-pass-export',()=>{const data=JSON.stringify({kind:'ordinary-play-completion-witness',...state(true)},null,2);const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));link.download=`completion-witness-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);});
  let collapsed=false;
  const hide=button('Hide test panels','completion-pass-hide',()=>{
    collapsed=!collapsed;
    for(const child of panel.children)if(child!==hide)child.hidden=collapsed;
    const inputPanel=document.getElementById('completion-input-relay');if(inputPanel)inputPanel.hidden=collapsed;
    panel.style.inset=collapsed?'8px auto auto 8px':'auto 8px 8px auto';
    hide.textContent=collapsed?'Show test panels':'Hide test panels';
  });
  const off=progressionEvents.on('*',event=>{log({kind:'gameplay-event',event:clone(event)});refresh();});
  const input=e=>{if(e.target?.closest?.('#completion-pass'))return;log({kind:e.type,code:e.code,repeat:e.repeat});};
  window.addEventListener('keydown',input,{capture:true});window.addEventListener('keyup',input,{capture:true});
  document.body.append(panel);log({kind:'observer-attached',mutatesGameplay:false});refresh();
  const timer=setInterval(refresh,750);
  return {noteInput:entry=>log(entry),dispose(){clearInterval(timer);off();window.removeEventListener('keydown',input,true);window.removeEventListener('keyup',input,true);panel.remove();}};
}
