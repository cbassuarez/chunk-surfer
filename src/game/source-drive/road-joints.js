// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// World crossings, not a timed scare. A restored/stationary vehicle emits none.
import {VEHICLE} from './vehicle-dynamics.js';
export const JOINT_OFFSETS=Object.freeze([-1.8,0,2.7]);
export function crossedRoadJoints(previousD,currentD,{speed=0,roadOffset=0,bridgeDistance=540,paused=false}={}){
 if(paused||![previousD,currentD,speed,roadOffset,bridgeDistance].every(Number.isFinite)||Math.abs(speed)<.02||Math.abs(currentD-previousD)<1e-8||Math.abs(roadOffset)>=3.8)return[];
 const events=[];for(const delta of JOINT_OFFSETS)for(const[axle,offset]of[['front',VEHICLE.frontDistance],['rear',-VEHICLE.rearDistance]]){const crossing=bridgeDistance+delta-offset;if((previousD<crossing&&currentD>=crossing)||(previousD>crossing&&currentD<=crossing))events.push({axle,jointDistance:bridgeDistance+delta,crossing});}
 return events.sort((a,b)=>(a.crossing-b.crossing)*Math.sign(currentD-previousD));
}
