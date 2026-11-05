import {uiDraw,uiFill,uiSize} from '../render/ui.js';
import {drawVfdText} from '../render/presentation.js';
import {promptLine} from './bindings.js';
import {makeColdOpenScene} from './coldopen.js';
import {OPENING_PROLOGUE,OPENING_PROLOGUE_SET,createOpeningPrologueStage} from '../data/opening-prologue.js';
import {openingHorizonFrame,openingOmenProps} from '../render/opening-omen.js';

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
// The talk is the game's own conversation machine: nothing advances by itself, a hub
// says its piece once, and you choose when to open your mouth. This only draws it, as
// a running column beside the picture, and moves the picture in its own time.
export function makeOpeningPrologueScene({getReady=()=>true,getPresentationReady=()=>true,toWorldView=frame=>frame,setOmen=()=>{},reducedMotion=false,audio,getAudio,replay=null,onStart=()=>{},onDone=()=>{},onExit=()=>{},onUnavailable=()=>{},setMusic=()=>{}}={}){
  let phase='loading',paused=false,exited=false,finished=false,skip=0,held=false,posed=null,cardAt=0,lastNode=null,fates=0,pictured=0,lastSerial=0,lastLine=null;
  const stage=createOpeningPrologueStage({reducedMotion}),nodes=OPENING_PROLOGUE.nodes,log=[];
  const clear=()=>setOmen({props:[],horizon:null,rain:null});
  function observed(){const s=stage.view();if(!posed)return s;const m={...s,...posed},d=m.target.map((n,k)=>n-m.eye[k]);return{...m,yaw:Math.atan2(d[0],-d[2]),pitch:Math.atan2(d[1],Math.hypot(d[0],d[2]))};}
  function picture(){
    const s=observed(),centre=s.hole,time=s.time;pictured++;
    setOmen({rain:s.rain,props:openingOmenProps({eye:s.eye,centre,radius:s.radius,moon:s.veil>=1?0:s.moon,time,stream:s.stream,reducedMotion}),
      horizon:s.veil>=1?null:openingHorizonFrame({centre,radius:s.radius,clock:time,wheels:s.wheels,falls:s.falls,open:s.open,shut:s.shut,reducedMotion})});
    const yaw=s.yaw+FRAME_SHIFT,reach=Math.hypot(s.target[0]-s.eye[0],s.target[2]-s.eye[2]),target=[s.eye[0]+Math.sin(yaw)*reach,s.target[1],s.eye[2]-Math.cos(yaw)*reach];
    return toWorldView({...OPENING_PROLOGUE_SET,time,eye:s.eye,target,yaw,pitch:s.pitch,veil:s.veil,
      observer:{x:s.eye[0],z:s.eye[2],feet:OPENING_PROLOGUE_SET.floorH,renderGroup:OPENING_PROLOGUE_SET.renderGroup,spaceId:OPENING_PROLOGUE_SET.observerSpace},openingOverture:true});
  }
  function finish(){if(finished)return;finished=true;clear();onDone();}
  const scene=makeColdOpenScene({id:'opening-prologue',opening:nodes,startAt:OPENING_PROLOGUE.entry,ambient:false,blocksWorld:true,allowsLook:false,suppressesHud:true,
    worldUnderlay:true,presentation:'cinematic',voiceEnabled:false,audio,getAudio,replay,worldView:picture,onDone:finish});
  const baseEnter=scene.enter.bind(scene),baseExit=scene.exit.bind(scene),baseUpdate=scene.update.bind(scene),baseKey=scene.key.bind(scene),baseKeyup=scene.keyup.bind(scene),baseView=scene.view.bind(scene);
  Object.assign(scene,{handlesEscape:false,worldPresentation:'visible',lookProfile:'calm'});
  // The talk starts on the first shown frame of the picture, not when it is pushed.
  scene.enter=()=>{};
  scene.update=dt=>{
    if(exited||finished||paused)return;
    if(phase==='loading'){
      const ready=getReady();
      if(ready?.error){onUnavailable(ready.error);finish();return;}
      if(ready===true||ready?.ready===true)phase='awaiting-frame';
      return;
    }
    if(phase==='awaiting-frame'){if(pictured<2||!getPresentationReady())return;phase='film';onStart();baseEnter();}
    if(phase!=='film'||!getPresentationReady())return;
    const step=Math.max(0,Math.min(.1,Number(dt)||0));
    stage.advance(step);baseUpdate(step);
    const v=baseView(),node=nodes[v.nodeId];
    if(v.lineSerial!==lastSerial){if(lastLine?.text)log.push(lastLine);lastSerial=v.lineSerial;}
    lastLine=v.line?{who:v.who,text:String(v.line.text||'')}:lastLine;
    if(v.nodeId!==lastNode){
      lastNode=v.nodeId;if(node?.fate)fates++;
      if(node?.stage)stage.to(node.stage==='fate'?`fate${Math.min(6,fates)}`:node.stage);
    }
    setMusic(stage.view().music);
    // You chose to say it. It does not then need a second press to have been said.
    if(v.who==='me'&&!v.typing&&!v.pending&&v.lineAge>ECHO_DWELL)baseKey({key:' '});
    if(node?.card){cardAt+=step;if(cardAt>=node.seconds){finish();return;}}
    skip=held?skip+step:0;
    if(skip>=SKIP_HOLD)finish();
  };
  scene.key=(event={})=>{
    const code=String(event.code||event.key||'').toLowerCase();
    if(code==='escape'||event.controllerAction==='back')return false;
    if(event.ctrlKey||event.metaKey||event.altKey)return true;
    held=true;
    if(event.repeat||phase!=='film'||nodes[baseView().nodeId]?.card)return true;
    return baseKey(event);
  };
  scene.keyup=(event={})=>{held=false;skip=0;baseKeyup(event);return true;};
  scene.pause=()=>{paused=true;held=false;skip=0;};scene.resume=()=>{paused=false;};scene.blur=()=>scene.pause();scene.focus=()=>scene.resume();
  scene.exit=()=>{if(exited)return;exited=true;clear();baseExit();onExit({finished});};
  scene.view=()=>({...baseView(),phase,paused,finished,skip,fates,stageId:stage.id(),stage:observed(),log:[...log]});
  // For review stills: the picture at a named point with its move finished, or an exact stage.
  scene.seekStage=key=>{stage.to(key);stage.snap();};
  scene.pose=value=>{posed=value;};
  scene.render=()=>{
    const {cols,rows}=uiSize(),s=observed(),v=baseView(),node=nodes[v.nodeId];
    if(phase!=='film'){uiFill(0,0,cols,rows,'#000');return;}
    uiDraw(({ctx})=>{
      const W=ctx.canvas.width,H=ctx.canvas.height,bar=Math.round(H*BAR);
      ctx.save();ctx.setTransform?.(1,0,0,1,0,0);ctx.fillStyle='#000';
      if(s.veil>0){ctx.globalAlpha=Math.min(1,s.veil);ctx.fillRect(0,0,W,H);ctx.globalAlpha=1;}
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
    const prompt=v.pending?.options?.length?promptLine([{action:'select',label:'SELECT'},{action:'confirm',label:'REPLY'}]):v.typing?'':promptLine([{action:'continue',label:'CONTINUE'}]);
    if(prompt)drawVfdText(inner,y,String(prompt).slice(0,Math.floor((w-PAD*2)/.8)),{scale:.8,color:DIM,alpha:.8});
    y-=STEP+GAP;
    if(v.pending?.options?.length){
      const blocks=v.pending.options.map((option,k)=>({k,rows:openingPrologueWrap(`${k+1}. ${option.text}`,chars-2)}));
      for(const block of[...blocks].reverse()){
        const on=block.k===v.pending.index;y-=(block.rows.length-1)*STEP;
        block.rows.forEach((text,n)=>drawVfdText(inner+(on?0:SCALE*2),y+n*STEP,(on&&n===0?'> ':on?'  ':'')+text,{scale:SCALE,color:on?LIT:INK,alpha:on?1:.72}));
        y-=STEP+.2;
      }
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
    if(skip>.12)centred(x*2+w-cols,1,'HOLD TO SKIP',.8,DIM,Math.min(1,skip/SKIP_HOLD));
  };
  return scene;
}
