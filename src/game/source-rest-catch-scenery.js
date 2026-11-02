// The Catch's listening place is an open instrument-case shelter on its real
// refuge, not another copy of the upper loggia or a new supported room.
import {SOURCE_REST_SEATS,SOURCE_REST_SCALE} from './source-rest-seat.js';
import {sourceRestWeather} from './source-rest-weather.js';
import {SOURCE_CONTINUATION} from '../data/source-continuation.js';
import {SOURCE_REST_HARPSICHORD_PARTS,sourceRestHarpsichordGeometryLibrary} from '../render/source-rest-harpsichord-models.js';
import {sourceRestHarpsichordResponse} from './source-rest-harpsichord-response.js';
import {sourceRestBellProps} from '../render/source-rest-bells.js';

const seat=SOURCE_REST_SEATS[1],first=SOURCE_REST_SEATS[0];
// The seat looks slightly left of the mechanism. Its shelter and weather
// still belong to the radial case, independently of the listener's neck.
const centre=SOURCE_CONTINUATION.catch.center,yaw=Math.atan2(centre.x-seat.x,seat.z-centre.z),
  forward=[Math.sin(yaw),-Math.cos(yaw)],right=[Math.cos(yaw),Math.sin(yaw)];
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const point=(f,y,r)=>({x:seat.x+forward[0]*f+right[0]*r,y:seat.feet+y,z:seat.z+forward[1]*f+right[1]*r});
const mapped=p=>{
  const f=first.x-p[0],r=first.z-p[2],q=point(f,p[1]-first.feet,r);
  return[q.x,q.y,q.z];
};
const mappedRow=row=>{const [x,y,z]=mapped([row.x,row.y,row.z]);return{...row,id:'catch-'+row.id,x,y,z};};
const matrix=(x=0,y=0,z=0,angle=0)=>{const c=Math.cos(angle),s=Math.sin(angle);return[c,0,s,0,0,1,0,0,-s,0,c,0,x,y,z,1];};
const multiply=(a,b)=>{const out=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;};
const rotateZ=angle=>{const c=Math.cos(angle),s=Math.sin(angle);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1];};
const hinged=(pivot,angle)=>multiply(matrix(...pivot),multiply(rotateZ(angle),matrix(...pivot.map(value=>-value))));

// Reuse the game's standard particle/drainage model and its supplied musical
// clock. The rigid basis change is the only difference; there is no second
// weather simulation, synthetic storm, moving floor or borrowed recollection.
export function sourceRestCatchWeather(state,{reducedMotion=false,flashMode='full'}={}){
  if(state?.phase!==seat.phase||(state.chartId??0)!==seat.chartId)return null;
  const source=sourceRestWeather({...state,phase:first.phase},{reducedMotion,flashMode});
  if(!source)return null;
  const segment=row=>({...row,id:'catch-'+row.id,a:mapped(row.a),b:mapped(row.b)});
  const rotation=yaw-first.view.yaw;
  return{...source,streaks:source.streaks.map(segment),roof:source.roof.map(segment),
    wet:source.wet.map(row=>({...mappedRow(row),yaw:rotation})),ripples:source.ripples.map(mappedRow),
    objects:source.objects.map(row=>({...mappedRow(row),yaw:row.yaw+rotation})),
    lightning:source.lightning.map(segment),origin:{x:seat.x,y:seat.feet,z:seat.z},basis:{forward:[...forward],right:[...right]}};
}

