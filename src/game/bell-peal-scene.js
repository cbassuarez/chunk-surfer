import { uiDraw, uiFill, uiLine, uiSize, uiStrokeRect, uiText } from '../render/ui.js';
import { drawMachinePanel, drawVfdCounter, drawVfdText } from '../render/presentation.js';

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));

function phraseMeter(snapshot){
  return Array.from({length:6},(_,index)=>index<snapshot.phrase?'■':index===snapshot.phrase?'□':'·').join(' ');
}

function judgementLine(snapshot){
  const value=snapshot.lastJudgement;if(!value||snapshot.judgementAgeMs>2_400)return null;
  const delta=Math.round(Number(value.deltaMs)||0),side=delta<0?'EARLY':delta>0?'LATE':'ON CONTACT';
  const grade=String(value.grade||'miss').toUpperCase();
  return{grade,detail:value.reason?`${String(value.reason).toUpperCase()} / ${Math.abs(delta)} MS`:`${Math.abs(delta)} MS ${side}`,delta};
}

function drawTimingInstrument(snapshot,{x,y,w}){
  const accepted=Math.max(1,Number(snapshot.timing?.acceptedMs)||260);
  const perfect=Math.max(1,Number(snapshot.timing?.perfectMs)||90);
  const span=Math.max(accepted*2.4,900),marker=clamp01(.5+(Number(snapshot.deltaMs)||0)/(span*2));
  uiDraw(({ctx,dpr,cellW,cellH})=>{
    const px=x*cellW*dpr,py=y*cellH*dpr,pw=w*cellW*dpr,ph=3.1*cellH*dpr;
    const centre=px+pw*.5,acceptedW=pw*(accepted/span)*.5,perfectW=pw*(perfect/span)*.5;
    ctx.save();ctx.fillStyle='#050506';ctx.fillRect(px,py,pw,ph);
    ctx.fillStyle='rgba(236,233,220,.10)';ctx.fillRect(centre-acceptedW,py,acceptedW*2,ph);
    ctx.fillStyle='rgba(242,168,30,.16)';ctx.fillRect(centre-perfectW,py,perfectW*2,ph);
    ctx.strokeStyle='rgba(236,233,220,.30)';ctx.lineWidth=Math.max(1,dpr);ctx.strokeRect(px+.5*dpr,py+.5*dpr,pw-dpr,ph-dpr);
    ctx.strokeStyle='#ece9dc';ctx.globalAlpha=.9;ctx.lineWidth=Math.max(1,1.5*dpr);ctx.beginPath();ctx.moveTo(centre,py);ctx.lineTo(centre,py+ph);ctx.stroke();
    const mx=px+marker*pw,armed=!!snapshot.armed;
    ctx.fillStyle=armed?'#f2a81e':'#ece9dc';ctx.globalAlpha=armed?1:.62;
    ctx.beginPath();ctx.moveTo(mx,py+ph*.12);ctx.lineTo(mx-5*dpr,py+ph*.42);ctx.lineTo(mx+5*dpr,py+ph*.42);ctx.closePath();ctx.fill();
    ctx.fillRect(mx-Math.max(1,dpr),py+ph*.42,Math.max(2,2*dpr),ph*.48);ctx.restore();
  });
  uiText(x,y+3.45,'EARLY','ui-secondary',.62);uiText(x+Math.max(0,w-4),y+3.45,'LATE','ui-secondary',.62);
  const contact='CONTACT';uiText(x+Math.max(0,Math.floor((w-contact.length)/2)),y+3.45,contact,snapshot.armed?'ui-amber':'ui-primary');
}

