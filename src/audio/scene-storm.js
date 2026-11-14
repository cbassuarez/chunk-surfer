// One explicit episode owns these events and this pressure-wave transport.
// No private clock, RAF, context, listener or gameplay noise emission.
import {freshStorm,stepStorm,stormFlash,stormBearing,forceStrike} from '../game/storm.js';
import {createThunderVoice} from './thunder.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
export const SCENE_STORM_PROFILES=Object.freeze({
  court:Object.freeze({intensity:.88,first:2.8,spacing:[7,19],distance:[520,4900],bearing:-.7}),
  arrival:Object.freeze({intensity:.86,first:2.8,spacing:[8,18],distance:[650,5200],bearing:-.7}),
  drive:Object.freeze({intensity:.9,first:3.2,spacing:[7.5,18],distance:[600,5600],bearing:-1.05}),
  prologue:Object.freeze({intensity:.8,first:3.4,spacing:[10,23],distance:[1000,5900],bearing:-1.05}),
});
const profileFor=value=>SCENE_STORM_PROFILES[value]||SCENE_STORM_PROFILES.court;
const random=seed=>{let n=(seed>>>0)^0x9e3779b9;n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return((n^(n>>>15))>>>0)/4294967296;};

export function createSceneStorm({getAudio=()=>null,seed=1947,profile='court',checkpoint=null,
  createVoice=createThunderVoice,onThunder=()=>{},onFlash=()=>{}}={}){
  const saved=checkpoint?.schema===1&&checkpoint.state&&Number.isFinite(checkpoint.state.time)
    &&Number.isFinite(checkpoint.state.nextAt)&&Number.isFinite(checkpoint.state.rng)
    &&Array.isArray(checkpoint.state.strikes)&&Array.isArray(checkpoint.state.pending)?checkpoint.state:null;
  let name=saved&&SCENE_STORM_PROFILES[checkpoint.profile]?checkpoint.profile:profile,
    state=saved?structuredClone(saved):freshStorm({seed,intensity:profileFor(name).intensity}),
    pair=null,voice=null,disposed=false,held=true,last=null;
  const history=[];
  if(!saved)state.nextAt=profileFor(name).first;
  function acquire(){
    let next;try{next=getAudio();}catch{return;}
    const ctx=next?.ctx||next?.context,destination=next?.destination||next?.output;
    if(!ctx||!destination)return;
    if(pair?.ctx===ctx&&pair.destination===destination)return;
    voice?.stop?.();pair={ctx,destination};voice=createVoice({context:ctx,destination});voice.setPaused?.(held);
    for(const strike of state.pending)voice.prepare?.(strike);
  }
  function view(){return last||{flash:0,bearing:0,time:state.time,profile:name,held,disposed,flashes:[],thunder:[]};}
  function update({dt=0,paused=false,ready=true,protectedAudio=false,active=true,profile:nextProfile=name,
    roofBands=null,flashMode='full',listenerYaw=0}={}){
    if(disposed)return view();name=nextProfile;const spec=profileFor(name);
    let protectedNow;try{protectedNow=typeof protectedAudio==='function'?!!protectedAudio():!!protectedAudio;}catch{protectedNow=true;}
    const nextHeld=paused||!ready||protectedNow;held=nextHeld;acquire();held=nextHeld||!voice;voice?.setPaused?.(held);
    if(held){const raw=stormFlash(state);last={...view(),flash:flashMode==='off'?0:raw*(flashMode==='reduced'?.20:1),held:true,flashes:[],thunder:[]};return last;}
    state.intensity=spec.intensity;
    const events=stepStorm(state,clamp(dt,0,.25),{active});
    // A slow front gives related bearings across a journey. This is an authored
    // distribution over the existing synthesized channel, not measured weather.
    for(const flash of events.flashes){
      const strike=state.pending.find(s=>s.seed===flash.seed);if(!strike)continue;
      const r=random(strike.seed),front=.14*Math.sin(state.time/95),near=spec.distance[0],far=spec.distance[1];
      strike.distance=near+(far-near)*clamp(Math.pow(r,.72)+front);
      strike.bearing=spec.bearing+state.time*.0018+(random(strike.seed+7)-.5)*1.25;
      const priorEnergy=strike.energy;strike.energy=clamp(.36+.62*(1-(strike.distance-near)/(far-near)),.34,.98);
      for(const stroke of strike.strokes)stroke.gain=clamp(stroke.gain*strike.energy/Math.max(.05,priorEnergy));
      strike.thunderAt=strike.startedAt+strike.distance/343;
      state.lastDistance=strike.distance;
      Object.assign(flash,{distance:strike.distance,bearing:strike.bearing,energy:strike.energy});
      state.nextAt=state.time+spec.spacing[0]+(spec.spacing[1]-spec.spacing[0])*random(strike.seed+19);
      voice?.prepare?.(flash);onFlash({...flash});
      history.push({type:'flash',at:state.time,...flash});
    }
    for(const thunder of events.thunder){
      voice?.strike?.({...thunder,worldBearing:thunder.bearing,bearing:thunder.bearing-(Number(listenerYaw)||0),bands:roofBands});
      onThunder({...thunder});history.push({type:'thunder',at:state.time,...thunder});
    }
    while(history.length>64)history.shift();
    const raw=stormFlash(state),flash=flashMode==='off'?0:raw*(flashMode==='reduced'?.20:1);
    last={flash,bearing:stormBearing(state),time:state.time,profile:name,held:false,disposed:false,flashes:events.flashes,thunder:events.thunder};return last;
  }
  return{update,frame:view,
    setPaused(value){held=!!value;voice?.setPaused?.(held);if(last)last={...last,held};},
    checkpoint:()=>({schema:1,profile:name,state:structuredClone(state)}),
    force({distance=1200}={}){
      if(disposed)return null;const strike=forceStrike(state,{distance});if(!strike)return null;
      acquire();voice?.prepare?.(strike);const event={seed:strike.seed,distance:strike.distance,bearing:strike.bearing,energy:strike.energy};
      history.push({type:'flash',at:state.time,forced:true,...event});while(history.length>64)history.shift();onFlash({...event,forced:true});return strike;
    },
    snapshot:()=>({...view(),pending:state.pending.map(s=>({seed:s.seed,distance:s.distance,bearing:s.bearing,thunderAt:s.thunderAt})),voice:voice?.snapshot?.()||null,history:history.map(s=>({...s})),provenance:'Seeded synthesized lightning-channel thunder; authored storm front and shelter bands, not measured recordings.'}),
    dispose(){if(disposed)return;disposed=true;voice?.stop?.();voice=null;state.strikes=[];state.pending=[];last={...view(),flash:0,bearing:0,disposed:true,flashes:[],thunder:[]};},
  };
}
