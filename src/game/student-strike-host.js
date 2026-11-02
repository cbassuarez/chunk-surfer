// The film borrows a view; the parked player and saved camera stay canonical.
const copy=value=>JSON.parse(JSON.stringify(value));
export function captureStudentStrikeReturnPose(value={}){
  for(const key of ['x','y','floor','yaw','pitch'])if(!Number.isFinite(value[key]))throw Error('Student strike requires a finite entry '+key);
  const result={x:value.x,y:value.y,floor:value.floor,yaw:value.yaw,pitch:value.pitch,facing:value.facing,
    renderGroup:value.renderGroup||'academic',camera:value.camera?copy(value.camera):null};
  if(result.camera?.eye&&!Object.values(result.camera.eye).every(Number.isFinite))throw Error('Student strike entry eye is invalid');
  return copy(result);
}
export function studentStrikeSavePatch(pose){
  const p=captureStudentStrikeReturnPose(pose);
  return{px:p.x,py:p.y,view:{yaw:p.yaw,pitch:p.pitch},facing:p.facing,area:'conservatory'};
}
const identity=e=>String(e?.code||e?.key||e?.controllerAction||'');
export function createStudentStrikeInputGate(){
  const held=new Set(),fresh=new Set();let returned=false;
  return{
    begin(){held.clear();fresh.clear();returned=false;},
    keyDown(e,{captured=false}={}){
      const id=identity(e);if(!id)return true;
      if(captured){held.add(id);fresh.delete(id);return true;}
      if(!returned)return true;
      if(held.has(id)||e.repeat&&!fresh.has(id))return false;
      if(!e.repeat)fresh.add(id);return true;
    },
    keyUp(e){const id=identity(e);held.delete(id);fresh.delete(id);},
    returnToPlayer(){returned=true;fresh.clear();},
    reset(){held.clear();fresh.clear();returned=false;},
    snapshot:()=>({returned,held:[...held],fresh:[...fresh]}),
  };
}
