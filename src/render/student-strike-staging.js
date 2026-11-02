// Student-strike set dressing uses the ordinary renderer, world plan and pack.
// It owns no player, scene, door, save, audio, input or WebGL context.
import * as FP from '../world/floorplan.js';
import * as PROPS from '../game/props.js';
import {CELL,ZONE} from '../data/floorplan/legend.js';
import {STUDENT_STRIKE_FILM} from '../data/student-strike-film.js';
import {resolveLightingContext,resolveLocalLights,lightRigFor} from '../data/conservatory-lights.js';
import {nativeStudentStrikeActors} from '../game/student-strike-timeline.js';
import {installStudentStrikeRecoveryProps,installStudentStrikeFood,RECOVERY_CLOTH_MESH} from './student-strike-props.js';

const preparation=new WeakMap();
const REQUIRED=['academic_society_odette','academic_society_agathe','academic_population_listener','academic_population_attendant',
  'upright_piano','piano_bench','school_desk','instrument_case','ending_body_prone','loose_note','textile_drugget_stage',
  RECOVERY_CLOTH_MESH,'student_strike_bread_plate',...STUDENT_STRIKE_FILM.records.map(r=>r.mesh)];
const PACKS=[{"url":"/assets/academic-gallery.glb","character":false,"meshes":["gallery_atrium_structure","gallery_floor","gallery_wall_bay","gallery_bust_plinth","gallery_bench","gallery_planter","gallery_fragment","gallery_roof_threshold","gallery_console_north","gallery_console_south"]},{"url":"/assets/conservatory-doors.glb","character":false,"meshes":["door_frame_pair","door_frame_hall","door_frame_single_steel","door_frame_single_oak","door_frame_tower","door_head_infill","door_head_overpanel","door_head_tympanum","door_head_tower","door_head_goods","door_head_transom","door_sealed_scar","door_debug_aperture","door_debug_hinge","door_debug_swing","door_leaf_service","door_leaf_practice","door_leaf_staff","door_leaf_pool","door_leaf_pool_pair","door_leaf_public","door_leaf_hall","door_leaf_chapel","door_leaf_tower","door_leaf_bay_goods","door_frame_goods"]},{"url":"/assets/conservatory-textiles.glb","character":false,"meshes":["textile_drugget_run","textile_drugget_stage","textile_stair_runner","textile_corridor_runner","atrium_waiting_rug","textile_chapel_runner","textile_rolled","textile_studio_carpet"]},{"url":"/assets/academic-society-characters.glb","character":true,"meshes":["academic_society_celeste","academic_society_emile","academic_society_odette","academic_society_lucien","academic_society_agathe","academic_society_noe","academic_society_sabine","academic_population_attendant","academic_population_listener","academic_population_hollow_coat","academic_population_unfinished_visitor"]},{"url":"/assets/exterior-frontages.glb","character":false,"meshes":["district_terrace_frontage","district_workshop_frontage","district_passage_frontage","ellery_square_north_terrace","ellery_square_side_terrace","ellery_square_west_terrace","district_court_walls","district_west_row_a_trade","district_west_row_b_trade","district_east_row_a_trade","district_east_row_b_trade","district_north_row_a_trade","district_north_row_c_trade","district_south_row_b_trade","ellery_square_west_trade","district_south_row_c_trade"]},{"url":"/assets/exterior-stationers.glb","character":false,"meshes":["ellery_square_west_terrace_stationer","exterior_stationers_room"]},{"url":"/assets/exterior-street-fabric.glb","character":false,"meshes":["exterior_street_kerbs","exterior_street_crossings","exterior_street_markings","exterior_street_services","exterior_street_nameplates","exterior_street_wall_services"]},{"url":"/assets/ellery-public-front.glb","character":false,"meshes":["conservatory_west_elevation","ellery_public_front","ellery_public_forecourt","ellery_baths_fanlight"]},{"url":"/assets/ellery-exterior-roofline.glb","character":false,"meshes":["ellery_west_roofline_closure"]},{"url":"/assets/opening-street.glb","character":false,"meshes":["opening_street_ground","opening_street_frontage","opening_street_service_history","opening_street_review_plate","opening_street_tree_small"]},{"url":"/assets/vegetation.glb","character":false,"meshes":["yard_hedge_run","yard_hedge_run_lod1","yard_hedge_run_lod2","yard_hedge_dense","yard_hedge_dense_lod1","yard_hedge_dense_lod2","yard_hedge_corner","yard_hedge_corner_lod1","yard_hedge_corner_lod2","opening_park_laurel","opening_park_laurel_lod1","opening_park_laurel_lod2","opening_street_tree_small","opening_street_tree_small_lod1","opening_street_tree_small_lod2","opening_street_tree_small_b","opening_street_tree_small_b_lod1","opening_street_tree_small_b_lod2","opening_street_tree_small_c","opening_street_tree_small_c_lod1","opening_street_tree_small_c_lod2","vegetation_nettle_cluster","vegetation_nettle_cluster_lod1","vegetation_nettle_cluster_lod2","vegetation_weed_cluster","vegetation_weed_cluster_lod1","vegetation_weed_cluster_lod2","vegetation_grass_edge","vegetation_grass_edge_lod1","vegetation_grass_edge_lod2","vegetation_leaf_scatter","vegetation_leaf_scatter_lod1","vegetation_leaf_scatter_lod2","academic_planter","academic_dead_tree","academic_dead_tree_lod1","academic_dead_tree_lod2","academic_dead_tree_b","academic_dead_tree_b_lod1","academic_dead_tree_b_lod2","academic_leaf_litter","academic_leaf_litter_lod1","academic_leaf_litter_lod2"]}];
const FACE_RETURNS={
  S03:[{id:'strike-piano-window-return',position:[53.1,11.95,6.2],color:[1,.87,.70],intensity:2.6,radius:6,penetration:.05},
    {id:'strike-piano-camera-return',position:[56.0,11.9,6.7],color:[.90,.92,1],intensity:1.1,radius:4.5,penetration:.04}],
  S04:[{id:'strike-peer-window-return',position:[56.2,12.0,6.2],color:[1,.87,.70],intensity:2.6,radius:6.5,penetration:.05},
    {id:'strike-peer-camera-return',position:[60.2,12.0,6.8],color:[.90,.92,1],intensity:1.1,radius:4.5,penetration:.04}],
};
let renderer=null;
const lightingAnchors=new Map();
const zoneNumber=value=>Number.isFinite(value)?value:ZONE[value];
export const shouldStageStudentStrike=frame=>!!frame&&frame.seconds<59&&!frame.nativeReturn&&frame.stage!=='return';

