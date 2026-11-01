// The listening place occupies a screened corner of the existing upper
// refuge. Its floor and original portal remain exactly where they were.
export const SOURCE_REST_ALCOVE=Object.freeze({chartId:0,phase:'wrong-return',feet:8.4,
  seat:Object.freeze({x:1.50,z:-21.20}),approach:Object.freeze({x:.83,z:-21.20}),
  discovery:Object.freeze({x:.05,z:-22.80,yaw:Math.PI/2,pitch:0}),
  route:Object.freeze([{x:3.85,z:-18},{x:3.85,z:-20},{x:0,z:-20},{x:-.05,z:-21.1},{x:.05,z:-22.8},{x:.83,z:-22.8},{x:.83,z:-21.2}].map(Object.freeze)),
  window:Object.freeze({x:.43,minZ:-21.95,maxZ:-20.65,minY:8.78,maxY:10.75}),
});
const wall=(id,minX,maxX,minZ,maxZ,minY,maxY)=>Object.freeze({id:'rest-alcove-'+id,chartId:0,phase:'wrong-return',region:'wrong-return',
  minX,maxX,minZ,maxZ,minY,maxY,role:'rest-alcove',material:'wood'});
export const SOURCE_REST_ALCOVE_SOLIDS=Object.freeze([
  // Keep the earlier east-to-refuge walk at z=-20 and the return portal's
  // x=0 centre unobstructed. This enclosure uses the northern corner only.
  wall('south-return',.72,1.78,-20.45,-20.31,8.4,11.2),
  wall('west-sill',.36,.50,-22.45,-20.45,8.4,8.78),
  wall('west-head',.36,.50,-22.45,-20.45,10.75,11.2),
  wall('west-north-jamb',.36,.50,-22.45,-21.95,8.4,11.2),
  wall('west-south-jamb',.36,.50,-20.65,-20.45,8.4,11.2),
  wall('east-back',2.10,2.25,-22.45,-20.45,8.4,11.2),
]);
