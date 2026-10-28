import { isOutdoorZone, ZONE } from '../data/floorplan/legend.js';
import { isPubMeshEnvelopeZone } from '../data/exterior-pub.js';
import { isStationersMeshEnvelopeZone } from '../data/exterior-stationers.js';
import { EXTERIOR_ROOF_ARCHITECTURE_IDS, EXTERIOR_ROOFLINE_MESH } from '../data/exterior-roofline.js';
import {GLASS_COURT as C} from '../data/glass-court.js';
import {GLASS_COURT_SIGHTLINES as S} from '../data/glass-court-sightlines.js';
import {buildingWindowInteriorPlane,buildingWindowPortal} from '../world/building-window-views.js';

// Cross-envelope visibility for the authored Ellery prop pack.
//
// Exterior observers see the complete civic-block shell. Interior observers
// see the room dressing. The loading bay is the deliberate exception: it is an
// open loading aperture, so its addressable dock contents remain eligible for
// the depth-tested mesh pass while the player approaches from the yard.

const EXTERIOR_ELLERY_MESHES=new Set([
  'ellery_public_front','ellery_public_forecourt',
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
export function worldPropVisibilityKey({group=null,zone=null,exteriorWindowId=null}={}){
  const key=[group,isExteriorObserver({zone}),isOutdoorZone(zone)];
  if(exteriorWindowId)key.push(exteriorWindowId);
  return JSON.stringify(key);
}

const FRAMED_INTERIOR_MESHES=new Set([
  ...C.meshNames,C.entranceFixtures.mesh,
  'front_atrium_perimeter_relief','atrium_public_fittings',
  'academic_atrium_structure','academic_skylight',
]);

export function isBuildingWindowInterior(instance,window){
  if(window?.id===S.windowId&&instance?.id==='ellery-baths-high-fanlight')return true;
  if(window?.id!==S.windowId)return false;
  // The ordinary-looking public view does not expose the hostile planted
  // bodies; their expressions live only on the visitor's side of the glass.
  if(String(instance?.id||'').startsWith('glass-court-planted-'))return false;
  if(FRAMED_INTERIOR_MESHES.has(instance?.mesh))return true;
  if(['pool-lobby','glasshouse-changing','changing-pool'].includes(instance?.doorId))return true;
  if(![ZONE.foyer,ZONE.natatorium,ZONE.glasshouse,ZONE.poolChanging].includes(instance?.zone))return false;
  return Number(instance.y)<9.5&&S.enclosures.some(r=>instance.x>=r.x0&&instance.x<r.x1&&instance.z>=r.z0&&instance.z<r.z1);
}

export function buildingWindowInteriorInstance(instance,window){
  if(!isBuildingWindowInterior(instance,window))return null;
  return{...instance,exteriorClipPlane:buildingWindowInteriorPlane(window),
    exteriorPortal:buildingWindowPortal(window),noShadow:true};
}

export function isLoadingBaySightlineProp(instance){
  const id=String(instance?.id||'');
  return id.startsWith('dock-')||id.startsWith('bay-');
}

export function shouldHideCrossEnvelopeProp(instance,{observerZone=null,exteriorWindow=null}={}){
  if(['occupation-baths-service-entry','occupation-baths-rainwater'].includes(instance?.id))return false;
  if(String(instance?.id||'').startsWith('building-window-unit-')||instance?.id==='natatorium-end-window')return false;
  if(!isExteriorObserver({zone:observerZone})){
    return INTERIOR_HIDDEN_EXTERIOR_MESHES.has(instance?.mesh);
  }
  // The caller must use buildingWindowInteriorInstance for these retained
  // submissions. Its exact portal clips every fragment to the real W3 opening.
  if(isBuildingWindowInterior(instance,exteriorWindow))return false;
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
