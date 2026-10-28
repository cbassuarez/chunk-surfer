// Waiting bays beside the stair routes, in physical metres. Logical anchors
// retain their own floor/island; exact wall planes never come from a logical
// edge of the analytic helix or the open well.
import { gridDrawnHeight } from './main-stair-geometry.js';

const mainGroups=Object.freeze(['ground','upper','academic']);
const basementGroups=Object.freeze(['ground','basement']);
const site=(id,logical,physical,floor,renderGroups,extra={})=>Object.freeze({
  id,logical:Object.freeze(logical),physical:Object.freeze(physical),floor,renderGroups,...extra,
});

export const STAIR_LANDING_SIGN_SITES=Object.freeze({
  'main-basement-stair/ground-landing':site('landing-ground-landing',{x:58,y:24.5},{x:58.2,z:25},0,basementGroups,{normal:Object.freeze({x:0,z:-1})}),
  'main-basement-stair/b3-landing':site('landing-b3-landing',{x:47,y:24.5},{x:46.8,z:25},-4,basementGroups,{normal:Object.freeze({x:0,z:-1})}),
  'main-open-well/upper-floor-landing':site('landing-upper-floor-landing',{x:151,y:50.5},{x:64.2,z:33},4.8,mainGroups,{normal:Object.freeze({x:0,z:1})}),
  'main-open-well/academic-floor-landing':site('landing-academic-floor-landing',{x:152,y:67.5},{x:65.4,z:40.5},10,mainGroups,{normal:Object.freeze({x:0,z:-1})}),
});

export function stairLandingSignPlacement(key,spec){
  const s=STAIR_LANDING_SIGN_SITES[key];if(!s||!spec)return null;
  return{id:s.id,mesh:spec.mesh,x:s.logical.x,y:s.logical.y,scale:1,
    floorOverride:s.floor,renderGroups:s.renderGroups,worldAligned:true,blocks:false,
    mount:'wall',frontAxis:'-z',mountNormal:{nx:s.normal.x,ny:s.normal.z},
    stairLandingWall:{...s.physical,normal:s.normal},elevation:1.6,
    landingLabel:spec.label,inspect:{first:spec.first,again:spec.again}};
}

export const STAIR_LANDING_WAITING_SITES=Object.freeze([
  site('main-ground',{x:143.5,y:34.47},{x:66.5,z:39.47},0,mainGroups,{yaw:0,portrait:site('main-ground',{x:143.5,y:34.5},{x:66.5,z:40},0,mainGroups,{normal:{x:0,z:-1},index:0}),
    clearRoute:Object.freeze({x0:66.25,x1:67.75,z0:32.5,z1:38.75})}),
  site('main-upper',{x:154.5,y:50.45},{x:67.5,z:33.45},4.8,mainGroups,{yaw:Math.PI,portrait:site('main-upper',{x:154.5,y:50.5},{x:67.5,z:33},4.8,mainGroups,{normal:{x:0,z:1},index:1}),
    clearRoute:Object.freeze({x0:66.25,x1:68.25,z0:34.25,z1:37.25})}),
  site('main-academic',{x:154.5,y:67.55},{x:68,z:40.05},10,mainGroups,{yaw:0,portrait:site('main-academic',{x:154.5,y:67.5},{x:68,z:40.5},10,mainGroups,{normal:{x:0,z:-1},index:2}),
    clearRoute:Object.freeze({x0:66.25,x1:68.25,z0:36.25,z1:39.25})}),
  site('basement-head',{x:58.5,y:24.45},{x:58.5,z:24.45},0,basementGroups,{yaw:0,portrait:site('basement-head',{x:58.5,y:22.5},{x:58.5,z:22},0,basementGroups,{normal:{x:0,z:1},index:3}),
    clearRoute:Object.freeze({x0:57,x1:60,z0:22.25,z1:23.75})}),
  site('basement-foot',{x:46.5,y:24.45},{x:46.5,z:24.45},-4,basementGroups,{yaw:0,portrait:site('basement-foot',{x:46.5,y:22.5},{x:46.5,z:22},-4,basementGroups,{normal:{x:0,z:1},index:4}),
    clearRoute:Object.freeze({x0:45,x1:48,z0:22.25,z1:23.75})}),
]);

export const STAIR_LANDING_PROPS=Object.freeze(STAIR_LANDING_WAITING_SITES.flatMap(s=>{
  const p=s.portrait;
  return[
    {id:`stair-waiting-${s.id}-sofa`,mesh:'sofa_01',x:s.logical.x,y:s.logical.y,
      yaw:s.yaw,frontAxis:'-z',scale:1,blocks:true,interactive:false,worldAligned:true,
      floorOverride:s.floor,elevation:gridDrawnHeight(s.floor)-s.floor,renderGroups:s.renderGroups,
      renderOffsetX:s.logical.x-Math.round(s.logical.x*2)/2,
      renderOffsetZ:s.logical.y-Math.round(s.logical.y*2)/2},
    {id:`stair-waiting-${s.id}-portrait`,mesh:'portrait_frame',x:p.logical.x,y:p.logical.y,
      frontAxis:'+z',scale:.85,blocks:false,interactive:false,worldAligned:true,
      floorOverride:p.floor,elevation:1.2,renderGroups:p.renderGroups,portraitIndex:p.index,
      mount:'wall',mountNormal:{nx:p.normal.x,ny:p.normal.z},stairLandingWall:{...p.physical,normal:p.normal}},
  ];
}));
