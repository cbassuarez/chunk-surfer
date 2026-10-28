// The existing goods pair opens for a moving van. Arrival is the whole body
// passing its real threshold, not an Enter press or a stopped-car flag.
import {roadSurfaceAt} from './road.js';
import {ORDINARY_DESTINATION} from './route-layout.js';
import {driveBodyCorners} from './vehicle-contacts.js';
const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
export function driveDoorCrossingFrame(state){
  const road=roadSurfaceAt(state.x,state.z),distance=road.distance;
  const furthest=Math.max(distance,Number(state.furthest)||0),target=ORDINARY_DESTINATION;
  const open=smooth((furthest-(target.d-14))/9);
  const corners=driveBodyCorners(state).map(p=>roadSurfaceAt(p.x,p.z));
  const near=Math.abs(road.offset-target.lateral)<2.5;
  const front=Math.max(...corners.map(p=>p.distance)),rear=Math.min(...corners.map(p=>p.distance));
  const fits=corners.every(p=>Math.abs(p.offset-target.lateral)<1.5);
  return {id:'source-goods-pair',kind:'driven-door',distance,open,
    phase:rear>target.d+.28&&fits?'through':front>=target.d?'threshold':open>0?'opening':'approach',
    thresholdDistance:target.d,frontDistance:front,rearDistance:rear,
    contact:near&&front>=target.d,complete:fits&&rear>target.d+.28,
    lateral:road.offset-target.lateral};
}
