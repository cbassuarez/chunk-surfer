// A whitelisted view of already submitted Source geometry. This exports no
// framebuffer, world catalogue, saves, microphone data or new scene owner.
import {cameraBasis} from './camera-basis.js';
import {sourceRestCubeGeometryLibrary} from './source-rest-cube-models.js';
import {sourceRestHarpsichordGeometryLibrary} from './source-rest-harpsichord-models.js';
import {sourceRestHarpsichordBoardGeometry} from './source-rest-harpsichord-board.js';
import {sourceRestGeometryLibrary} from './source-rest-models.js';
import {SOURCE_REST_SEATS} from '../game/source-rest-seat.js';

const prefix='source-continuation-';
export const SOURCE_REST_APERTURE_GEOMETRY_LIMIT=24;
let library=null;
function models(){return library||=(
  {...sourceRestCubeGeometryLibrary(),...sourceRestHarpsichordGeometryLibrary(),...sourceRestGeometryLibrary(),
    'rest-harpsichord-soundboard':sourceRestHarpsichordBoardGeometry()});}
// A narrow catalogue seam for the child-window upload compiler. It cannot
// request the rest of the world, and caller-provided substitute arrays are
// never authority for an architectural mesh.
export function sourceRestApertureMesh(name){
  return typeof name==='string'&&/^(rest-note-cube-|rest-harpsichord-)/.test(name)?models()[name]||null:null;
}
const matrixValid=m=>m?.length===16&&Array.from(m).every(Number.isFinite);
const priority=(part,phase)=>{
  if(phase==='catch'){
    const index=['strings','case','lining','bridge','soundboard','beading','manual-bed','naturals','accidentals','wrestplank','pins','lid','lid-prop','rose'].indexOf(part.restHarpsichordPart);
    return index<0?99:index;
  }
  return String(part.mesh).endsWith('-core')?0:String(part.mesh).endsWith('-chamber')?1:String(part.mesh).endsWith('-cell')?2:3;
};

export function sourceRestApertureFrame(frame,state,{anchor={x:0,y:0,z:0},viewport=null}={}){
  const seat=SOURCE_REST_SEATS.find(s=>s.phase===state?.phase);
  if(!frame||!seat||state?.chartId!==seat.chartId||!state.sourceRestView
    ||!['sitting','seated'].includes(state.sourceRestView.mode)||state.sourceRestView.degradation>=.95)return null;
  const catalogue=models(),seen=new Set(),geometry=[];
  const selected=(frame.props||[]).filter(p=>!p.portalDestination&&!p.portalFragment&&!p.restReturnDestination&&!p.restBody
    &&(state.phase==='catch'?typeof p.restHarpsichordPart==='string':p.restNoteArchitecture))
    .sort((a,b)=>priority(a,state.phase)-priority(b,state.phase));
  for(const part of selected){
    const mesh=String(part.mesh||'').replace(prefix,''),g=catalogue[mesh];
    if(!g?.p?.length||!g?.i?.length||!matrixValid(part.matrix)||seen.has(part.id))continue;
    // Complete instrument batches include all six string banks and the real
    // opaque lids/ribs. They must be present to occlude a background film.
    // The older CPU preview still owns its own smaller raster-work budget.
    if(state.phase!=='catch'&&geometry.filter(p=>p.mesh===mesh).length>=(mesh.endsWith('-wing')?2:1))continue;
    seen.add(part.id);geometry.push({id:part.id,mesh,p:g.p,i:g.i,base:g.base||[.45,.43,.33,1],
      matrix:Array.from(part.matrix),role:part.restHarpsichordPart||mesh.replace('rest-note-cube-',''),
      register:part.restHarpsichordRegister||null,reactive:part.restHarpsichordReactive||null});
    if(geometry.length===SOURCE_REST_APERTURE_GEOMETRY_LIMIT)break;
  }
  if(!geometry.length)return null;
  const music=state.sourceRestView;
  const width=Number(viewport?.width)>0?Number(viewport.width):16,height=Number(viewport?.height)>0?Number(viewport.height):9,
    tanHalfFov=Number(viewport?.tanHalfFov)>0?Number(viewport.tanHalfFov):.95;
  return{phase:state.phase,mediaTime:Number(music.musicTime)||0,signal:Number(music.musicSignal)||0,
    degradation:Math.max(0,Math.min(1,Number(music.degradation)||0)),
    narrativeProgress:Math.max(0,Math.min(1,Number(music.narrativeProgress??music.degradation)||0)),
    viewport:{width,height,aspect:width/height,tanHalfFov,supplied:!!viewport},
    revoicing:music.musicRevoicing||null,eye:[...frame.eye],basis:cameraBasis(frame.yaw,frame.pitch),
    seat:{x:seat.x+(anchor.x||0),feet:seat.feet+(anchor.y||0),z:seat.z+(anchor.z||0)},geometry};
}
