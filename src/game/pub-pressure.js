// One witnessed disturbance in the ordinary Lyric. The host owns world time,
// save flags, camera visibility and sound. This controller owns none of them.
export const PUB_PRESSURE_CUE_ID='lyric-pipe-pressure:note';
export const PUB_PRESSURE_TIMING=Object.freeze({settleSeconds:1.1,tremorSeconds:.48,noteAt:.76,duration:2.2,maxStep:.25});
const START_ID='lyric-pipe-pressure:started',END_ID='lyric-pipe-pressure:ended',EPS=1e-9;
const seconds=dt=>Number.isFinite(dt)?Math.max(0,Math.min(PUB_PRESSURE_TIMING.maxStep,dt)):0;

/**
 * update({dt,inPub,worldActive,watersServed,glassSettled,still,attended=true,
 *   quiet=true,paused=false,busy=false,focused=true,consumed=false})
 * returns a presentation frame plus one-shot events. view() never replays them.
 * Persist `consumed` on the started event, before any note can be emitted.
 * A new controller seeded with that latch cannot replay an interrupted attempt.
 */
export function createPubPressure({consumed:initialConsumed=false}={}){
  let consumed=initialConsumed===true,active=false,elapsed=0,settledFor=0,noteSent=false,suspended=false,endedBy=null;
  function view(){
    const phase=active?(elapsed<PUB_PRESSURE_TIMING.tremorSeconds-EPS?'tremor':noteSent?'listening':'waiting-note')
      :consumed?'complete':settledFor>0?'settling':'idle';
    const u=elapsed/PUB_PRESSURE_TIMING.tremorSeconds;
    // C1 at both ends; the renderer supplies a restrained material-space
    // tremor, using this exact elapsed time rather than a second clock.
    const amount=active&&elapsed>EPS&&elapsed<PUB_PRESSURE_TIMING.tremorSeconds-EPS?Math.sin(Math.PI*u)**2:0;
    return{phase,active,consumed,elapsed,settledFor,amount,suspended,endedBy,cueId:PUB_PRESSURE_CUE_ID};
  }
  const result=events=>({...view(),events});
  function finish(reason,events){
    if(active)events.push({type:reason==='finished'?'complete':'cancelled',id:END_ID,reason,elapsed});
    active=false;elapsed=0;settledFor=0;suspended=false;endedBy=reason;
  }
  function advance(dt,events){
    const before=elapsed;elapsed=Math.min(PUB_PRESSURE_TIMING.duration,elapsed+dt);
    if(!noteSent&&before<PUB_PRESSURE_TIMING.noteAt&&elapsed>=PUB_PRESSURE_TIMING.noteAt-EPS){
      noteSent=true;events.push({type:'note',id:PUB_PRESSURE_CUE_ID,elapsed:PUB_PRESSURE_TIMING.noteAt});
    }
    if(elapsed>=PUB_PRESSURE_TIMING.duration-EPS)finish('finished',events);
  }
  function update(input={}){
    const events=[];
    // Main will echo the newly saved latch on the next tick. That echo must
    // not cancel the same live attempt which produced it.
    if(input.consumed===true&&!consumed){consumed=true;settledFor=0;endedBy='already-consumed';}
    if(input.inPub!==true){
      if(active)finish('left-pub',events);else{settledFor=0;suspended=false;}
      return result(events);
    }
    // These genuinely pause world time. Keep the visible glass pose frozen.
    suspended=input.paused===true||input.focused===false;
    if(suspended)return result(events);
    const interruption=input.busy===true?'busy':input.worldActive!==true?'world-inactive':input.quiet===false?'not-quiet':null;
    if(interruption){
      if(active)finish(interruption,events);else settledFor=0;
      return result(events);
    }
    const dt=seconds(input.dt);if(dt===0)return result(events);
    if(active){advance(dt,events);return result(events);}
    if(consumed)return result(events);
    const eligible=input.watersServed===true&&input.glassSettled===true&&input.still===true&&input.attended!==false;
    if(!eligible){settledFor=0;return result(events);}
    const needed=Math.max(0,PUB_PRESSURE_TIMING.settleSeconds-settledFor);
    settledFor=Math.min(PUB_PRESSURE_TIMING.settleSeconds,settledFor+dt);
    if(settledFor>=PUB_PRESSURE_TIMING.settleSeconds-EPS){
      consumed=true;active=true;elapsed=0;noteSent=false;endedBy=null;
      events.push({type:'started',id:START_ID,elapsed:0});
      // Retain the eligible fraction after the threshold; frame partitioning
      // cannot move the authored note later or create an extra silent frame.
      advance(Math.max(0,dt-needed),events);
    }
    return result(events);
  }
  function reset({consumed:nextConsumed=false}={}){
    consumed=nextConsumed===true;active=false;elapsed=0;settledFor=0;noteSent=false;suspended=false;endedBy=null;
    return view();
  }
  return{update,view,reset};
}
