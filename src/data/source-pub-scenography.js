// Cold, unfinished pieces for the optional Source Lyric. No opaque whole-room
// mesh can sit below an opening: the renderer places separate supported decks.
export const SOURCE_PUB_SCENOGRAPHY_ASSET='assets/source-pub-scenography.glb';
export const SOURCE_PUB_SCENOGRAPHY_MESHES=Object.freeze({
  fittings:'source_pub_cold_fittings',deck:'source_pub_deck',joist:'source_pub_joist',bay:'source_pub_unfinished_bay',
  cask:'source_pub_cask',panel:'source_pub_loose_panel',practical:'source_pub_cold_practical',
  emptyTray:'source_pub_bare_tray',singleTray:'source_pub_single_water_tray',waterGlass:'source_pub_clean_water_glass',
});
export const SOURCE_PUB_SCENOGRAPHY=Object.freeze({
  asset:SOURCE_PUB_SCENOGRAPHY_ASSET,meshes:SOURCE_PUB_SCENOGRAPHY_MESHES,
  coordinateSpace:'source-pub-local-metres',floorThickness:.16,baySpacing:2.4,wallHeight:3.42,
  cask:{radius:.378,height:.873,stackPitch:.87},maximumVisibleCasks:168,maximumTriangles:14000,maximumBytes:1600000,
  protectedPacks:['public/assets/conservatory-props.glb','public/assets/pub-characters.glb','public/assets/pub-quest-props.glb','public/assets/pub-hospitality.glb'],
});

// Four non-overlapping deck rectangles leave an honest square opening. No
// floor or joist is emitted across its interior; the lower room is visible.
export function sourcePubDeckRectangles(length,depth,hole=null){
  if(!hole)return[{x0:0,x1:length,z0:0,z1:depth}];
  const r=hole.radius,x0=Math.max(0,hole.x-r),x1=Math.min(length,hole.x+r),z0=Math.max(0,hole.z-r),z1=Math.min(depth,hole.z+r);
  return[{x0:0,x1:x0,z0:0,z1:depth},{x0:x1,x1:length,z0:0,z1:depth},{x0,x1,z0:0,z1:z0},{x0,x1,z0:z1,z1:depth}].filter(p=>p.x1-p.x0>.001&&p.z1-p.z0>.001);
}
