// THE PROLOGUE'S SOUND: THE ROAD FIRST, THEN THE RADIO, THEN THE ROOM.
//
// Seb, 2026-11-05: the music must not start with the first frame; there has
// to be time with only rain, thunder and driving. So the film opens in the van:
// rain on the roof, tyres on a wet road, the engine, the wipers, thunder far off.
// The Chaconne arrives later and small, as if on the cab radio (narrow band,
// mono, a little driven). When the other speaks it opens out of the radio into
// the whole recording while the van sinks under it, and the van comes back up
// as the film lets go, so it hands straight to the drive.
//
// `openingPrologueMix` is pure: the timeline is testable without a context.
// The graph only follows it.
import {createOpeningArrivalAudio} from './opening-arrival.js';
import {createThunderVoice} from './thunder.js';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(Number(v))?Number(v):0));
const smooth=t=>{const k=clamp(t);return k*k*(3-2*k);};

export const OPENING_PROLOGUE_AUDIO=Object.freeze({
  // Seconds of the film with no music at all, however fast the talk is read.
  roadOnlySeconds:16,
  // The radio comes up over this long, to this share of the scene's level, and
  // plays at least this long at that level before anything can open it.
  radioRiseSeconds:7,radioLevel:.34,radioDwellSeconds:5,
  // Once the other has spoken, the radio opens into the room over this long.
  openSeconds:9,
  // The van under the film once it has opened, and the van at full.
  cabUnder:.28,cabFull:1,cabFadeIn:3,
  // Music under the other's voice.
  speechDuck:.58,
  // The radio's band, and where the open recording's filter ends up.
  radioBand:Object.freeze({hp:320,lp:2700}),openLp:18000,
  // Thunder through the van's roof: far, then nearer, then once more later on.
  thunder:Object.freeze([
    Object.freeze({at:5.5,distance:4400,bearing:-1.1,energy:.62,seed:4417}),
    Object.freeze({at:13.5,distance:2600,bearing:.9,energy:.7,seed:1888}),
    Object.freeze({at:47,distance:3600,bearing:-.4,energy:.66,seed:1908}),
  ]),
  // Heard from inside a van: the roof takes the top off.
  roofBands:Object.freeze({low:1,mid:.82,high:.34}),
  // A steady cruise, and wipers on their slow setting.
  cruise:Object.freeze({speed:15,engineLoad:.34,throttle:.28,gear:4,wiperPeriod:1.35,wiperSweep:1.15}),
});

/**
 * The mix at `elapsed` seconds into the film.
 * - `stageMusic` is the scene's own level for where the talk has got to.
 * - `openedAt` is when the other first spoke (null until then).
 * - `speaking` is true while the other's voice is sounding.
 * - `ending` is the scene's veil, 0..1, as the film lets go.
 * Returns {musicStarted, music, radio (1 = all radio, 0 = open), cab, wipers}.
 */
export function openingPrologueMix({elapsed=0,stageMusic=0,openedAt=null,speaking=false,ending=0}={},A=OPENING_PROLOGUE_AUDIO){
  const t=Math.max(0,Number(elapsed)||0),musicStarted=t>=A.roadOnlySeconds;
  const rise=musicStarted?smooth((t-A.roadOnlySeconds)/A.radioRiseSeconds):0;
  // It can open only after the radio has had its moment, whenever it spoke:
  // read quickly, the voice arrives in a van with no music in it yet.
  const openFrom=openedAt==null?null:Math.max(Number(openedAt)||0,A.roadOnlySeconds+A.radioRiseSeconds+A.radioDwellSeconds);
  const open=openFrom==null?0:smooth((t-openFrom)/A.openSeconds);
  const level=clamp(stageMusic)*(A.radioLevel+(1-A.radioLevel)*open)*rise*(speaking?A.speechDuck:1);
  const settle=smooth(t/A.cabFadeIn),letGo=smooth(clamp(ending));
  const cab=settle*(A.cabFull+(A.cabUnder-A.cabFull)*open)*(1-letGo)+settle*A.cabFull*letGo;
  return{musicStarted,music:level,radio:1-open,cab,wipers:open<.5||letGo>.5};
}

/** Thunder strikes due between two moments of the film. */
export function openingPrologueThunderDue(from,to,A=OPENING_PROLOGUE_AUDIO){
  return A.thunder.filter(strike=>strike.at>from&&strike.at<=to);
}

/**
 * The graph. `getAudio()` returns {ctx, music, sfx}: the music bus for the
 * recording, and the effects bus for the van and the thunder. `musicPair()` is
 * what the recording's player plays into.
 */
