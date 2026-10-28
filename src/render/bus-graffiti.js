// A thin paint-only mesh shares the host bus's transform and visibility. It
// never joins the traffic simulation, collision, lighting, or pedestrian data.
export function busGraffitiInstance(bus){
  if(bus?.mesh!=='ambient_late_bus')return null;
  return {id:`${bus.id}:paint`,mesh:'ambient_bus_graffiti',paintOf:bus.id,
    x:bus.x,y:bus.y,z:bus.z,yaw:bus.yaw,scale:bus.scale,
    ...(bus.scaleX!==undefined?{scaleX:bus.scaleX}:{}),
    ...(bus.scaleY!==undefined?{scaleY:bus.scaleY}:{}),
    ...(bus.scaleZ!==undefined?{scaleZ:bus.scaleZ}:{}),
    ...(bus.matrix?{matrix:bus.matrix}:{}),
    zone:bus.zone,structural:false,ambient:true,noShadow:true,
    ...(bus.skyExposed?{skyExposed:true}:{})};
}
