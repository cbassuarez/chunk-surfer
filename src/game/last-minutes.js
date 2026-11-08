// THE LAST MINUTES. docs/plans/last-minutes.md, section 1a and stage 4.
//
// Two curves, from the first second, and they cross: his faculties fall and
// meaning rises. Nothing here is ever drawn as a quantity. game/hypoxia.js rules
// that a single level would make the state legible, and legibility is the one
// thing he doesn't have, so what comes out is several values that move at different
// rates and don't agree:
//
//   exposureFloor  what fresh air can no longer bring him back past. Under the
//                  plant room's bad air there is another source, and nothing says
//                  what it is. Fed to stepHypoxia, which does the rest.
//   deinhibition   how much of what used to be filtered out gets through. This is
//                  what a seep is, and why they come more often.
//   meaning        the cascade. Runs ahead of the faculties, because the loss of
//                  self-criticism comes first.
//   surge          late, brief, and it looks like recovery: sharper and brighter
//                  than he has been all night. Colour comes back. Meaning spikes.
//   front          failure as a wave across the map, not noise. Everything behind
//                  it stays wrong, because the arc never goes back.
//
// Every reading stays open. This is one mechanism among several, and the game never
// says "it was only a bag" and never says it wasn't.

export const LAST_MINUTES=Object.freeze({
  // 21:38 to the strike at 06:01.
  nightSeconds:30180,
  perTake:.1,sourceEntered:.5,sourceExited:.88,finale:.95,
  floorPeak:.92,
  surgeFrom:.55,surgeMaxPeriod:260,surgeMinPeriod:140,
  // Metres. It starts small, somewhere, and reaches everywhere.
  frontRadius:300,frontBand:22,frontStart:.1,
});
const C=LAST_MINUTES;
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
const smooth=(a,b,v)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
function hash(seed,salt){
  let h=0x811c9dc5;
  for(const ch of `${seed}:${salt}`){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}
  return(h>>>0)/4294967296;
}

// What the night has reached, from what is already true of it. Whichever is furthest
// along: a slow player's clock, a fast player's takes, or Source.
export function lastMinutesArcTarget({nightSeconds=0,takes=0,inSource=false,sourceExited=false,finale=false}={}){
  const night=clamp01((Number(nightSeconds)||0)/C.nightSeconds),count=Math.max(0,Number(takes)||0);
  return clamp01(Math.max(.85*Math.pow(night,1.35),count*C.perTake,inSource?C.sourceEntered:0,sourceExited?C.sourceExited:0,finale?C.finale:0));
}
// It never goes back. A retake that un-counts a room gives nothing back to him.
export const stepLastMinutesArc=(previous,target)=>Math.max(clamp01(previous),clamp01(target));

// Brief windows, on a clock that isn't the arc's, so they can't be predicted from
// it. Fast to arrive and slow to leave.
export function lastMinutesSurge(arc,played,seed=0){
  const a=clamp01(arc);if(a<C.surgeFrom)return 0;
  const reach=(a-C.surgeFrom)/(1-C.surgeFrom),period=mix(C.surgeMaxPeriod,C.surgeMinPeriod,reach);
  const clock=Math.max(0,Number(played)||0)/period,beat=Math.floor(clock),phase=clock-beat;
  const width=(20+18*hash(seed,`w${beat}`))/period,at=.12+(.8-width)*hash(seed,`a${beat}`),u=(phase-at)/width;
  if(u<0||u>1)return 0;
  return Math.min(1,u/.12)*(1-smooth(.12,1,u))*mix(.55,1,reach);
}