function drawMemberRail(snapshot,{x,y,w}){
  const active=new Set(snapshot.activeBells||[8]),slot=Math.max(3,Math.floor(w/8));
  for(let bell=1;bell<=8;bell++){
    const sx=x+(bell-1)*slot,on=active.has(bell),tenor=bell===8,sounding=snapshot.soundingBell===bell&&snapshot.phase==='row';
    uiStrokeRect(sx,y,slot-1,2,on?(tenor?'#f2a81e':'#ece9dc'):'#343434',on ? (sounding?1:.82) : .26,sounding?2:1);
    uiText(sx+Math.max(0,Math.floor((slot-2)/2)),y+.55,on?String(bell):'×',tenor?'ui-amber':on?'ui-primary':'ui-secondary',on?(sounding?1:.82):.30);
  }
}

function drawPermutation(snapshot,{x,y,w}){
  const row=snapshot.target?.row;if(!row)return;
  const active=new Set(snapshot.activeBells||[8]),cell=Math.max(3,Math.floor(w/8));
  const label=row.map((bell)=>active.has(bell)?String(bell):'·');
  for(let place=0;place<8;place++){
    const sx=x+place*cell,tenor=place===7,current=snapshot.phase==='row'&&place===snapshot.place;
    if(current)uiStrokeRect(sx-.5,y-.45,cell-1,2.35,tenor?'#f2a81e':'#ece9dc',.72,1);
    uiText(sx,y,label[place],tenor?'ui-amber':active.has(row[place])?'ui-primary':'ui-secondary',active.has(row[place])?1:.32);
    uiLine(sx,y+1.15,sx+cell-1,y+1.15,tenor?'#f2a81e':'#777',tenor ? .9 : .3,1);
  }
}

