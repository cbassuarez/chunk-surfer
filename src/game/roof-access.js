import { ROOF_PASSWORD } from '../data/roof-password.js';

// Ren's later brass key opens the shorter ladder. The exterior service gate
// retains the school master key and its own word lock; recording is unrelated.
export function roofGateEligibility(keys,word){
  const schoolKey=keys?.has?.('master')===true;
  const passwordCheck=typeof word==='string'&&word.trim().toUpperCase()===ROOF_PASSWORD;
  return{schoolKey,passwordCheck,canOpen:schoolKey&&passwordCheck};
}
