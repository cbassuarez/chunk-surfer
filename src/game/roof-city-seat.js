// The body stays at its safe approach checkpoint. Only the eye is borrowed by
// the bench, so a quit, reload or interrupted scene always resumes on the walk.
export const ROOF_CITY_SEAT_ACTION=Object.freeze({
  sitSeconds:1.4,standSeconds:.9,hintSeconds:5.5,
});

const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
const lerp=(a,b,t)=>a+(b-a)*t;

export function makeRoofCitySeatScene({origin,seat,look,floor,yaw,pitch,eyeDrop,
  onEnter=()=>{},onSeated=()=>{},onStand=()=>{},onExit=()=>{},onFinish=()=>{},render=()=>{},
}={}){
  let phase='lowering',elapsed=0;
  const turn=Math.atan2(Math.sin(yaw-look.yaw),Math.cos(yaw-look.yaw));
  const scene={
    id:'roof-city-seat',blocksInput:true,blocksWorld:false,suppressesHud:true,
    lookProfile:'explore',allowsLook:true,
    get tracksMotion(){return phase==='rising';},
    enter:onEnter,
    exit:onExit,
    update(dt){
      elapsed+=Math.max(0,Number(dt)||0);
      if(phase==='lowering'&&elapsed>=ROOF_CITY_SEAT_ACTION.sitSeconds){
        phase='seated';elapsed=0;onSeated({yaw,pitch});
      }else if(phase==='rising'&&elapsed>=ROOF_CITY_SEAT_ACTION.standSeconds){
        phase='finished';onFinish();
      }
    },
    worldView(){
      const t=phase==='lowering'?smooth(elapsed/ROOF_CITY_SEAT_ACTION.sitSeconds)
        :phase==='rising'?1-smooth(elapsed/ROOF_CITY_SEAT_ACTION.standSeconds):1;
      const turnT=smooth(elapsed/(ROOF_CITY_SEAT_ACTION.sitSeconds*.78));
      return{x:lerp(origin.x,seat.x,t),y:lerp(origin.y,seat.y,t),floorH:floor-eyeDrop*t,
        yaw:phase==='lowering'?look.yaw+turn*turnT:undefined,
        pitch:phase==='lowering'?lerp(look.pitch,pitch,t):undefined,suppressActors:false};
    },
    stand(){
      if(phase!=='seated')return false;
      phase='rising';elapsed=0;onStand();return true;
    },
    key(event){
      if(['e','enter','escape'].includes(String(event.key||'').toLowerCase())){
        event.preventDefault?.();scene.stand();
      }
      return true;
    },
    view(){return{phase,elapsed,seat:{...seat},origin:{...origin},
      showStandHint:phase==='seated'&&elapsed<ROOF_CITY_SEAT_ACTION.hintSeconds};},
    render(){render(scene.view());},
  };
  return scene;
}
