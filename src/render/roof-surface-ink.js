// Roof zinc, lead and low masonry retain their own dim mineral ink. This is
// material identity, not transparency or an inferred screen-space roof mask.
// Keep clear of grain, apparition coverage and the fire escape's byte 237.
export const ROOF_SURFACE_INK_BYTE=229;
export const ROOF_SURFACE_INK_TAG=ROOF_SURFACE_INK_BYTE/255;
export const ROOF_GLASS_INK_BYTE=225;
export const ROOF_GLASS_INK_TAG=ROOF_GLASS_INK_BYTE/255;
export const ROOF_SURFACE_INK_GLSL=`
const float ROOF_SURFACE_INK_TAG=229.0/255.0;
float roofSurfaceInkTag(float value){
  return 1.0-step(1.5/255.0,abs(value-ROOF_SURFACE_INK_TAG));
}
`;
export const ROOF_GLASS_INK_GLSL=`
const float ROOF_GLASS_INK_TAG=225.0/255.0;
float roofGlassInkTag(float value){
  return 1.0-step(1.5/255.0,abs(value-ROOF_GLASS_INK_TAG));
}
`;
