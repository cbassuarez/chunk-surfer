// The anonymous human volumes and tapered limbs continue the apparition family
// in build-props.mjs: neck, sloped shoulders, hands, knees, loaded hips and short
// floor charge. The four standing bodies are Source's (demolition, earthfall);
// the church itself now uses the six below.
export const ST_BRENDANS_PRESENCE_MESHES=Object.freeze({waiting:'brendan_presence_waiting',braced:'brendan_presence_braced',seated:'brendan_presence_seated',upward:'brendan_presence_upward'});
// ST BRENDAN'S OWN: bodies in the air in the middle of a fit, and bodies on the
// floor. Three keyframes of a conniption each place, swapped like stop motion by
// game/st-brendans-apparitions.js, and drawn with less definition than the
// standing four: no fingers, no ankles, joints sunk into the limbs.
export const ST_BRENDANS_APPARITION_MESHES=Object.freeze({
 fitArch:'brendan_fit_arch',fitTwist:'brendan_fit_twist',fitFold:'brendan_fit_fold',
 floorProne:'brendan_floor_prone',floorCurled:'brendan_floor_curled',floorArched:'brendan_floor_arched',
});
export const ST_BRENDANS_PRESENCE_LIMITS=Object.freeze({bytes:750000,triangles:22000,meshes:10});
export const ST_BRENDANS_PRESENCE_SEAT_TOP=.5275;
// How much of a body is drawn. 'lumped' is the church's; the others are the
// alternatives put up for review (tools/chunk_surfer/st-brendans-options.mjs).
export const ST_BRENDANS_DEFINITIONS=Object.freeze(['lumped','fused','broken']);
export const ST_BRENDANS_DEFINITION='lumped';
export const ST_BRENDANS_PRESENCE_MATERIAL=Object.freeze({name:'Brendan anonymous shadow volume',pbrMetallicRoughness:{baseColorFactor:[.025,.028,.03,1],roughnessFactor:.94,metallicFactor:0},extras:{materialFactors:'gltf',studyLocalFinish:true}});
export const ST_BRENDANS_PRESENCE_POSES=Object.freeze({
 waiting:{
  torso:[.040,1.08,.018],torsoRadii:[.235,.375,.135],pelvis:[.025,.80,.01],pelvisRadii:[.20,.15,.13],neck:[.045,1.48,.005],head:[.055,1.65,-.005],headTilt:.02,
  shoulders:[[-.195,1.39,.005],[.275,1.35,.020]],elbows:[[-.27,1.06,.07],[.33,1.025,-.04]],wrists:[[-.27,.74,.10],[.35,.71,-.05]],
  hips:[[-.10,.76,.02],[.15,.75,.005]],knees:[[-.16,.43,-.045],[.23,.39,.02]],ankles:[[-.165,.105,-.01],[.25,.105,.10]],
 },
 braced:{
  torso:[0,1.085,-.12],torsoRadii:[.235,.34,.14],torsoTilt:-.28,pelvis:[.015,.80,.04],pelvisRadii:[.20,.15,.13],neck:[.018,1.38,-.32],head:[.028,1.51,-.40],headTilt:-.22,
  shoulders:[[-.235,1.28,-.20],[.24,1.30,-.23]],elbows:[[-.385,1.13,-.34],[.37,1.29,-.35]],wrists:[[-.45,1.13,-.50],[.42,1.34,-.49]],handDirections:[[0,-.10,-1],[0,-.05,-1]],
  hips:[[-.115,.76,.06],[.14,.76,.03]],knees:[[-.19,.43,-.11],[.24,.40,-.045]],ankles:[[-.25,.105,.11],[.28,.105,.14]],
 },
 seated:{
  torso:[.015,.965,-.025],torsoRadii:[.235,.31,.14],torsoTilt:-.28,pelvis:[.025,.6475,.10],pelvisRadii:[.20,.12,.13],neck:[.015,1.205,-.18],head:[.008,1.245,-.29],headTilt:-.37,
  shoulders:[[-.22,1.18,-.105],[.25,1.15,-.11]],elbows:[[-.27,.77,-.31],[.28,.755,-.30]],wrists:[[-.16,.61,-.48],[.18,.59,-.45]],
  hips:[[-.10,.635,.10],[.15,.63,.10]],knees:[[-.17,.49,-.43],[.22,.48,-.39]],ankles:[[-.20,.105,-.50],[.24,.105,-.46]],
 },
 upward:{
  torso:[-.035,1.09,.02],torsoRadii:[.235,.38,.135],pelvis:[-.01,.80,.025],pelvisRadii:[.20,.15,.13],neck:[-.045,1.50,.045],head:[-.055,1.70,.095],headTilt:.48,
  shoulders:[[-.27,1.40,.045],[.20,1.37,.02]],elbows:[[-.31,1.10,.04],[.255,1.05,.025]],wrists:[[-.29,.77,.025],[.28,.73,.02]],
  hips:[[-.135,.76,.025],[.115,.75,.015]],knees:[[-.19,.40,-.06],[.15,.425,.025]],ankles:[[-.23,.105,.035],[.18,.105,.09]],
 },
});
// Floor-pivoted like the standing four (feet near y 0); the runtime lifts the
// fits into the air. Lying bodies run along local z, head toward -z.
export const ST_BRENDANS_APPARITION_POSES=Object.freeze({
 // Thrown back: spine bowed, head flung behind, arms out and back, heels up.
 fitArch:{
  torso:[0,1.05,.12],torsoRadii:[.235,.36,.135],torsoTilt:.45,pelvis:[0,.78,-.05],pelvisRadii:[.20,.15,.13],neck:[0,1.37,.30],head:[0,1.44,.47],headTilt:.95,
  shoulders:[[-.24,1.30,.22],[.24,1.31,.20]],elbows:[[-.55,1.38,.38],[.52,1.24,.44]],wrists:[[-.80,1.31,.56],[.74,1.53,.50]],
  hips:[[-.11,.74,-.04],[.12,.74,-.03]],knees:[[-.17,.42,.12],[.19,.47,.17]],ankles:[[-.21,.31,.49],[.23,.16,.43]],
 },
 // Wrenched round: one arm over the head, one clawing down, a knee to the chest.
 fitTwist:{
  torso:[.03,1.06,0],torsoRadii:[.235,.36,.135],torsoTilt:-.15,pelvis:[-.02,.80,.04],pelvisRadii:[.20,.15,.13],neck:[.08,1.42,-.06],head:[.16,1.56,-.10],headTilt:-.5,
  shoulders:[[-.23,1.36,.02],[.25,1.32,-.02]],elbows:[[-.37,1.63,.05],[.43,1.08,-.18]],wrists:[[-.21,1.88,.02],[.31,.84,-.35]],
  hips:[[-.12,.77,.05],[.12,.76,.03]],knees:[[-.18,.99,-.31],[.16,.42,.05]],ankles:[[-.20,.62,-.18],[.25,.10,.18]],
 },
 // Jackknifed: folded over itself, arms clutched in, knees drawn up.
 fitFold:{
  torso:[0,1.0,-.15],torsoRadii:[.235,.34,.14],torsoTilt:-.7,pelvis:[0,.80,.05],pelvisRadii:[.20,.15,.13],neck:[0,1.22,-.36],head:[0,1.20,-.51],headTilt:-1.0,
  shoulders:[[-.23,1.20,-.25],[.23,1.21,-.26]],elbows:[[-.30,.92,-.43],[.31,.97,-.40]],wrists:[[-.08,.86,-.51],[.10,.80,-.48]],
  hips:[[-.11,.76,.06],[.12,.76,.06]],knees:[[-.14,.99,-.37],[.15,.94,-.38]],ankles:[[-.16,.55,-.18],[.17,.52,-.21]],
 },
 // Face down, one arm reaching on along the floor, one flung out.
 floorProne:{
  torso:[0,.17,-.30],torsoRadii:[.235,.36,.13],torsoTilt:1.5,pelvis:[0,.15,.13],pelvisRadii:[.20,.15,.13],pelvisTilt:1.5,neck:[0,.20,-.70],head:[.02,.17,-.86],headTilt:1.4,
  shoulders:[[-.25,.19,-.56],[.25,.20,-.55]],elbows:[[-.56,.10,-.76],[.58,.10,-.45]],wrists:[[-.63,.06,-1.06],[.86,.06,-.56]],
  hips:[[-.12,.14,.18],[.12,.15,.18]],knees:[[-.22,.09,.55],[.20,.10,.59]],ankles:[[-.25,.07,.93],[.31,.07,.95]],
 },
 // On its side, drawn into itself.
 floorCurled:{
  torso:[0,.27,-.05],torsoRadii:[.14,.34,.235],torsoTilt:1.2,pelvis:[0,.25,.30],pelvisRadii:[.13,.15,.20],pelvisTilt:1.2,neck:[.03,.30,-.42],head:[.05,.28,-.58],headTilt:1.6,
  shoulders:[[0,.47,-.30],[0,.10,-.31]],elbows:[[-.18,.44,-.56],[-.20,.12,-.52]],wrists:[[-.22,.36,-.71],[-.25,.14,-.68]],
  hips:[[0,.38,.30],[0,.12,.31]],knees:[[-.34,.36,0],[-.37,.12,.03]],ankles:[[-.16,.30,.37],[-.19,.08,.39]],
 },
 // On its back, arched off the floor between its heels and the crown of its head.
 floorArched:{
  torso:[0,.43,0],torsoRadii:[.235,.36,.135],torsoTilt:-1.35,pelvis:[0,.48,.37],pelvisRadii:[.20,.15,.13],pelvisTilt:-1.2,neck:[0,.21,-.40],head:[0,.12,-.53],headTilt:-1.9,
  shoulders:[[-.26,.31,-.25],[.26,.30,-.26]],elbows:[[-.53,.12,-.30],[.50,.10,-.20]],wrists:[[-.71,.05,-.10],[.66,.05,-.02]],
  hips:[[-.12,.46,.41],[.12,.47,.40]],knees:[[-.20,.40,.79],[.23,.38,.81]],ankles:[[-.22,.07,.96],[.25,.07,.99]],
 },
});
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(q=>q/n)},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((q,k)=>q-b[k]);
function geometry(){return{positions:[],normals:[],indices:[]}}
function triangle(g,p,ns,want){
 const n=cross(sub(p[1],p[0]),sub(p[2],p[0]));if(n.reduce((s,v,k)=>s+v*want[k],0)<0){[p[1],p[2]]=[p[2],p[1]];[ns[1],ns[2]]=[ns[2],ns[1]];}
 const base=g.positions.length/3;for(let i=0;i<3;i++){g.positions.push(...p[i]);g.normals.push(...ns[i]);}g.indices.push(base,base+1,base+2);
}
function ellipsoid(g,c,r,columns=12,rows=8,tilt=0){
 const cs=Math.cos(tilt),sn=Math.sin(tilt),rot=([x,y,z])=>[x,y*cs-z*sn,y*sn+z*cs],point=(i,j)=>{const a=i/columns*Math.PI*2,b=(j/rows-.5)*Math.PI,l=[r[0]*Math.cos(a)*Math.cos(b),r[1]*Math.sin(b),r[2]*Math.sin(a)*Math.cos(b)];return{p:rot(l).map((q,k)=>q+c[k]),n:rot(unit(l.map((q,k)=>q/(r[k]*r[k]))))}};
 for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){const v=[point(i,j),point(i+1,j),point(i+1,j+1),point(i,j+1)],want=unit(v[0].p.map((q,k)=>q-c[k]));if(j>0)triangle(g,[v[0].p,v[1].p,v[2].p],[v[0].n,v[1].n,v[2].n],want);if(j<rows-1)triangle(g,[v[0].p,v[2].p,v[3].p],[v[0].n,v[2].n,v[3].n],want)}
}
// Same five-ring taper and soft mid-limb bulge as the established family;
// fewer circumferential vertices retain its silhouette within this tiny pack.
function limb(g,a,b,ra,rb,rings=4,sides=8){
 const d=sub(b,a),axis=unit(d),side=unit(cross(axis,Math.abs(axis[1])<.88?[0,1,0]:[1,0,0])),depth=cross(axis,side),row=[];
 for(let j=0;j<=rings;j++){const t=j/rings,r=(ra+(rb-ra)*t)*(1+.12*Math.sin(t*Math.PI));row[j]=[];for(let i=0;i<sides;i++){const angle=i/sides*Math.PI*2,n=side.map((q,k)=>q*Math.cos(angle)+depth[k]*Math.sin(angle)),p=a.map((q,k)=>q+d[k]*t+n[k]*r);row[j].push({p,n});}}
 for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const k=(i+1)%sides,v=[row[j][i],row[j][k],row[j+1][k],row[j+1][i]],want=unit(v[0].n.map((q,k)=>q+v[1].n[k]));triangle(g,[v[0].p,v[1].p,v[2].p],[v[0].n,v[1].n,v[2].n],want);triangle(g,[v[0].p,v[2].p,v[3].p],[v[0].n,v[2].n,v[3].n],want)}
 for(const end of[0,rings])for(let i=0;i<sides;i++){const n=axis.map(q=>q*(end===0?-1:1)),c=end===0?a:b;triangle(g,[c,row[end][i].p,row[end][(i+1)%sides].p],[n,n,n],n)}
}
function hand(g,wrist,side,direction=null){
 const d=unit(direction||[0,-1,0]),palm=wrist.map((q,k)=>q+d[k]*.055+(k===0?side*.006:0));
 ellipsoid(g,palm,[.052,.066,.036],10,6,direction?-Math.PI/2:0);
 for(let finger=0;finger<4;finger++){
  const offset=side*(finger-1.5)*.021,start=palm.map((q,k)=>q+d[k]*.026+(k===0?offset:0)),end=palm.map((q,k)=>q+d[k]*(.09-(finger===0?.014:0))+(k===0?offset+side*.005:0)+(k===1&&direction?-.012:0));limb(g,start,end,.0125,.008,2,6);
 }
 const thumb=palm.map((q,k)=>q+(k===0?-side*.044:k===1?-.005:0));limb(g,thumb,thumb.map((q,k)=>q+d[k]*.043+(k===0?-side*.018:0)),.017,.011,2,6);
}
function body(pose){
 const g=geometry();ellipsoid(g,pose.torso,pose.torsoRadii,14,9,pose.torsoTilt||0);ellipsoid(g,pose.pelvis,pose.pelvisRadii,12,8);
 ellipsoid(g,pose.neck,[.073,.115,.073],10,7,pose.headTilt*.5);ellipsoid(g,pose.head,[.142,.185,.125],14,10,pose.headTilt);
 for(let i=0;i<2;i++){
  const side=i===0?-1:1,shoulder=pose.shoulders[i],elbow=pose.elbows[i],wrist=pose.wrists[i],hip=pose.hips[i],knee=pose.knees[i],ankle=pose.ankles[i];
  ellipsoid(g,shoulder,[.110,.103,.105],10,7);limb(g,shoulder,elbow,.090,.066);ellipsoid(g,elbow,[.069,.070,.068],10,6);limb(g,elbow,wrist,.063,.042);hand(g,wrist,side,pose.handDirections?.[i]);
  ellipsoid(g,hip,[.115,.12,.102],10,7);limb(g,hip,knee,.107,.080);ellipsoid(g,knee,[.082,.083,.080],10,7);limb(g,knee,ankle,.077,.049);
  ellipsoid(g,[ankle[0],.055,ankle[2]-.065],[.077,.055,.15],12,8);
  // Short charge drawn into the floor, without new light, particles or motion.
  for(const sign of[-1,1])limb(g,[ankle[0],.012,ankle[2]-.12],[ankle[0]+sign*.15,.006,ankle[2]-.20+sign*.035],.008,.0025,2,4);
 }
 return g;
}
// Less of a person than the standing four. 'lumped': mitten hands, no ankles,
// joints sunk into six-sided limbs. 'fused': the same, swollen until the limbs
// run together. 'broken': the same parts, pulled apart and out of register.
function vague(pose,definition=ST_BRENDANS_DEFINITION){
 const g=geometry(),fused=definition==='fused',broken=definition==='broken';
 const swell=fused?1.32:1,joint=fused?1.28:1;
 let seed=0;const jitter=()=>{if(!broken)return[0,0,0];seed++;const r=k=>Math.sin(seed*12.9898+k*78.233)*43758.5453%1;return[r(1)*.055,r(2)*.045,r(3)*.055]};
 const shift=(p,d)=>p.map((q,k)=>q+d[k]);
 const part=(a,b,ra,rb)=>{if(!broken){limb(g,a,b,ra*swell,rb*swell,2,6);return}const d=jitter(),cut=.17,s=a.map((q,k)=>q+(b[k]-q)*cut),e=a.map((q,k)=>q+(b[k]-q)*(1-cut));limb(g,shift(s,d),shift(e,d),ra,rb,2,6)};
 const lump=(c,r,tilt=0)=>ellipsoid(g,shift(c,jitter()),r.map(q=>q*joint),8,5,tilt);
 ellipsoid(g,shift(pose.torso,jitter()),pose.torsoRadii.map(q=>q*(fused?1.1:1)),10,7,pose.torsoTilt||0);
 ellipsoid(g,shift(pose.pelvis,jitter()),pose.pelvisRadii.map(q=>q*(fused?1.08:1)),8,6,pose.pelvisTilt||0);
 // The neck and head are one lump; a fused head sinks into the shoulders.
 const head=fused?pose.head.map((q,k)=>q+(pose.neck[k]-q)*.22):pose.head;
 part(pose.neck,head,.075,.07);ellipsoid(g,shift(head,jitter()),[.135,.17,.12].map(q=>q*(fused?.92:1)),10,7,pose.headTilt||0);
 for(let i=0;i<2;i++){
  const shoulder=pose.shoulders[i],elbow=pose.elbows[i],wrist=pose.wrists[i],hip=pose.hips[i],knee=pose.knees[i],ankle=pose.ankles[i];
  if(!broken){lump(shoulder,[.105,.10,.10]);lump(knee,[.08,.08,.078])}
  part(shoulder,elbow,.088,.068);part(elbow,wrist,.066,.05);
  // A mitten past the wrist, along the forearm: no fingers to count.
  const fore=unit(wrist.map((q,k)=>q-elbow[k]));lump(wrist.map((q,k)=>q+fore[k]*.07),[.055,.075,.045]);
  part(hip,knee,.108,.082);part(knee,ankle,.078,.055);
  const shin=unit(ankle.map((q,k)=>q-knee[k]));lump(ankle.map((q,k)=>q+shin[k]*.05),[.065,.07,.11]);
 }
 // Its lowest point on the floor datum, as the standing four.
 let low=Infinity;for(let i=1;i<g.positions.length;i+=3)low=Math.min(low,g.positions[i]);
 for(let i=1;i<g.positions.length;i+=3)g.positions[i]-=low;
 return g;
}
export function createStBrendansPresenceGeometry({definition=ST_BRENDANS_DEFINITION}={}){
 return new Map([
  ...Object.entries(ST_BRENDANS_PRESENCE_MESHES).map(([pose,name])=>[name,body(ST_BRENDANS_PRESENCE_POSES[pose])]),
  ...Object.entries(ST_BRENDANS_APPARITION_MESHES).map(([pose,name])=>[name,vague(ST_BRENDANS_APPARITION_POSES[pose],definition)]),
 ]);
}
export function presenceBounds(g){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<g.positions.length;i++){const k=i%3;min[k]=Math.min(min[k],g.positions[i]);max[k]=Math.max(max[k],g.positions[i])}return{min,max}}
