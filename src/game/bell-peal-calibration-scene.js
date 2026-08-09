import { uiSize, uiText } from '../render/ui.js';
import { drawVfdText } from '../render/presentation.js';
import { createBellPealClock } from './bell-peal-performance.js';

export const PEAL_CALIBRATION = Object.freeze({
  beatMs:600,
  countInBeats:4,
  responseBeats:4,
});

const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,Number(value)||0));

export function calibrationOffsetFromSamples(samples=[],automaticLatencyMs=0){
  const clean=samples.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if(!clean.length)return 0;
  const middle=Math.floor(clean.length/2);
  const median=clean.length%2?clean[middle]:(clean[middle-1]+clean[middle])/2;
  const residual=median-Math.max(0,Number(automaticLatencyMs)||0);
  return clamp(Math.round(-residual/5)*5,-250,250);
}

export function createBellPealCalibrationScene({
  context,
  destination=null,
  initialOffsetMs=0,
  onDone=()=>{},
}={}){
  let startedAt=0,clockAnchorAt=0,inputClock=null,targets=[],samples=[],used=new Set(),finished=false,resultMs=Number(initialOffsetMs)||0;
  const automaticLatencyMs=()=>inputClock?.snapshot?.().automaticLatencyMs??Math.max(0,((Number(context?.baseLatency)||0)+(Number(context?.outputLatency)||0))*1000);

  function scheduleTick(when,accent=false){
    if(!context?.createOscillator)return;
    const osc=context.createOscillator(),gain=context.createGain();
    osc.type='sine';osc.frequency.value=accent?880:660;
    gain.gain.setValueAtTime(.0001,when);gain.gain.exponentialRampToValueAtTime(accent ? .08 : .045,when+.004);gain.gain.exponentialRampToValueAtTime(.0001,when+.075);
    osc.connect(gain);gain.connect(destination||context.destination);osc.start(when);osc.stop(when+.09);
  }
  function finish(scene){
    if(finished)return;finished=true;
    // Samples have already crossed the browser's output timestamp or its
    // base/output-latency estimate, so what remains is the player's manual
    // residual rather than a second subtraction of device latency.
    resultMs=samples.length>=2?calibrationOffsetFromSamples(samples,0):Number(initialOffsetMs)||0;
    onDone({scene,offsetMs:resultMs,samples:[...samples],automaticLatencyMs:automaticLatencyMs()});
  }

  const scene={
    id:'tower-peal-calibration',blocksInput:true,blocksWorld:true,lookProfile:'technical',
    enter(){
      const now=Number(context?.currentTime)||0;clockAnchorAt=now;inputClock=createBellPealClock({context,timingOffsetMs:0});inputClock.start(0);
      startedAt=now+.35;targets=[];samples=[];used.clear();finished=false;
      const total=PEAL_CALIBRATION.countInBeats+PEAL_CALIBRATION.responseBeats;
      for(let index=0;index<total;index++){
        const at=startedAt+(index+1)*PEAL_CALIBRATION.beatMs/1000;
        targets.push(at);scheduleTick(at,index>=PEAL_CALIBRATION.countInBeats);
      }
    },
    update(){
      if(finished||!targets.length)return;
      if((Number(context?.currentTime)||0)>targets.at(-1)+.9)finish(scene);
    },
    key(e){
      const bare=!e.metaKey&&!e.ctrlKey&&!e.altKey;
      if(bare&&(e.code==='Escape'||e.key==='Escape'||e.controllerAction==='back')){finish(scene);return true;}
      if(!bare||e.repeat||!(e.code==='Space'||e.key===' '||e.controllerAction==='mark'))return false;
      const eventTransportMs=inputClock?.eventTransportMs?.(e.timeStamp)??((Number(context?.currentTime)||0)-clockAnchorAt)*1000;
      const now=clockAnchorAt+eventTransportMs/1000;
      let nearest=-1,distance=Infinity;
      for(let index=PEAL_CALIBRATION.countInBeats;index<targets.length;index++){
        if(used.has(index))continue;const d=Math.abs(now-targets[index]);if(d<distance){distance=d;nearest=index;}
      }
      if(nearest>=0&&distance<=.42){used.add(nearest);samples.push((now-targets[nearest])*1000);}
      return true;
    },
    render(){
      const{cols,rows}=uiSize(),now=Number(context?.currentTime)||0;
      const elapsed=Math.max(0,now-startedAt),beat=Math.floor(elapsed/(PEAL_CALIBRATION.beatMs/1000));
      const responding=beat>=PEAL_CALIBRATION.countInBeats;
      const title='BELL TIMING CALIBRATION';uiText(Math.max(2,Math.floor((cols-title.length)/2)),3,title,'ui-amber');
      const instruction=responding?'PRESS SPACE WITH EACH HIGH CALL':'LISTEN — FOUR-BEAT CALL';
      uiText(Math.max(2,Math.floor((cols-instruction.length)/2)),rows-6,instruction,'ui-primary');
      const marks=Array.from({length:PEAL_CALIBRATION.responseBeats},(_,index)=>used.has(index+PEAL_CALIBRATION.countInBeats)?'◆':'◇').join('  ');
      drawVfdText(Math.max(2,Math.floor((cols-marks.length)/2)),Math.floor(rows*.48),marks,{scale:1,role:'ui-primary'});
      const footer='ESC  KEEP CURRENT OFFSET';uiText(Math.max(2,Math.floor((cols-footer.length)/2)),rows-2,footer,'ui-secondary');
    },
    result:()=>({offsetMs:resultMs,samples:[...samples],automaticLatencyMs:automaticLatencyMs()}),
  };
  return scene;
}
