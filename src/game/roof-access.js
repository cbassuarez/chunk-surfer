// The north-gallery exterior stair is school service access. Ren's later brass
// key opens the shorter ladder and never substitutes for the school's key or
// for a room take at this door.
export function roofGateEligibility(keys,acceptedTakes){
  const schoolKey=keys?.has?.('master')===true;
  const recorderCheck=Number(acceptedTakes)>=1;
  return{schoolKey,recorderCheck,canOpen:schoolKey&&recorderCheck};
}
