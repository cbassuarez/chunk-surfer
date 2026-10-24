// Original retained ornament on the stair hall's measured masonry faces.
// The separate optional pack leaves the existing stair and every route surface
// authoritative. Its one origin is shared with the open-well hero mesh.
export const MAIN_STAIR_WALL_PACK='assets/conservatory-stair-walls.glb';
export const MAIN_STAIR_WALL_MESHES=Object.freeze({
  main_stair_wall_treatment:Object.freeze({w:10,d:13.2,h:13.6,blocks:false}),
});
export const MAIN_STAIR_WALL_PROPS=Object.freeze([
  Object.freeze({id:'main-stair-retained-wall-ornament',mesh:'main_stair_wall_treatment',
    x:139,y:29,yaw:0,scale:1,renderOffsetX:1,renderOffsetZ:2,floorOverride:0,
    renderGroups:Object.freeze(['ground','upper','academic']),
    interactive:false,blocks:false,structural:true}),
]);
