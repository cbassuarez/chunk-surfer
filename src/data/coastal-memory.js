// One metre-scaled place shared by the opening memory and its later foot pocket.
// Sea-level origin is vertically beneath the actual road at d304. +X is seaward,
// +Y up, and the road's forward direction is -Z. No renderer or game state here.
import {worldAt} from '../game/source-drive/road.js';
import {OPENING_VEHICLE} from './opening-vehicle.js';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const TAU=Math.PI*2,clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
export const COASTAL_MEMORY_REVISION='coastal-memory-6';
export const COASTAL_NOTE_COPY='For the part that wouldn’t play.';
const road=worldAt(304,0),c=Math.cos(road.heading),s=Math.sin(road.heading);
export const COASTAL_WORLD_FROM_LOCAL=freeze([c,0,s,0,0,1,0,0,-s,0,c,0,32+road.x,road.y-28,32+road.z,1]);
export function coastalWorldPoint(p,m=COASTAL_WORLD_FROM_LOCAL){return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
export function coastalLocalPoint(p,m=COASTAL_WORLD_FROM_LOCAL){const d=p.map((v,i)=>v-m[12+i]);return[m[0]*d[0]+m[1]*d[1]+m[2]*d[2],m[4]*d[0]+m[5]*d[1]+m[6]*d[2],m[8]*d[0]+m[9]*d[1]+m[10]*d[2]];}
export function coastalMultiply(a,b){const out=Array(16).fill(0);for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let i=0;i<4;i++)out[col*4+row]+=a[i*4+row]*b[col*4+i];return out;}
export function coastalBodyMatrix({position,heading=0,pitch=0,roll=0}){const ch=Math.cos(heading),sh=Math.sin(heading),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll),m=[ch*cr-sh*sp*sr,cp*sr,sh*cr+ch*sp*sr,0,-ch*sr-sh*sp*cr,cp*cr,-sh*sr+ch*sp*cr,0,-sh*cp,-sp,ch*cp,0,0,0,0,1];m[12]=position[0]-.85*m[4];m[13]=position[1]+.85-.85*m[5];m[14]=position[2]-.85*m[6];return m;}
export const COASTAL_SETTLED_POSE=freeze({position:[11.5,-3.8,-20.5],heading:.08,pitch:-.12,roll:0});
export const COASTAL_SETTLED_BODY_LOCAL=freeze(coastalBodyMatrix(COASTAL_SETTLED_POSE));
export const COASTAL_SETTLED_BODY_WORLD=freeze(coastalMultiply(COASTAL_WORLD_FROM_LOCAL,COASTAL_SETTLED_BODY_LOCAL));
// Vehicle dimensions are a build receipt only. Runtime attachments consume the
// loaded driving pack metrics; never duplicate its lamps or axle positions here.
const vanDimensions=OPENING_VEHICLE.bodyBox.max.map((v,i)=>v-OPENING_VEHICLE.bodyBox.min[i]);
const rimKnots=[[-210,2],[-100,2.2],[-20,1.4],[-8,1.45],[0,1.45],[6,1.45],[10,3.2],[17,11],[30,27],[45,36],[58,34],[70,22],[85,16],[105,19],[145,15],[220,11],[300,8]];
export function coastalRimX(z){let i=0;while(i<rimKnots.length-2&&z>rimKnots[i+1][0])i++;const[a,b]=[rimKnots[i],rimKnots[i+1]],u=smooth((z-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*u+(.36*Math.sin(z*.47)+.19*Math.sin(z*1.09))*smooth((Math.abs(z)-5)/6);}
// Exact route samples cut a formation into the bank so a raised grass plateau
// cannot occupy the already-authored car lane. The same surface is walkable.
const roadLocal=[];for(let d=172;d<=330;d+=1){const q=worldAt(d),p=coastalLocalPoint([32+q.x,q.y,32+q.z]);roadLocal.push({x:p[0],y:p[1],z:p[2],d,halfWidth:q.halfWidth});}
export const COASTAL_ROAD_FORMATION=freeze(roadLocal);
function roadNear(x,z){let best=null;for(let i=0;i<roadLocal.length-1;i++){const a=roadLocal[i],b=roadLocal[i+1],dx=b.x-a.x,dz=b.z-a.z,u=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)),distance=Math.hypot(x-a.x-u*dx,z-a.z-u*dz);if(!best||distance<best.distance)best={distance,height:a.y+(b.y-a.y)*u,halfWidth:a.halfWidth+(b.halfWidth-a.halfWidth)*u};}return best;}
// A lower erosion bench in the added southern strip, with C2 joins in both
// directions. The old bank at z >= -9 and the actual road/drop stay exact.
export const COASTAL_LOWER_BENCH=freeze({maximumDip:12,centreZ:-49,halfSpan:40,unchangedNorthZ:-9,unchangedSouthZ:-89});
export function coastalLowerOffset(z){const p=COASTAL_LOWER_BENCH,t=z>=p.centreZ?(p.unchangedNorthZ-z)/p.halfSpan:(z-p.unchangedSouthZ)/p.halfSpan;if(t<=0)return 0;const x=Math.min(1,t),e=.2,I=u=>u*u*u-.5*u*u*u*u,F=x<e?e*I(x/e)/(1-e):x>1-e?1-e*I((1-x)/e)/(1-e):(x-e*.5)/(1-e);return p.maximumDip*F;}
export function coastalTerrainHeight(x,z){const plateau=28+.28*Math.sin(z*.055)+.11*Math.cos(x*.12+z*.045)-2.3*smooth((z-72)/43),karst=-.22*Math.exp(-((x-11)**2+(z-57)**2)/90),base=plateau+karst,r=roadNear(x,z),blend=smooth((r.distance-r.halfWidth+.13)/3.1);return Math.min(base,r.height-.13+(base-r.height+.13)*blend)-coastalLowerOffset(z);}
// A clipped metre-scale top mesh. Collision and visible ground consume these
// identical triangles; the procedural height function is not a second floor.
const verts=[],tris=[],rows=105,cols=44,zMin=-49,zMax=119,xMin=-36;
for(let j=0;j<=rows;j++){const z=zMin+(zMax-zMin)*j/rows,rim=coastalRimX(z);for(let i=0;i<=cols;i++){const x=xMin+(rim-xMin)*i/cols;verts.push([x,coastalTerrainHeight(x,z),z]);}}
for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const a=j*(cols+1)+i,b=a+1,d=a+cols+1,e=d+1;tris.push([a,d,b],[b,d,e]);}
export const COASTAL_WALKABLE_SURFACE=freeze({vertices:verts,triangles:tris,rows,cols,zMin,zMax,xMin});
// The cliff/root cap must share this actual triangulated edge. Resampling the
// procedural rim more coarsely creates protruding faces during a small walk.
export function coastalBankEdgeAt(z){const row=Math.max(0,Math.min(rows,(z-zMin)/(zMax-zMin)*rows)),j=Math.min(rows-1,Math.floor(row)),u=row-j,a=verts[j*(cols+1)+cols],b=verts[(j+1)*(cols+1)+cols];return[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];}
function sampleTriangle(x,z,triangle,id){const[a,b,c]=triangle.map(i=>verts[i]),den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)return null;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;if(Math.min(u,v,w)<-1e-7)return null;const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]),n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...n);return{height:a[1]*u+b[1]*v+c[1]*w,normal:n.map(v=>v/length),triangleId:id,walkable:n[1]/length>=.78};}
export function coastalSupportAt(x,z){if(!Number.isFinite(x)||!Number.isFinite(z)||z<zMin||z>zMax||x<xMin||x>coastalRimX(z))return null;const row=Math.min(rows-1,Math.max(0,Math.floor((z-zMin)/(zMax-zMin)*rows)));for(let j=Math.max(0,row-1);j<=Math.min(rows-1,row+1);j++)for(let i=0;i<cols*2;i++){const id=j*cols*2+i,r=sampleTriangle(x,z,tris[id],id);if(r)return r;}return null;}
// A continuous buried cut formation under the retained asphalt tiles. It is
// part of the limestone coast, with one matching footprint per half-metre bay;
// it never raises or replaces the actual walkable bank triangles.
const formationRows=[],formationTriangles=[],formationBarriers=[];
function roadBasePoint(d,lateral,top){const road=worldAt(d,lateral),p=coastalLocalPoint([32+road.x,road.y,32+road.z]),ground=coastalSupportAt(p[0],p[2]);if(!ground)throw Error('Retained road formation leaves the actual bank.');p[1]=top?p[1]-.07:ground.height-.20;return p;}
function formationQuad(a,b,c,d){formationTriangles.push([a,b,c],[a,c,d]);}
for(let d=317;d<=337;d+=.5){const width=worldAt(d).halfWidth+.30;formationRows.push({distance:d,leftTop:roadBasePoint(d,-width,true),rightTop:roadBasePoint(d,width,true),leftBottom:roadBasePoint(d,-width,false),rightBottom:roadBasePoint(d,width,false)});}
for(let i=0;i<formationRows.length-1;i++){const a=formationRows[i],b=formationRows[i+1],A=a.leftTop,B=a.rightTop,C=b.rightTop,D=b.leftTop,aa=a.leftBottom,bb=a.rightBottom,cc=b.rightBottom,dd=b.leftBottom;formationQuad(A,B,C,D);formationQuad(aa,dd,cc,bb);formationQuad(A,D,dd,aa);formationQuad(B,bb,cc,C);if(i===0)formationQuad(A,aa,bb,B);if(i===formationRows.length-2)formationQuad(D,C,cc,dd);const footprint=[A,B,C,D].map(p=>[p[0],p[2]]),groundY=Math.min(aa[1],bb[1],cc[1],dd[1]),height=Math.max(A[1],B[1],C[1],D[1])-groundY;formationBarriers.push({id:'coastal-retained-road-base-'+i,kind:'road-formation',footprint,x:footprint.reduce((n,p)=>n+p[0],0)/4,z:footprint.reduce((n,p)=>n+p[1],0)/4,groundY,height,visibilityHeight:height,mesh:'cm_limestone_coast'});}
export const COASTAL_RETAINED_ROAD_BASE=freeze({start:317,end:337,rowSpacing:.5,edgeMargin:.30,crestOffset:-.07,burialDepth:.20,rows:formationRows,triangles:formationTriangles});
export const COASTAL_RETAINED_ROAD_BARRIERS=freeze(formationBarriers);
// Broken bedrock follows the jointed edge in irregular groups. These exact
// polygons are also the foot collision; the profiles are shared with the GLB.
export const COASTAL_OUTCROP_PROFILES=freeze([
 [[-.94,-.50],[-.55,-.97],[.34,-1.02],[.86,-.62],[1.04,.12],[.57,.87],[-.18,1.05],[-.79,.66],[-1.02,.06]],
 [[-.87,-.72],[-.22,-1.06],[.65,-.90],[1.01,-.24],[.83,.53],[.24,1.02],[-.54,.86],[-1.03,.22]],
 [[-.97,-.23],[-.63,-.91],[.12,-1.03],[.82,-.70],[1.02,.03],[.73,.79],[-.03,1.04],[-.74,.61]],
 [[-.83,-.78],[-.09,-1.04],[.59,-.86],[1.03,-.16],[.66,.43],[.39,1.03],[-.41,.92],[-.98,.34]],
]);
const geologyRandom=i=>{const v=Math.sin(i*71.317+19.17)*43758.5453;return v-Math.floor(v);};
export function coastalOutcropFootprint(b){const c=Math.cos(b.yaw||0),s=Math.sin(b.yaw||0);return COASTAL_OUTCROP_PROFILES[b.variant||0].map(([x,z])=>[b.x+c*x*b.radiusX+s*z*b.radiusZ,b.z-s*x*b.radiusX+c*z*b.radiusZ]);}
function footprintDistance(x,z,polygon){let inside=false,nearest=Infinity;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[j],b=polygon[i];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;const dx=b[0]-a[0],dz=b[1]-a[1],u=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz));nearest=Math.min(nearest,Math.hypot(x-a[0]-u*dx,z-a[1]-u*dz));}return inside?0:nearest;}
const barrier=[];let rimZ=15.6,rimIndex=0;
while(rimZ<zMax-1){const i=rimIndex++,r=n=>geologyRandom(i*13+n),x=coastalRimX(rimZ)-.14-.15*r(1),radiusX=.55+.39*r(2),radiusZ=.72+.98*r(3),b={id:'limestone-rim-'+i,kind:'rim',x,z:rimZ,radius:radiusX,radiusX,radiusZ,height:(i===27||i===28) ? .70 :.52+.91*r(4),yaw:(r(5)-.5)*.72,variant:i%4,groundY:coastalTerrainHeight(x,rimZ)-.14};
 // The first descent looks over two naturally fractured knee-high blocks. Their
 // exact base/contact polygons remain solid; the former tall tooth hid almost
 // the entire pier despite a clear ray to the pier's near-end anchor.
 if(i===27||i===28)b.authoredFracture='Pier approach viewshed; same bedding footprint, lower broken crown.';
 b.footprint=coastalOutcropFootprint(b);if(b.footprint.every(p=>p[1]<40)||b.footprint.every(p=>p[1]>48))barrier.push(b);
 if(i%5===2){const z=rimZ+.45,x2=x-.62,b2={id:'limestone-rim-fragment-'+i,kind:'rim',x:x2,z,radius:.37,radiusX:.37,radiusZ:.51+.15*r(6),height:.48+.18*r(7),yaw:-.3+r(8),variant:(i+1)%4,groundY:coastalTerrainHeight(x2,z)-.10};b2.footprint=coastalOutcropFootprint(b2);if(b2.footprint.every(p=>p[1]<40)||b2.footprint.every(p=>p[1]>48))barrier.push(b2);}
 rimZ+=1.30+radiusZ*.76+1.12*r(9);
}
for(let z=zMin;z<=zMax;z+=2)barrier.push({id:'inland-outcrop-'+Math.round(z*10),kind:'inland',x:xMin+.32,z,radius:1.3,height:2.5+.4*Math.cos(z*.4),groundY:coastalTerrainHeight(xMin+.32,z)});
for(let x=xMin+2;x<coastalRimX(zMin)-1;x+=2)barrier.push({id:'south-outcrop-'+Math.round(x*10),kind:'inland',x,z:zMin+.45,radius:1.3,height:2.3,groundY:coastalTerrainHeight(x,zMin+.45)});
for(let x=xMin+2;x<coastalRimX(zMax)-1;x+=2)barrier.push({id:'north-outcrop-'+Math.round(x*10),kind:'inland',x,z:zMax-.45,radius:1.3,height:2.3,groundY:coastalTerrainHeight(x,zMax-.45)});
for(const b of barrier)b.visibilityHeight=b.height*(b.kind==='rim'?1.16:1.04);
export const COASTAL_RIM_BARRIERS=freeze(barrier);
export const COASTAL_PHYSICAL_BARRIERS=freeze([...COASTAL_RIM_BARRIERS,...COASTAL_RETAINED_ROAD_BARRIERS]);
const boxGround=coastalSupportAt(27,43).height;
export function coastalCanOccupy(x,z,feet=null,radius=.24){const centre=coastalSupportAt(x,z);if(!centre?.walkable||Number.isFinite(feet)&&Math.abs(centre.height-feet)>.40)return false;if(Math.hypot(x-27,z-43)<.56+radius)return false;for(const b of COASTAL_PHYSICAL_BARRIERS)if(b.footprint?footprintDistance(x,z,b.footprint)<radius:Math.hypot(x-b.x,z-b.z)<b.radius+radius)return false;for(let i=0;i<8;i++){const a=i/8*TAU,p=coastalSupportAt(x+Math.cos(a)*radius,z+Math.sin(a)*radius);if(!p?.walkable||Math.abs(p.height-centre.height)>.28)return false;}return true;}
// Working utility fittings reveal the real underlip stock and far deck, rather than
// making the distant pier stock itself emissive. The old far fitting is retained.
function pierFixture(id,side,z,radius,targetZ){const opticalX=side*1.55;return{id,mastBase:[side*1.95,0,z],mastTop:[side*1.95,3.85,z],armEnd:[opticalX,3.85,z],neckBottom:[opticalX,3.72,z],glassCenter:[opticalX,3.55,z],glassSize:[.14,.22,.14],aperture:[opticalX,3.43,z],cageHalfWidth:.09,cageBottom:3.38,cageTop:3.72,shadowTarget:[0,.095,targetZ],color:[1,.74,.46],intensity:2.4,radius};}
function pierBulkhead(id,z,targetZ){return{id,kind:'underlip-bulkhead',mounts:[{from:[-2.155,-.08,z-.09],to:[-2.46,-.08,z-.09],radius:.015},{from:[-2.155,-.08,z+.09],to:[-2.46,-.08,z+.09],radius:.015}],glassCenter:[-2.55,-.08,z],glassSize:[.14,.22,.14],aperture:[-2.55,-.20,z],cageHalfWidth:.09,cageBottom:-.25,cageTop:.09,shadowTarget:[-2.155,-1.5,targetZ],color:[1,.74,.46],intensity:2.4,radius:14};}
const pierFixtures=freeze([pierBulkhead('coastal-pier-near-marker',3,11),pierBulkhead('coastal-pier-middle-marker',17,25),pierFixture('coastal-pier-marker',1,31,24,17)]);
export const COASTAL_MEMORY_LAYOUT=freeze({schema:1,revision:COASTAL_MEMORY_REVISION,units:'metres',seaY:0,lipY:28,frame:{roadDistance:304,worldFromLocal:COASTAL_WORLD_FROM_LOCAL},settledPose:COASTAL_SETTLED_POSE,settledBodyLocal:COASTAL_SETTLED_BODY_LOCAL,settledBodyWorld:COASTAL_SETTLED_BODY_WORLD,vanDimensions,headland:{id:'coastal-headland',spur:[35,28,45]},spawn:{x:.94533163695,z:-45,feet:coastalSupportAt(.94533163695,-45).height,yaw:2.73481727533,pitch:-.55},musicBox:{id:'coastal-broken-music-box',x:27,z:43,y:boxGround+.68,groundY:boxGround,plinthHeight:.68,interactionRadius:1.45},note:{id:'coastal-damp-note',position:[27.24,boxGround+.681,43.015],contentStatus:'Anonymous provisional copy owned by narrative host; no invented signature or backstory.'},pier:{id:'coastal-distant-pier',position:[110,4.6,200],heading:-.18,deckLength:34,width:4.8,structure:{pileRadius:.24,pileBottomSeaY:-10.3,pileTopLocalY:-.815,tideBandTopSeaY:.85,girderDepth:.50,girderTopLocalY:-.065,transverseDepth:.25},fixture:pierFixtures[2],fixtures:pierFixtures},arrivalPath:[[.94533163695,-45],[-.5,-43],[-.5,-29],[.2,-15],[.2,-2],[.2,6],[4,16],[15,30],[25.9,41.8],[25.9,43]],coastalPath:[[25.9,43],[25.9,41.6],[34.6,42.5],[35,43],[31.811984,50],[31.275915,56],[27.424861,62],[19.893308,68],[17.706081,74],[14.388407,80],[13.07639,86],[13.07639,88]],pierReturnPlane:{id:'coastal-first-descent',point:{x:13.07639,z:87},normal:{x:0,z:1},halfWidth:48,meaning:'Clear first descent toward the distant pier, before the actual road-formation trench; not pier arrival.'},barriers:COASTAL_PHYSICAL_BARRIERS,supportAt:coastalSupportAt,canOccupy:coastalCanOccupy});