// Must be called after the ordinary base pack is ready. Failure remains
// retryable, and a rebuilt/lost native catalog is not mistaken for readiness.
export async function prepareStudentStrikeAssets({propsRenderer}={}){
  const p=propsRenderer||await import('./props3d.js');
  if(typeof p.propMeshCatalog!=='function'||!p.propMeshCatalog().length)throw Error('The ordinary native prop pack is not ready.');
  const prior=preparation.get(p),catalog=new Set(p.propMeshCatalog());
  if(prior&&(!prior.ready||REQUIRED.every(name=>catalog.has(name))))return prior.promise;
  const entry={ready:false,promise:null};
  entry.promise=(async()=>{
    const results=await Promise.allSettled(PACKS.filter(pack=>!pack.meshes.every(name=>catalog.has(name))).map(pack=>{
      const method=pack.character?'addCharacterPack':'addPropPack';
      if(typeof p[method]!=='function')throw Error('Missing native '+method+' loader.');
      return p[method](pack.url);
    }));
    const failures=results.filter(r=>r.status==='rejected');
    if(failures.length)throw Error('Student-strike assets unavailable: '+failures.map(r=>String(r.reason?.message||r.reason)).join('; '));
    if(typeof p.installAuthoredPropMeshes!=='function')throw Error('Native authored prop installation is unavailable.');
    const installed=p.installAuthoredPropMeshes((gl,pack)=>{
      const recovery=installStudentStrikeRecoveryProps(gl,pack,{records:STUDENT_STRIKE_FILM.records});
      installStudentStrikeFood(gl,pack);return recovery;
    });
    const names=new Set(p.propMeshCatalog()),missing=REQUIRED.filter(name=>!names.has(name));
    if(missing.length)throw Error('Student-strike native meshes unavailable: '+missing.join(', '));
    renderer=p;lightingAnchors.clear();entry.ready=true;
    return{ready:true,requiredMeshes:[...REQUIRED],installed};
  })();
  preparation.set(p,entry);
  try{return await entry.promise;}catch(error){if(preparation.get(p)===entry)preparation.delete(p);throw error;}
}

export function studentStrikeActors(frame,voiceActorId=null){
  if(!shouldStageStudentStrike(frame))return[];
  return nativeStudentStrikeActors(frame,{voiceActorId}).map(instance=>({...instance,zone:frame.zone}));
}
const movingObject=object=>object.id==='offered-bread'||!!object.motion;
export function studentStrikeDynamicProps(frame,voiceActorId=null){
  if(!shouldStageStudentStrike(frame))return[];
  return[...studentStrikeActors(frame,voiceActorId),...(frame.objects||[]).filter(movingObject).map(p=>({...p,zone:zoneNumber(p.zone)??frame.zone,structural:false}))];
}

export function studentStrikeStaticProps(frame,baseStatic=null){
  if(!shouldStageStudentStrike(frame))return null;
  if(!renderer)throw Error('Prepare the student-strike assets before staging.');
  const names=new Set(renderer.propMeshCatalog());
  const instances=baseStatic||PROPS.renderInstances({group:frame.renderGroup,inscriptions:true,batchDressing:false});
  const replaced=new Set((frame.actors||[]).map(actor=>'academic-person-'+(actor.sourceActorId||actor.id)));
  const hidden=new Set(frame.hidePropIds||[]);
  const out=instances.filter(p=>!replaced.has(p.id)&&!hidden.has(p.id)&&(names.has(p.mesh)||names.has(p.fallbackMesh)));
  for(const p of (frame.objects||[]).filter(p=>!movingObject(p))){
    if(!names.has(p.mesh))throw Error('Student-strike dressing mesh is missing: '+p.mesh);
    out.push({...p,zone:zoneNumber(p.zone)??frame.zone,structural:false});
  }
  return out;
}

