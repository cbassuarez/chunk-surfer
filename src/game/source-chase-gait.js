import {GAIT_SPEED,SPEED_FLOOR} from './locomotion.js';

// Source proper already asks the body to flee. Movement keys sustain the old
// full sprint; the run key buys a short extra lead. Only that extra effort
// spends breath, and a winded body never drops below the Source baseline.
// Human rooms, authored score walks and the ordinary world keep their own gait.
export const SOURCE_CHASE_GAIT=Object.freeze({
  baseline:GAIT_SPEED.sprint,
  burst:GAIT_SPEED.sprint*1.1,
  pursuer:GAIT_SPEED.sprint+.3,
  teachingPursuer:GAIT_SPEED.sprint*.9,
});

export function sourceChaseGait({run=false,winded=false}={}){
  const burst=!!run&&!winded;
  return {gait:burst?'sprint':'run',speed:burst?SOURCE_CHASE_GAIT.burst:SOURCE_CHASE_GAIT.baseline};
}

export function applySourceChaseFactors(speed,factors=[]){
  let value=Number.isFinite(speed)?speed:SOURCE_CHASE_GAIT.baseline;
  for(const factor of factors)if(Number.isFinite(factor)&&factor>0)value*=Math.min(1,factor);
  return Math.max(SPEED_FLOOR,Math.min(SOURCE_CHASE_GAIT.burst,value));
}
