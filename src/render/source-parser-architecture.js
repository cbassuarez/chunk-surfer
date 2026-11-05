// The existing dimensional route is a parse tree made solid. A scope has an
// actual entrance and return in the journey charts; the Catch continues it
// downward through the three real release edges. No new portal or support is
// implied by the punctuation, and no vertex follows a camera or a clock.
import {JOURNEY_PORTALS} from '../data/source-continuation-journey.js';
import {SOURCE_CONTINUATION as C,CONTINUATION_CATCH_STAGES,CONTINUATION_DROP_LIPS,continuationRadialPoint} from '../data/source-continuation.js';
import {portalMultiply,portalTransformPoint,transformPortalPlanes} from './source-mesh-portals.js';
import {sourceRestReturnRoom} from './source-rest-return.js';
import {sourceContinuationVoidCopies} from './source-continuation-void.js';

const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(v,n)=>v.map(x=>x*n),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),
  cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>mul(v,1/Math.max(1e-9,Math.hypot(...v)));
const prefix='source-parser-';
export const SOURCE_PARSER_ARCHITECTURE=freeze({version:1,clearance:.18,stroke:.14,thickness:.16,maxReceivingShells:3,maxCanonicalProps:24,maxImages:96,
  grammar:'paired delimiters around existing world scopes',fixed:true,collision:false});

const scopes=[{id:'chart-0',parent:null,depth:0,chartId:0,region:'wrong-return'}];
for(let chartId=1;chartId<=4;chartId++)scopes.push({id:'chart-'+chartId,parent:'chart-'+(chartId-1),depth:chartId,chartId,region:'wrong-return'});
for(const stage of CONTINUATION_CATCH_STAGES)scopes.push({id:'catch-'+stage.level,parent:stage.level?'catch-'+(stage.level-1):'chart-4',depth:5+stage.level,chartId:0,region:'catch',level:stage.level});
export const SOURCE_PARSER_SCOPES=freeze(scopes);