export function lastMinutesFrame({arc=0,played=0,seed=0,sourceLocal=0,moshHold=0}={}){
  const a=clamp01(arc),local=clamp01(sourceLocal),mosh=clamp01(moshHold);
  // Mosh and surge are opposite motions and must not overlap: a fear spike wins
  // for its sub-second, then the recovery returns. Sequencing here keeps one body.
  const surge=lastMinutesSurge(a,played,seed)*(1-mosh);
  // The Source haystack is the local expression of the same nervous system: its
  // pressure feeds deinhibition rather than running beside it, so the search's
  // 0.64..0.985 pressure actually opens the seeps and takeovers.
  return Object.freeze({
    arc:a,surge,
    exposureFloor:C.floorPeak*Math.pow(smooth(.04,1,a),1.5),
    deinhibition:Math.max(smooth(.02,.92,a),local),
    meaning:clamp01(Math.pow(smooth(0,.85,a),.8)+surge*.25),
    sourceLocal:local,moshHold:mosh,
  });
}
export function lastMinutesExposureFloor(frame,tolerance=1){
  return clamp01((Number(frame?.exposureFloor)||0)/Math.sqrt(Math.max(.35,Number(tolerance)||1)));
}

// THE FRONT. `point` is physical metres. It starts near a seeded spot, and how far
// it has spread is only ever a function of the arc, so a place gone wrong stays wrong.
export function lastMinutesFrontOrigin(seed=0,{centre=[0,0],spread=90}={}){
  const angle=hash(seed,'front-a')*Math.PI*2,r=spread*Math.sqrt(hash(seed,'front-r'));
  return[centre[0]+Math.cos(angle)*r,centre[1]+Math.sin(angle)*r];
}
export function lastMinutesFrontLoss(arc,point,origin=[0,0]){
  const a=clamp01(arc);if(a<=C.frontStart||!point)return 0;
  const reach=Math.pow((a-C.frontStart)/(1-C.frontStart),1.6)*C.frontRadius,
    d=Math.hypot((Number(point.x)||0)-origin[0],(Number(point.z)||0)-origin[1],(Number(point.y)||0)*3);
  return 1-smooth(reach-C.frontBand,reach,d);
}

const IDENTITY=Object.freeze({chroma:1,contrast:1,narrowing:0,lift:0,moonSize:1,moonBlood:0});
export const LAST_MINUTES_IDENTITY=IDENTITY;
// What the screen is told, from what hypoxia.js already worked out for him. The
// simulation doesn't change, the perception of it does. Reduced dread opts out
// entirely, as hypoxiaPerception does.
export function lastMinutesPerception(base,frame,{regionLoss=0,reducedDread=false}={}){
  if(reducedDread||!base||!frame)return IDENTITY;
  const loss=clamp01(regionLoss),surge=clamp01(frame.surge),meaning=clamp01(frame.meaning);
  // Measured against the look of the game: it has to remain itself. Where the front
  // has been, colour goes; everywhere it goes slowly, and it never all goes.
  const chroma=Math.max(.3,mix(1,clamp01(base.chroma),.62)*(1-.42*loss)),contrast=Math.max(.74,mix(1,clamp01(base.coverage),.5)*(1-.08*loss));
  return Object.freeze({
    chroma:mix(chroma,1.35,surge),
    contrast:mix(contrast,1.06,surge),
    narrowing:clamp01(base.narrowing)*(1-surge),
    lift:surge,
    // The same moon, more of it, and redder. It always was.
    moonSize:1+3.6*Math.pow(meaning,1.7)+.6*surge,
    moonBlood:smooth(.34,.92,meaning),
  });
}

// He only has the one body. Each is a chance per use of the verb, never a certainty,
// and it can't be asked for while a take is rolling.
export function lastMinutesWorldFaculty(frame,{regionLoss=0}={}){
  const d=clamp01(frame?.deinhibition),loss=clamp01(regionLoss);
  return clamp01(d*.55+loss*.12);
}

// The moon's direction, as nightSky() in r3d.js works it out, so words can answer
// where he is looking.
export function moonDirection(nightSeed=0){
  const fract=v=>v-Math.floor(v),az=Math.PI+(fract(nightSeed*2.71)-.5)*2.1,alt=.26+.13*fract(nightSeed*7.13);
  const x=Math.cos(az)*(1-alt),y=alt,z=Math.sin(az)*(1-alt),length=Math.hypot(x,y,z)||1;
  return[x/length,y/length,z/length];
}
