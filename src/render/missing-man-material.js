// Exact authored material identity, never inferred from dark RGB or opacity.
// Clear of print (112..171), apparition (.68...86), glass225/roof229/iron237.
export const MISSING_MAN_CORE_BYTE=221;
export const MISSING_MAN_CORE_TAG=MISSING_MAN_CORE_BYTE/255;
export const MISSING_MAN_SMOKE_BYTE=245;
export const MISSING_MAN_SMOKE_TAG=MISSING_MAN_SMOKE_BYTE/255;
export const MISSING_MAN_MATERIAL_ROLES=Object.freeze({
  warning_negative_core:'missing-man-core',
  warning_smoke:'missing-man-smoke',
});
export function missingManMaterialRole(primitive={}){
  return MISSING_MAN_MATERIAL_ROLES[primitive.materialName]||primitive.materialRole||null;
}
export function isMissingManCoreTag(value){return Number.isFinite(value)&&Math.abs(value-MISSING_MAN_CORE_TAG)<1.5/255;}
export const MISSING_MAN_MATERIAL_GLSL=`
const float MISSING_MAN_CORE_TAG=221.0/255.0;
const float MISSING_MAN_SMOKE_TAG=245.0/255.0;
float missingManCoreTag(float value){
  return 1.0-step(1.5/255.0,abs(value-MISSING_MAN_CORE_TAG));
}
float missingManSmokeTag(float value){
  return 1.0-step(1.5/255.0,abs(value-MISSING_MAN_SMOKE_TAG));
}
`;
