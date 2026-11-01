// The rear public room gives way to an outdoor court, crossed by one enclosed
// greenhouse. These are physical metres, shared by the final mesh builders.
export const ELLERY_COURTYARD_SKY=Object.freeze({x0:77,x1:94,z0:15,z1:27});
export const ELLERY_COURTYARD_GROUND=Object.freeze({x0:74,x1:95,z0:15,z1:27});
export const ELLERY_COURTYARD_SERVICE_ARCH=Object.freeze({x0:49,x1:74,z0:19,z1:22});

// Each architectural mesh has one actual ordinary-world placement. Generic
// furniture is never clipped: its individual placements are moved instead.
export const ELLERY_COURTYARD_ARCHITECTURE=Object.freeze({
  conservatory_west_elevation:{anchor:[50,0,7.5],ground:true},
  front_atrium_perimeter_relief:{anchor:[85.5,0,15],ground:true},
  atrium_public_fittings:{anchor:[85.5,0,15],ground:true},
  academic_atrium_structure:{anchor:[85,10,15]},
  academic_skylight:{anchor:[85,10,15]},
  academic_roof_structure:{anchor:[85,17,15.5]},
  academic_roof_glazing:{anchor:[84,17,14.5]},
  gallery_atrium_structure:{anchor:[85,10,15]},
  gallery_floor:{anchor:[85,10,15]},
});

export function courtyardMeshCuts(mesh){
  const spec=ELLERY_COURTYARD_ARCHITECTURE[mesh];if(!spec)return[];
  const world=[{min:[77,5.3,15],max:[94,40,27]}];
  if(spec.ground)world.push({min:[74.01,.03,15.01],max:[94.99,9.49,26.99]});
  if(mesh==='conservatory_west_elevation')world.push({min:[49,-.05,19],max:[74,4.01,22]});
  return world.map(box=>({min:box.min.map((v,k)=>v-spec.anchor[k]),max:box.max.map((v,k)=>v-spec.anchor[k])}));
}

export function courtyardPlacement(prop){
  // Retire the old rear-atrium furniture without touching the named interactors
  // elsewhere in Ellery. The hallway's eastern return remains enclosed.
  if(['atrium-banner-west','atrium-banner-east','atrium-lantern-south','atrium-waiting-rug','atrium-closing-notice'].includes(prop.id))return null;
  return prop;
}