function pealTime(ms=0){
  const total=Math.max(0,Math.floor((Number(ms)||0)/1000));
  return`${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

export function createBellPealScene({performance,reducedMotion=()=>false,onGuidedPulse=()=>{},onCountInPulse=()=>{},onInterference=()=>{},onRelease=()=>{}}={}){
  let released=false,guidedPulseRow=-1,countInPulse=-1,interferenceSignature='',interferenceStatusUntil=0;
  const scene={
    id:'tower-tenor-performance',blocksInput:true,blocksWorld:false,suppressesHud:true,allowsLook:true,lookProfile:'battle',
    enter(){performance?.start?.();},
    resume(){performance?.resume?.('scene-resume');},
    update(dt){
      performance?.tick?.(dt);const snap=performance?.snapshot?.();
      if(snap?.guided&&snap.armed&&snap.approach>=.72&&guidedPulseRow!==snap.row){guidedPulseRow=snap.row;onGuidedPulse(snap);}
      if(snap?.phase==='retry'||snap?.phase==='count_in')guidedPulseRow=-1;
      if(snap?.phase==='count_in'&&snap.countIn!==countInPulse){countInPulse=snap.countIn;onCountInPulse(snap);}
      if(snap?.phase!=='count_in')countInPulse=-1;
      const signature=`${snap?.interference?.stage}:${(snap?.activeBells||[]).join(',')}`;
      if(signature&&signature!==interferenceSignature){
        const previous=interferenceSignature;interferenceSignature=signature;interferenceStatusUntil=(snap?.clockMs||0)+4_800;
        if(previous)onInterference(snap);
      }
    },
    key(e){
      const bare=!e.metaKey&&!e.ctrlKey&&!e.altKey;
      if(bare&&(e.code==='Space'||e.key===' '||e.controllerAction==='mark')){if(!e.repeat)performance?.press?.({timeStamp:e.timeStamp});return true;}
      if(bare&&(e.code==='KeyE'||String(e.key).toLowerCase()==='e'||e.controllerAction==='interact')){
        if(!released){released=true;performance?.release?.();onRelease(scene);}return true;
      }
      return false;
    },
    render(){
      const snap=performance?.snapshot?.();if(!snap)return;
      const{cols,rows}=uiSize(),w=Math.min(112,cols-6),x=Math.floor((cols-w)/2);
      uiFill(0,0,cols,rows,'rgba(2,2,3,0.72)');
      const panel=drawMachinePanel(x-2,2,w+4,rows-4,{
        label:'AUDIOCORP / CHANGE CONTROL',source:'TOWER',meter:false,footer:'SPACE / PULL     E / RELEASE',scrim:false,theme:'amber',model:'TC-84',
      });
      const left=panel.x+1,right=panel.x+panel.w-1,bodyW=Math.max(24,right-left),top=panel.y+.2;
      if(snap.hud?.title!==false)drawVfdText(left,top,'STEDMAN TRIPLES',{scale:1,role:'ui-primary'});
      const transport=pealTime(snap.musicalElapsedMs);uiText(Math.max(left,right-transport.length),top,transport,'ui-secondary',.76);
      if(snap.hud?.progress!==false){
        const progress=`ROW ${String(Math.min(84,snap.row+1)).padStart(2,'0')} / 84`;
        uiText(right-progress.length,top+1.35,progress,'ui-amber');
      }
      if(snap.hud?.phrases!==false)uiText(left,top+1.4,phraseMeter(snap),'ui-secondary',.8);
      if(snap.hud?.stroke!==false){
        const stroke=(snap.target?.stroke||'cover').toUpperCase();uiText(right-stroke.length,top+1.4,stroke,'ui-secondary',.8);
      }

      const membersY=top+3.6;
      uiText(left,membersY-.9,'BAND / PLACES','ui-label',.58);
      if(snap.hud?.members!==false)drawMemberRail(snap,{x:left,y:membersY,w:bodyW});
      const status=String(snap.interference?.surferLine||'');
      const statusAlpha=(snap.clockMs||0)<interferenceStatusUntil ? .96 : .52;
      uiText(left,membersY+2.65,status.slice(0,bodyW),'ui-amber',statusAlpha);

      const permutationY=membersY+5.25;
      if(snap.hud?.permutation!==false)uiText(left,permutationY-.9,'CURRENT CHANGE','ui-label',.58);
      if(snap.hud?.permutation!==false)drawPermutation(snap,{x:left,y:permutationY,w:bodyW});
      const timingY=Math.max(permutationY+3.45,Math.floor(rows*.46));
      uiText(left,timingY-.85,'TENOR CONTACT','ui-label',.58);
      drawTimingInstrument(snap,{x:left,y:timingY,w:bodyW});

      const feedback=judgementLine(snap),feedbackY=timingY+5.8;
      if(snap.phase==='count_in'){
        const call=snap.countInCall||'LISTEN';drawVfdText(left,feedbackY,call,{scale:Math.min(2,bodyW/Math.max(1,call.length*2)),role:'ui-primary'});
        drawVfdCounter(right-5,feedbackY,String(snap.countIn),{scale:1,theme:'amber'});
      }else if(snap.phase==='retry'){
        drawVfdText(left,feedbackY,'TENOR ABSENT',{scale:1,role:'ui-primary'});uiText(left,feedbackY+2,'ROW RECALLED / LISTEN TO THE HOLE','ui-amber');
      }else if(feedback&&snap.hud?.judgement!==false){
        drawVfdText(left,feedbackY,feedback.grade,{scale:1,role:'ui-primary'});uiText(left,feedbackY+2,feedback.detail,'ui-amber');
      }else{
        const readiness=snap.armed?(snap.guided&&snap.approach>.82?'PULL':'TENOR ARMED')
          :snap.phase==='row'&&snap.soundingBell?`BELL ${snap.soundingBell} / LISTEN`:'LISTEN';
        drawVfdText(left,feedbackY,readiness,{scale:1,role:snap.armed?'ui-counter':'ui-primary'});
      }

      const mode=`${String(snap.mode||'standard').toUpperCase()}  CONTACT ±${snap.timing?.acceptedMs||260} MS`;
      uiText(left,panel.y+panel.h-1.4,mode,'ui-secondary',.7);
      if(reducedMotion?.())uiText(right-14,panel.y+panel.h-1.4,'REDUCED MOTION','ui-secondary',.55);
    },
  };
  return scene;
}