export function studentStrikeLighting(frame,{ordinaryContext=null,ordinaryLights=[]}={}){
  if(!shouldStageStudentStrike(frame))return{active:false,context:ordinaryContext,lights:ordinaryLights};
  const base=resolveLightingContext({group:frame.renderGroup,zone:frame.zone,spaceId:frame.spaceId}),override=frame.lightingOverride||{};
  const context={...base,...(Number.isFinite(override.ambientIntensity)?{ambientIntensity:override.ambientIntensity}:{}),
    ...(Number.isFinite(override.bounceIntensity)?{bounce:{color:base.ambientColor,intensity:override.bounceIntensity}}:{})};
  if(!lightingAnchors.has(frame.renderGroup))lightingAnchors.set(frame.renderGroup,new Map(PROPS.renderInstances({group:frame.renderGroup,inscriptions:false,batchDressing:false}).map(p=>[p.id,p])));
  const props=lightingAnchors.get(frame.renderGroup);
  const nativeLights=resolveLocalLights(base,{timeSec:frame.performanceSeconds,reducedFlash:true,
    origin:{x:frame.camera.eye[0],y:frame.camera.eye[1],z:frame.camera.eye[2]},towerActive:frame.towerActive,
    towerCleared:false,liveCircuits:new Set((lightRigFor(frame.renderGroup)||[]).map(l=>l.circuit).filter(Boolean)),slots:12,
    anchorPosition:id=>{const p=props.get(id);if(!p)return null;const authored=PROPS.propById(id);
      return{...p,floorY:Number.isFinite(authored?.floor)?authored.floor:frame.floorH};}});
  const authored=[...(override.lights||[]),...(FACE_RETURNS[frame.shotId]||[])].map(l=>({...l,x:l.position?.[0]??l.x,y:l.position?.[1]??l.y,z:l.position?.[2]??l.z}));
  const lights=[...authored,...nativeLights.map(l=>({...l,intensity:l.intensity*(override.nativeLightScales?.[l.id]??1)}))].slice(0,12);
  return{active:true,context,lights};
}

export function studentStrikeGate(frame,{width=960,height=480}={}){
  width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);
  if(!shouldStageStudentStrike(frame))return{active:false,bars:[],activeRect:{x:0,y:0,width,height},lens:null};
  const w=Math.min(width,height*2),h=w/2,x=(width-w)/2,y=(height-h)/2,bars=[];
  if(y>0){bars.push({x:0,y:0,width,height:y},{x:0,y:y+h,width,height:height-y-h});}
  if(x>0){bars.push({x:0,y:0,width:x,height},{x:x+w,y:0,width:width-x-w,height});}
  return{active:true,bars,activeRect:{x,y,width:w,height:h},lens:frame.camera.lens?{...frame.camera.lens,sensorHeightMm:12.445*Math.max(1,2/(width/height))}:null};
}

export function studentStrikeWorldView(frame,{fp=FP,aspect=2}={}){
  if(!shouldStageStudentStrike(frame))return null;
  const {eye}=frame.camera;
  const logical=fp.logicalAtPhysical(eye[0]/CELL,eye[2]/CELL,{group:frame.renderGroup,floor:frame.floorH});
  if(!logical||logical.renderGroup!==frame.renderGroup||Math.abs(logical.floor-frame.floorH)>.035||fp.isSolid(logical.x,logical.y))
    throw Error('Student-strike camera has no supported '+frame.renderGroup+' observer.');
  if(eye[1]<=logical.floor+.015||eye[1]>=logical.ceil-.015)throw Error('Student-strike camera lies outside the supported vertical span.');
  if(Number.isFinite(frame.zone)&&logical.zone!==frame.zone)throw Error('Student-strike camera zone differs from the authored scene.');
  const scale=Math.max(1,2/(Number(aspect)||2)),authoredCamera={...frame.camera,eye:[...eye],tanHalfFov:frame.camera.tanHalfFov*scale,
    lens:frame.camera.lens?{...frame.camera.lens,sensorHeightMm:frame.camera.lens.sensorHeightMm*scale}:null};
  return{x:logical.x,y:logical.y,floorH:eye[1]-1.62,observerFloor:logical.floor,renderGroup:frame.renderGroup,
    yaw:frame.camera.yaw,pitch:frame.camera.pitch,endingShot:true,studentStrike:true,authoredCamera,
    suppressActors:true,cinematicLensStage:'post-print',sensoryProfile:'story',shotId:frame.shotId};
}
