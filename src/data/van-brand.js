// Company paint follows real panels and articulated leaves, never a new shell.
export {VAN_BRAND_COPY,VAN_BRAND_VIEWBOX} from './van-brand-art.js';
export const VAN_BRAND_PACK='assets/van-brand.glb';
const surface=value=>Object.freeze(value);
const side=(surfaceX,centerY,centerZ,widthM,heightM)=>surface({kind:'side',surfaceX,centerY,centerZ,widthM,heightM,copies:2});
// Rear identities remain on their own leaf. A whole mark on each yard leaf is
// legible while closed, half-open or fully open, without paint spanning a hinge.
const rear=(surfaceZ,centerX,centerY,widthM,heightM,normal=1)=>surface({kind:'rear',surfaceZ,centerX,centerY,widthM,heightM,normal,copies:1});
export const VAN_BRAND_FITS=Object.freeze({
 yard:surface({mesh:'van_brand_yard',hostMeshes:Object.freeze(['yard_van']),surfaces:Object.freeze([side(1.045,1.68,.25,2.35,.705)])}),
 drive:surface({mesh:'van_brand_drive',hostMeshes:Object.freeze(['opening_drive_vehicle_body','drive_vehicle_body']),surfaces:Object.freeze([
  side(.965,1.62,1.425,1.70,.510),rear(2.456,0,1.13,1.62,.486)])}),
 yardRearLeft:surface({mesh:'van_brand_yard_rear_l',hostMeshes:Object.freeze(['yard_van_door_l']),surfaces:Object.freeze([rear(.0435,.44,1.43,.62,.186,1)])}),
 yardRearRight:surface({mesh:'van_brand_yard_rear_r',hostMeshes:Object.freeze(['yard_van_door_r']),surfaces:Object.freeze([rear(-.0435,.44,1.43,.62,.186,-1)])}),
});
// These meshes are built from the same paint through the crash deformation.
const wreckFits=Object.freeze([
 {mesh:'van_wreck_brand',hostMeshes:['van_wreck_hull']},
 {mesh:'van_wreck_brand_rear_door',hostMeshes:['van_wreck_rear_door']},
 {mesh:'van_wreck_brand_rear_door_far',hostMeshes:['van_wreck_rear_door_far']},
]);
export const VAN_BRAND_PAINT=Object.freeze({
 frontOffsetM:.0026,thicknessM:.00020,pigmentLayerStepM:.00012,
 roughness:.79,metallic:0,
 printedSurface:Object.freeze({version:1,coverage:'solid',polarity:'dark-on-light',process:'owner-applied spray and brush paint'}),
 letteringFinish:Object.freeze({version:1,profile:'apparatus-stencil',localSpecular:true}),
});
export function vanBrandFit(mesh){return [...Object.values(VAN_BRAND_FITS),...wreckFits].find(fit=>fit.hostMeshes.includes(mesh))||null;}
