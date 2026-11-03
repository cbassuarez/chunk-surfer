import {SOURCE_REST_PERFORMANCE} from '../data/source-rest-performance.js';
import {SOURCE_REST_SEATS,sourceRestEyePosition} from './source-rest-seat.js';

// The Ophanim horizon replaces the retained semiangel at the same pivot. A
// spinning hole whose tilted disc has torn into three precessing wheels, as
// Lense-Thirring precession tears a misaligned disc into separate rings. Each
// wheel keeps eight bright knots. The player's marked mistakes close those
// eyes; the outer wheels fall at the semiangel's own authored bearing
// failures and the last one in the final passage. Every value is a pure
// function of the recording clock: identical clocks give identical frames.
const number=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,number(value)));
const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
const add=(a,b)=>a.map((v,k)=>v+b[k]),scale=(a,s)=>a.map(v=>v*s),dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>scale(a,1/Math.max(1e-9,Math.hypot(...a)));
const rotate=(v,axis,angle)=>{const k=unit(axis),c=Math.cos(angle),s=Math.sin(angle);return add(add(scale(v,c),scale(cross(k,v),s)),scale(k,dot(k,v)*(1-c)));};

export const SOURCE_REST_HORIZON=Object.freeze({
  // Seat-relative, 1.5m nearer than the retired semiangel's pivot above the
  // far gate, so the whole far judgment bell hangs behind the lens plane and
  // is wrapped into the ring instead of being cut by it.
  pivot:Object.freeze([-19.5,7.55,-.80]),
  // Schwarzschild radius in metres. It grows only inside the final passage,
  // reaching its last size at the existing 96% blackout.
  radius:.85,finalRadius:2.6,growFrom:.35,growUntil:.96,
  // Frame dragging is tuned for legibility, not solved from the Kerr metric;
  // rays are captured at the horizon itself. The lens is integrated inside
  // lensRadius (in rs).
  capture:1,dragging:4,lensRadius:12,
  // The disc plane sits 18 degrees off edge-on toward the seat, rolled -16.
  spin:Object.freeze({towardSeat:18,roll:-16}),
  rings:Object.freeze([
    Object.freeze({inner:3.3,outer:4.3,precession:.045,tilt:.38,collapse:Object.freeze({passage:2,at:.49})}),
    Object.freeze({inner:5.2,outer:6.3,precession:.022,tilt:-.6,collapse:Object.freeze({passage:1,at:.35})}),
    Object.freeze({inner:7.3,outer:8.8,precession:.011,tilt:.84,collapse:Object.freeze({passage:1,at:.70})}),
  ]),
  collapseSeconds:7,collapsedInner:1.25,collapsedOuter:1.55,
  eyes:8,eyeDarkSeconds:25,eyeFlashSeconds:1.2,
  // The first grueling passage drives the rings five times faster and shakes
  // the outer wheel loose without taking it.
  passageSpin:5,outerWobble:.45,
  // Torn architecture spirals in with this orbital winding (frame dragging).
  swirl:1.6,
});

const mistakes=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='mistake').map(row=>({...row})).sort((a,b)=>a.start-b.start);
const passages=SOURCE_REST_PERFORMANCE.annotations.filter(row=>row.type==='grueling').map(row=>({...row})).sort((a,b)=>a.start-b.start);
let scheduleCache=null;
/** The finite authored schedule every frame and destruction layer shares. */
export function sourceRestHorizonSchedule(duration=SOURCE_REST_PERFORMANCE.duration){
  const length=Math.max(.001,number(duration,SOURCE_REST_PERFORMANCE.duration));
  if(scheduleCache?.length===length)return scheduleCache.value;
  const spans=passages.map(row=>{const end=row.endPolicy==='track-end'?length:Math.min(length,row.end);
    return Object.freeze({id:row.id,start:row.start,end,span:Math.max(.001,end-row.start)});});
  const value=Object.freeze({
    duration:length,passages:Object.freeze(spans),
    mistakes:Object.freeze(mistakes.map((row,index)=>Object.freeze({index,id:row.id,time:row.start,severity:row.severity,
      ring:index%3,eye:(index*3+Math.floor(index/3))%SOURCE_REST_HORIZON.eyes}))),
    collapses:Object.freeze(SOURCE_REST_HORIZON.rings.map(ring=>{const p=spans[ring.collapse.passage];return p?p.start+p.span*ring.collapse.at:Infinity;})),
    growth:Object.freeze((()=>{const p=spans[2];return p?[p.start+p.span*SOURCE_REST_HORIZON.growFrom,length*SOURCE_REST_HORIZON.growUntil]:[Infinity,Infinity];})()),
  });
  scheduleCache={length,value};return value;
}

