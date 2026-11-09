// A suspended visit, not a completed ending. The existing drive-off owns the
// picture. This module never files a return or replaces the active run.
import {openingVehiclePoint} from '../data/opening-vehicle.js';
import {nightDeadlinePending} from './night-deadline.js';
export const VAN_RETURN=Object.freeze({pending:'van.departure.pending',count:'van.departure.count',at:'van.departure.at',handle:Object.freeze([1.025,1.15,-2.48]),reach:1.65,seeCos:.88});
const finite=Number.isFinite;
export function vanReturnAvailable(save={}, {blocked=false}={}){
  return !blocked&&save.run?.status==='active'&&!save.run?.finalizedReturn&&!save.run?.pendingReturn
    &&!nightDeadlinePending(save.nightDeadline)&&['leaving','departed'].includes(save.towerWarning?.phase);
}
// Exterior driver's handle only: not through the passenger side or another floor.
export function vanDriverDoorFocus(anchor,observer,{enabled=true,occluded=false}={}){
  if(!enabled||occluded||!anchor||!observer)return null;
  if(![anchor.x,anchor.y,anchor.z,anchor.yaw,observer.x,observer.y,observer.z,observer.yaw,observer.pitch??0].every(finite))return null;
  const dx=observer.x-anchor.x,dz=observer.z-anchor.z,c=Math.cos(anchor.yaw),s=Math.sin(anchor.yaw);
  if(c*dx+s*dz<1.02||Math.abs(observer.y-1.62-anchor.y)>.45)return null;
  const point=openingVehiclePoint(anchor,VAN_RETURN.handle,false),x=point.x-observer.x,y=point.y-observer.y,z=point.z-observer.z,distance=Math.hypot(x,y,z);
  if(distance>VAN_RETURN.reach||distance<.05)return null;
  const pitch=observer.pitch??0,cp=Math.cos(pitch),facing=(x*Math.sin(observer.yaw)*cp+y*Math.sin(pitch)-z*Math.cos(observer.yaw)*cp)/distance;
  return facing>=VAN_RETURN.seeCos?{id:'yard-van-driver-handle',action:'van-driver-door',label:'GET IN THE VAN',point,distance}:null;
}
export function prepareVanReturn(save,checkpoint={},now=Date.now()){
  if(!vanReturnAvailable(save))return null;
  const patch={flags:{...save.flags,[VAN_RETURN.pending]:true,[VAN_RETURN.at]:now,[VAN_RETURN.count]:Math.max(0,Math.floor(Number(save.flags?.[VAN_RETURN.count])||0))+(save.flags?.[VAN_RETURN.pending]?0:1)}};
  // Continue returns to this world checkpoint, never a temporary cab/film pose.
  for(const key of ['px','py','facing','cameraRevision','checkpointRevision'])if(finite(checkpoint[key]))patch[key]=checkpoint[key];
  if(checkpoint.view&&finite(checkpoint.view.yaw)&&finite(checkpoint.view.pitch))patch.view={yaw:checkpoint.view.yaw,pitch:checkpoint.view.pitch};
  patch.area='conservatory';return patch;
}
export function finishVanReturn(save={}){return{flags:{...save.flags,[VAN_RETURN.pending]:false}};}
export function vanReturnConversation({returning=false}={}){
  return{
    start:{speaker:'',lines:[{who:'direction',text:'The cab still smells of wet wool and warm wiring. The door settles into its seals.'},{who:'you',text:returning?'The key is still here. I can still turn it.':'He said there was no job. I could take him at his word.'}],goto:'choice'},
    choice:{speaker:'',lines:[],choices:[{text:'Drive away. Come back when I am ready.',goto:'leave',vanReturn:'leave'},{text:'Leave the key alone. Get back out.',goto:'stay',vanReturn:'stay'}]},
    leave:{speaker:'',lines:[{who:'direction',text:'You turn the key. For a moment the building is only something in the rear-view mirror.'}],goto:'done'},
    stay:{speaker:'',lines:[{who:'you',text:'Not yet.'}],goto:'done'},done:{speaker:'',lines:[]},
  };
}
// Saving must succeed before departure. Duplicate callbacks cannot leave twice.
export function createVanReturn({getSave,commit,persist,getCheckpoint=()=>({}),drive,onTitle=()=>{},onError=()=>{},now=Date.now}={}){
  let busy=false,finished=false,choice=null;
  const finish=()=>{if(finished)return;finished=true;commit(finishVanReturn(getSave()));onTitle();};
  return{
    choose(value){if(busy||finished||!['leave','stay'].includes(value))return false;choice=value;return true;},
    async complete(){
      if(busy||finished||choice!=='leave')return false;
      const patch=prepareVanReturn(getSave(),getCheckpoint(),now());if(!patch)return false;
      busy=true;commit(patch);
      try{if(await persist()!==true)throw Error('The departure could not be saved.');if(drive({onDone:finish})!==true)finish();return true;}
      catch(error){busy=false;onError(error);return false;}
    },
    view:()=>({busy,finished,choice}),
  };
}
