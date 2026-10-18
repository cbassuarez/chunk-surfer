// World LOD of the existing compiled inspect material. Albedo and pigment
// coverage remain in the unchanged world-pigment atlas; these are linear data.
export const PAPER_WORLD_MATERIAL=Object.freeze({
 version:1,path:'assets/paper/world-material.png',tile:Object.freeze([32,46]),
 channels:Object.freeze({r:'roughness',g:'signed print micro-height around 128',b:'transmission'}),
 heightRangeM:.00036,
 heightBasis:'Authored normal-only calibration: 14 impact codes are about 20 micrometres; no silhouette displacement or measured paper depth is claimed.',
});
