// THE INTERRUPTION DIRECTOR. docs/plans/last-minutes.md, stage 5.
//
// Attached to verbs, not plot: every door, every take armed, the torch, the bag. There
// are far more of those than there are places in the story, so the only question is
// how often. De-inhibition answers that: what used to be filtered out gets through.
//
// Two things come out of here. Neither ever touches a saved value, the tape or a take.
//
//   a seep      under a second of somewhere else, printed over the room. Road carnage
//               early, and later the field, because the end-of-life dream literature
//               says fear gives way to comfort and that a minority stay distressing.
//   a dead door it doesn't answer. It answers once he stops trying. Same rule as the
//               field: waiting always gets you out, with a hard limit either way.

export const INTERRUPTION=Object.freeze({
  verbs:Object.freeze({door:1,'take-arm':.55,torch:.35,bag:.35,inspect:.3}),
  gap:Object.freeze({from:170,to:30}),
  hourly:Object.freeze({from:3,to:26}),
  seconds:Object.freeze({from:.085,to:.42}),
  carnageFloor:.18,
  dead:Object.freeze({from:.1,gapFrom:150,gapTo:45,chanceFrom:.03,chanceTo:.26,quiet:1.8,presses:4,seconds:9}),
  // Stay out of the opening. It is compared state for state against the crash loop.
  earliest:.02,
  // So it runs through the whole night and doesn't bunch at the end: every stretch of
  // the arc is owed one flash, whatever the dice said. Band 0 is the first door after
  // the get-in door, so it starts at the beginning. The caller keeps it out of the
  // opening and out of Source.
  band:.07,owedGap:40,
  takeover:Object.freeze({from:.1,gapFrom:900,gapTo:360,chanceFrom:.05,chanceTo:.2,most:5}),
  deadVerb:Object.freeze({from:.08,gapFrom:260,gapTo:70,chanceFrom:.04,chanceTo:.24,quiet:.85,presses:2}),
  bleed:Object.freeze({gapFrom:320,gapTo:75}),
});
const C=INTERRUPTION;
export const SEEP_CARNAGE=Object.freeze(['wheel','hubcap','bent-metal','glass','tail-lamps']);
export const SEEP_PASTORAL=Object.freeze(['daisies','sun','lids','sky']);
// The window that becomes the game. Field first, and last of all an empty one.
export const TAKEOVER_MEDIA=Object.freeze(['flowers-seb','clouds','pollination','sunflower-datamosh','empty-field']);
export const TAKEOVER_HAYSTACK=Object.freeze(['paper-close']);
// VERB-LATCHED TAKEOVERS. The dream lets through what the verb is reaching for.
//   take-arm  he arms the recorder — the nervous system made external — and the
//             dream answers with the body/brain failing: cells dying, parasites,
//             decay. "The tape is what I can no longer hold."
//   torch     he reaches for the last light he owns, and the dream answers with
//             the light at the end: the nebula, the jellyfish, the dispersing flock.
export const TAKEOVER_CLINICAL=Object.freeze(['apoptosis-organelles','mitotic-catastrophe','microfilariae','schistosoma-eggs','boar-corpse-decomposition']);
export const TAKEOVER_COMFORT=Object.freeze(['orion-nebula-flythrough','sea-nettle-jellyfish','starling-murmuration']);
// What can be heard from where he is, wherever he is. Hearing may outlast the rest.
// The ordinary sounds of a van come first. Water and a hand on the glass come later.
export const CAB_BLEED=Object.freeze([
  Object.freeze({kind:'indicator',from:.04}),Object.freeze({kind:'wipers',from:.1}),Object.freeze({kind:'radio',from:.22}),
  Object.freeze({kind:'water',from:.36}),Object.freeze({kind:'knock',from:.5}),
]);
export const DEAD_DOOR_LINES=Object.freeze(['Come on.','It isn\'t locked.','Hm.','The handle\'s fine.','Stop. Try again.']);
const clamp01=v=>Math.max(0,Math.min(1,Number(v)||0));
const mix=(a,b,t)=>a+(b-a)*t;
function hash(seed,salt){let h=0x811c9dc5;for(const ch of `${seed}:${salt}`){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}return(h>>>0)/4294967296;}

