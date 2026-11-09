import {uiDraw,uiFill,uiSize} from '../render/ui.js';
import {drawVfdText} from '../render/presentation.js';
import {promptLine} from './bindings.js';
import {makeColdOpenScene} from './coldopen.js';
import {OPENING_PROLOGUE,OPENING_PROLOGUE_SET,createOpeningPrologueStage} from '../data/opening-prologue.js';
import {openingHorizonFrame,openingOmenProps} from '../render/opening-omen.js';
import {createOpeningPrologueDirection} from './opening-prologue-direction.js';

const SKIP_HOLD=1.1,ECHO_DWELL=.55,COLUMN=.38,PAD=2.6,SCALE=1.14,STEP=1.22,GAP=.75,BAR=.028;
// The hole sits in the middle of what the column leaves, not behind the column.
const FRAME_SHIFT=.42;
const COLOUR=Object.freeze({direction:'#a9b4be',unknown:'#ece4d3',me:'#e8a24a'}),DIM='#7d776b',LIT='#e8a24a',INK='#ece4d3';
const centred=(cols,row,text,scale,color,alpha)=>drawVfdText(Math.max(0,(cols-text.length*scale)/2),row,text,{scale,color,alpha});
export function openingPrologueWrap(text,width){
  const rows=[];let row='';
  for(const word of String(text).split(/\s+/).filter(Boolean)){
    const next=row?`${row} ${word}`:word;
    if(row&&next.length>width){rows.push(row);row=word;}else row=next;
  }
  if(row)rows.push(row);
  return rows;
}
const spoken=(who,text)=>who==='me'?`"${text}"`:text;
const skipEvent=event=>event.controllerAction?event.controllerAction==='tabNext'
  :String(event.code||event.key||'').toLowerCase()==='keye'||String(event.key||'').toLowerCase()==='e';