export function createOpeningPrologueAudio({getAudio=()=>null,createCab=createOpeningArrivalAudio,createThunder=createThunderVoice}={},A=OPENING_PROLOGUE_AUDIO){
  let ctx=null,graph=null,cab=null,thunder=null,elapsed=0,openedAt=null,stageMusic=0,ending=0,last=null,disposed=false,wiperClock=0;
  function build(){
    if(graph||disposed)return graph;
    let pair;try{pair=getAudio();}catch{return null;}
    const context=pair?.ctx,music=pair?.music,sfx=pair?.sfx;
    if(!context||!music||!sfx||context.state&&context.state!=='running')return null;
    ctx=context;const nodes=[],own=node=>(nodes.push(node),node);
    const input=own(ctx.createGain()),master=own(ctx.createGain());master.gain.value=0;master.connect(music);
    // The radio: summed to mono, a narrow band, a soft clip.
    const mono=own(ctx.createGain());mono.channelCount=1;mono.channelCountMode='explicit';
    const hp=own(ctx.createBiquadFilter()),lp=own(ctx.createBiquadFilter()),shaper=own(ctx.createWaveShaper()),radioGain=own(ctx.createGain());
    hp.type='highpass';hp.frequency.value=A.radioBand.hp;hp.Q.value=.8;lp.type='lowpass';lp.frequency.value=A.radioBand.lp;lp.Q.value=.9;
    const curve=new Float32Array(512);for(let n=0;n<512;n++){const x=n/255.5-1;curve[n]=Math.tanh(x*1.8)/Math.tanh(1.8);}shaper.curve=curve;
    input.connect(mono);mono.connect(hp);hp.connect(lp);lp.connect(shaper);shaper.connect(radioGain);radioGain.connect(master);radioGain.gain.value=1;
    // The room: the whole recording, its filter opening as it arrives.
    const openLp=own(ctx.createBiquadFilter()),openGain=own(ctx.createGain());openLp.type='lowpass';openLp.frequency.value=A.radioBand.lp;openLp.Q.value=.5;
    input.connect(openLp);openLp.connect(openGain);openGain.connect(master);openGain.gain.value=0;
    const cabBus=own(ctx.createGain()),thunderBus=own(ctx.createGain());cabBus.gain.value=0;cabBus.connect(sfx);thunderBus.connect(sfx);
    graph={nodes,input,master,radioGain,openLp,openGain,cabBus,thunderBus,music,sfx};
    cab=createCab({getAudio:()=>({ctx,destination:cabBus})});
    thunder=createThunder({context:ctx,destination:thunderBus});
    for(const strike of A.thunder)try{thunder.prepare(strike);}catch{}
    return graph;
  }
  const ramp=(param,value,seconds=.25)=>{try{param.cancelScheduledValues(ctx.currentTime);param.setTargetAtTime(value,ctx.currentTime,seconds);}catch{}};
  function update({dt=0,stageMusic:level=stageMusic,spoken=false,speaking=false,veil=0,paused=false}={}){
    if(disposed)return last;
    if(!build())return last;
    if(paused){ramp(graph.master.gain,0,.15);ramp(graph.cabBus.gain,0,.15);cab?.update?.({paused:true});return last;}
    const step=Math.max(0,Math.min(.25,Number(dt)||0)),before=elapsed;elapsed+=step;stageMusic=clamp(level);ending=clamp(veil);
    if(spoken&&openedAt==null)openedAt=elapsed;
    const mix=openingPrologueMix({elapsed,stageMusic,openedAt,speaking,ending},A);
    ramp(graph.master.gain,mix.music,.3);
    ramp(graph.radioGain.gain,mix.radio,.4);ramp(graph.openGain.gain,1-mix.radio,.4);
    ramp(graph.openLp.frequency,A.radioBand.lp+(A.openLp-A.radioBand.lp)*Math.pow(1-mix.radio,2),.5);
    ramp(graph.cabBus.gain,mix.cab,.5);
    wiperClock+=mix.wipers?step:0;
    const C=A.cruise,angle=Math.sin(wiperClock*2*Math.PI/C.wiperPeriod)*C.wiperSweep;
    const drive={speed:C.speed,engineLoad:C.engineLoad,throttle:C.throttle,gear:C.gear,engineOn:true,surface:'road',elapsed,
      wiperMoving:mix.wipers,wiperAngles:[angle,angle]};
    cab?.update?.({dt:step,state:{phase:'driving',drive,rain:1,doorOpen:0},weather:{rain:1,roadWetness:.9,wiperMoving:mix.wipers,wiperAngles:[angle,angle]},ready:true});
    for(const strike of openingPrologueThunderDue(before,elapsed,A))try{thunder?.strike({...strike,bands:A.roofBands});}catch{}
    last={...mix,elapsed,openedAt};return last;
  }
  function dispose(){
    if(disposed)return;disposed=true;
    if(graph&&ctx){
      // Let go over a moment, so the drive that follows does not start on a cut.
      ramp(graph.master.gain,0,.25);ramp(graph.cabBus.gain,0,.35);
      const g=graph;setTimeout(()=>{cab?.dispose?.();thunder?.stop?.();for(const node of g.nodes)try{node.disconnect();}catch{}},1600);
    }else{cab?.dispose?.();thunder?.stop?.();}
  }
  return{
    musicPair:()=>build()?{ctx,destination:graph.input}:null,
    update,dispose,
    snapshot:()=>({elapsed,openedAt,stageMusic,ending,built:!!graph,disposed,mix:last?{...last}:null,cab:cab?.snapshot?.()||null}),
  };
}
