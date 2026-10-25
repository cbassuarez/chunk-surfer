// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
import{worldAt,roadAt}from'../road.js';
import{makeCutLandscape}from'./landscape-scene.js';
import{cutPose,cutLayerPose,CUT_LIVING_MESHES}from'./motion.js';
export const CUT_MODULES=Object.freeze([
 {id:'cut-first',d:684,lateral:5.0,height:.84,living:false,ribs:false},
 {id:'cut-strata',d:708,lateral:4.65,height:.92,living:false,ribs:true},
 {id:'cut-exposure',d:732,lateral:4.60,height:.96,living:true,ribs:true},
 {id:'cut-loaded',d:756,lateral:4.55,height:1.02,living:true,ribs:true},
 {id:'cut-deep',d:780,lateral:4.6,height:1.08,living:true,ribs:true},
 {id:'cut-approach',d:804,lateral:4.7,height:.98,living:true,ribs:true},
 {id:'cut-hold',d:828,lateral:4.55,height:1.04,living:true,ribs:true},
 {id:'cut-hero',d:852,lateral:4.45,height:1,living:true,ribs:true},
 {id:'cut-resistance',d:876,lateral:4.55,height:1.02,living:true,ribs:true},
 {id:'cut-departure',d:900,lateral:4.8,height:.92,living:true,ribs:true},
 {id:'cut-last-stratum',d:924,lateral:5.25,height:.76,living:false,ribs:true},
]);
export const CUT_INSPECTION_LAMPS=Object.freeze([{id:'cut-inspection-approach',d:748,lateral:-5.3,intensity:1.1,radius:39},{id:'cut-inspection-hold',d:812,lateral:-7.7,intensity:2.1,radius:43,target:{d:829,local:[-2,7.8,-7]}}]);
// The old broad white cliff/curtain is deliberately retired. Four sparse low
// engineering insets retain material history without competing with the vault.
const legacyInsets=new Set(['cut-first','cut-exposure','cut-hero','cut-last-stratum']);
const staticNames=['cut_retaining','cut_fittings','cut_rubble'];
function matrix(a,height=1){const c=Math.cos(a.heading),n=Math.sin(a.heading);return[c,0,n,0,0,height,0,0,-n,0,c,0,32+a.x,a.y,32+a.z,1];}
function instance(mesh,m,id,character){return{mesh,id,matrix:m,x:m[12],y:m[13],z:m[14],structural:true,skyExposed:true,...(character?{character}: {})};}
// The remaining0.74m inset faces sit behind the real continuous roadside
// toe/rail. Their old coarse boxes began0.29m in front of the actual concrete;
// retaining them would create a second invisible contact before the visible
// perimeter. Overhead bone/tissue and the offshore sea never close the road.
export function cutColliders(){return[];}
export function makeCutScene(s,evolution=null){if(s.cutEnabled===false)return{props:[],sources:[],lights:[],diagnostics:{enabled:false}};const props=[],sources=[],lights=[],d=-s.z;for(const m of CUT_MODULES){if(Math.abs(m.d-d)>185)continue;const a=worldAt(m.d,m.lateral),mt=matrix(a,m.height*.24),pose=m.living?cutPose({timeSec:s.programTime,furthest:s.furthest,distance:m.d,id:m.id}):null;if(legacyInsets.has(m.id))for(const mesh of staticNames)props.push(instance(mesh,mt,m.id+'-'+mesh));if(pose){if(m.id==='cut-hero')for(const mesh of CUT_LIVING_MESHES)props.push(instance(mesh,mt,m.id+'-'+mesh,cutLayerPose(mesh,{timeSec:s.programTime,furthest:s.furthest,distance:m.d,id:m.id})));const p=worldAt(m.d,m.lateral+1.8,2.0);sources.push({id:m.id,world:[32+p.x,p.y,32+p.z],motion:pose.motion});}}
 for(const l of CUT_INSPECTION_LAMPS){
  const a=worldAt(l.d,l.lateral);let mt=matrix(a),target=null;
  if(l.target){const site=matrix(worldAt(l.target.d)),q=l.target.local;target=[0,1,2].map(k=>site[k]*q[0]+site[k+4]*q[1]+site[k+8]*q[2]+site[k+12]);mt=matrix({...a,heading:Math.atan2(target[2]-(32+a.z),target[0]-(32+a.x))});}
  props.push(instance('cut_inspection_lamp',mt,l.id));
  const p=target?[mt[12]+mt[0]*.335,mt[13]+4.16,mt[14]+mt[2]*.335]:(()=>{const q=worldAt(l.d,l.lateral+.34,4.16);return[32+q.x,q.y,32+q.z];})(),direction=target?target.map((v,k)=>v-p[k]):[Math.cos(a.heading)*.94,.34,Math.sin(a.heading)*.94],length=Math.hypot(...direction);
  lights.push({id:l.id,x:p[0],y:p[1],z:p[2],color:[.73,.81,.91],intensity:l.intensity,radius:l.radius,penetration:1,direction:direction.map(v=>v/length)});
 }
 const landscape=makeCutLandscape(s,evolution);props.push(...landscape.props);sources.push(...(landscape.sources||[]));
 // The landscape's physical surfaces take precedence over retired wall-module
 // hints. A nearest point on the long wave can remain audible beside the ribs.
 sources.sort((a,b)=>(a.motion.kind?0:1)-(b.motion.kind?0:1)||Math.abs(a.motion.distance-d)-Math.abs(b.motion.distance-d));return{props,lights,sources:sources.slice(0,3),diagnostics:{enabled:true,modules:CUT_MODULES.filter(m=>Math.abs(m.d-d)<=185).map(m=>({id:m.id,d:m.d,living:m.living})),nearest:sources.slice(0,3).map(x=>({id:x.id,kind:x.motion.kind||'legacy',load:x.motion.load,physiology:x.motion.physiology,morphs:x.morphs||cutPose({timeSec:s.programTime,furthest:s.furthest,distance:x.motion.distance,id:x.id}).morphs,phases:x.motion.phases})),worldSpace:true,rootAnchorsFixed:true,landscape:landscape.diagnostics}};
}
