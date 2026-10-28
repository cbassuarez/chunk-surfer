// Authored metre geometry only. The floorplan and door schedule retain all
// containment, aperture, movement and progression authority.
import {CONSERVATORY_DOORS,DOOR_ARCHETYPES} from './conservatory-doors.js';
export const SCENE_DOCK_FABRIC=Object.freeze({
 origin:Object.freeze({x:53,z:7.5}),
 room:Object.freeze({x0:57.25,x1:73.25,z0:3.25,z1:15.25,ceiling:5.5}),
 floorLift:.008,
 clearSpine:Object.freeze({x0:63.5,x1:66.75,z0:7.5,z1:15.25}),
 goodsRun:Object.freeze({x0:57.25,x1:66.75,z0:8.65,z1:11.85}),
});
export const SCENE_DOCK_PORTALS=Object.freeze(['dock-grey-exterior','dock-foyer-service','dock-inner-service'].map(id=>{
 const door=CONSERVATORY_DOORS.find(d=>d.id===id),shape=DOOR_ARCHETYPES[door.archetype];
 return Object.freeze({id,x:door.x,z:door.y,width:shape.aperture.width,height:shape.aperture.height,axis:door.widthAxis});
}));
export const SCENE_DOCK_MESHES=Object.freeze({
 scene_dock_room_fabric:{w:17.2,d:12.8,h:5.5,blocks:false},
 scene_dock_dispatch_desk:{w:1.55,d:.74,h:1.14,blocks:true},
 scene_dock_hand_truck:{w:.62,d:.64,h:1.31,blocks:true},
 scene_dock_freight_crates:{w:.86,d:.72,h:1.62,blocks:true},
 scene_dock_crate_low:{w:1.24,d:.50,h:.46,blocks:false},
 scene_dock_road_case_open:{w:1.2,d:.66,h:.82,blocks:true},
 scene_dock_cable_reel:{w:.92,d:.84,h:1.04,blocks:true},
 scene_dock_shutter_bar:{w:2.36,d:.34,h:1.53,blocks:false},
 scene_dock_chandelier_cage:{w:2.16,d:1.8,h:2.77,blocks:true},
 scene_dock_check_position:{w:1.6,d:1.6,h:.012,blocks:false},
});

export const SCENE_DOCK_COLLIDERS=Object.freeze([
 {id:'scene-dock-maintenance-ledge',kind:'obb',x:70.8,y:4.25,width:2.2,depth:.62,yaw:0,minElevation:0,maxElevation:.83,spaceId:'ground'},
]);
