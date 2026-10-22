// Physical metres, derived from the retained academic roof/atrium contracts.
// The NW rake is art direction for this night, not a measured sun bearing.
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
export const ACADEMIC_ATRIUM_LIGHT=freeze({
  roofY:17,groundY:0,
  aperture:{x0:79,x1:89,z0:8,z1:21},
  void:{x0:79,x1:89,z0:8,z1:21},
  deck:{top:10,bottom:9.5},
  panes:{columns:5,rows:6,firstX:80,firstZ:9.0833,stepX:2,stepZ:2.1667,width:1.90,depth:2.0667},
  // Below-glass primary iron: centreY16.69, .19m square, actual13m runs.
  beams:{xs:[79,83,87,89],y:16.69,halfWidth:.095,z0:8,z1:21},
  leadPatches:[{x0:81.05,x1:82.95,z0:12.38335,z1:14.45005},{x0:87.05,x1:88.95,z0:16.71665,z1:18.78335}],
  direction:{x:-.20,y:-1,z:-.32},
  penumbra:.06,beamPenumbra:.04,deckPenumbra:.025,
  color:[.52,.67,.80],surfaceEnergy:.62,volumeDensity:.022,volumeColor:[.16,.205,.25],volumeCap:.30,volumeSteps:16,
  // Conservative bounding box of all projected aperture points down to grade.
  bounds:{min:[75.6,0,2.56],max:[89,17,21]},
  contextGroups:['ground','academic','academicRoof'],
  provenance:{
    roof:'src/data/academic-roof.js:ACADEMIC_ROOF.glass +roofPointToPhysical',
    glazing:'tools/chunk_surfer/academic-roof-geometry.mjs:academic_roof_glazing',
    retainedGlazing:'public/assets/conservatory-props.glb:academic_roof_glazing',
    atrium:'src/data/academic-gallery-treatment.js:ACADEMIC_GALLERY; compiled front_atrium floor0/ceil17 and academic floor10/underside9.5',
    direction:'Art-directed fixed NW rake; no camera/actor tracking; no time or state clock',
  },
});
