// Independent chart connections. No chapter imports and no global embedding.
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const point=(x,z,feet,chartId=0,extra={})=>({x,z,feet,chartId,phase:'wrong-return',...extra});
const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,s)=>a.map(v=>v*s),neg=a=>mul(a,-1),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const vector=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]);
function rotation(axis,degrees){const a=degrees*Math.PI/180,c=Math.round(Math.cos(a)),s=Math.round(Math.sin(a));return axis==='x'?[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]:axis==='z'?[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]:axis==='y'?[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]:identity();}
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const r=i%4,c=Math.floor(i/4);return a[r]*b[c*4]+a[r+4]*b[c*4+1]+a[r+8]*b[c*4+2]+a[r+12]*b[c*4+3];});
function inverse(m){const n=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1],t=vector(n,neg(m.slice(12,15)));n.splice(12,3,...t);return n;}
const normalPoint=(p,n,d)=>point(p.x+n[0]*d,p.z+n[2]*d,p.feet,p.chartId);
export const SOURCE_JOURNEY=freeze({version:3,catchOffset:{x:-134,y:0,z:-80},gate:{x:-152,y:8.4,z:-92,halfWidth:.9,normal:{x:-1,z:0}},entry:point(-18,-12,8.4),exit:point(-152.4,-92,8.4),bounds:{minX:-210,maxX:40,minZ:-125,maxZ:20,minY:-23,maxY:115}});
export const JOURNEY_CHARTS=freeze([0,1,2,3,4].map(id=>({id,gravity:[0,-9.8,0],name:id?'outward-'+id:'original'})));
const surfaces=[],solids=[],props=[],routes=[],anchors=[],refuges=[],sightlines=[],branchRoutes={},places=[];
function floor(id,a,b,width=4.8,extra={}){const chartId=a.chartId;if(chartId!==b.chartId||a.feet!==b.feet||a.x!==b.x&&a.z!==b.z)throw Error('Journey supports need one axis-aligned chart plane.');const s={id:'journey-'+id,chartId,phase:'wrong-return',region:'wrong-return',kind:'rect',minX:Math.min(a.x,b.x)-width/2,maxX:Math.max(a.x,b.x)+width/2,minZ:Math.min(a.z,b.z)-width/2,maxZ:Math.max(a.z,b.z)+width/2,y:a.feet,thickness:.35,material:'case-lining',construction:'impossible-joint',role:'journey',...extra};surfaces.push(s);return s;}
function path(id,points,width=4.8,extra={}){for(let i=1;i<points.length;i++)floor(id+'-'+i,points[i-1],points[i],width,extra);}
function endpoint(p,normal,up=[0,1,0],right=null){right ||= cross(up,normal);const center=[p.x,p.feet+1.6,p.z],corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(add(center,mul(right,x*1.6)),mul(up,y*1.6)));return{...p,center,origin:center,normal,right,up,corners,halfWidth:1.6,halfHeight:1.6,minY:p.feet,maxY:p.feet+3.2,approach:{...normalPoint(p,normal,4),yaw:Math.atan2(-normal[0],normal[2]),pitch:0}};}
function frame(id,e){const m=[...e.right,0,...e.up,0,...e.normal,0,...e.center,1];props.push({id:'journey-'+id,kind:'journey-frame',chartId:e.chartId,x:e.center[0],y:e.center[1],z:e.center[2],feet:e.feet,width:3.2,height:3.2,frameMatrix:m,portalId:id});const parts=[[-1.76,-1.6,-1.76,1.76],[1.6,1.76,-1.76,1.76],[-1.6,1.6,1.6,1.76],[-1.6,1.6,-1.76,-1.6]];for(let k=0;k<parts.length;k++){const[x0,x1,y0,y1]=parts[k],ps=[];for(const x of[x0,x1])for(const y of[y0,y1])for(const z of[-.12,.12])ps.push(transform(m,[x,y,z]));solids.push({id:'journey-'+id+'-frame-'+k,chartId:e.chartId,phase:'wrong-return',region:'wrong-return',minX:Math.min(...ps.map(p=>p[0])),maxX:Math.max(...ps.map(p=>p[0])),minY:Math.min(...ps.map(p=>p[1])),maxY:Math.max(...ps.map(p=>p[1])),minZ:Math.min(...ps.map(p=>p[2])),maxZ:Math.max(...ps.map(p=>p[2])),role:'arch-pier',material:'cold-wall',portalId:id});}}
function connection(id,aPoint,bPoint,axis,degrees,normal,override=null){const r=override||rotation(axis,degrees),a=endpoint(aPoint,normal),bUp=vector(r,a.up),bRight=neg(vector(r,a.right)),b=endpoint(bPoint,neg(vector(r,normal)),bUp,bRight),t=b.center.map((v,i)=>v-vector(r,a.center)[i]);r.splice(12,3,...t);const inv=inverse(r),p={id,fromChart:a.chartId,toChart:b.chartId,a,b,matrix:r,inverseMatrix:inv,rotation:{axis,degrees},transform:{yaw:0,dx:t[0],dy:t[1],dz:t[2]},reciprocal:true};frame(id+'-a',a);frame(id+'-b',b);return p;}
const portals=[
 connection('first-return',point(-63,-32,8.4,0),point(-63,-6,16.8,1),'x',90,[1,0,0]),
 connection('upper-walk',point(-107,-54,16.8,1),point(-119,-28,8.4,2),'z',90,[0,0,1]),
 connection('under-return',point(-147,-72,8.4,2),point(-143,-40,0,3),'x',-90,[-1,0,0]),
 connection('last-return',point(-177,-88,0,3),point(-165,-64,8.4,4),'z',-90,[0,0,-1]),
 connection('catch-closure',point(-152,-92,8.4,4),point(-152,-92,8.4,0),'none',0,[1,0,0]),
 connection('twisted-shortcut',point(-163,-45,0,3),point(-88,-1,16.8,1),'xz',90,[1,0,0],multiply(rotation('x',90),rotation('z',90))),
 connection('earlier-upper-return',point(-141,-31,8.4,2),point(0,-19,8.4,0),'yx',90,[1,0,0],multiply(rotation('y',90),rotation('x',90))),
];
let previous=SOURCE_JOURNEY.entry;
for(let i=0;i<4;i++){
 const p=portals[i],approach=normalPoint(p.a,p.a.normal,4),corner=point(approach.x,previous.z,previous.feet,previous.chartId),walk=i===1?[previous,point(-83,-1,16.8,1),point(-83,-5,16.8,1),point(-88,-5,16.8,1),point(-93,-5,16.8,1),point(-93,-1,16.8,1),corner,approach]:i===2?[previous,point(-133,-31,8.4,2),point(-136,-31,8.4,2),point(-136,-35,8.4,2),point(-146,-35,8.4,2),point(-146,-31,8.4,2),corner,approach]:i===3?[previous,point(-155,-45,0,3),point(-158,-45,0,3),point(-158,-49,0,3),point(-168,-49,0,3),point(-168,-45,0,3),corner,approach]:[previous,corner,approach];path('outward-'+i,walk,4.8,{material:i===2?'cold-stone':i%2?'piano-wood':'case-lining',lane:'main'});routes.push(...walk);
 const pre=normalPoint(p.a,p.a.normal,.4),crossing=normalPoint(p.a,p.a.normal,-.4),emerge=normalPoint(p.b,p.b.normal,.4);path('source-pad-'+i,[approach,pre],3.8);routes.push(pre,{...crossing,foldId:p.id,foldSide:'a'},{...emerge,foldId:p.id,foldSide:'b'});
 // The brief aperture collars retain the actual square frame clearance. The
 // arrival opens out beyond it, so broad floor cannot skirt a fold's sides.
 const far=normalPoint(p.b,p.b.normal,6),near=normalPoint(p.b,p.b.normal,3);path('receiving-'+i,[normalPoint(p.b,p.b.normal,-1),far],4.0,{lane:'threshold'});floor('arrival-court-'+i,far,far,7,{role:'journey-arrival',material:i===0?'piano-wood':i===1?'cold-stone':'case-lining'});routes.push(far,near);
 const right=cross([0,1,0],p.b.normal),side=point(near.x+right[0]*5,near.z+right[2]*5,near.feet,near.chartId);path('recognition-exit-'+i,[near,side],4.4,{lane:'main'});routes.push(side);
 const landmark={...approach,id:'journey-'+p.id+'-landmark'};props.push({...landmark,kind:'journey-landmark',x:landmark.x,y:landmark.feet,z:landmark.z,yaw:Math.atan2(-p.a.normal[0],p.a.normal[2]),width:2.2,height:2.4,portalId:p.id});
 for(const[d,k]of[[5,0],[3,1]]){const eyeP=normalPoint(p.b,p.b.normal,d),target={x:landmark.x,y:landmark.feet+1.25,z:landmark.z};sightlines.push({id:p.id+'-recognition-'+k,portalId:p.id,foldId:p.id,side:'b',chartId:p.toChart,targetChart:p.fromChart,eye:{x:eyeP.x,y:eyeP.feet+1.62,z:eyeP.z},feet:eyeP.feet,yaw:Math.atan2(-p.b.normal[0],p.b.normal[2]),pitch:0,target,presentedTarget:transform(p.matrix,[target.x,target.y,target.z]),anchorId:landmark.id,throughPortal:true});}
 anchors.push({id:'journey-'+p.id+'-arrival',...far,radius:1,earnedBy:'supported-arrival',foldId:p.id});previous=side;
}
const finish=[previous,point(-146,previous.z,8.4,4),point(-146,-92,8.4,4),point(-150.5,-92,8.4,4)];
for(let i=1;i<finish.length;i++)floor('final-reach-'+i,finish[i-1],finish[i],i===3?3.8:5.2,{lane:i===3?'threshold':'main'});
path('gate-source-pad',[finish.at(-1),normalPoint(portals[4].a,portals[4].a.normal,-.4)],3.8);routes.push(...finish,{...normalPoint(portals[4].a,portals[4].a.normal,-.4),foldId:'catch-closure',foldSide:'a'},{...normalPoint(portals[4].b,portals[4].b.normal,.4),foldId:'catch-closure',foldSide:'b'});
// A usable earlier-chart shortcut. Its real broad pads connect to the existing
// runs; neither a preview nor an unseen neighbour awards an arrival anchor.
for(const e of[portals[5].a,portals[5].b,portals[6].a]){const pad=normalPoint(e,e.normal,3);path('shortcut-'+e.chartId,[normalPoint(e,e.normal,-1),pad],3.8);}
path('shortcut-1-link',[point(-88,-1,16.8,1),point(-88,-5,16.8,1),point(-93,-5,16.8,1),point(-93,-1,16.8,1)],3.2,{lane:'branch'});
for(const[id,p,target]of[['twisted-shortcut',portals[5],point(-88,-5,16.8,1)],['earlier-upper-return',portals[6],point(0,-15,8.4,0)]]){
 for(const[d,k]of[[8,0],[5,1]]){const eye=normalPoint(p.a,p.a.normal,d),target3=[target.x,target.feet+1.25,target.z];sightlines.push({id:id+'-forward-'+k,portalId:id,side:'a',chartId:p.fromChart,targetChart:p.toChart,eye:{x:eye.x,y:eye.feet+1.62,z:eye.z},feet:eye.feet,yaw:Math.atan2(-p.a.normal[0],p.a.normal[2]),pitch:0,target:{x:target3[0],y:target3[1],z:target3[2]},presentedTarget:transform(p.inverseMatrix,target3),throughPortal:true,forwardRecognition:true});}
 props.push({...target,id:'journey-'+id+'-old-landmark',kind:'journey-landmark',x:target.x,y:target.feet,z:target.z,yaw:0,width:2.2,height:2.4,portalId:id});
}
// Each outward chart has a second route around a real open court. Both ends
// rejoin the main walk; these are usable escape choices, not decorative decks.
// The last court stays before z=-61, preserving the physical corridor ahead.
const courts=[
 {id:'soundboard-court',name:'The sounding gallery',chartId:1,feet:16.8,material:'piano-wood',route:[[-78,-1],[-78,-24],[-97,-24],[-97,-38],[-107,-38]],refuge:[-100,-18],neck:[[-107,-18],[-100,-18]],height:5.4},
 {id:'masonry-court',name:'The broken arcade',chartId:2,feet:8.4,material:'cold-stone',route:[[-129,-31],[-129,-50],[-137,-50],[-137,-60],[-151,-60]],refuge:[-121,-50],neck:[[-129,-50],[-121,-50]],height:4.2},
 {id:'binding-court',name:'The binding shelter',chartId:3,feet:0,material:'case-lining',route:[[-149,-45],[-149,-69],[-163,-69],[-163,-80],[-177,-80]],refuge:[-156,-40],neck:[[-156,-45],[-156,-40]],height:2.8},
 {id:'last-court',name:'The split lookout',chartId:4,feet:8.4,material:'cold-wall',route:[[-160,-61],[-160,-43],[-140,-43],[-140,-55],[-146,-55],[-146,-61]],refuge:[-133,-43],neck:[[-140,-43],[-133,-43]],height:7.2},
];
function architectureBox(id,p,x0,x1,z0,z1,y0,y1,material){solids.push({id:'journey-'+id,chartId:p.chartId,phase:'wrong-return',region:'wrong-return',minX:p.x+x0,maxX:p.x+x1,minZ:p.z+z0,maxZ:p.z+z1,minY:p.feet+y0,maxY:p.feet+y1,role:'journey-architecture',material});}
for(const court of courts){
 const {id,chartId,feet,material,height}=court,toPoint=([x,z])=>point(x,z,feet,chartId),loop=court.route.map(toPoint),neck=court.neck.map(toPoint),refuge=toPoint(court.refuge);
 path(id+'-loop',loop,3.2,{lane:'branch',material,placeId:id});branchRoutes[id]=loop;
 path('refuge-'+chartId+'-neck',neck,3.2,{lane:'branch',material,placeId:id});branchRoutes[id+'-overlook']=neck;
 floor('refuge-'+chartId,refuge,refuge,6.4,{role:'journey-refuge',material,placeId:id});
 // The refuge centre and both diagonal views stay clear. Its posts, ribs and
 // canopy have matching collision/render boxes, all outside the walking line.
 for(const x of[-2.6,2.6])for(const z of[-2.6,2.6])architectureBox(id+'-pier-'+x+'-'+z,refuge,x-.22,x+.22,z-.22,z+.22,0,height,material);
 for(const z of[-2.6,2.6])architectureBox(id+'-rib-'+z,refuge,-2.82,2.82,z-.22,z+.22,height-.2,height+.2,material);
 if(chartId===3)architectureBox(id+'-canopy',refuge,-2.82,2.82,-2.82,2.82,height,height+.3,'piano-wood');
 if(chartId===4)for(const z of[-2.6,2.6])architectureBox(id+'-split-fin-'+z,refuge,-1,1,z-.22,z+.22,0,height,'cold-stone');
 places.push({id,name:court.name,chartId,material,arrival:normalPoint(portals[chartId-1].b,portals[chartId-1].b.normal,6),loop,overlook:refuge,refuge,neck,mainWidth:chartId===4?5.2:4.8,branchWidth:3.2});
}
// Preserve the two established recovery pockets and their order for saves and
// existing inspection tools; the new middle and final pockets follow them.
for(const chartId of[1,3,2,4]){const p=places.find(p=>p.chartId===chartId).refuge;refuges.push({id:'journey-refuge-'+chartId,...p});}
export const JOURNEY_PORTALS=freeze(portals);
export const JOURNEY_FOLDS=JOURNEY_PORTALS;
export const JOURNEY_SURFACES=freeze(surfaces);
export const JOURNEY_JOINT_SOLIDS=freeze(solids);
export const JOURNEY_DOORS=freeze([]);
export const JOURNEY_ROUTES=freeze({main:routes,...branchRoutes});
export const JOURNEY_PLACES=freeze(places);
export const JOURNEY_SIGHTLINES=freeze(sightlines);
export const JOURNEY_PROPS=freeze(props);
export const JOURNEY_ARRIVAL_ANCHORS=freeze(anchors);
export const JOURNEY_REFUGES=freeze(refuges);
export const JOURNEY_REVIEW_STAGES=freeze(portals.slice(0,4).map(p=>({id:'ii-fold-'+p.id,portalId:p.id,...p.a.approach})));