const boxFaces=[[0,1,2,3],[4,5,6,7],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]];
function quad(g,ids,inside){
  let [a,b,c,d]=ids;const at=index=>g.p.slice(index*3,index*3+3),pa=at(a),pb=at(b),pc=at(c),middle=mul(ids.map(at).reduce((v,p)=>add(v,p),[0,0,0]),.25);
  if(dot(cross(sub(pb,pa),sub(pc,pa)),sub(middle,inside))<0)[b,d]=[d,b];
  g.i.push(a,b,c,a,c,d);
}
function cell(g,points){
  const start=g.p.length/3,inside=mul(points.reduce((v,p)=>add(v,p),[0,0,0]),1/points.length);g.p.push(...points.flat());
  for(const face of boxFaces)quad(g,face.map(k=>start+k),inside);
}
function beam(g,a,b,width=.10){
  const along=sub(b,a),axis=unit(along),right=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),up=unit(cross(right,axis)),h=width/2,
    ring=p=>[add(add(p,mul(right,-h)),mul(up,-h)),add(add(p,mul(right,h)),mul(up,-h)),add(add(p,mul(right,h)),mul(up,h)),add(add(p,mul(right,-h)),mul(up,h))];
  cell(g,[...ring(a),...ring(b)]);
}
function ribbon(g,points,{width=SOURCE_PARSER_ARCHITECTURE.stroke,depth=SOURCE_PARSER_ARCHITECTURE.thickness,z=0,offset=[0,0]}={}){
  const first=g.p.length/3,rings=[];
  for(let k=0;k<points.length;k++){
    const point=points[k],a=points[Math.max(0,k-1)],b=points[Math.min(points.length-1,k+1)],
      before=unit([point[0]-a[0],point[1]-a[1],0]),after=unit([b[0]-point[0],b[1]-point[1],0]),
      n0=k?[-before[1],before[0],0]:[-after[1],after[0],0],n1=k<points.length-1?[-after[1],after[0],0]:n0,
      miter=unit(add(n0,n1)),half=Math.min(width, width*.5/Math.max(.35,dot(miter,n0))),normal=mul(miter,half),x=point[0]+offset[0],y=point[1]+offset[1];
    const ring=[[x-normal[0],y-normal[1],z-depth/2],[x+normal[0],y+normal[1],z-depth/2],[x+normal[0],y+normal[1],z+depth/2],[x-normal[0],y-normal[1],z+depth/2]];
    rings.push(ring);g.p.push(...ring.flat());
  }
  for(let k=0;k<rings.length-1;k++){
    const a=first+k*4,b=a+4,inside=mul([...rings[k],...rings[k+1]].reduce((v,p)=>add(v,p),[0,0,0]),.125);
    for(let side=0;side<4;side++)quad(g,[a+side,a+(side+1)%4,b+(side+1)%4,b+side],inside);
    if(k===0)quad(g,[a,a+1,a+2,a+3],inside);
    if(k===rings.length-2)quad(g,[b,b+1,b+2,b+3],inside);
  }
}
function braces(g,{halfWidth=1.6,halfHeight=1.6,z=.15,offsetY=0,shape='curly',growth=0}={}){
  const h=halfHeight+.22+growth,reach=halfWidth+.62+growth,
    left=shape==='square'?[[.32,h],[-.28,h],[-.28,-h],[.32,-h]]:
      [[.32,h],[.04,h],[-.20,h-.26],[-.20,.48],[-.43,.20],[-.62,0],[-.43,-.20],[-.20,-.48],[-.20,-h+.26],[.04,-h],[.32,-h]];
  ribbon(g,left,{z,offset:[-reach,offsetY]});ribbon(g,left.map(([x,y])=>[-x,y]),{z,offset:[reach,offsetY]});
}
function gateGeometry(depth,{halfWidth=1.6,halfHeight=1.6,receiving=true,closing=false}={}){
  const g={p:[],i:[]};braces(g,{halfWidth,halfHeight,shape:closing?'square':'curly'});
  const shells=receiving?Math.min(SOURCE_PARSER_ARCHITECTURE.maxReceivingShells,Math.max(0,depth)):0;
  for(let k=0;k<shells;k++)braces(g,{halfWidth,halfHeight,shape:'square',z:.9+k*.85,growth:.18+k*.11});
  if(shells){
    const x=halfWidth+1.12,low=-halfHeight-.12;
    for(const side of[-1,1])beam(g,[side*x,low,.15],[side*(x+.18+(shells-1)*.11),low-.18-(shells-1)*.11,.9+(shells-1)*.85],.09);
  }
  // Indentation is a short architectural comb above the opening. It belongs
  // to the delimiter, never a UI depth counter or a new navigational marker.
  for(let k=0;k<depth;k++)beam(g,[-.55+k*.17,halfHeight+.55,.15],[-.55+k*.17,halfHeight+.77,.15],.055);
  if(closing){beam(g,[0,halfHeight+.66,.15],[0,halfHeight+.82,.15],.10);beam(g,[0,halfHeight+.56,.15],[-.09,halfHeight+.38,.15],.07);}
  return g;
}
const basis=e=>[...e.right,0,...e.up,0,...e.normal,0,...e.center,1];
const bounds=p=>{const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let k=0;k<p.length;k++){min[k%3]=Math.min(min[k%3],p[k]);max[k%3]=Math.max(max[k%3],p[k]);}return{min,max};};
const placements=[],library=[];
function install(id,geometry,frame,metadata){
  const name=prefix+id,b= bounds(geometry.p),radius=Math.hypot(...[0,1,2].map(k=>Math.max(Math.abs(b.min[k]),Math.abs(b.max[k]))));
  library.push({name,id,kind:'detail',material:'source',materialRole:'source-parser-scope',...geometry,sourceParser:true,bounds:b});
  placements.push({id:name,mesh:name,matrix:frame,cullRadius:radius,parserArchitecture:true,parserScope:metadata.scopeId,nestingDepth:metadata.depth,
    noShadow:true,noReflection:true,structural:false,decorative:true,collidable:false,sourceStructure:'source-parser',...metadata});
}
for(const edge of JOURNEY_PORTALS)for(const side of['a','b']){
  const endpoint=edge[side],other=edge[side==='a'?'b':'a'],catchRoot=edge.id==='catch-closure'&&side==='b',depth=catchRoot?5:endpoint.chartId,
    otherDepth=edge.id==='catch-closure'&&side==='a'?5:other.chartId,scopeId=catchRoot?'catch-0':'chart-'+endpoint.chartId;
  install(edge.id+'-'+side,gateGeometry(depth,{halfWidth:endpoint.halfWidth,halfHeight:endpoint.halfHeight,receiving:side==='b'}),basis(endpoint),
    {chartId:endpoint.chartId,region:catchRoot?'catch':'wrong-return',level:catchRoot?0:null,scopeId,depth,
      realPortalId:edge.id,portalSide:side,scopeFrom:scopeId,scopeTo:otherDepth===5?'catch-0':'chart-'+other.chartId,
      parserFlow:otherDepth>depth?'enter':otherDepth<depth?'return':'crosslink',clearAperture:{halfWidth:endpoint.halfWidth,halfHeight:endpoint.halfHeight},
      parserAnchor:{center:[...endpoint.center],right:[...endpoint.right],up:[...endpoint.up],normal:[...endpoint.normal]}});
}
for(const lip of CONTINUATION_DROP_LIPS){
  const upper=CONTINUATION_CATCH_STAGES[lip.level],lower=CONTINUATION_CATCH_STAGES[lip.level+1],normal=[-lip.dx,0,-lip.dz],right=[normal[2],0,-normal[0]],
    center=[lip.x,upper.y+1.6,lip.z],next=continuationRadialPoint(lower.innerRadius+.65,lip.approachAngle),target=[next.x,lower.y+1.6,next.z],delta=sub(target,center),dy=delta[1],dz=dot(delta,normal),
    g={p:[],i:[]};
  braces(g,{halfWidth:1.25,halfHeight:1.6,z:.12});braces(g,{halfWidth:1.25,halfHeight:1.6,z:dz,offsetY:dy,shape:'square',growth:.12});
  // The two gutters drop through the void beside the actual body's release
  // envelope. They join scopes rather than putting a floor beneath the fall.
  for(const side of[-1,1])beam(g,[side*2.25,-1.72,.12],[side*2.37,dy-1.84,dz],.10);
  install('catch-release-'+lip.level,g,[...right,0,0,1,0,0,...normal,0,...center,1],
    {chartId:0,region:'catch',level:lip.level,scopeId:'catch-'+lip.level,depth:5+lip.level,scopeFrom:'catch-'+lip.level,scopeTo:'catch-'+(lip.level+1),
      realReleaseId:lip.id,parserFlow:'enter',clearAperture:{halfWidth:1.25,halfHeight:1.6},childLevel:lip.level+1,
      parserAnchor:{center,right,up:[0,1,0],normal},childAnchor:{center:target,right:[...right],up:[0,1,0],normal:[...normal]},
      scopesSharePhysicalRoute:true});
}
const final=C.catch.finalDoor;
install('catch-final',gateGeometry(8,{halfWidth:1.05,halfHeight:1.3,closing:true}),[0,0,-1,0,0,1,0,0,1,0,0,0,final.x,final.y+1.3,final.z,1],
  {chartId:0,region:'catch',level:3,scopeId:'catch-3',depth:8,scopeFrom:'catch-3',scopeTo:'outside',realDoorId:'catch-final',parserFlow:'return',
    clearAperture:{halfWidth:1.05,halfHeight:1.3},parserAnchor:{center:[final.x,final.y+1.3,final.z],right:[0,0,-1],up:[0,1,0],normal:[1,0,0]}});

