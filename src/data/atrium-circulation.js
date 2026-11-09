// The stage service door belongs to the foyer's level0, while the real stage
// is1.5m lower. A guarded landing and one short, visible run join those floors.
export const HALL_STAGE_SERVICE_STAIR=Object.freeze({
  id:'hall-stage-service-steps',mesh:'hall_stage_service_steps',
  at:Object.freeze({x:99,y:11}),
  landing:Object.freeze({x:99,y:10,width:1,depth:2}),
  from:Object.freeze({x:100,y:10}),to:Object.freeze({x:103,y:10}),
  fromH:0,toH:-1.5,width:1.5,treads:8,going:.5,railHeight:.95,
});
export const hallServiceTreadHeight=index=>-1.5*Math.max(0,Math.min(7,index))/7;
export const HALL_STAGE_SERVICE_RAIL_COLLIDERS=Object.freeze([
  ...[10,12].map(y=>({id:`hall-service-landing-rail-${y}`,kind:'obb',x:99.5,y,width:1,depth:.48,
    yaw:0,minElevation:0,maxElevation:.95,spaceId:'hall'})),
  ...Array.from({length:8},(_,i)=>[10,11.5].map(y=>({
    id:`hall-service-run-rail-${i}-${y}`,kind:'obb',x:100+i*.5+.25,y,width:.5,depth:.48,
    yaw:0,minElevation:hallServiceTreadHeight(i),maxElevation:hallServiceTreadHeight(i)+.95,spaceId:'hall',
  }))).flat(),
]);