const geometryCache=new Map();
function geometry(seat){
  if(geometryCache.has(seat))return geometryCache.get(seat);
  const eye=sourceRestEyePosition(seat),pivot=SOURCE_REST_HORIZON.pivot,
    centre=[seat.x+pivot[0],seat.feet+pivot[1],seat.z+pivot[2]],view=unit(add(centre,scale(eye,-1))),
    level=unit(add([0,1,0],scale(view,-dot([0,1,0],view)))),toward=SOURCE_REST_HORIZON.spin.towardSeat*Math.PI/180,
    spin=unit(rotate(add(scale(level,Math.cos(toward)),scale(view,-Math.sin(toward))),view,SOURCE_REST_HORIZON.spin.roll*Math.PI/180)),
    across=unit(cross(spin,view)),along=cross(spin,across),axes=[across,along,unit(add(across,along))],
    rings=SOURCE_REST_HORIZON.rings.map((ring,k)=>unit(rotate(spin,axes[k],ring.tilt)));
  const value=Object.freeze({eye,centre,view,spin,rings});geometryCache.set(seat,value);return value;
}

/** Deterministic hole state for the listening seat. Returns active:false at
 * the authored blackout or outside the Source II phase. */
export function sourceRestHorizonFrame({time=0,unwrappedTime=null,duration=SOURCE_REST_PERFORMANCE.duration,progress=0,breath=0,
  reducedMotion=false,seat=SOURCE_REST_SEATS[0]}={}){
  const schedule=sourceRestHorizonSchedule(duration),length=schedule.duration,wrapped=clamp(number(time),0,length),
    clock=Math.max(wrapped,number(unwrappedTime,wrapped)),cycles=Math.max(0,Math.floor((clock-wrapped+.001)/length)),
    g=geometry(seat||SOURCE_REST_SEATS[0]),p=clamp(progress),phrase=clamp(breath);
  const base={active:false,centre:[...g.centre],radius:SOURCE_REST_HORIZON.radius,clock,time:wrapped,cycles,progress:p};
  if(p>=.96)return{...base,reason:'blackout'};
  const first=schedule.passages[0],spinBoost=first?SOURCE_REST_HORIZON.passageSpin*(cycles*first.span+clamp(wrapped-first.start,0,first.span)):0;
  let alive=0,flash=0;
  const rings=SOURCE_REST_HORIZON.rings.map((ring,k)=>{
    const precession=reducedMotion?0:ring.precession*(clock+spinBoost)+.06*Math.sin(clock*.21+k),
      normal=unit(rotate(g.rings[k],g.spin,precession)),collapseAt=schedule.collapses[k],
      fall=ease((clock-collapseAt)/SOURCE_REST_HORIZON.collapseSeconds);
    let inner=ring.inner,outer=ring.outer;
    if(k===2&&first&&!reducedMotion&&wrapped>first.start&&wrapped<first.end+6){
      const wobble=Math.sin(wrapped*1.7)*SOURCE_REST_HORIZON.outerWobble*Math.min(1,(wrapped-first.start)/4)*Math.min(1,(first.end+6-wrapped)/6);
      inner+=wobble;outer+=wobble*.6;
    }
    inner+=(SOURCE_REST_HORIZON.collapsedInner-inner)*fall;outer+=(SOURCE_REST_HORIZON.collapsedOuter-outer)*fall;
    const present=1-ease((fall-.8)/.2),burst=clock>collapseAt?1.6*Math.exp(-(clock-collapseAt)/1.5)*(1-fall)*(reducedMotion?.4:1):0;
    alive+=present;flash+=burst;
    return Object.freeze({normal,inner,outer,alive:present,flash:burst,collapseAt,falling:fall});
  });
  // Eyes respond only to this pass's heard mistakes: age since the latest
  // mistake that struck each knot, or a large sentinel when none has.
  const eyeAges=new Float32Array(SOURCE_REST_HORIZON.rings.length*SOURCE_REST_HORIZON.eyes).fill(1e4);
  let heard=0;
  for(const row of schedule.mistakes){if(row.time>wrapped)break;heard++;eyeAges[row.ring*SOURCE_REST_HORIZON.eyes+row.eye]=wrapped-row.time;}
  const [growStart,growEnd]=schedule.growth,grow=cycles>0?1:Math.pow(ease((clock-growStart)/Math.max(.001,growEnd-growStart)),1.5),
    radius=SOURCE_REST_HORIZON.radius+(SOURCE_REST_HORIZON.finalRadius-SOURCE_REST_HORIZON.radius)*grow,
    light=.32*(.75+.5*phrase)*(.35+.65*alive/rings.length)+flash*.25;
  return Object.freeze({...base,active:true,radius,capture:SOURCE_REST_HORIZON.capture,dragging:SOURCE_REST_HORIZON.dragging,
    lensRadius:SOURCE_REST_HORIZON.lensRadius,spin:[...g.spin],rings:Object.freeze(rings),eyeAges,breath:phrase,light,
    swirl:reducedMotion?0:SOURCE_REST_HORIZON.swirl,reducedMotion:!!reducedMotion,
    diagnostics:Object.freeze({rings:rings.length,ringsAlive:Number(alive.toFixed(4)),eyesClosed:Array.from(eyeAges).filter(a=>a<SOURCE_REST_HORIZON.eyeDarkSeconds).length,
      mistakesHeard:heard,radius:Number(radius.toFixed(4)),growing:grow>0,
      scope:'Recording-clock hole: torn three-wheel disc, eyes closed by marked mistakes, wheels fall at the semiangel bearing moments.'})});
}