const openingPrologueVoice=v=>v.who==='unknown'&&typeof v.voice==='number'&&v.voice>=0&&v.voice<1;
export function openingPrologueActFrame(frame,act){return{...frame,shut:Math.max(frame.shut,act?1:0)};}
// Keep the selected answer whole when text scale leaves too few rows for the
// eight-question board. Up/down moves this window with the actual selection.
export function openingPrologueChoiceWindow(options,chars,maxRows,selected=0){
  const blocks=(options||[]).map((option,k)=>({k,rows:openingPrologueWrap(`${k+1}. ${option.text}`,Math.max(8,chars-2))}));
  if(!blocks.length)return{blocks:[],before:0,after:0};
  const cost=block=>block.rows.length*STEP+.2,budget=Math.max(6,maxRows);
  const at=Math.max(0,Math.min(blocks.length-1,selected));
  let start=at,end=at+1,used=cost(blocks[at]);
  while(start>0||end<blocks.length){
    const canBefore=start>0&&used+cost(blocks[start-1])<=budget;
    const canAfter=end<blocks.length&&used+cost(blocks[end])<=budget;
    if(!canBefore&&!canAfter)break;
    if(canBefore&&(!canAfter||at-start<=end-at-1)){start--;used+=cost(blocks[start]);}
    else{used+=cost(blocks[end]);end++;}
  }
  return{blocks:blocks.slice(start,end),before:start,after:blocks.length-end};
}
// The talk is the game's own conversation machine: nothing advances by itself, a hub
// says its piece once, and you choose when to open your mouth. This only draws it, as
// a running column beside the picture, and moves the picture in its own time.
export function makeOpeningPrologueScene({getReady=()=>true,getPresentationReady=()=>true,toWorldView=frame=>frame,setOmen=()=>{},reducedMotion=false,audio,getAudio,replay=null,onStart=()=>{},onDone=()=>{},onExit=()=>{},onUnavailable=()=>{},setMusic=()=>{},
  drive=null,driveMetrics=null,driveLive=()=>true,onDriveFrame=()=>{},onBeat=()=>{}}={}){
  let phase='loading',paused=false,exited=false,finished=false,skip=0,held=false,posed=null,cardAt=0,lastNode=null,fates=0,pictured=0,lastSerial=0,lastLine=null,beat=drive?'drive':'omen',openingAct=null;
  let lastFrame=null,reviewStage=null,reviewSnap=false,hasSpoken=false,bodyCue='neutral',bodyCueStarted=false,started=false,lastPresented=false,presentationHeld=false;
  const direction=drive?createOpeningPrologueDirection({reducedMotion}):null;
  const stage=createOpeningPrologueStage({reducedMotion}),nodes=OPENING_PROLOGUE.nodes,log=[];
  const metrics=()=>typeof driveMetrics==='function'?driveMetrics():driveMetrics;
  const clear=()=>setOmen({props:[],horizon:null,rain:null});
  function observed(){const s=openingPrologueActFrame(stage.view(),openingAct);if(!posed)return s;const m={...s,...posed},d=m.target.map((n,k)=>n-m.eye[k]);return{...m,yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};}
  function picture(){
    const s=observed(),centre=s.hole,time=s.time;pictured++;
    setOmen({rain:s.rain,props:openingOmenProps({eye:s.eye,centre,radius:s.radius,moon:s.veil>=1?0:s.moon,time,stream:s.stream,reducedMotion}),
      horizon:s.veil>=1?null:openingHorizonFrame({centre,radius:s.radius,clock:time,wheels:s.wheels,falls:s.falls,open:s.open,shut:s.shut,reducedMotion,eyePresentation:s.eyePresentation})});
    const yaw=s.yaw+FRAME_SHIFT,reach=Math.hypot(s.target[0]-s.eye[0],s.target[2]-s.eye[2]),target=[s.eye[0]+Math.sin(yaw)*reach,s.target[1],s.eye[2]-Math.cos(yaw)*reach];
    return toWorldView({...OPENING_PROLOGUE_SET,time,eye:s.eye,target,yaw,pitch:s.pitch,veil:s.veil,
      observer:{x:s.eye[0],z:s.eye[2],feet:OPENING_PROLOGUE_SET.floorH,renderGroup:OPENING_PROLOGUE_SET.renderGroup,spaceId:OPENING_PROLOGUE_SET.observerSpace},openingOverture:true});
  }
  function finish(){if(finished)return;finished=true;clear();onDone();}
  const scene=makeColdOpenScene({id:'opening-prologue',opening:nodes,startAt:OPENING_PROLOGUE.entry,ambient:false,blocksWorld:true,allowsLook:false,suppressesHud:true,
    worldUnderlay:true,presentation:'cinematic',voiceEnabled:true,audio,getAudio,replay,worldView:picture,onDone:finish});
  const baseEnter=scene.enter.bind(scene),baseExit=scene.exit.bind(scene),baseUpdate=scene.update.bind(scene),baseKey=scene.key.bind(scene),baseKeyup=scene.keyup.bind(scene),baseView=scene.view.bind(scene);
  Object.assign(scene,{handlesEscape:false,worldPresentation:'visible',lookProfile:'calm'});
  // The world frame carries the omen; a drive beat owns the picture itself
  // and hides the world exactly the way the door teaser does.
  Object.defineProperty(scene,'worldPresentation',{configurable:true,get:()=>drive?'hidden':'visible'});
  // The actual prologue never lends its camera or lighting to another owner.
  // A no-drive host remains available for the text-only/headless fallback.
  scene.worldView=()=>drive?null:picture();
  Object.defineProperty(scene,'allowsLook',{configurable:true,get:()=>phase==='film'&&!paused
    &&driveLive()&&typeof drive?.lookBy==='function'});
  scene.lookAngles=()=>direction?.view()?{yaw:direction.view().yaw,pitch:direction.view().pitch}:drive?.lookAngles?.()||{yaw:0,pitch:-.035};
  scene.lookBy=(yaw,pitch)=>scene.allowsLook?!!drive.lookBy(yaw,pitch):false;
  // The talk starts on the first shown frame of the picture, not when it is pushed.
  scene.enter=()=>{};
  function semantic(){
    if(reviewStage){if(reviewStage==='dark')return'road';if(reviewStage==='gone')return'return';if(reviewStage.startsWith('fate')||reviewStage==='last'||reviewStage==='margin')return'personal';if(['ellery','school','boy','notice','roll'].includes(reviewStage))return'ellery';return'recognition';}
    return nodes[baseView().nodeId]?.semanticPhase||'road';
  }
  function present(step=0){
    if(!drive||!driveLive())return false;
    const raw=drive.frame(metrics());if(!raw)return false;
    const v=baseView(),s=observed(),frame=direction.compose(raw,{dt:step,stage:s,stageId:stage.id(),nodeId:reviewStage?'':v.nodeId,semanticPhase:semantic(),snap:reviewSnap,override:posed});reviewSnap=false;
    if(!frame)return false;
    const j=frame.journey,active=j.radius>.01&&semantic()!=='road',view=[0,.08,-1];
    const horizon=active?openingHorizonFrame({centre:j.hole,radius:j.radius,clock:s.time,view,wheels:s.wheels,falls:s.falls,open:s.open,shut:s.shut,reducedMotion,eyePresentation:s.eyePresentation}):null;
    // Source's optical family, with the normal scene's material encoding.
    // A global Source ink finish must not acquire the driver's ordinary cab.
    setOmen({rain:s.rain,props:active?openingOmenProps({eye:j.eye,centre:j.hole,radius:j.radius,moon:s.moon,time:s.time,stream:s.stream,reducedMotion,view}):[],horizon:horizon?{...horizon,finish:null}:null});
    const accepted=onDriveFrame(frame)!==false;lastPresented=accepted;
    if(!accepted&&!presentationHeld){presentationHeld=true;scene.presentationPause?.();}
    else if(accepted&&presentationHeld){presentationHeld=false;scene.presentationResume?.();}
    if(accepted)lastFrame=frame;return accepted;
  }
  function established(){return!drive||direction.view()?.established===true;}
  function bodyComplete(){return bodyCue==='neutral'||!bodyCueStarted||(drive?.snapshot()?.embodiment?.progress??1)>=1;}
  scene.update=dt=>{
    if(exited||finished||paused)return;
    if(phase==='loading'){
      const ready=getReady();
      if(ready?.error){onUnavailable(ready.error);finish();return;}
      if(ready===true||ready?.ready===true)phase='awaiting-frame';
      return;
    }
    if(phase==='awaiting-frame'){
      if(!getPresentationReady())return;
      if(drive){if(!driveLive())return;if(!started){drive.start();started=true;}if(!present(0))return;}
      else if(pictured<2)return;
      phase='film';onStart();onBeat(beat);baseEnter();
    }
    if(phase!=='film')return;
    const step=Math.max(0,Math.min(.1,Number(dt)||0));
    skip=held?skip+step:0;if(skip>=SKIP_HOLD){finish();return;}
    if(!getPresentationReady()){lastPresented=false;if(!presentationHeld){presentationHeld=true;scene.presentationPause?.();}return;}
    if(drive&&!lastPresented&&!present(0))return;
    stage.advance(step);baseUpdate(step);
    const v=baseView(),node=nodes[v.nodeId];
    if(v.lineSerial!==lastSerial){if(lastLine?.text)log.push(lastLine);lastSerial=v.lineSerial;}
    lastLine=v.line?{who:v.who,text:String(v.line.text||'')}:lastLine;
    if(v.nodeId!==lastNode){
      lastNode=v.nodeId;reviewStage=null;if(node?.fate)fates++;
      if(node?.openingAct&&!openingAct)openingAct={id:node.openingAct,node:v.nodeId,at:stage.time()};
      if(node?.stage)stage.to(node.stage==='fate'?`fate${Math.min(6,fates)}`:node.stage);
      const cue=v.nodeId==='interval-wheel'?'seam':v.nodeId==='interval-hold'?'grip':v.nodeId==='interval-release'?'release':null;
      if(cue){bodyCue=cue;bodyCueStarted=false;}
    }
    if(openingPrologueVoice(v))hasSpoken=true;
    if(drive){
      if(bodyCue!=='neutral'&&!bodyCueStarted&&direction.view()?.intent==='body'&&established()){drive.setEmbodiment?.({cue:bodyCue});bodyCueStarted=true;}
      const returning=v.nodeId==='wipers'||v.nodeId==='card';
      drive.setEmbodiment?.({holdWiper:hasSpoken&&!returning});
      drive.update(step);present(step);
    }
    setMusic(semantic()==='road'?.6:semantic()==='ellery'?.78:semantic()==='return'||v.nodeId==='off'?.42:.62);
    // You chose to say it. It does not then need a second press to have been said.
    if(v.who==='me'&&!v.typing&&!v.pending&&v.lineAge>ECHO_DWELL&&established()&&bodyComplete())baseKey({key:' '});
    if(node?.card){cardAt+=step;if(cardAt>=node.seconds){finish();return;}}
  };
  scene.key=(event={})=>{
    const code=String(event.code||event.key||'').toLowerCase();
    if(code==='escape'||event.controllerAction==='back')return false;
    if(event.ctrlKey||event.metaKey||event.altKey)return true;
    if(skipEvent(event)){
      event.preventDefault?.();
      if(phase==='film'&&!event.repeat)held=true;
      return true;
    }
    if(event.repeat||phase!=='film'||nodes[baseView().nodeId]?.card)return true;
    if(presentationHeld)return true;
    const v=baseView(),progressKey=[' ','enter','z'].includes(code)||/^[1-9]$/.test(code);
    if(progressKey&&!v.typing&&(!established()||!bodyComplete()))return true;
    return baseKey(event);
  };
  scene.keyup=(event={})=>{if(skipEvent(event)){held=false;skip=0;}baseKeyup(event);return true;};
  scene.pause=()=>{if(paused)return;paused=true;held=false;skip=0;drive?.setPaused?.(true);scene.presentationPause?.();};scene.resume=()=>{if(!paused)return;paused=false;drive?.setPaused?.(false);scene.presentationResume?.();};scene.blur=()=>scene.pause();scene.focus=()=>scene.resume();
  scene.exit=()=>{if(exited)return;exited=true;clear();baseExit();onExit({finished});};
  scene.view=()=>{const j=direction?.view(),s=observed();return{...baseView(),phase,paused,finished,skip,fates,spoken:hasSpoken,presentationReady:!drive||lastPresented,openingAct:openingAct?{...openingAct}:null,stageId:stage.id(),semanticPhase:semantic(),stage:j?{...s,eye:j.eye,target:j.target,hole:j.hole,radius:j.radius,yaw:j.yaw,pitch:j.pitch}:s,log:[...log],beat,beatVeil:0,journey:j,drive:drive?.snapshot()||null};};
  scene.physicalFrame=()=>lastFrame;
  // For review stills: the picture at a named point with its move finished, or an exact stage.
  scene.seekStage=key=>{stage.to(key);stage.snap();reviewStage=key;reviewSnap=true;};
  scene.pose=value=>{posed=value;reviewSnap=true;if(phase==='film'&&drive)present(0);};
  scene.render=()=>{
    const {cols,rows}=uiSize(),s=observed(),v=baseView(),node=nodes[v.nodeId];
    if(paused&&phase==='film'&&drive)present(0);
    if(phase!=='film'){uiFill(0,0,cols,rows,'#000');return;}
    uiDraw(({ctx})=>{
      const W=ctx.canvas.width,H=ctx.canvas.height,bar=Math.round(H*BAR);
      ctx.save();ctx.setTransform?.(1,0,0,1,0,0);ctx.fillStyle='#000';
      const veil=Math.max(s.veil||0,direction?.view()?.opticalVeil||0);
      if(veil>0){ctx.globalAlpha=Math.min(1,veil);ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
      ctx.fillRect(0,0,W,bar);ctx.fillRect(0,H-bar,W,bar);ctx.restore();
    });
    if(node?.card){
      const alpha=Math.min(Math.min(1,cardAt/.8),Math.max(0,(node.seconds-cardAt)/.8)),mid=Math.floor(rows/2)-node.card.length*2;
      node.card.forEach((text,k)=>{const scale=k===2?2.4:3.2;centred(cols,mid+k*4,text,scale,k===2?LIT:INK,alpha);});
      return;
    }
    const w=Math.max(30,Math.round(cols*COLUMN)),x=cols-w,inner=x+PAD,chars=Math.max(14,Math.floor((w-PAD*2)/SCALE));
    uiFill(x,0,w,rows,'#000');
    // From the bottom: the prompt, the replies, and then the talk stacked upward.
    let y=rows-1.6;
    const prompt=!established()||!bodyComplete()?'':v.pending?.options?.length?promptLine([{action:'select',label:'SELECT'},{action:'confirm',label:'REPLY'}]):v.typing?'':promptLine([{action:'continue',label:'CONTINUE'}]);
    if(prompt)drawVfdText(inner,y,String(prompt).slice(0,Math.floor((w-PAD*2)/.8)),{scale:.8,color:DIM,alpha:.8});
    y-=STEP+GAP;
    if(v.pending?.options?.length){
      const {blocks,before,after}=openingPrologueChoiceWindow(v.pending.options,chars,rows*.62,v.pending.index);
      if(after)drawVfdText(inner,y,'MORE REPLIES BELOW',{scale:.75,color:DIM,alpha:.8});
      y-=after?STEP:0;
      for(const block of[...blocks].reverse()){
        const on=block.k===v.pending.index;y-=(block.rows.length-1)*STEP;
        block.rows.forEach((text,n)=>drawVfdText(inner+(on?0:SCALE*2),y+n*STEP,(on&&n===0?'> ':on?'  ':'')+text,{scale:SCALE,color:on?LIT:INK,alpha:on?1:.72}));
        y-=STEP+.2;
      }
      if(before){drawVfdText(inner,y,'MORE REPLIES ABOVE',{scale:.75,color:DIM,alpha:.8});y-=STEP;}
      y-=GAP;
    }
    // The line being said types out in place, so its wrapping does not jump.
    const entries=[...log.map(row=>({...row,done:true})),...(v.line&&v.line.text?[{who:v.who,text:String(v.line.text),typed:v.typed}]:[])];
    for(let k=entries.length-1,age=0;k>=0&&y>.5;k--,age++){
      const entry=entries[k],text=spoken(entry.who,entry.text),wrapped=openingPrologueWrap(text,chars);
      y-=(wrapped.length-1)*STEP;
      const fade=entry.done?Math.max(.34,.86-age*.08):1,offset=entry.who==='me'&&!entry.done?1:0;
      let left=entry.done?Infinity:(entry.typed??text.length)+offset;
      wrapped.forEach((row,n)=>{
        const at=y+n*STEP;if(at<.3)return;
        const shown=left>=row.length?row:row.slice(0,Math.max(0,left));left-=row.length+1;
        if(shown)drawVfdText(inner,at,shown,{scale:SCALE,color:COLOUR[entry.who]||INK,alpha:fade});
      });
      y-=STEP+GAP;
    }
    const skipPrompt=promptLine([{action:'tabNext',label:'HOLD TO SKIP'}]);
    if(skip>.12||s.time<8)centred(x,1,skipPrompt,.8,DIM,skip>.12?Math.min(1,skip/SKIP_HOLD):.65);
  };
  return scene;
}
