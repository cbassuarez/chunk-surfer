// Reserved material identity in the acquired mark plane. Grain uses 0/.5/1;
// apparition coverage uses .70-.84. Keep this exact through the RGBA8 targets.
export const FIRE_ESCAPE_INK_BYTE=237;
export const FIRE_ESCAPE_INK_TAG=FIRE_ESCAPE_INK_BYTE/255;
export const FIRE_ESCAPE_INK_GLSL=`
const float FIRE_ESCAPE_INK_TAG=237.0/255.0;
float fireEscapeInkTag(float value){
  return 1.0-step(1.5/255.0,abs(value-FIRE_ESCAPE_INK_TAG));
}
`;