freeze(library);freeze(placements);
export const sourceParserGeometryLibrary=()=>library;
export const sourceParserPlacements=()=>placements;
export function sourceParserArchitectureFrame(state={}, {origin={x:0,y:0,z:0}}={}){
  const offset=[finite(origin.x),finite(origin.y),finite(origin.z)],props=placements.map(p=>{
    const matrix=new Float32Array(p.matrix);for(let k=0;k<3;k++)matrix[12+k]+=offset[k];
    return{...p,matrix,x:matrix[12],y:matrix[13],z:matrix[14]};
  }),scopeId=state.phase==='catch'?'catch-'+Math.max(0,Math.min(3,Math.round(finite(state.level)))):'chart-'+Math.max(0,Math.min(4,Math.round(finite(state.chartId)))),scope=SOURCE_PARSER_SCOPES.find(row=>row.id===scopeId);
  return{props,diagnostics:{active:true,canonicalProps:props.length,scopes:SOURCE_PARSER_SCOPES.length,depth:scope.depth,scopeId,
    portalPairs:JOURNEY_PORTALS.length,releaseWells:CONTINUATION_DROP_LIPS.length,triangles:library.reduce((n,g)=>n+g.i.length/3,0),
    fixedWorld:true,physicalRouteChanged:false,grammar:SOURCE_PARSER_ARCHITECTURE.grammar}};
}

