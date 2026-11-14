// THE TOWER ROAD, ONCE IT IS TAKEN. Seb, 2026-11-14: the walk to the tower
// between the bells is gone. Taking the tower is walking on down the pale road in
// the Rind itself, with no cut and nothing reloaded, between bells on either
// side. Some of them sound, and they should surprise him.
//
// The bells are St Brendan's own ring, lifted out of it at the three sizes the
// passage used (regular, miniature, architecturally large), never a new set.
// They hang from their headstocks the way the passage's ring did, with no frame.
// A bell that sounds looks exactly like one that will not: nothing marks it, and
// what sets it off is never the obvious thing. One goes behind him after he has
// passed it, the big one tolls long before he gets there, one is right at his
// shoulder, and one waits for him to stop walking.
import {HORIZON_APPROACH as C,horizonTowerBearing} from './horizon-approach.js';
import {SOURCE_RING,bellAssemblyPoseAt} from './source-level.js';
import {ELLERY_BELLS} from './bell-tower.js';

const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
// Where on the tower road he walks, in metres out from the object: on from where
// the choice was made, to the door of St Brendan's, where the Rind hands him to
// the tower's field of doors.
export const HORIZON_TOWER_WALK=freeze({from:C.commit-1,arrive:62});
// The ring's own stroke (eight places), and how much slower or quicker a bell
// that is not its own size swings.
const STROKE=ELLERY_BELLS.length*.19;
export const HORIZON_BELL_SIZES=freeze({
  regular:{period:STROKE,rate:1,elevation:s=>2.4,gain:1},
  miniature:{period:STROKE*.4,rate:1.9,elevation:s=>1.15,gain:.55},
  architectural:{period:STROKE*2.3,rate:.5,elevation:s=>1.02*s+.5,gain:1.6},
});
const trueScale=ring=>SOURCE_RING[ring-1].visualScale;
// [id, ring, r, side, size, scale (architectural only), metres from the road's
// middle, yaw, what sets it off]. The big ones turn their wheels along the road
// (yaw near a quarter turn) and stand far enough off that wheel and swing clear it. `at`: once he is this far along. `still`:
// once he has stood this long anywhere past `from`, or at `at` regardless.
const ROWS=[
  ['a',1,10,-1,'regular',0,2.7,.2],
  ['b',4,13.5,1,'miniature',0,2.1,1.1],
  ['c',2,17,1,'regular',0,2.9,-.4,{at:21.5}],
  ['d',6,21,-1,'architectural',4.5,7.6,1.75],
  ['e',3,25.5,-1,'regular',0,2.8,.9],
  ['f',7,28,1,'miniature',0,2.2,-1.3],
  ['g',8,31,1,'architectural',6,9.2,1.4,{at:24}],
  ['h',5,35,-1,'regular',0,2.7,.1],
  ['i',1,38,-1,'miniature',0,2.05,.7,{at:38.4}],
  ['j',4,41.5,1,'regular',0,2.9,-.8],
  ['k',2,45,-1,'architectural',5,8.3,1.65],
  ['l',6,48,1,'regular',0,2.8,.35,{still:2.2,from:42,at:53}],
  ['m',7,51.5,-1,'regular',0,2.75,-.6],
  ['n',3,54,1,'miniature',0,2.1,.4],
  ['o',8,57,-1,'regular',0,2.85,.15,{at:59.5}],
  ['p',5,59.5,1,'architectural',4.5,7.6,1.5],
];
export const HORIZON_TOWER_BELLS=freeze(ROWS.map(([id,ring,r,side,size,large,offset,yaw,sound])=>{
  const scale=size==='architectural'?large:size==='miniature'?trueScale(ring)*.32:trueScale(ring),S=HORIZON_BELL_SIZES[size];
  return{id:`tower-bell-${id}`,ring,r,side,size,scale,offset,yaw,elevation:S.elevation(scale),period:S.period,sound:sound||null};
}));
export const HORIZON_SOUNDING_BELLS=freeze(HORIZON_TOWER_BELLS.filter(bell=>bell.sound));

// Where a bell hangs on the map: its bearing, so that it stands `offset` metres
// to the side of the road's middle however the space has bent the road there.
export function horizonTowerBellBearing(bell,variant='closed'){
  const R=C.variants.closed.radius;
  return horizonTowerBearing(variant)+bell.side*bell.offset/(R*Math.max(.05,Math.sin(bell.r/R)));
}
// Whether `bell` sounds this step, given how far along he is and how long he has
// stood still. Pure; the scene keeps what has already sounded.
export function horizonBellDue(bell,{along=0,still=0}={}){
  const s=bell.sound;if(!s)return false;
  if(s.still&&along>=s.from&&still>=s.still)return true;
  return Number.isFinite(s.at)&&along>=s.at;
}
// A bell that sounds swings the way the chapel's swing: joined at the bottom of a
// stroke, mouth down and moving, up into the handstroke, back down through the
// backstroke, and then it dies away to hanging still. The hand and back strikes
// fall where the ring's own curve strikes them.
const DIE=1.4;
export function horizonBellStrikes(bell){
  const strike=ELLERY_BELLS[bell.ring-1].strikePhase;
  return freeze([{stroke:'hand',at:(strike-.5)*bell.period},{stroke:'back',at:(strike+.5)*bell.period}]);
}
export function horizonBellPose(bell,sinceRung){
  if(sinceRung==null||!(sinceRung>=0))return{angle:0,clapperAngle:0,sliderOffset:0};
  const swinging=2*bell.period,end=swinging+DIE;
  if(sinceRung>=end)return{angle:0,clapperAngle:0,sliderOffset:0};
  const pose=bellAssemblyPoseAt({ring:bell.ring,swing:{kind:'full-circle',period:bell.period,phase:Math.PI}},sinceRung);
  if(sinceRung<=swinging)return pose;
  const u=(sinceRung-swinging)/DIE,k=(1-u)*(1-u);
  return{angle:pose.angle*k,clapperAngle:pose.clapperAngle*k,sliderOffset:pose.sliderOffset*k};
}