export function sourceRestCatchScenery(state,{reducedMotion=false,flashMode='full',noteScore=null}={}){
  if(state?.phase!==seat.phase||(state.chartId??0)!==seat.chartId)return null;
  const music=state.sourceRestView||{},response=sourceRestHarpsichordResponse({score:noteScore,currentTime:music.musicTime,
    signal:music.musicSignal,electronic:music.musicRevoicing?.electronic,playing:music.musicPlaying!==false,reducedMotion}),
    models=sourceRestHarpsichordGeometryLibrary(),base=matrix(seat.x,seat.feet,seat.z,yaw),place=[];
  for(const part of SOURCE_REST_HARPSICHORD_PARTS){
    const model=models[part.mesh],register=part.register?['low','mid','high'].indexOf(part.register):-1;
    let pose=matrix(),amount=0;
    if(part.reactive==='acoustic-strings')amount=response.architecture.acousticLift[register];
    else if(part.reactive==='electronic-strings')amount=response.architecture.electronicLift[register];
    else if(part.reactive==='bridge')amount=response.bridgeLift;
    if(amount)pose=matrix(0,amount,0);
    if(part.reactive==='lid')pose=hinged(part.pivot,response.lidAngle);
    const modelCentre=model.bounds.min.map((value,k)=>(value+model.bounds.max[k])/2);
    place.push({...part,id:'catch-rest-'+part.id,mesh:'source-continuation-'+part.mesh,matrix:multiply(base,pose),
      x:seat.x,y:seat.feet,z:seat.z,yaw,chartId:seat.chartId,level:seat.level,region:seat.phase,restPlace:true,
      structural:false,decorative:true,interactive:false,noShadow:true,localCenter:modelCentre,
      cullRadius:Math.min(32,Math.hypot(...model.bounds.max.map((value,k)=>value-model.bounds.min[k]))*.5+2),
      architectural:!!(model.architecturalStrings||model.architecturalBearings||model.architecturalRibs||model.registerFret),
      cutawayOverhead:['lid','wrestplank','pins'].includes(part.casePart),
      response:part.reactive==='lid'?response.lidAngle:amount});
  }
  place.push({id:'catch-rest-harpsichord-soundboard',mesh:'source-continuation-rest-harpsichord-soundboard',matrix:base,
    x:seat.x,y:seat.feet,z:seat.z,yaw,chartId:seat.chartId,level:seat.level,region:seat.phase,restPlace:true,
    structural:false,decorative:true,interactive:false,noShadow:true,casePart:'soundboard',exposedEdge:true});
  const benchScale=[1,0,0,0,0,1,0,0,0,0,SOURCE_REST_SCALE.z,0,0,0,0,1];
  place.push({id:'catch-rest-harpsichord-seat-upholstery',mesh:'source-continuation-rest-harpsichord-seat-upholstery',
    matrix:multiply(matrix(seat.x,seat.feet,seat.z,-seat.yaw),benchScale),
    x:seat.x,y:seat.feet,z:seat.z,yaw:-seat.yaw,chartId:seat.chartId,level:seat.level,region:seat.phase,restPlace:true,
    structural:false,decorative:true,interactive:false,noShadow:true,casePart:'seat-upholstery',cullRadius:2});
  const lamps=[[.80,-1.0],[4.80,1.1]].map(([f,r],i)=>({id:'catch-rest-lamp-'+i,...point(f,0,r),chartId:seat.chartId,level:seat.level,
    region:seat.phase,restPlace:true,harpsichord:true,focusPractical:i===0,radius:i?7.5:6.5,
    intensity:(i?.83:.92)+response.phrasePressure*.14,color:i?[.74,.60,.35]:[.94,.67,.36]}));
  const degradation=clamp(state.sourceRestView?.degradation),signal=reducedMotion?0:clamp(state.sourceRestView?.musicSignal),centre=point(12,2,0);
  return{seatId:seat.id,region:seat.phase,treatment:'escherian-harpsichord-case',place,vista:[],lamps,
    // The dedicated case settle is submitted by the ordinary bench owner;
    // its dark canvas is the matching part above. Source II's cushions stay out.
    upholstery:{x:seat.x,y:seat.feet,z:seat.z,yaw:seat.yaw,scaleZ:SOURCE_REST_SCALE.z,chartId:seat.chartId,enabled:false},
    carpet:{id:'catch-rest-existing-floor',...point(0,.009,0),chartId:seat.chartId,region:seat.phase,existingFloor:true},
    centre,signal,degradation,rally:0,arcs:[],motes:[],vaults:[],rallyFragments:[],
    memories:{road:[],drive:[],ellery:[],tableaux:[],lights:[]},noteArchitecture:{parts:[],lights:[],diagnostics:{recognized:0,represented:0,parts:0}},
    bells:sourceRestBellProps(state,{reducedMotion}),flood:null,weather:sourceRestCatchWeather(state,{reducedMotion,flashMode}),
    harpsichord:{parts:place.length,caseFrame:'one instrument spans all Catch stages; earned counterarc refuge',response,
      strings:122,manuals:2,supportFloor:'original supports with a clipped wood veneer',
      architecturalCourses:122,registerBays:3,architecturalHeight:18.2,seatLevel:seat.level,
      geometryTriangles:Object.values(models).reduce((sum,model)=>sum+model.i.length/3,0),
      audioOwner:'existing aligned Couperin score',newAudio:false,independentClock:false},
    diagnostics:{placeProps:place.length,lampProps:lamps.length*2,addedFloor:false,addedCollision:false,view:'inside-the-existing-catch-harpsichord-and-return',
      visibleFromCatchLevels:[0,1,2,3],architecturalAnchors:'existing level0/1/2 outer shelves',
      weatherOwner:'standard-source-rest-weather',musicMemories:false,upholsteryOwner:'purpose-built-case-settle'}};
}