const translation=(x=0,y=0,z=0)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const samePlanes=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length
  &&a.every((plane,k)=>plane.length===b[k]?.length&&plane.every((v,j)=>Math.abs(v-b[k][j])<1e-8));
function withExclude(part,planes){
  const prior=part.portalExcludePlanes||[];
  return prior.some(p=>samePlanes(p,planes))?part:{...part,portalExcludePlanes:[...prior,planes]};
}
function parserImage(part,map,extra){
  const position=portalTransformPoint(map,[part.x,part.y,part.z]);
  return{...part,...extra,matrix:portalMultiply(map,part.matrix),x:position[0],y:position[1],z:position[2],
    ...((part.sourceWorldMatrix||part.surroundings)?{sourceWorldMatrix:portalMultiply(map,part.sourceWorldMatrix||translation())}:{}),
    noShadow:true,noReflection:true};
}

// Share the route's current apertures, never its physical instance allowance.
// Canonical frame coordinates already include origin. Camera compensation and
// the Catch's optional rigid study rotation belong to the host after this step.
export function sourceParserArchitectureImages(frame,{chartId=0,origin={x:0,y:0,z:0},portalViews=[],voidViews=null,sourceExcludes=[],restReturn=null,limit=96}={}){
  const canonical=Array.isArray(frame?.props)?frame.props:[],o={x:finite(origin.x),y:finite(origin.y),z:finite(origin.z)},
    anchor=translation(o.x,o.y,o.z),unanchor=translation(-o.x,-o.y,-o.z),
    cap=Math.min(SOURCE_PARSER_ARCHITECTURE.maxImages,Math.max(0,Math.floor(finite(limit,96)))),
    native=canonical.filter(p=>(p.chartId??0)===chartId).map(p=>({...p,portalExcludePlanes:sourceExcludes.length?[...sourceExcludes]:null})),images=[];
  for(const view of portalViews){
    if(!view.toCurrent||!Array.isArray(view.planes))continue;
    const map=portalMultiply(anchor,portalMultiply(view.toCurrent,unanchor)),planes=transformPortalPlanes(view.planes,anchor);
    for(const part of canonical)if((part.chartId??0)===view.destinationChart)images.push(parserImage(part,map,
      {id:part.id+':through:'+view.id,canonicalId:part.canonicalId||part.id,portalClipPlanes:planes,portalExcludePlanes:null,portalClipId:view.id,portalDestination:true}));
  }
  let before=[...native,...images],returnImages=0;
  if(restReturn?.planes&&restReturn.frame?.toCurrent&&restReturn.frame?.seat){
    before=before.map(part=>withExclude(part,restReturn.planes));
    for(const part of sourceRestReturnRoom(canonical,restReturn.frame.seat)){
      before.push(parserImage(part,restReturn.frame.toCurrent,
        {id:part.id+':through:rest-return:'+restReturn.frame.seatId,canonicalId:part.canonicalId||part.id,
          restReturnDestination:true,portalDestination:true,portalClipId:'rest-return:'+restReturn.frame.seatId,portalClipPlanes:restReturn.planes,portalExcludePlanes:null}));
      returnImages++;
    }
  }
  const props=before.slice(0,cap),voidImages=sourceContinuationVoidCopies({views:voidViews||{domain:null},canonicalProps:canonical,origin:o,remaining:cap-props.length});
  props.push(...voidImages.props);
  return{props,diagnostics:{active:props.length>0,canonical:canonical.length,native:native.length,portalImages:images.length,returnImages,
    voidImages:voidImages.props.length,submitted:props.length,omitted:Math.max(0,before.length-cap)+(voidImages.diagnostics.omittedVisible||0),
    budget:cap,physicalBudgetUsed:0,currentChart:chartId}};
}
