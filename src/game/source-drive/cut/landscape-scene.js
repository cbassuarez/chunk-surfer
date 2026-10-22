// Road-centred anatomy and one offshore held wave. No geometry, contact or
// narrative progression is recomputed here; GPU morphs use a saved clock.
import {worldAt,roadAt,roadSurfaceAt} from '../road.js';
import {cageSecretionAt} from './physiology.js';
import {COSTAL_GLAND_ANCHORS,COSTAL_NECK,costalPointPose,costalNeckPoint} from './costal-geometry.js';
import {ribPose,heldWavePose} from './landscape-motion.js';
export const CUT_THORAX_CHAMBERS=Object.freeze([
 {id:'thorax-emergence',d:768,height:.74,width:1.02},
 {id:'thorax-first-vault',d:798,height:.86,width:1.06},
 {id:'thorax-open-ribs',d:829,height:1,width:1.0},
 {id:'thorax-held',d:861,height:1.10,width:1.045},
 {id:'thorax-strain',d:894,height:1.04,width:1.02},
 {id:'thorax-last-vault',d:926,height:.87,width:1.10},
]);
export const CUT_TRAILING_RIBS=Object.freeze([
 {id:'thorax-after-1',d:977,lateral:1.7,height:.91,width:1,flip:false},
 {id:'thorax-after-2',d:1025,lateral:-1.6,height:.83,width:1.12,flip:true},
 {id:'thorax-after-3',d:1076,lateral:2.0,height:.70,width:1.18,flip:false},
 {id:'thorax-after-4',d:1134,lateral:-1.9,height:.64,width:1.30,flip:true},
]);
export const CUT_COASTAL_TRANSITIONS=Object.freeze([
 {id:'coast-buried-strake',d:606,lateral:-11,height:.42,width:.84,length:.74,flip:true,phase:'approach'},
 {id:'coast-held-sheet',d:663,lateral:-10.5,height:.60,width:.92,length:.82,flip:true,phase:'approach'},
 {id:'coast-exposed-rib',d:715,lateral:-9.8,height:.78,width:1,length:.86,flip:true,phase:'approach'},
 {id:'coast-second-bank',d:750,lateral:9.5,height:.96,width:.96,length:.90,flip:false,phase:'approach'},
 {id:'coast-stranded-after',d:987,lateral:10.2,height:.40,width:.86,length:.65,flip:false,phase:'aftermath'},
 {id:'coast-dissolving-after',d:1083,lateral:-10,height:.26,width:1.05,length:.48,flip:true,phase:'aftermath'},
]);
export const CUT_WAVE_LAYOUT=Object.freeze({d:760,lateral:-28,lengthScale:1.8,heightScale:1,authoredSpan:[-91.4,90.44],height:[-4,36.5],maximumCullRadius:195});
const thoraxMeshes=['cut_thoracic_bone','cut_sternum','cut_intercostal_depth','cut_intercostal_sheet','cut_periosteum'];
const waveMeshes=['cut_wave_surface','cut_wave_foam','cut_wave_spindrift','cut_wave_strakes'];
const littoralMeshes=['cut_littoral_rib','cut_littoral_water','cut_littoral_tissue'];
// Samples of the actual authored water barrel, exported by the geometry bake.
// One interpolated microphone anchor is not a per-vertex animation path.
export const CUT_WAVE_SOUND_ANCHORS=[{"v":0.04,"base":[2.496724050055863,5.011027312215598,-84.0016576762326],"full":[-0.12505472929498218,8.419339725371696,-84.0016576762326]},{"v":0.11666666666666667,"base":[11.840616636257803,-0.3282045228556303,-69.64649084575808],"full":[1.8266289713186143,12.689979441565315,-69.64649084575808]},{"v":0.19333333333333336,"base":[17.62618516890788,1.4931035745197043,-55.09928706862874],"full":[2.64499360203596,20.968652611453205,-55.09928706862874]},{"v":0.27,"base":[23.138108278555606,3.0846155907776236,-40.58199957562949],"full":[3.8164293946166232,28.202798139898302,-40.58199957562949]},{"v":0.3466666666666667,"base":[23.147388264584226,3.849678051835756,-26.30769511153028],"full":[1.7391753959412477,31.680354781071628,-26.30769511153028]},{"v":0.42333333333333334,"base":[22.99903882046797,4.157580499663702,-12.417263499702946],"full":[0.7510920032033257,33.079911362107744,-12.417263499702946]},{"v":0.5,"base":[22.88085947981757,4.221534048484173,1.0624329914532904],"full":[0.45849389304254373,33.37060931129171,1.0624329914532904]},{"v":0.5766666666666668,"base":[24.391843973225942,4.130902156156349,14.226538954077348],"full":[2.216656274617711,32.95864616434705,14.226538954077348]},{"v":0.6533333333333334,"base":[25.487832780524805,4.041547899398939,27.26394360467538],"full":[3.556338509436787,32.55249045181336,27.26394360467538]},{"v":0.7300000000000001,"base":[23.43883259157467,3.571860001628533,40.401172165364954],"full":[2.788305314405946,30.417545461947874,40.401172165364954]},{"v":0.8066666666666668,"base":[18.465504526611113,2.2085483590678514,53.83509765356051],"full":[1.533099910971515,24.22067435939933,53.83509765356051]},{"v":0.8833333333333334,"base":[11.925427763900919,0.3905735882308452,67.67446071417038],"full":[-0.048863840365025224,15.957152673776573,67.67446071417038]},{"v":0.9600000000000001,"base":[6.324396949249927,3.9197370836683927,81.90756874238797],"full":[1.6127222727410362,10.04491416312995,81.90756874238797]}];
function matrix(a,{height=1,width=1,length=1,flip=false}={}){const c=Math.cos(a.heading),n=Math.sin(a.heading),f=flip?-1:1;return[c*width*f,0,n*width*f,0,0,height,0,0,-n*length*f,0,c*length*f,0,32+a.x,a.y,32+a.z,1];}
// Remnant roots must not become uncollidable objects in the new open deck.
// Their familiar silhouettes recede to its outside rather than occupying the
// old narrow verge while the physical carriageway widens around them.
function remnantLateral(d,lateral){const r=roadAt(d);return r.treatment.expanse>.02?Math.sign(lateral||1)*(Math.max(r.leftWidth,r.rightWidth)+24):lateral;}
function prop(mesh,mt,id,character,cullRadius=0){return{mesh,id,matrix:mt,x:mt[12],y:mt[13],z:mt[14],character,structural:true,skyExposed:true,cullRadius,sourceStructure:'drive-living-landscape'};}
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
function glandMatrix(chamber,site,pose){const a=worldAt(chamber.d),body=matrix(a,chamber),q=point(body,costalPointPose(site.point,pose.morphs,site.side)),m=matrix(a,{height:chamber.height*site.scale[1],width:chamber.width*site.scale[0],length:site.scale[2],flip:site.side<0});m[12]=q[0];m[13]=q[1];m[14]=q[2];return m;}
function addCostalSecretion(props,chamber,s,evolution,pose){if(Math.abs(chamber.d+s.z)>66)return[];const sites=[],activity=Math.max(0,Math.min(1,pose.morphs.breath,pose.motion.physiology?.activity??pose.motion.load?.anatomyReveal??1));
 for(const[index,site]of COSTAL_GLAND_ANCHORS.entries()){const seq=cageSecretionAt({timeSec:s.programTime||0,furthest:s.furthest||0,distance:chamber.d,index,load:pose.motion.load}),w={tension:seq.bead*activity,shear:seq.extension*activity,breath:0,recoil:seq.drip*activity},m=glandMatrix(chamber,site,pose),id=chamber.id+'-'+site.id,character={joints:{},morphs:w};props.push(prop('cut_costal_glands',m,id+'-gland',character,3),prop('cut_costal_secretions',m,id+'-neck',character,4));
  const releaseTime=Math.max(0,(s.programTime||0)-seq.age+3.3),released=seq.fall>.0001,rp=released?ribPose({timeSec:releaseTime,furthest:s.furthest||0,distance:chamber.d,id:chamber.id,evolution}):pose,rm=released?glandMatrix(chamber,site,rp):m,rs=released?cageSecretionAt({timeSec:releaseTime,furthest:s.furthest||0,distance:chamber.d,index}):seq,rw={tension:rs.bead*activity,shear:rs.extension*activity,breath:0,recoil:rs.drip*activity},start=point(rm,costalNeckPoint(COSTAL_NECK.outlet,rw)),a=worldAt(chamber.d),outward=[Math.cos(a.heading)*site.side,Math.sin(a.heading)*site.side],end=[start[0]+outward[0]*site.outward,0,start[2]+outward[1]*site.outward+.12*(index?1:-1)];end[1]=roadSurfaceAt(end[0]-32,end[2]-32).height+.025;
  sites.push({id,world:point(m,costalNeckPoint(COSTAL_NECK.outlet,w)),attachment:[m[12],m[13],m[14]],phase:seq.phase,bead:w.tension,extension:w.shear,drop:seq.drop*activity,fall:seq.fall,drip:seq.drip*activity,residue:seq.residue*activity,activity});
  const drop=seq.drop*activity;if(drop>.001){const dm=matrix(a,{height:drop*chamber.height*site.scale[1],width:drop*site.scale[0],length:drop*site.scale[2],flip:site.side<0}),f=seq.fall,top=.55*drop*chamber.height*site.scale[1];dm[12]=start[0]+(end[0]-start[0])*f;dm[13]=start[1]-top+(end[1]-(start[1]-top))*f;dm[14]=start[2]+(end[2]-start[2])*f;props.push(prop('cut_costal_drop',dm,id+'-drop',{joints:{},morphs:{}},1));}
  const residue=seq.residue*activity;if(residue>.001){const puddle=matrix(a,{height:.12*residue,width:2.4*residue*site.scale[0],length:1.8*residue*site.scale[2]});puddle[12]=end[0];puddle[13]=end[1];puddle[14]=end[2];props.push(prop('cut_costal_drop',puddle,id+'-residue',{joints:{},morphs:{}},1));}
 }return sites;
}
export function makeCutLandscape(s,evolution=null){const props=[],sources=[],glandSites=[],d=-s.z,timeSec=s.programTime||0,furthest=s.furthest||0;
 for(const chamber of CUT_THORAX_CHAMBERS){if(Math.abs(chamber.d-d)>290)continue;const a=worldAt(chamber.d),m=matrix(a,chamber),pose=ribPose({timeSec,furthest,distance:chamber.d,id:chamber.id,evolution});for(const mesh of thoraxMeshes){props.push(prop(mesh,m,chamber.id+'-'+mesh,pose,38));}glandSites.push(...addCostalSecretion(props,chamber,s,evolution,pose));const point=worldAt(chamber.d,-9.4*chamber.width,2.6*chamber.height);sources.push({id:chamber.id,world:[32+point.x,point.y,32+point.z],morphs:pose.morphs,motion:{...pose.motion,kind:'anatomy',distance:chamber.d,timeSec,furthest}});}
 const w=CUT_WAVE_LAYOUT;if(Math.abs(w.d-d)<490){const a=worldAt(w.d,w.lateral),m=matrix(a,{height:w.heightScale,length:w.lengthScale,flip:true}),pose=heldWavePose({timeSec,furthest,distance:w.d,id:'cut-held-ocean',evolution});for(const mesh of waveMeshes)props.push(prop(mesh,m,'cut-held-ocean-'+mesh,pose,w.maximumCullRadius));
  const current=worldAt(d),dx=current.x-a.x,dz=current.z-a.z,localZ=(dx*Math.sin(a.heading)-dz*Math.cos(a.heading))/w.lengthScale,v=Math.max(.04,Math.min(.96,(localZ+90)/180)),at=(v-.04)/.92*12,index=Math.min(11,Math.floor(at)),f=at-index,lo=CUT_WAVE_SOUND_ANCHORS[index],hi=CUT_WAVE_SOUND_ANCHORS[index+1],curl=pose.morphs.breath,q=lo.base.map((p,k)=>{const base=p+(hi.base[k]-p)*f,full=lo.full[k]+(hi.full[k]-lo.full[k])*f;return base+(full-base)*curl;}),world=[m[0]*q[0]+m[8]*q[2]+m[12],m[5]*q[1]+m[13],m[2]*q[0]+m[10]*q[2]+m[14]];sources.push({id:'cut-held-ocean',world,morphs:pose.morphs,motion:{...pose.motion,kind:'water',distance:Math.max(598,Math.min(922,d)),timeSec,furthest}});}
 for(const coastal of CUT_COASTAL_TRANSITIONS){if(Math.abs(coastal.d-d)>290)continue;const a=worldAt(coastal.d,coastal.phase==='aftermath'?remnantLateral(coastal.d,coastal.lateral):coastal.lateral),m=matrix(a,coastal),pose=ribPose({timeSec,furthest,distance:coastal.d,id:coastal.id,evolution});for(const mesh of littoralMeshes)props.push(prop(mesh,m,coastal.id+'-'+mesh,pose,38));const q=[2.8*coastal.width,7.1*coastal.height,-3.6*coastal.length],world=[m[0]*(q[0]/coastal.width)+m[8]*(q[2]/coastal.length)+m[12],q[1]+m[13],m[2]*(q[0]/coastal.width)+m[10]*(q[2]/coastal.length)+m[14]];sources.push({id:coastal.id,world,morphs:pose.morphs,motion:{...pose.motion,kind:'anatomy',distance:coastal.d,timeSec,furthest}});}
 for(const remnant of CUT_TRAILING_RIBS){if(Math.abs(remnant.d-d)>290)continue;const a=worldAt(remnant.d,remnantLateral(remnant.d,remnant.lateral)),m=matrix(a,{...remnant,length:.82});props.push(prop('cut_thoracic_remnant',m,remnant.id,{joints:{},morphs:{tension:0,shear:0,breath:0,recoil:0}},30));}
 return{props,sources,diagnostics:{thoraxChambers:CUT_THORAX_CHAMBERS.map(x=>x.d),trailingRibs:CUT_TRAILING_RIBS.map(x=>x.d),wave:CUT_WAVE_LAYOUT,coastalTransitions:CUT_COASTAL_TRANSITIONS.map(x=>({d:x.d,phase:x.phase})),physiology:{glandSites},monumental:true,roadSurfaceChanged:false}};
}
