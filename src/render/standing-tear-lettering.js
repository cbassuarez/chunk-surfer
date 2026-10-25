// Actual Ear room pressure ribbons, exported locally so Standing Tear can
// carry different sentences without rebuilding the shared ear-room GLB.
import {STANDING_TEAR_EAR_LETTERING as EAR} from './generated/standing-tear-lettering.js';

export const STANDING_TEAR_LETTERING_PROVENANCE=EAR;
// The Ear room selects pigment for the wall beneath it. Its literal brown
// oxide disappeared into Source's black stock in the final acquisition, so
// this local application uses loaded pale bone pigment in the same matte hand.
// Shape, film relief and roughness remain the authored Ear treatment.
export const STANDING_TEAR_LETTERING_MATERIAL=Object.freeze({...EAR.material,
  name:'stop listening paint / Source pale bone',sourceMaterial:EAR.material.name,
  base:Object.freeze([.82,.76,.63,1])});
export function standingTearEarLetteringGeometry(){
  return EAR.meshes.map(mesh=>({...mesh,kind:'detail',material:'ear-pigment'}));
}
export function standingTearEarLetteringFor(text){return EAR.meshes.find(mesh=>mesh.text===text)||null;}