/** CPU mirror of the per-vertex infall in the prop vertex program. Each
 * point falls on its own path: nearer ends fall and orbit faster, so tidal
 * stretching and the wrapped stream emerge from the paths themselves. */
export function sourceRestHorizonInfall(point,{release=0,anchor=1},frame){
  if(!frame?.active)return{point:[...point],consumed:false};
  const age=frame.clock-release;if(age<=0)return{point:[...point],consumed:false};
  const axis=frame.spin,rs=frame.radius,rel=add(point,scale(frame.centre,-1)),
    e1=unit(cross(axis,Math.abs(axis[1])<.95?[0,1,0]:[1,0,0])),e2=cross(axis,e1),
    r0=Math.max(Math.hypot(...rel)/rs,1.001),z0=dot(rel,axis)/rs,period=(6+.25*Math.pow(r0,1.5))*anchor,s=age/period,last=1-Math.pow(1/r0,1.5);
  if(s>=last)return{point:[...frame.centre],consumed:true};
  const k=Math.pow(1-s,2/3),r=r0*k,z=z0*Math.pow(k,1.5),rho=Math.sqrt(Math.max(r*r-z*z,0)),
    phase=Math.atan2(dot(rel,e2),dot(rel,e1))+frame.swirl*3*(Math.pow(1-s,-1/3)-1);
  return{point:add(frame.centre,scale(add(add(scale(axis,z),scale(e1,rho*Math.cos(phase))),scale(e2,rho*Math.sin(phase))),rs)),consumed:false};
}
