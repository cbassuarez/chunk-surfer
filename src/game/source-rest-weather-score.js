import {freshBootWeatherState,stepBootWeather} from './boot-weather.js';
import {windAt} from '../world/wind.js';
import {sourceRestJudgmentFrame} from './source-rest-judgment.js';
import {sourceRestFloodFrame,SOURCE_REST_STORM} from './source-rest-flood.js';
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0)),smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
// Sunset remains the place. One late, bounded storm is an event laid over it,
// measured in actual audible seconds so a held choice cannot strand the flood.
export function sourceRestWeatherCue({active=true,seated=false,progress=0,nodeId='',audibleSeconds=0,musicTime=audibleSeconds,reducedMotion=false,
  sinceEntry=0,sinceSit=0,sinceInterruption=null,stormAge=null}={}){
  const p=clamp(progress),clock=Math.max(0,Number(audibleSeconds)||0),fade=1-smooth(.88,.95,p),
    age=stormAge===null?(seated?(p-SOURCE_REST_STORM.triggerProgress)*530:-1):stormAge,
    flood=sourceRestFloodFrame({active,progress:p,clock:musicTime,stormAge:age,reducedMotion}),
    judgment=sourceRestJudgmentFrame({clock:musicTime,active,progress:p,stormAge:age,reducedMotion}),
    storm=age>=0&&age<SOURCE_REST_STORM.duration,
    onset=storm?smooth(0,5,age):0,settle=1-smooth(39,54,age),strength=storm?onset*settle:0,
    sunset={active:!!active,amount:active?fade:0,progress:p,storm:strength,bearing:-Math.PI/2-.40,altitude:.065-.13*smooth(.10,.92,p)};
  const empty={stage:'absent',rain:0,clouds:0,moon:0,horizon:0,wind:0,windStrength:0,drips:0,wetness:0,ripples:0,audioGain:0,
    rainGain:0,sheetsGain:0,leavesGain:0,sheets:0,leaves:0,reverse:false,clock,kind:'none',audioKind:null,
    audio:{rain:0,sheets:0,leaves:0},reducedMotion,judgment,flood,sunset,stormAge:age};
  if(!active||p>=.95)return empty;
  const submersion=clamp(flood.submersion),rain=strength*.94*fade,drips=strength*.76*(1-submersion)*fade,
    wetness=(strength+(age>=54?.18:0))*fade,windStrength=(.09+strength*.71)*(1-submersion*.85)*fade,
    wind=windAt(clock,{depth:windStrength}),rainGain=rain*.78*(1-submersion*.92),
    stage=!storm?'last-sunset':age<8?'storm-over-sunset':submersion>.85?'submerged-memory':age<32?'rising-water':'returning-sunset';
  return{...empty,stage,rain,clouds:(.20+strength*.75)*fade,moon:0,horizon:.92*fade,
    flash:judgment.flash,wind,windStrength,drips,wetness,ripples:rain*(1-submersion),rainGain,
    audioGain:rainGain,kind:rain>.02?'rain':'none',audioKind:rain>.02?'rain':null,audio:{rain:rainGain,sheets:0,leaves:0}};
}

export function createSourceRestWeatherScore({seed=7193}={}){
  let fields=null,entryAt=null,sitAt=null,interruptionAt=null,lastClock=null,lastReduced=false,stormAt=null;
  function resetFields(reducedMotion){fields=Object.fromEntries(['rain'].map((kind,n)=>[kind,freshBootWeatherState(kind,{seed:seed+n*107,reducedMotion})]));lastReduced=reducedMotion;}
  function update(input={}){
    const clock=Math.max(0,Number(input.audibleSeconds??input.musicTime)||0),active=input.active!==false,reducedMotion=!!input.reducedMotion;
    if(!fields||lastReduced!==reducedMotion)resetFields(reducedMotion);
    if(!active){entryAt=sitAt=interruptionAt=lastClock=null;for(const field of Object.values(fields))field.particles=[];return{...sourceRestWeatherCue({...input,active:false,audibleSeconds:clock}),particles:[]};}
    if(entryAt===null)entryAt=clock;if(input.seated&&sitAt===null)sitAt=clock;
    if(input.nodeId==='interruption'&&interruptionAt===null)interruptionAt=clock;
    if(input.seated&&Number(input.progress)>=SOURCE_REST_STORM.triggerProgress&&stormAt===null)stormAt=clock;
    const cue=sourceRestWeatherCue({...input,audibleSeconds:clock,stormAge:input.stormAge??(stormAt===null?-1:Math.max(0,clock-stormAt)),sinceEntry:input.sinceEntry??Math.max(0,clock-entryAt),
      sinceSit:input.sinceSit??(sitAt===null?0:Math.max(0,clock-sitAt)),
      sinceInterruption:input.sinceInterruption??(interruptionAt===null?null:Math.max(0,clock-interruptionAt))});
    const delta=lastClock===null?0:Math.max(0,Math.min(.25,clock-lastClock));lastClock=clock;
    for(const[kind,field]of Object.entries(fields)){
      // Standard particle gusts share the actual audible time coordinate with
      // sky/audio. Their kind-specific response depth remains the game's own.
      const target=Math.round(120*(kind==='rain'?cue.rain:cue[kind])*(reducedMotion?.35:1));
      if(delta>0){
        field.time=Math.max(0,clock-delta);
        if(kind==='rain')for(const particle of field.particles)particle.vy=Math.abs(particle.vy)*(cue.reverse?-1:1);
        let rest=delta;do{const dt=Math.min(.1,rest);stepBootWeather(field,dt,{targetCount:target,stormActive:false});rest-=dt;}while(rest>1e-8);
        if(kind==='rain')for(const particle of field.particles)particle.vy=Math.abs(particle.vy)*(cue.reverse?-1:1);
      }
      field.thunder.length=0;field.flashes.length=0;
    }
    const particles=[];
    if(cue.stage!=='absent')for(const[kind,field]of Object.entries(fields))for(const particle of field.particles){
      const presence=kind==='rain'?cue.rain:cue[kind];
      // A falling population drains naturally during cue changes; do not
      // delete it merely because its replacement target has reached zero.
      const visibility=kind==='rain'?Math.max(presence,cue.drips*.20):presence>.01?presence:.20;
      if(visibility>.005)particles.push({...particle,kind,visibility,wind:field.wind,reverse:kind==='rain'&&cue.reverse});
    }
    return{...cue,particles};
  }
  return Object.freeze({update});
}
