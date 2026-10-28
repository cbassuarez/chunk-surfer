// Pigment on the existing four court walls, in their local metre frames.
// No new collision or wall panels: the marks sit just in front of the masonry.
export const EXTERIOR_GRAFFITI_PACK = '/assets/exterior-graffiti.glb';
export const EXTERIOR_GRAFFITI_COURTS = Object.freeze([
  {id:'north',x:78,z:-15,yaw:Math.PI,scaleZ:13/16},
  {id:'south',x:86,z:107,yaw:0,scaleZ:1},
  {id:'west',x:-15,z:24,yaw:Math.PI/2,scaleZ:15/16},
  {id:'east',x:143,z:16,yaw:-Math.PI/2,scaleZ:20/16},
].map(Object.freeze));
export const EXTERIOR_GRAFFITI_MESHES = Object.freeze(Object.fromEntries(
  EXTERIOR_GRAFFITI_COURTS.map(({id})=>[`exterior_graffiti_${id}`,{w:9,d:16,h:2.4,blocks:false}]),
));

// Side determines the inward-facing surface. Positions fit between the real
// doors (the opposite wall reverses their local Z coordinates).
export const EXTERIOR_GRAFFITI_MARKS = Object.freeze({
  north:[[-1,4.50,1.20,'MOTH',0],[1,7.15,1.28,'LARK',1],[-1,8.75,1.22,'VEX',2],[1,11.42,1.15,'NIX',0]],
  south:[[-1,4.48,1.25,'ROOK',2],[1,7.12,1.22,'KITE',0],[-1,8.73,1.20,'DUST',1],[1,11.40,1.24,'MOTH',2]],
  west:[[-1,4.52,1.24,'NIX',1],[1,7.16,1.20,'VEX',2],[-1,8.76,1.28,'REEL',0],[1,11.43,1.18,'ROOK',1]],
  east:[[-1,4.49,1.19,'KITE',0],[1,7.14,1.26,'DUST',2],[-1,8.72,1.20,'LARK',1],[1,11.39,1.25,'REEL',2]],
});
