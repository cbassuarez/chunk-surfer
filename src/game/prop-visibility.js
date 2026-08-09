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
]);

const INTERIOR_HIDDEN_EXTERIOR_MESHES=new Set([
  'conservatory_west_elevation',
  'conservatory_stair_window',
]);

export function isExteriorObserver({x=0,z=0}={}){
  return x<50||x>128||z<0||z>92;
}

export function isLoadingBaySightlineProp(instance){
  return String(instance?.id||'').startsWith('dock-');
}

export function shouldHideCrossEnvelopeProp(instance,{observerX=0,observerZ=0}={}){
  if(!isExteriorObserver({x:observerX,z:observerZ})){
    return INTERIOR_HIDDEN_EXTERIOR_MESHES.has(instance?.mesh);
  }
  if(EXTERIOR_ELLERY_MESHES.has(instance?.mesh))return false;
  if(isLoadingBaySightlineProp(instance))return false;
  // The exterior hero mesh is the complete visible envelope of Ellery. Large
  // interior structures must not substitute for an exterior elevation through
  // recessed courts. Ordinary yard props live outside this footprint.
  return Number(instance?.x)>=49.5&&Number(instance?.x)<=129.0
    &&Number(instance?.z)>=-.5&&Number(instance?.z)<=93.5;
}
