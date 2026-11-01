// One handmade apparatus. Coordinates are the mounted pin, not a camera prop.
export const THRESHOLD_GAG = Object.freeze({
  id:'ellery-return-room-ghost',hostKind:'source-false-return',chartId:0,feet:4.8,bodyRadius:.22,bodyHeight:1.8,eyeHeight:1.62,
  mount:Object.freeze({x:68.60,y:5.95,z:57.05,yaw:-Math.PI/3}),
  triggerX:71.20,armX:71.55,laneMinZ:58.40,laneMaxZ:59.10,
  restAngle:Math.PI/2,swingSeconds:.19,reducedSwingSeconds:.35,
  reboundSeconds:.22,reboundRadians:.10,reducedReboundRadians:.018,
  clickAfterContact:.31,voiceAfterContact:.41,finishAfterContact:1.40,
  warningMargin:.30,warningTailSeconds:1.10,loopQuietSeconds:.35,viewHalfAngle:.70,
  openingLocal:Object.freeze([-.18,.30,.09]),revealLocal:Object.freeze([-.68,.30,.082]),
  inscription:Object.freeze({target:Object.freeze([-.68,.36,.005]),range:1.6,epithet:'HIS FEARFUL MEDIOCRITY',credit:'ELLERY STUDENTS',captionSeconds:7,ghostPose:'head_turn',ghostHeight:1.92,ghostRadius:.32}),
  speaker:Object.freeze([-.680,-.185,-.111]),contact:Object.freeze([-.245,0,.03]),
});
export const THRESHOLD_GAG_MESHES=Object.freeze(['ellery_threshold_mount','ellery_threshold_scenery','ellery_threshold_ghost','ellery_threshold_armature']);
export const thresholdGagTiming=reduced=>{
  const swing=reduced?THRESHOLD_GAG.reducedSwingSeconds:THRESHOLD_GAG.swingSeconds;
  return{contact:swing,rattle:swing+THRESHOLD_GAG.reboundSeconds,click:swing+THRESHOLD_GAG.clickAfterContact,
    boo:swing+THRESHOLD_GAG.voiceAfterContact,finish:swing+THRESHOLD_GAG.finishAfterContact};
};
export function thresholdGagAngle(elapsed=0,{fired=false,reduced=false}={}){
  if(!fired)return THRESHOLD_GAG.restAngle;
  const t=Math.max(0,Number(elapsed)||0),clock=thresholdGagTiming(reduced),u=t-clock.contact;
  if(t<clock.contact){const p=t/clock.contact;return THRESHOLD_GAG.restAngle*(1-p*p);}
  if(u<THRESHOLD_GAG.reboundSeconds)return (reduced?THRESHOLD_GAG.reducedReboundRadians:THRESHOLD_GAG.reboundRadians)
    *Math.sin(Math.PI*u/THRESHOLD_GAG.reboundSeconds)*Math.exp(-6*u);
  return 0;
}
// Source uses x'=cos(a)x-sin(a)z; all parts and sound positions share it.
export function thresholdGagPoint(point,angle=0){
  const m=THRESHOLD_GAG.mount,a=m.yaw+angle,c=Math.cos(a),s=Math.sin(a);
  return{x:m.x+c*point[0]-s*point[2],y:m.y+point[1],z:m.z+s*point[0]+c*point[2]};
}
export function thresholdGagViewPoints(){return[THRESHOLD_GAG.openingLocal,THRESHOLD_GAG.revealLocal].map(p=>{const v=thresholdGagPoint(p);return[v.x,v.y,v.z];});}
export function thresholdGagPose(state={}){
  const g=state.thresholdGag||state,fired=g.phase==='running'||g.phase==='spent',angle=thresholdGagAngle(g.elapsed,{fired,reduced:g.reduced});
  return{angle,fired,phase:g.phase||'rest',mount:{x:THRESHOLD_GAG.mount.x,y:THRESHOLD_GAG.mount.y,z:THRESHOLD_GAG.mount.z},
    contact:thresholdGagPoint(THRESHOLD_GAG.contact),speaker:thresholdGagPoint(THRESHOLD_GAG.speaker,angle),chartId:0};
}
// Actual part solids rather than the entire sweep: the bare reverse stays reachable.
export const THRESHOLD_GAG_SOLIDS=Object.freeze([
  {id:'backing',moving:false,min:[.19,-1.15,-1.52],max:[.229,1.38,-.02]},
  {id:'post',moving:false,min:[.19,-1.15,-.125],max:[.30,1.38,.155]},
  {id:'rear-foot',moving:false,min:[.16,-1.15,-1.34],max:[.46,-1.084,-1.16]},
  {id:'front-foot',moving:false,min:[.16,-1.15,-.31],max:[.46,-1.084,-.13]},
  {id:'apron-lower',moving:false,min:[-.18,-1.15,-.008],max:[.30,-.13,.018]},
  {id:'apron-upper',moving:false,min:[-.18,.10,-.008],max:[.30,1.38,.018]},
  {id:'apron-cleat',moving:false,min:[-.18,-.18,.055],max:[.30,.16,.080]},
  {id:'mount',moving:false,min:[.01,-.12,.033],max:[.20,.12,.163]},
  {id:'stop',moving:false,min:[-.28,-.065,.03],max:[-.21,.065,.08]},
  {id:'board',moving:true,min:[-1.35,-.84,.04],max:[-.36,.97,.09]},
  {id:'tab',moving:true,min:[-.792,.746,.065],max:[-.239,1.135,.09]},
  {id:'arm',moving:true,min:[-.77,-.0525,-.08],max:[0,.0525,.03]},
  {id:'speaker',moving:true,min:[-.7725,-.2875,-.117],max:[-.5875,-.0825,-.003]},
  {id:'spine',moving:true,min:[-.703,-.783,.018],max:[-.613,.767,.068]},
]);
export function thresholdGagPenetration(x,z,state,radius=.22,height=1.72){
  if(state.kind!==THRESHOLD_GAG.hostKind||!state.thresholdGag?.available)return 0;
  const m=THRESHOLD_GAG.mount,pose=thresholdGagPose(state),feet=Number(state.feet)||0;
  return Math.max(0,...THRESHOLD_GAG_SOLIDS.map(box=>{
    if(feet+height<=m.y+box.min[1]||feet>=m.y+box.max[1])return 0;
    const a=m.yaw+(box.moving?pose.angle:0),c=Math.cos(a),s=Math.sin(a),dx=x-m.x,dz=z-m.z,lx=c*dx+s*dz,lz=-s*dx+c*dz;
    return Math.max(0,Math.min(lx+radius-box.min[0],box.max[0]+radius-lx,lz+radius-box.min[2],box.max[2]+radius-lz));
  }));
}

export function thresholdGagBlocks(x,z,state,radius=.22,height=1.72){return thresholdGagPenetration(x,z,state,radius,height)>0;}
