// The reception gradually empties on real returns. Held Note remains a separate ceiling body,
// using the original harmless lure/reveal before one fixed, avoidable sweep.
export const ACADEMIC_ADVERSARY_TIMING=Object.freeze({
  maxTick:.1,lureCadence:8.6,reveal:1.4,demonstration:4.3,
  warning:3.2,strike:.8,rest:4,withdraw:1.1,
});
export const ACADEMIC_ADVERSARY_COMPOSURE_COST=5;
// Optional local reactions: the adapter must prove actual speaker earshot and
// route mouths/voices through the society. They grant no topic or quest state.
export const ACADEMIC_ADVERSARY_SOCIAL_REPLIES=Object.freeze({
  warning:Object.freeze({actorId:'emile',text:'Stand clear of the wings. It leaves a gap.'}),
  clean:Object.freeze({actorId:'sabine',text:'A rest. At last, someone uses one.'}),
  struck:Object.freeze({actorId:'celeste',text:'It only wanted you in time. Come away from it.'}),
});
export const ACADEMIC_ADVERSARY_CUES=Object.freeze({
  'lure-studio':Object.freeze({sound:'lure-studio',at:Object.freeze({x:4.7,y:255}),caption:'[A thin four-note tune plays behind locked glass.]'}),
  'lure-chamber':Object.freeze({sound:'lure-chamber',at:Object.freeze({x:8.5,y:243}),caption:'[The same tune answers from the open chamber.]'}),
  reveal:Object.freeze({sound:'held-reveal',at:Object.freeze({x:8.4,y:243}),caption:'[Four faces hold still above the chairs.]'}),
  demonstration:Object.freeze({sound:'wing-tear',at:Object.freeze({x:8.4,y:245.2}),caption:'[A wing peels from the frieze. The first sweep passes high.]'}),
  warning:Object.freeze({sound:'held-warning',caption:'[The wings draw tight. Step back from beneath them. Cross when the note breaks.]'}),
  strike:Object.freeze({sound:'held-strike',caption:'[The held note crosses the opening.]'}),
  rest:Object.freeze({sound:'held-release',caption:'[The opening clears. Cross while the note lets go.]'}),
  clean:Object.freeze({sound:'held-clean',caption:'[You pass in the silence. The four faces fold away.]'}),
  struck:Object.freeze({sound:'held-impact',caption:'[The note catches you once, then the body withdraws.]'}),
});

export const academicHeldPoint=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)
  ?{x:value.x,y:value.y}:null;
export const academicHeldInside=(p,bounds)=>!!academicHeldPoint(p)&&!!bounds
  &&p.x>=bounds.x0&&p.x<=bounds.x1&&p.y>=bounds.y0&&p.y<=bounds.y1;
export const ACADEMIC_HELD_APPROACH=Object.freeze({x0:7.5,y0:249,x1:11,y1:268});
export const ACADEMIC_HELD_CHAMBER=Object.freeze({x0:1,y0:241,x1:16,y1:248.8});
export const academicHeldLocal=p=>academicHeldInside(p,ACADEMIC_HELD_APPROACH)||academicHeldInside(p,ACADEMIC_HELD_CHAMBER);

// Asset-audited compact mouth pose. `at` is the render-authored mark; the
// continuous anchor projection places its physical authored centre at
// (8.85,248.5). Contact/gate bounds below are physical authored coordinates.
export const ACADEMIC_HELD_GEOMETRY=Object.freeze({ready:true,
  anchorAt:Object.freeze({x:9,y:246}),at:Object.freeze({x:8.35,y:248}),
  cueAt:Object.freeze({x:8.85,y:248.5}),scale:.9,yaw:Math.PI,pitch:.93,
  safeHeight:2.1,strikeHeight:1.2,activeHeight:1.4,warningTravel:1.2,
  playerRadius:.24,
  damageBounds:Object.freeze({x0:8.55,x1:8.9,y0:248.05,y1:248.4}),
  crossingGate:Object.freeze({axis:'y',at:248.4,min:8,max:10.2,direction:0}),
  frame:academicHeldFixedFrame,
});