export function createInterruptionDirector({seed=0}={}){
  let count=0,lastAt=-Infinity,lastId=null,tried=0,lastDeadAt=-Infinity,deadCount=0,takeovers=0,lastTakeoverAt=-Infinity,lastVerbAt=-Infinity,bleeds=0,nextBleedAt=null;
  const served=new Set();
  const recent=[];
  // `frame` is lastMinutesFrame. `blocked` is the caller's whole list of reasons: a
  // take rolling, a fight, a menu, Effects off.
  function seepFor(verb,{at=0,frame=null,regionLoss=0,blocked=false,reducedDread=false,reducedFlash=false}={}){
    if(blocked||!frame)return null;
    const weight=C.verbs[verb];if(!weight)return null;
    const d=clamp01(frame.deinhibition),loss=clamp01(regionLoss),band=Math.floor(clamp01(frame.arc)/C.band);
    if(!served.has(band)&&verb!=='take-arm'){
      if(at-lastAt<C.owedGap)return null;
    }else{
      if(frame.arc<C.earliest||at-lastAt<mix(C.gap.from,C.gap.to,d))return null;
      while(recent.length&&at-recent[0]>3600)recent.shift();
      if(recent.length>=mix(C.hourly.from,C.hourly.to,d))return null;
      tried+=1;
      if(hash(seed,`roll${tried}`)>weight*(.02+.52*d)*(1+loss))return null;
    }
    served.add(band);
    const share=Math.max(C.carnageFloor,1-1.1*clamp01(frame.arc));
    const carnage=!reducedDread&&hash(seed,`set${count}`)<share,pool=carnage?SEEP_CARNAGE:SEEP_PASTORAL;
    let id=pool[Math.floor(hash(seed,`id${count}`)*pool.length)%pool.length];
    if(id===lastId)id=pool[(pool.indexOf(id)+1)%pool.length];
    count+=1;lastAt=at;lastId=id;recent.push(at);
    return{id,set:carnage?'carnage':'pastoral',seconds:mix(C.seconds.from,C.seconds.to,d),gain:reducedFlash&&!carnage?.55:1};
  }
  function deadDoorFor({at=0,frame=null,regionLoss=0,blocked=false}={}){
    if(blocked||!frame)return false;
    const d=clamp01(frame.deinhibition);
    if(d<C.dead.from||at-lastDeadAt<mix(C.dead.gapFrom,C.dead.gapTo,d))return false;
    tried+=1;
    if(hash(seed,`dead${tried}`)>mix(C.dead.chanceFrom,C.dead.chanceTo,d)*(1+clamp01(regionLoss)))return false;
    lastDeadAt=at;deadCount+=1;return true;
  }
  // Rare and large. Fewer of these in a whole run than there are takes. The
  // pool is the verb's answer: arming the recorder lets the body fail through,
  // reaching for the light lets the light at the end through; anything else
  // stays on the ordinary field-to-empty arc.
  function takeoverFor({at=0,frame=null,regionLoss=0,blocked=false,verb='',haystack=false}={}){
    if(blocked||!frame||takeovers>=C.takeover.most)return null;
    const d=clamp01(frame.deinhibition);
    if(d<C.takeover.from||at-lastTakeoverAt<mix(C.takeover.gapFrom,C.takeover.gapTo,d))return null;
    tried+=1;
    if(hash(seed,`take${tried}`)>mix(C.takeover.chanceFrom,C.takeover.chanceTo,d)*(1+clamp01(regionLoss)))return null;
    lastTakeoverAt=at;
    const pool=haystack?TAKEOVER_HAYSTACK:verb==='take-arm'?TAKEOVER_CLINICAL:verb==='torch'?TAKEOVER_COMFORT:TAKEOVER_MEDIA;
    return pool[takeovers++%pool.length];
  }
  function deadVerbFor({at=0,frame=null,blocked=false}={}){
    if(blocked||!frame)return false;
    const d=clamp01(frame.deinhibition);
    if(d<C.deadVerb.from||at-lastVerbAt<mix(C.deadVerb.gapFrom,C.deadVerb.gapTo,d))return false;
    tried+=1;
    if(hash(seed,`verb${tried}`)>mix(C.deadVerb.chanceFrom,C.deadVerb.chanceTo,d))return false;
    lastVerbAt=at;return true;
  }
  function bleedFor({at=0,frame=null,blocked=false}={}){
    if(!frame)return null;
    const arc=clamp01(frame.arc),open=CAB_BLEED.filter(row=>arc>=row.from);
    if(!open.length)return null;
    if(nextBleedAt==null){nextBleedAt=at+mix(C.bleed.gapFrom,C.bleed.gapTo,clamp01(frame.deinhibition))*(.5+hash(seed,'first-bleed'));return null;}
    if(at<nextBleedAt||blocked)return null;
    const pick=open[open.length-1-Math.floor(hash(seed,`bleed${bleeds}`)*Math.min(3,open.length))];
    bleeds+=1;nextBleedAt=at+mix(C.bleed.gapFrom,C.bleed.gapTo,clamp01(frame.deinhibition))*(.7+.6*hash(seed,`gap${bleeds}`));
    return{kind:pick.kind,level:mix(.5,1,arc)};
  }
  return{seepFor,deadDoorFor,takeoverFor,deadVerbFor,bleedFor,snapshot:()=>({count,lastAt,lastId,tried,lastDeadAt,deadCount,takeovers,lastTakeoverAt,lastVerbAt,bleeds,nextBleedAt,recent:recent.length,bands:served.size})};
}

// One door that won't. It lets go if he stops pressing for a moment, however often he
// has tried. Pure, so the promise can be held to in a spec.
export function freshDeadDoor(id,at=0){return{id,since:at,lastPress:at,presses:1,said:0};}
export function pressDeadDoor(door,at=0){
  const next={...door};
  const gave=at-door.lastPress>=C.dead.quiet||door.presses+1>C.dead.presses||at-door.since>=C.dead.seconds;
  next.presses+=1;next.lastPress=at;
  return{door:next,gave};
}
