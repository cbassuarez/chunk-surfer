// One contract for the Conservatory's main open-well stair.
//
// The floorplan compiler consumes the logical ribbons and collision envelope;
// the project-native GLB builder consumes the same radii, flights and finishes.
// Keeping those facts together is what prevents the visible tread, the height
// sampled under the player, and the camera's path around the well from drifting
// into three different staircases again.

const PI=Math.PI;

const freezeFlight=(flight)=>Object.freeze({
  ...flight,
  logicalFrom:Object.freeze({...flight.logicalFrom}),
  logicalTo:Object.freeze({...flight.logicalTo}),
});

export const MAIN_STAIR_GEOMETRY=Object.freeze({
  revision:3,
  center:Object.freeze({x:63,z:36}),
  widthM:2,
  innerRadiusM:.65,
  outerRadiusM:2.65,
  collisionOuterRadiusM:3,
  walkOuterRadiusM:2.65,
  goingM:.28,
  slabDepthM:.18,
  finishThicknessM:.028,
  handrailHeightM:1,
  balusterMaximumClearGapM:.106,
  openWell:Object.freeze({floor:-4,ceil:14}),
  // This authored point is the centre of the immutable Floor 1 stair hall. The
  // final apron and its sightline may aim at it; the hall cells themselves are
  // not part of this module and must never be rewritten by a stair rebuild.
  floor1Aim:Object.freeze({x:61.5,z:31.5}),
  flights:Object.freeze([
    freezeFlight({
      id:'ground-to-half',logicalFrom:{x:134,y:50},logicalTo:{x:134,y:56.5},
      fromH:0,toH:2.4,rises:14,theta0:0,sweep:PI,ceil:4.55,
      groupFrom:'ground',groupTo:'upper',
    }),
    freezeFlight({
      id:'half-to-upper',logicalFrom:{x:138,y:56.5},logicalTo:{x:138,y:50},
      fromH:2.4,toH:4.8,rises:14,theta0:PI,sweep:PI,ceil:7.15,
      groupFrom:'ground',groupTo:'upper',
    }),
    freezeFlight({
      id:'upper-to-half',logicalFrom:{x:134,y:65},logicalTo:{x:134,y:58},
      fromH:4.8,toH:7.4,rises:15,theta0:PI*5/9,sweep:PI,ceil:9.75,
      groupFrom:'upper',groupTo:'academic',
    }),
    freezeFlight({
      id:'half-to-academic',logicalFrom:{x:138,y:58},logicalTo:{x:138,y:65},
      fromH:7.4,toH:10,rises:15,theta0:PI*14/9,sweep:PI,ceil:13.8,
      groupFrom:'upper',groupTo:'academic',
    }),
  ]),
  landings:Object.freeze([
    Object.freeze({id:'upper-floor-landing',at:Object.freeze({x:150,y:50}),size:Object.freeze({x:6,y:4}),physicalAt:Object.freeze({x:62.5,z:33}),height:4.8,ceil:9.75,renderGroup:'upper'}),
    Object.freeze({id:'academic-floor-landing',at:Object.freeze({x:150,y:64}),size:Object.freeze({x:6,y:4}),physicalAt:Object.freeze({x:63.5,z:36.5}),height:10,ceil:13.8,renderGroup:'academic'}),
  ]),
});

export function mainStairFloorplanFlights(){
  const stair=MAIN_STAIR_GEOMETRY;
  return stair.flights.map((flight,index)=>({
    id:flight.id,
    from:{...flight.logicalFrom},to:{...flight.logicalTo},
    fromH:flight.fromH,toH:flight.toH,width:stair.widthM,rises:flight.rises,
    going:stair.goingM,ceil:flight.ceil,renderMode:'hero-mesh',navigationMode:'analytic-helix',
    groupFrom:flight.groupFrom,groupTo:flight.groupTo,
    arc:{
      center:{...stair.center},rInner:stair.innerRadiusM,rOuter:stair.collisionOuterRadiusM,
      rWalk:stair.walkOuterRadiusM,theta0:flight.theta0,sweep:flight.sweep,
      openWell:index===0?{...stair.openWell}:undefined,
    },
  }));
}

export function mainStairFloorplanLandings(){
  return MAIN_STAIR_GEOMETRY.landings.map((landing)=>({
    ...landing,at:{...landing.at},size:{...landing.size},physicalAt:{...landing.physicalAt},
  }));
}