// Closed-segment/slab test catches a fast player step through a thin sweep.
// The bounds are an audited body proxy, never the whole wing AABB by default.
export function academicHeldSegmentHits(from,to,bounds,radius=0){
  return academicHeldSegmentEntry(from,to,bounds,radius)!==null;
}
function academicHeldSegmentEntry(from,to,bounds,radius=0){
  if(!academicHeldPoint(from)||!academicHeldPoint(to)||!bounds)return null;
  const r=Number.isFinite(radius)?Math.max(0,radius):0;
  if(!r)return segmentRectEntry(from,to,bounds);
  // Exact circle-vs-rectangle Minkowski sum: square expansion alone would
  // falsely catch the player's round body at the four outside corners.
  const candidates=[
    segmentRectEntry(from,to,{x0:bounds.x0-r,x1:bounds.x1+r,y0:bounds.y0,y1:bounds.y1}),
    segmentRectEntry(from,to,{x0:bounds.x0,x1:bounds.x1,y0:bounds.y0-r,y1:bounds.y1+r}),
  ];
  if(![bounds.x0,bounds.x1,bounds.y0,bounds.y1].every(Number.isFinite)||bounds.x1<bounds.x0||bounds.y1<bounds.y0)return null;
  const dx=to.x-from.x,dy=to.y-from.y,a=dx*dx+dy*dy;
  for(const x of [bounds.x0,bounds.x1])for(const y of [bounds.y0,bounds.y1]){
    const ox=from.x-x,oy=from.y-y,c=ox*ox+oy*oy-r*r;
    if(c<=0){candidates.push(0);continue;}
    if(a<1e-16)continue;
    const b=2*(ox*dx+oy*dy),discriminant=b*b-4*a*c;
    if(discriminant<0)continue;
    const entry=(-b-Math.sqrt(discriminant))/(2*a),leave=(-b+Math.sqrt(discriminant))/(2*a);
    if(entry<=1&&leave>=0)candidates.push(Math.max(0,entry));
  }
  const hits=candidates.filter(value=>value!==null);return hits.length?Math.min(...hits):null;
}
function segmentRectEntry(from,to,bounds){
  let enter=0,leave=1;
  for(const [axis,lo,hi] of [['x',bounds.x0,bounds.x1],['y',bounds.y0,bounds.y1]]){
    if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<lo)return null;
    const delta=to[axis]-from[axis];
    if(Math.abs(delta)<1e-10){if(from[axis]<lo||from[axis]>hi)return null;continue;}
    const a=(lo-from[axis])/delta,b=(hi-from[axis])/delta;
    enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
    if(enter>leave)return null;
  }
  return leave>=0&&enter<=1?Math.max(0,enter):null;
}

export function academicHeldCrossing(from,to,gate){
  if(!academicHeldPoint(from)||!academicHeldPoint(to)||!gate)return false;
  const axis=gate.axis==='x'?'x':'y',other=axis==='x'?'y':'x';
  if(!Number.isFinite(gate.at)||!Number.isFinite(gate.min)||!Number.isFinite(gate.max))return false;
  const delta=to[axis]-from[axis];if(Math.abs(delta)<1e-10)return false;
  const direction=gate.direction===0?(delta<0?-1:1):gate.direction===-1?-1:1;
  if(delta*direction<=0||(from[axis]-gate.at)*direction>=0||(to[axis]-gate.at)*direction<0)return false;
  const t=(gate.at-from[axis])/delta,at=from[other]+(to[other]-from[other])*t;
  return t>=0&&t<=1&&at>=gate.min&&at<=gate.max;
}

const clamp=value=>Math.max(0,Math.min(1,Number(value)||0));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
export function academicHeldDemonstrationFrame(phase,elapsed=0){
  const crossing=phase==='demonstration'?ease(elapsed/ACADEMIC_ADVERSARY_TIMING.demonstration):0;
  return{visible:true,phase,anchorAt:{...ACADEMIC_HELD_GEOMETRY.anchorAt},at:{x:8.1+3.6*crossing,y:245.1},height:2.7,yaw:Math.PI,pitch:.76,scale:1.35,
    crossing,descent:0,wingTension:phase==='reveal'?.2+.08*Math.sin(elapsed*1.7):.55+.24*Math.sin(elapsed*2.4),
    wheelAngle:elapsed*(phase==='demonstration'?1.45:.45),clipTime:elapsed,threatActive:false};
}

