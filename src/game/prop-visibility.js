import { isOutdoorZone, ZONE } from '../data/floorplan/legend.js';
import { isPubMeshEnvelopeZone } from '../data/exterior-pub.js';
import { isStationersMeshEnvelopeZone } from '../data/exterior-stationers.js';
import { EXTERIOR_ROOF_ARCHITECTURE_IDS, EXTERIOR_ROOFLINE_MESH } from '../data/exterior-roofline.js';

// Cross-envelope visibility for the authored Ellery prop pack.
//
// Exterior observers see the complete civic-block shell. Interior observers
// see the room dressing. The loading bay is the deliberate exception: it is an
// open loading aperture, so its addressable dock contents remain eligible for
// the depth-tested mesh pass while the player approaches from the yard.

const EXTERIOR_ELLERY_MESHES=new Set([
  'conservatory_west_elevation',
  'conservatory_stair_window',
  'bay_canopy',
  'opening_street_frontage',
  EXTERIOR_ROOFLINE_MESH,
]);

const INTERIOR_HIDDEN_EXTERIOR_MESHES=new Set([
  'conservatory_west_elevation',
  'conservatory_stair_window',
  // Exterior mode cannot draw the ray-marched Get-In walls, so this aligned
  // stand-in closes the room through the open goods doors. Indoors the real
  // floorplan shell takes over and this one must yield without doubling faces.
  'getin_sightline_shell',
]);

// WHICH SIDE OF THE ENVELOPE THE OBSERVER IS ON, asked of the ZONE.
//
// This used to be a bounding box on x/z, and the loading bay apron broke it: the
// apron is authored as weather but stands inside the building's footprint, so
// the box called it interior while the renderer's own test called it exterior —
// and between the two answers the walls and the skin both disappeared. See
// OUTDOOR_ZONES in floorplan/legend.js for the whole account.
export function isExteriorObserver({zone=null}={}){
  return isOutdoorZone(zone)||isPubMeshEnvelopeZone(zone)||isStationersMeshEnvelopeZone(zone);
}

// Static submissions depend on both envelope filtering and the roof import.
// A pub/shop uses the civic mesh envelope while remaining indoors; a street
// observer also receives the existing roof architecture. Height-band changes
// within either context do not change this selection and need no prop rebuild.
export function worldPropVisibilityKey({group=null,zone=null}={}){
  return JSON.stringify([group,isExteriorObserver({zone}),isOutdoorZone(zone)]);
}

export function isLoadingBaySightlineProp(instance){
  const id=String(instance?.id||'');
  return id.startsWith('dock-')||id.startsWith('bay-');
}

export function shouldHideCrossEnvelopeProp(instance,{observerZone=null}={}){
  if(['occupation-baths-service-entry','occupation-baths-rainwater'].includes(instance?.id))return false;
  if(String(instance?.id||'').startsWith('building-window-unit-')||instance?.id==='natatorium-end-window')return false;
  if(!isExteriorObserver({zone:observerZone})){
    return INTERIOR_HIDDEN_EXTERIOR_MESHES.has(instance?.mesh);
  }
  if(EXTERIOR_ELLERY_MESHES.has(instance?.mesh))return false;
  if(EXTERIOR_ROOF_ARCHITECTURE_IDS.includes(instance?.id))return false;
  // Roof actors and steel sit inside Ellery's X/Z envelope but above it.
  // Their own depth-writing geometry must survive the exterior shell filter.
  if(observerZone===ZONE.academicRoof&&(
    String(instance?.id||'').startsWith('roof-')
    ||String(instance?.id||'').startsWith('academic-roof-')
    ||Number(instance?.y)>=16.7
  ))return false;
  if(isLoadingBaySightlineProp(instance))return false;
  // The exterior hero mesh is the complete visible envelope of Ellery. Large
  // interior structures must not substitute for an exterior elevation through
  // recessed courts. Ordinary yard props live outside this footprint.
  return Number(instance?.x)>=49.5&&Number(instance?.x)<=129.0
    &&Number(instance?.z)>=-.5&&Number(instance?.z)<=93.5;
}
