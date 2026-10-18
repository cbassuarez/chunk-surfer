// Authored anchors in academic_roof_structure's LOCAL metre coordinates.
// Each separate carving mesh is centred on its own swivel pivot, with +Z
// forward. Compose these with the actual structure instance, not a duplicated
// world origin. Rest yaw uses the ordinary prop convention: +Z -> [-sin,cos].
export const ROOF_WATCHERS=Object.freeze([
  {id:'roof-watcher-foliate',kind:'foliate',mesh:'academic_roof_watcher_foliate',
    localPivot:[-11.10,3.99,-6],restYaw:-Math.PI/2,maxYaw:Math.PI/15,profile:'relief',seed:17},
  {id:'roof-watcher-hound',kind:'hound',mesh:'academic_roof_watcher_hound',
    localPivot:[-11.38,5.06,-3],restYaw:-Math.PI/2,maxYaw:Math.PI/9,profile:'animal',seed:31},
  {id:'roof-watcher-owl',kind:'owl',mesh:'academic_roof_watcher_owl',
    localPivot:[11.475,5.07,3],restYaw:Math.PI/2,maxYaw:Math.PI/9,profile:'animal',seed:53},
].map(value=>Object.freeze({...value,localPivot:Object.freeze(value.localPivot)})));

export const ROOF_WATCHERS_BY_ID=Object.freeze(Object.fromEntries(ROOF_WATCHERS.map(w=>[w.id,w])));
