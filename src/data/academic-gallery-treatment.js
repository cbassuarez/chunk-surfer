// A single integrated gallery treatment. Existing six encounter IDs and their
// state-owned meshes stay authoritative; the optional pack changes presentation.
// Authored metres, gallery base +10m. The atrium remains a real absent floor.
export const ACADEMIC_GALLERY = Object.freeze({
  base:10,ceiling:17,
  void:Object.freeze({x0:79,x1:89,z0:8,z1:21}),
  guard:Object.freeze({west:78.84,east:89.16,north:7.84,south:21.16,height:1.18}),
  plinthSeat:1.11,
});

export const ACADEMIC_GALLERY_MESHES = Object.freeze({
  gallery_atrium_structure:{w:24,d:27,h:11.3,blocks:false},
  gallery_floor:{w:24,d:27,blocks:false},
  gallery_wall_bay:{w:4.26,d:.25,h:6.99,blocks:false},
  gallery_bust_plinth:{w:.68,d:.68,h:1.11,blocks:false},
  gallery_fragment:{w:.8,d:.6,h:.65,blocks:false},
  gallery_bench:{w:2.3,d:.68,h:1.05,blocks:true},
  gallery_planter:{w:.76,d:.76,h:1.25,blocks:true},
  gallery_roof_threshold:{w:2.8,d:.5,h:3.6,blocks:false},
  // The proxy describes the bearing console, not its slender vase/lamp above.
  gallery_console_north:{w:1.8,d:.5,h:.9,blocks:true},
  gallery_console_south:{w:1.8,d:.5,h:.9,blocks:true},
});

const mute={interactive:false,structural:true,renderGroups:['ground','academic'],floorOverride:10};
const prop=(id,mesh,x,y,yaw=0,extra={})=>({id,mesh,x,y,yaw,scale:1,...mute,...extra});
export const ACADEMIC_GALLERY_PROPS = Object.freeze([
  // The safe anchor is on the west walk; the offset registers the mesh with the
  // existing composite structure at world(85,15), rather than in the nav void.
  prop('gallery-treatment-floor','gallery_floor',27,254,0,{renderOffsetX:8,renderOffsetZ:1}),
  ...[250,254,258].map((y,i)=>prop(`gallery-treatment-west-bay-${i+1}`,'gallery_wall_bay',24,y,-Math.PI/2,{renderOffsetX:-.94})),
  prop('gallery-treatment-bench','gallery_bench',24,254,-Math.PI/2,{fallbackMesh:'district_bench'}),
  prop('gallery-treatment-planter-north','gallery_planter',24,249,-.12,{fallbackMesh:'wastebasket'}),
  prop('gallery-treatment-planter-south','gallery_planter',24,259,.32,{scale:.86,fallbackMesh:'wastebasket'}),
  prop('gallery-treatment-console-north','gallery_console_north',24,251,-Math.PI/2,{fallbackMesh:'classic_console_01'}),
  prop('gallery-treatment-console-south','gallery_console_south',24,257,-Math.PI/2,{fallbackMesh:'classic_console_01'}),
  prop('gallery-treatment-roof-threshold','gallery_roof_threshold',44,243,0,{renderOffsetZ:-1}),
]);

// Keep all original mesh names in the game-state layer. This resolver is used
// after the optional pack is installed, including after the socket/eye reducer
// reapplies appearance and the unseen-turn mechanism reapplies its held yaw.
export function academicGalleryMesh(instance,hasMesh=()=>false){
  let mesh=null;
  if(instance.id==='academic-atrium-structure'&&instance.mesh==='academic_atrium_structure')mesh='gallery_atrium_structure';
  else if(/^academic-bust-plinth-[1-6]$/.test(instance.id||'')&&instance.mesh==='academic_bust_plinth')mesh='gallery_bust_plinth';
  else if(instance.id==='academic-bust-fragment-6'&&instance.mesh==='academic_bust_fragment')mesh='gallery_fragment';
  return mesh&&hasMesh(mesh)?mesh:instance.mesh;
}

// Sharing this exact roof instance exposes the supported roof's real underside
// and ribs, with its existing transform. No Ren, roof seating or action is added
// to the gallery. The older, unrelated oversized grid remains visible below.
export function academicGalleryPlacement(prop){
  if(prop.id==='academic-roof-glazing')return{...prop,renderGroups:['academicRoof','academic']};
  if(prop.id==='academic-skylight'||/^academic-frieze-west-[1-3]$/.test(prop.id||''))return{...prop,renderGroups:['ground']};
  if(/^academic-bust-plinth-[1-6]$/.test(prop.id||''))return{...prop,blocks:true,w:.68,d:.68,h:1.11};
  return prop;
}
