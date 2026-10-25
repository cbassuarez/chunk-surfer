// Shared by the finite Source I masonry, Wrong Return/The Catch and Source IV.
// The room still consists of real opaque depth-winning meshes with the exact
// source clauses. Blue stock never replaces a dangerous void with a surface.
import {sourcePrintMaps,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {SOURCE_BLUEPRINT,SOURCE_BLUEPRINT_PRINT_SURFACE,sourceBlueprintEnabled} from './source-blueprint-contract.js';

export function sourceBlueprintMaps(gl,{enabled=sourceBlueprintEnabled()}={}){
  const maps=sourcePrintMaps(gl,enabled?'blueprint':'divide');
  return {...maps,blueprint:enabled,printedSurface:enabled?SOURCE_BLUEPRINT_PRINT_SURFACE:SOURCE_PRINT_SURFACE};
}
export function sourceBlueprintMaterial(maps,{base=[.62,.66,.59,1]}={}){
  const blueprint=maps?.blueprint??sourceBlueprintEnabled();
  return {base:blueprint?[...SOURCE_BLUEPRINT.stockFactor]:[...base],
    texture:maps.texture,normalTexture:maps.normalTexture,ormTexture:maps.ormTexture,
    letteringFinish:maps.letteringFinish,materialFactors:'gltf',metallic:1,roughness:1,
    printedSurface:blueprint?SOURCE_BLUEPRINT_PRINT_SURFACE:SOURCE_PRINT_SURFACE};
}
export function sourceBlueprintLighting(fallback={}){
  return sourceBlueprintEnabled()?{...fallback,ambientColor:[.62,.72,.80],
    ambientIntensity:Math.max(.10,Number(fallback.ambientIntensity)||0)}:{...fallback};
}
