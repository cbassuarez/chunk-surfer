// The operator stays in Ellery while the retained student owns the picture.
// This latch is deliberately independent of story progression and Contact.
export function createStandingTearLatch({site,clearance=1}={}){
  let armed=true;
  return {
    get armed(){return armed;},
    disarm(){armed=false;},
    update(point,{movementHeld=false}={}){
      if(!armed&&!movementHeld&&Math.hypot(point.x-site.x,point.z-site.z)>clearance)armed=true;
      return armed;
    },
  };
}
export function standingTearReturnPatch(pose){
  if(!pose||!['x','y','floor','yaw','pitch'].every(k=>Number.isFinite(pose[k])))throw Error('Standing Tear needs the exact operator pose.');
  return {px:pose.x,py:pose.y,view:{yaw:pose.yaw,pitch:pose.pitch},facing:pose.facing??0,standingTear:null};
}
export function standingTearResume(value,runId){
  return value?.kind==='standing-tear'&&String(value.runId)===String(runId)&&value.returnPose&&['x','y','floor','yaw','pitch'].every(k=>Number.isFinite(value.returnPose[k]))?value:null;
}
export function createStandingTearInputGate(){
  let armed=false;
  return {
    arm(){armed=true;},
    get armed(){return armed;},
    update(snapshot={}){
      if(armed&&!Object.values(snapshot.axes||{}).some(v=>Math.abs(v)>.08)&&!(snapshot.buttons?.size))armed=false;
      return !armed;
    },
  };
}