export function academicHeldStrikeHeight(elapsed,geometry=ACADEMIC_HELD_GEOMETRY){
  const t=Math.max(0,Math.min(ACADEMIC_ADVERSARY_TIMING.strike,Number(elapsed)||0));
  const depth=t<.18?ease(t/.18):t<=.48?1:1-ease((t-.48)/.32);
  return geometry.safeHeight+(geometry.strikeHeight-geometry.safeHeight)*depth;
}
function inverseEase(value){let lo=0,hi=1;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(ease(mid)<value)lo=mid;else hi=mid;}return(lo+hi)/2;}
export function academicHeldStrikeWindow(geometry=ACADEMIC_HELD_GEOMETRY){
  if(geometry.strikeWindow)return geometry.strikeWindow;
  if(!Number.isFinite(geometry.safeHeight)||!Number.isFinite(geometry.strikeHeight)||!Number.isFinite(geometry.activeHeight))
    return{start:0,end:ACADEMIC_ADVERSARY_TIMING.strike};
  const depth=clamp((geometry.safeHeight-geometry.activeHeight)/(geometry.safeHeight-geometry.strikeHeight));
  return{start:.18*inverseEase(depth),end:.48+.32*inverseEase(1-depth)};
}
export function academicHeldStrikeActive(elapsed,geometry=ACADEMIC_HELD_GEOMETRY){
  const window=academicHeldStrikeWindow(geometry);return elapsed>=window.start&&elapsed<=window.end;
}
export function academicHeldContact(from,to,fromElapsed,toElapsed,geometry=ACADEMIC_HELD_GEOMETRY){
  return academicHeldContactTime(from,to,fromElapsed,toElapsed,geometry)!==null;
}
export function academicHeldContactTime(from,to,fromElapsed,toElapsed,geometry=ACADEMIC_HELD_GEOMETRY){
  if(!academicHeldPoint(from)||!academicHeldPoint(to)||!Number.isFinite(fromElapsed)||!Number.isFinite(toElapsed)||toElapsed<=fromElapsed)return null;
  const window=academicHeldStrikeWindow(geometry),start=Math.max(window.start,fromElapsed),end=Math.min(window.end,toElapsed);
  if(end<start)return null;
  const pointAt=t=>{const f=(t-fromElapsed)/(toElapsed-fromElapsed);return{x:from.x+(to.x-from.x)*f,y:from.y+(to.y-from.y)*f};};
  const entry=academicHeldSegmentEntry(pointAt(start),pointAt(end),geometry.damageBounds,geometry.playerRadius);
  return entry===null?null:start+(end-start)*entry;
}

function academicHeldFixedFrame(view){
  const g=ACADEMIC_HELD_GEOMETRY,t=Math.max(0,Number(view.elapsed)||0),poseTime=Number.isFinite(view.poseTime)?view.poseTime:t;
  const target={visible:true,anchorAt:{...g.anchorAt},at:{...g.at},height:g.safeHeight,scale:g.scale,yaw:g.yaw,pitch:g.pitch,
    crossing:1,descent:1,wingTension:.7,wheelAngle:poseTime*.45,clipTime:poseTime};
  if(view.phase==='warning'&&view.warningFrom?.visible){
    const from=view.warningFrom,amount=ease(t/g.warningTravel);
    target.at={x:from.at.x+(g.at.x-from.at.x)*amount,y:from.at.y+(g.at.y-from.at.y)*amount};
    for(const key of ['height','scale','yaw','pitch','crossing','descent','wingTension'])
      if(Number.isFinite(from[key]))target[key]=from[key]+(target[key]-from[key])*amount;
  }else if(view.phase==='strike')target.height=academicHeldStrikeHeight(t,g);
  else if(view.phase==='withdraw'){
    const from=view.withdrawFrom,amount=ease(t/ACADEMIC_ADVERSARY_TIMING.withdraw);
    if(from?.visible)target.height=from.height+(g.safeHeight-from.height)*amount;
  }
  return target;
}

export function academicHeldCue(view={}){
  const durations={warning:ACADEMIC_ADVERSARY_TIMING.warning,strike:ACADEMIC_ADVERSARY_TIMING.strike,rest:ACADEMIC_ADVERSARY_TIMING.rest};
  const phase=view.phase,remaining=durations[phase]===undefined?null:Math.max(0,durations[phase]-(Number(view.elapsed)||0));
  const text=phase==='suspended'?'[The held note waits.]':ACADEMIC_ADVERSARY_CUES[phase]?.caption||null;
  if(!text)return null;
  const instruction=phase==='warning'?'STEP BACK / KEEP OUT FROM UNDER THE WINGS. CROSS WHEN THE NOTE BREAKS.':phase==='strike'?'Keep clear of the opening.':phase==='rest'?'Cross while the opening is clear.':
    phase==='suspended'?'Wait for a fresh warning.':null;
  return{source:'HELD NOTE',text,instruction,remaining};
}

export function academicHeldFrame(view={},geometry=ACADEMIC_HELD_GEOMETRY){
  if(view.phase==='suspended'&&view.suspendedFrom)return{...structuredClone(view.suspendedFrom),phase:'suspended',threatActive:false};
  if(['reveal','demonstration'].includes(view.phase)){
    const result=academicHeldDemonstrationFrame(view.phase,view.elapsed);
    if(Number.isFinite(view.poseTime)){result.clipTime=view.poseTime;result.wheelAngle=view.poseTime*.45;}
    return result;
  }
  if(!['warning','strike','rest','withdraw','suspended'].includes(view.phase)||geometry?.ready!==true)return{visible:false,phase:view.phase||'dormant',threatActive:false};
  if(typeof geometry.frame==='function')return{...geometry.frame(view),phase:view.phase,
    threatActive:view.phase==='strike'&&view.warningComplete===true&&academicHeldStrikeActive(view.elapsed,geometry)};
  return{visible:false,phase:view.phase,threatActive:false};
}
