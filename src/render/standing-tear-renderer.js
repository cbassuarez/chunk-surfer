// One finite, supported Source basin. The scene, its threshold preview and the
// ordinary building all borrow the same prop/depth/acquisition context.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import {CELL,EYE,MATERIAL,ZONE} from '../data/floorplan/legend.js';
import {STANDING_TEAR_LAYOUT as LAYOUT} from '../data/standing-tear.js';
import {standingTearFolds,standingTearRibbonSegments} from '../data/standing-tear-folds.js';
import {STANDING_TEAR_MEMORIES,STANDING_TEAR_PANEL_DEFINITIONS,standingTearPressurePanels} from '../data/standing-tear-pressure.js';
import {standingTearMemoryPulse} from '../data/standing-tear-memory-score.js';
import {standingTearEarLetteringGeometry,standingTearEarLetteringFor,STANDING_TEAR_LETTERING_MATERIAL as EAR_PAINT} from './standing-tear-lettering.js';
import {sourceContinuationMeshPayload} from './source-continuation-renderer.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
import {standingTearSourceMaps,standingTearSourceUV,STANDING_TEAR_SOURCE_PRINT,STANDING_TEAR_PRINT_SCALE} from './standing-tear-print.js';

const PREFIX='standing-tear-',finite=(n,f=0)=>Number.isFinite(Number(n))?Number(n):f;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,finite(n)));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const matrix=(x=0,y=0,z=0,yaw=0,sx=1,sy=sx,sz=sx)=>{
  const c=Math.cos(yaw),s=Math.sin(yaw);return new Float32Array([c*sx,0,s*sx,0,0,sy,0,0,-s*sz,0,c*sz,0,x,y,z,1]);
};
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const rotationZ=a=>new Float32Array([Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1]);
const transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const faces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[0,1,5,4],[3,7,6,2]];
function box(x0,x1,y0,y1,z0,z1){return{p:[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]].flat(),i:faces.flatMap(([a,b,c,d])=>[a,c,b,a,d,c])};}
function append(target,piece,m=identity()){
  const offset=target.p.length/3;for(let k=0;k<piece.p.length;k+=3)target.p.push(...transform(m,piece.p.slice(k,k+3)));
  target.i.push(...piece.i.map(k=>k+offset));return target;
}
function joined(boxes){return boxes.reduce((g,b)=>append(g,box(...b)),{p:[],i:[]});}
function foldedSheet(width,height,depth=.10){
  // The folds have real thickness and side faces: they occlude each other
  // from the working positions instead of depending on a painted backdrop.
  const g={p:[],i:[]},segments=6;
  for(let k=0;k<segments;k++){
    const x0=(k/segments-.5)*width,x1=((k+1)/segments-.5)*width,z0=(k%2?-.5:.5)*depth,z1=(k%2?.5:-.5)*depth;
    const p=[[x0,-height/2,z0-.08],[x1,-height/2,z1-.08],[x1,-height/2,z1+.08],[x0,-height/2,z0+.08],[x0,height/2,z0-.08],[x1,height/2,z1-.08],[x1,height/2,z1+.08],[x0,height/2,z0+.08]].flat();
    append(g,{p,i:faces.flatMap(([a,b,c,d])=>[a,c,b,a,d,c])});
  }return g;
}
const foldAtRest=standingTearFolds({elapsed:0});
const ribbonDefinitions=foldAtRest.filter(f=>f.role==='overhead-fold').flatMap(fold=>standingTearRibbonSegments(fold).map(segment=>({id:segment.id,foldId:fold.id,index:segment.index,length:segment.size[2]})));
const library=[
  {id:'dark',kind:'detail',material:'dark',...box(-.5,.5,-.5,.5,-.5,.5)},
  {id:'copper',kind:'detail',material:'copper',...box(-.5,.5,-.5,.5,-.5,.5)},
  {id:'paper',kind:'detail',material:'paper',...box(-.5,.5,-.5,.5,-.5,.5)},
  {id:'light',kind:'detail',material:'light',...box(-.5,.5,-.5,.5,-.5,.5)},
  {id:'seam-edge',kind:'detail',material:'paper',...foldedSheet(1,1,.15)},
  // Bake the actual metre dimensions before sourcePrintUV is generated.
  // Scaling a one-metre UV tile to90m made one word cover the whole wall.
  {id:'support-slab',kind:'detail',material:'source',...box(-10,10,-.3,.3,-10,10)},
  // A low cut through the supported field makes the finite walking edge
  // physical. It is a bank of stock, never the former complete high room.
  {id:'field-cut-bank',kind:'detail',material:'source',printScale:[8,1],sourceLayer:7,...joined([
    [-10,10,-.6,-.34,-.55,.55],[-10,10,-.31,-.08,-.55,.55],
    [-10,10,-.055,.25,-.55,.55],[-10,10,.275,.6,-.55,.55],
  ])},
  {id:'field-cut-strata',kind:'detail',material:'paper',...joined([
    [-10,10,-.34,-.31,-.55,.55],[-10,10,-.08,-.055,-.55,.55],[-10,10,.25,.275,-.55,.55],
  ])},
  ...STANDING_TEAR_MEMORIES.map((memory,index)=>({id:'music-ground-'+memory.id,kind:'detail',material:'source',printScale:[8,1],sourceLayer:index*2+2,...box(-4.8,4.8,-.006,.006,-4.8,4.8)})),
  ...STANDING_TEAR_PANEL_DEFINITIONS.map((panel,index)=>({id:panel.id,kind:'detail',material:'source',printScale:STANDING_TEAR_PRINT_SCALE.floor,sourceLayer:index%8+1,...box(-panel.width/2,panel.width/2,-panel.height/2,panel.height/2,-panel.thickness/2,panel.thickness/2)})),
  ...ribbonDefinitions.map((piece,index)=>({id:piece.id,kind:'detail',material:'source',printScale:STANDING_TEAR_PRINT_SCALE.fold,sourceLayer:index%8+1,...box(-4,4,-.6,.6,-piece.length/2,piece.length/2)})),
  ...standingTearEarLetteringGeometry(),
].map(piece=>({...piece,name:PREFIX+piece.id}));
const payloads=new Map(library.map(piece=>[piece.name,sourceContinuationMeshPayload(piece)]));
const meshName=id=>PREFIX+id;
const paint={source:[1,1,1,1],metal:[.12,.17,.19,1],dark:[.014,.025,.029,1],ivory:[.66,.67,.55,1],copper:[.40,.25,.13,1],paper:[.54,.60,.61,1],light:[.55,.73,.68,1],cloth:[.075,.13,.17,1],skin:[.43,.25,.16,1]};
const required=library.map(piece=>piece.name);
export const STANDING_TEAR_RENDER_BUDGET=Object.freeze({far:320,basin:{minX:-80,maxX:80,minZ:-30,maxZ:210},maxHeight:90,customMeshes:library.length,customTriangles:library.reduce((n,p)=>n+p.i.length/3,0),lights:7});
export function standingTearGeometry(){return library;}

export function installStandingTearMeshes(gl,pack,{maps=null}={}){
  if(!gl||!pack?.catalog)return false;
  for(const piece of library){
    if(pack.catalog.has(piece.name))continue;
    const source=piece.material==='source',earPaint=piece.material==='ear-pigment',printed=source?(maps||standingTearSourceMaps(gl,{layer:piece.sourceLayer||1})):null;
    const data=payloads.get(piece.name),uvs=new Float32Array(data.uvs.length);
    for(let v=0;v<data.positions.length;v+=3)uvs.set(standingTearSourceUV([...data.positions.slice(v,v+3)],[...data.normals.slice(v,v+3)],piece.printScale||(piece.id==='support-slab'?STANDING_TEAR_PRINT_SCALE.floor:STANDING_TEAR_PRINT_SCALE.wall)),v/3*2);
    const vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,source?uvs:data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{standingTear:true,triangles:data.triangles,bounds:{min:data.bounds.min,max:data.bounds.max}},primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,base:earPaint?EAR_PAINT.base:paint[piece.material],emissive:source?[.010,.022,.016]:piece.material==='light'?[.015,.03,.025]:[0,0,0],texture:source?printed.texture:null,normalTexture:null,ormTexture:null,letteringFinish:null,materialFactors:'gltf',metallic:piece.material==='metal'?.62:0,roughness:earPaint?EAR_PAINT.roughness:1,aoStrength:0,portrait:false,alphaCut:0,materialName:earPaint?EAR_PAINT.name:`Standing Tear ${piece.material}`,printedSurface:source?STANDING_TEAR_SOURCE_PRINT:null}]});
  }gl.bindVertexArray(null);return required;
}
const placed=(id,mesh,m,extra={})=>({id:PREFIX+id,mesh:meshName(mesh),matrix:m,x:m[12],y:m[13],z:m[14],zone:ZONE.sourceSpace,structural:true,noShadow:true,noReflection:true,sourceStructure:'standing-tear',...extra});
const pigmentMatrix=(width,height)=>new Float32Array([-width,0,0,0,0,height,0,0,0,0,-1,0,0,0,0,1]);
const cameraFrame=frame=>{
  const p=frame?.pose||frame?.player||{},eye=frame?.camera?.eye||[finite(p.x),finite(p.feet)+1.62,finite(p.z,.5)];
  return{eye:[...eye],yaw:finite(frame?.camera?.yaw,finite(p.yaw,Math.PI)),pitch:finite(frame?.camera?.pitch,finite(p.pitch))};
};
function unscaledFoldMatrix(fold){const m=new Float32Array(fold.matrix);for(let col=0;col<3;col++)for(let row=0;row<3;row++)m[col*4+row]/=fold.size[col];return m;}

// These are marks on the stock the player raises. They inherit its hinge and
// bearing rather than facing the camera or becoming a second prompt layer.
const pressureWriting=Object.freeze([
  [{text:'THE REFERENCE IS NOT TO BE',x:-1,y:2.35,w:18.4,h:1.0,tilt:-.018},{text:'STOPPED BETWEEN ATTEMPTS',x:.7,y:1.12,w:17.2,h:1.0,tilt:.012}],
  [{text:'THEY ARE WAITING ON ME',x:-1.2,y:2.15,w:16.6,h:1.18,tilt:.021}],
  [{text:'AGAIN',x:2,y:2.15,w:5.8,h:1.5,tilt:-.07},{text:'AGAIN',x:2.19,y:2.06,w:5.8,h:1.5,tilt:-.048}],
  [{text:'PERFECT PRACTICE MAKES',x:-1.1,y:3.08,w:17,h:1.18,tilt:-.025},{text:'FOR A PROPER PERFORMANCE',x:.8,y:1.82,w:18.8,h:1.06,tilt:.018}],
  [{text:'AGAIN',x:-3.5,y:2.25,w:6.5,h:1.65,tilt:.045},{text:'AGAIN',x:-3.34,y:2.16,w:6.5,h:1.65,tilt:.061},{text:'AGAIN',x:5.8,y:1.23,w:4.3,h:1.2,tilt:-.09}],
  [{text:'CHUNK SURFER',x:-4.2,y:1.82,w:5.9,h:.68,tilt:-.022},{text:'AGAIN',x:4.9,y:3.1,w:5.4,h:1.4,tilt:.032}],
]);
function writeOnCourse(props,panel,local,memory){
  if(!memory.awake)return;
  const z=-panel.size[2]/2-.0002;
  pressureWriting[panel.index].forEach((line,index)=>{
    const pose=multiply(matrix(line.x,-panel.size[1]/2+line.y,z),rotationZ(line.tilt));
    const ink=multiply(local,multiply(pose,pigmentMatrix(line.w,line.h))),mesh=standingTearEarLetteringFor(line.text);
    props.push(placed(`pressure-writing-${panel.index}-${index}`,mesh.id,ink,{text:line.text,
      standingTearRole:'pressure-writing',panelId:panel.id,memoryId:panel.memoryId,physical:true,
      writingTreatment:'ear-room-pressed-pigment',cullRadius:24}));
  });
}

export function standingTearRenderFrame(frame={},presentation={}){
  const props=[],lights=[],labels=[],camera=cameraFrame(frame),elapsed=finite(frame.elapsed),fold=smooth(frame.entryFold??elapsed);
  const memories=STANDING_TEAR_MEMORIES.map(definition=>({...definition,awake:false,awakeSeconds:0,pressure:0,...frame.memories?.find(memory=>memory.id===definition.id)}));
  const architecture=memories.some(memory=>memory.awake);
  const reduced=presentation.reduceMotion===true||presentation.reducedMotion===true;
  const put=(id,mesh,m,extra={})=>props.push(placed(id,mesh,m,extra));
  // The floor spans the exact controller support union. Seams remain flush;
  // there are no inaccessible islands painted over a narrow walking corridor.
  for(let row=0;row<12;row++)for(let col=0;col<8;col++)put(`floor-${row}-${col}`,'support-slab',matrix(-70+col*20,-.3,-20+row*20),{standingTearRole:'basin-support',supportY:0});
  const bank=(id,boundary,x,z,yaw,index)=>{
    const height=[1.12,1.24,1.18,1.32][index%4],m=matrix(x,height/2,z,yaw,1,height/1.2,1);
    put('margin-'+id,'field-cut-bank',m,{standingTearRole:'field-margin',physicalBoundary:boundary,height,cullRadius:21});
    put('margin-strata-'+id,'field-cut-strata',m,{standingTearRole:'field-margin-strata',physicalBoundary:boundary,height,cullRadius:21});
  };
  for(const sign of[-1,1])for(let index=0;index<12;index++)bank(`side-${sign}-${index}`,sign*80,sign*80.55,-20+index*20,Math.PI/2,index);
  for(const end of[-30,210])for(let index=0;index<8;index++)bank(`end-${end}-${index}`,end,-70+index*20,end+(end<0?-.55:.55),0,index);
  const folds=standingTearFolds(frame,{reducedMotion:reduced});
  // The remote interlocked courses remain immense. The former completed
  // perimeter is absent: the bodily enclosure is what this walk constructs.
  for(const fold of folds.filter(fold=>fold.role==='overhead-fold')){
    for(const part of standingTearRibbonSegments(fold)){
      const def=ribbonDefinitions.find(d=>d.id===part.id),segment=new Float32Array(part.matrix);
      for(let col=0;col<3;col++)for(let row=0;row<3;row++)segment[col*4+row]/=[8,1.2,def.length][col];
      put(def.id,def.id,segment,{standingTearRole:'overhead-fold',foldId:fold.id,segment:part.index,moving:fold.moving,gravity:part.gravity,minimumY:fold.minimumY,cullRadius:100});
      put('core-'+def.id,'paper',multiply(segment,matrix(0,0,0,0,8.08,1.0,def.length+.035)),{standingTearRole:'source-cut-core',foldId:fold.id,minimumY:fold.minimumY});
    }
  }
  // Each voice has a fixed printed patch in the same supported field. No
  // instrument, figure or raised pedestal asks for a central approach.
  for(const [index,memory]of memories.entries()){
    const source=memory.source,pulse=standingTearMemoryPulse(memory.id,finite(memory.musicSeconds,elapsed));
    put('music-ground-'+memory.id,'music-ground-'+memory.id,matrix(source.x,.002,source.z,index===1?.16:index===2?-.11:0),{
      standingTearRole:'music-island',memoryId:memory.id,awake:memory.awake,pressure:memory.pressure,
      source:{...source},musicPulse:pulse,emissive:[.015,.035,.025,pulse*(memory.awake?.14+memory.pressure*.22:.025)],cullRadius:10});
    lights.push({id:PREFIX+'memory-'+memory.id,x:source.x,y:3.2,z:source.z,radius:15,
      intensity:(memory.awake?1.25+memory.pressure*.7:.68)*(.94+pulse*.06),
      color:[[.68,.72,.60],[.51,.66,.72],[.65,.64,.72]][index],penetration:.7});
  }
  const panels=frame.panels||standingTearPressurePanels([],memories);
  for(const panel of panels){
    const local=unscaledFoldMatrix(panel),memory=memories.find(memory=>memory.id===panel.memoryId);
    put(panel.id,panel.id,local,{standingTearRole:'pressure-course',panelId:panel.id,memoryId:panel.memoryId,
      progress:panel.progress,target:panel.target,colliding:panel.colliding,hinge:{...panel.hinge},
      authoritativeMatrix:[...panel.matrix],closedVertices:panel.closedVertices,cullRadius:35});
    writeOnCourse(props,panel,local,memory);
  }
  // The warm return contracts into a raised crease, leaving ordinary Source
  // floor under and around it. There is never a new invisible movement wall.
  if(!frame.preview){
    for(const sign of[-1,1]){
      const x=sign*(.70-.34*fold),width=.035+.73*fold,bottom=.02+fold*2.6,height=2.5-fold*2.3;
      put(`entry-fold-${sign}`,'seam-edge',matrix(x,bottom+height/2,-.55,sign*fold*.55,width,height,.45),{standingTearRole:'closing-entry',entryFold:fold,blocking:false});
    }
    if(fold<.999&&!presentation.departureViewAvailable)put('warm-entry-absence','copper',matrix(0,1.26,-.58,0,1.35*(1-fold),2.45*(1-fold),.018),{standingTearRole:'disappearing-hall-light',emissive:[.35,.14,.035,.25*(1-fold)]});
  }
  lights.push(
    {id:PREFIX+'entry-graze',x:-7,y:9,z:2,radius:37,intensity:1.1,color:[.51,.61,.66],penetration:1},
    {id:PREFIX+'near-fold',x:-43,y:23,z:25,radius:82,intensity:3.8,color:[.56,.64,.69],penetration:1},
    {id:PREFIX+'far-fold',x:35,y:38,z:99,radius:120,intensity:5.4,color:[.45,.57,.64],penetration:1},
    {id:PREFIX+'far-boundary',x:-20,y:51,z:176,radius:112,intensity:4.8,color:[.45,.53,.60],penetration:1},
  );
  return{phase:frame.phase||'arrival',props,lights,labels,eye:camera.eye,yaw:camera.yaw,pitch:camera.pitch,authoredCamera:camera,entryFold:fold,architectureRunning:architecture,memories,panels,
    counts:{props:props.length,lights:lights.length,supportedSlabs:96},bounds:STANDING_TEAR_RENDER_BUDGET.basin,presentation};
}

/** The physical lip is visible from both sides before a preview is ready. */
export function standingTearThresholdProps(site=LAYOUT.site,options={}){
  const props=[],x=finite(site.x,LAYOUT.site.x),z=finite(site.z,LAYOUT.site.z),y=finite(site.feet,4.8),height=finite(site.height,2.5),width=finite(site.width,1.4),yaw=finite(site.yaw,Math.atan2(-finite(site.normalX),finite(site.normalZ,1)));
  const base=matrix(x,y,z,yaw),put=(id,mesh,m,extra={})=>props.push(placed(id,mesh,multiply(base,m),{zone:ZONE.practice,standingTearRole:'threshold',...extra}));
  for(const sign of[-1,1])for(let k=0;k<5;k++){
    const yy=(k+.5)*height/5,edge=sign*(width/2+.035+Math.sin(k*2.1)*.023);
    put(`lip-${sign}-${k}`,'seam-edge',matrix(edge,yy,sign*.018,sign*.09,.065,height/5+.025,.22));
    put(`cold-edge-${sign}-${k}`,'light',matrix(edge-sign*.018,yy,-.003,0,.015,height/5-.04,.05),{emissive:[.05,.11,.10,.34]});
  }
  put('lip-foot','paper',matrix(0,.012,0,0,width+.08,.025,.22));
  put('lip-top','paper',matrix(0,height,0,0,width+.08,.045,.13));
  if(options.backing===true)put('unresolved-slit','dark',matrix(0,height/2,0,0,width,height,.018),{standingTearRole:'threshold-backing'});
  return props;
}

let cachedScenePlan=null;
function scenePlan(){
  if(cachedScenePlan)return cachedScenePlan;
  const size=640,rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size).fill(MATERIAL.sourceField);for(let i=3;i<rgba.length;i+=4)rgba[i]=ZONE.sourceSpace;
  cachedScenePlan={size,rgba,material};return cachedScenePlan;
}
const sourceLook={roomMemoryActive:true,chroma:.88,paper:0},weather={rain:0,moon:0,clouds:0};
const lightingContext={ambientColor:[.60,.67,.65],ambientIntensity:.14,captureExposure:2.2,whitePointScale:1,screen:'stochastic'};
function setScene(renderer,last){
  renderer.r3dSetSourceScene?.({key:'source:standing-tear',look:sourceLook,weather,corpus:[],staticInstances:[],dynamicInstances:[]});
  renderer.r3dSetProps?.(last.props);renderer.r3dSetDynamicProps?.([]);renderer.r3dSetLocalLights?.(last.lights);
}
function drawState(last){return{px:last.eye[0]/CELL-.5,py:last.eye[2]/CELL-.5,floorH:last.eye[1]-EYE,authoredCamera:last.authoredCamera,authoredPropRange:320,tileW:640,tileH:640,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:0,plan:true,water:{active:false},sensoryProfile:'story',textSpace:true,sourceVoidPhysical:false};}
function clearScene(renderer,props){
  for(const name of['r3dSetHorizon','r3dSetSourceShore','r3dSetSourceTowerView','r3dSetSourceCrossing','r3dSetSourceReflection'])renderer[name]?.(null);
  for(const name of['r3dSetSourceEmergency','r3dSetSourceWhiteout','r3dSetSourceFault','r3dSetIndoorRain'])renderer[name]?.(0);
  for(const name of['r3dSetLocalLights','r3dSetEmergencyShadows','r3dSetSourcePortals','r3dSetSourceOpenings','r3dSetSourceDoorLights','r3dSetSourceTextInstances','r3dSetDynamicProps','r3dSetProps'])renderer[name]?.([]);props.setPressureInstances?.([]);
}
export function createStandingTearRenderer({renderer=R3,props=P3,onRelease=()=>{},installMeshes=installStandingTearMeshes}={}){
  let initialized=false,released=false,loading=null,error=null,last=null,releaseRange=null,repair=null;
  const owner=Symbol('standing-tear'),resident=()=>{const known=new Set(props.propMeshCatalog?.()||[]);return required.every(name=>known.has(name));};
  async function install(){if(released)return false;if(props.installAuthoredPropMeshes?.(installMeshes)===false)throw Error('The Standing Tear mesh context is unavailable.');if(!resident())throw Error('The Standing Tear printed meshes did not become resident.');return true;}
  function initialize(){if(loading)return loading;loading=(async()=>{
    if(await renderer.r3dBasePropsReady?.()===false)throw Error('The Standing Tear prop context is unavailable.');if(released||!await install())return false;
    if(typeof props.setAuthoredPropRange!=='function')throw Error('The Standing Tear range lease is unavailable.');
    clearScene(renderer,props);releaseRange=props.setAuthoredPropRange(owner,320);const plan=scenePlan();renderer.r3dSetPlan?.(plan.rgba,plan.size,plan.size,plan.material);
    renderer.r3dSetLookProfile?.('explore',{transitionMs:0});renderer.r3dSetLightingContext?.(lightingContext);renderer.r3dSnapCameraOnNextFrame?.();renderer.r3dResetVfdMemory?.();initialized=true;return true;
  })().catch(reason=>{error=String(reason?.message||reason);releaseRange?.();releaseRange=null;throw reason;});return loading;}
  function render(frame,presentation={}){
    if(!initialized||released)return false;if(error)throw Error(error);
    if(!resident()){if(!repair)repair=install().catch(reason=>{error=String(reason?.message||reason);}).finally(()=>{repair=null;});renderer.r3dClearScreen?.();return true;}
    const departure=renderer.r3dTowerViewCaptured?.()?.key==='standing-tear-departure';
    last=standingTearRenderFrame(frame,{...presentation,departureViewAvailable:departure});setScene(renderer,last);
    if(departure&&last.entryFold<.999){
      const w=.675*(1-last.entryFold),bottom=last.entryFold*2.6,height=2.45*(1-last.entryFold);
      renderer.r3dSetSourceTowerView?.({corners:[[-w,bottom,-.55],[w,bottom,-.55],[w,bottom+height,-.55],[-w,bottom+height,-.55]],origin:[0,0,-.55],forward:[0,-1],width:w*2});
    }else renderer.r3dSetSourceTowerView?.(null);
    return renderer.r3dFrame?.(drawState(last))!==false;
  }
  function dispose(){if(released)return false;const owned=initialized||!!releaseRange;released=true;initialized=false;if(owned)clearScene(renderer,props);releaseRange?.();releaseRange=null;onRelease();return true;}
  return{initialize,render,ready:()=>initialized&&!released&&resident()&&!error,clear:()=>{if(!released)renderer.r3dClearScreen?.();},dispose,diagnostics:()=>({ready:initialized&&!released&&resident()&&!error,released,error,repairing:!!repair,budget:STANDING_TEAR_RENDER_BUDGET,frame:last?{phase:last.phase,eye:last.eye,counts:last.counts,awakened:last.memories.filter(memory=>memory.awake).map(memory=>memory.id),architectureRunning:last.architectureRunning}:null})};
}

// A live capture of this exact basin, not an unrelated procedural world. The
// host restores its ordinary building plan/props immediately after capture.
export function createStandingTearPreview({site=LAYOUT.site,renderer=R3,props=P3,installMeshes=installStandingTearMeshes}={}){
  let initialized=false,released=false,loading=null,releaseRange=null,last=null,error=null,lastCapture=null;const owner=Symbol('standing-tear-preview');
  function initialize(){if(loading)return loading;loading=(async()=>{if(await renderer.r3dBasePropsReady?.()===false)return false;if(released)return false;if(props.installAuthoredPropMeshes?.(installMeshes)===false)return false;initialized=true;return true;})().catch(e=>{error=String(e?.message||e);throw e;});return loading;}
  function render({eye,yaw=0,pitch=0,time=0}={}){
    if(!initialized||released||!Array.isArray(eye)||eye.length!==3)return false;
    const known=new Set(props.propMeshCatalog?.()||[]);
    if(!required.every(name=>known.has(name))&&props.installAuthoredPropMeshes?.(installMeshes)===false)return false;
    const nx=finite(site.normalX),nz=finite(site.normalZ,1),dx=eye[0]-site.x,dz=eye[2]-site.z,signed=dx*nx+dz*nz,side=signed<0?1:-1,captureTime=finite(time),angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const captureMetadata=renderer.r3dTowerViewCaptured?.(),captureLost=captureMetadata===null||(captureMetadata?.key&&captureMetadata.key!=='standing-tear-preview');
    if(lastCapture&&lastCapture.side===side&&!captureLost){
      const moved=Math.hypot(...eye.map((n,k)=>n-lastCapture.eye[k])),turned=Math.abs(angle(yaw-lastCapture.yaw));
      // The existing depth reprojection supplies continuous parallax between
      // captures. A stationary tear needs no repeated plan/GPU allocations.
      if(captureTime>=lastCapture.time&&captureTime-lastCapture.time<.125)return false;
      if(moved<.12&&turned<.10)return false;
    }
    const siteYaw=finite(site.yaw,Math.atan2(-nx,nz)),virtual=[side*(dx*nz-dz*nx),eye[1]-site.feet,.5+side*signed],virtualYaw=yaw-siteYaw+(side<0?Math.PI:0);
    const frame={preview:true,camera:{eye:virtual,yaw:virtualYaw,pitch:0},phase:'arrival',entryFold:0,elapsed:0,transportRunning:false};
    const physical=standingTearRenderFrame(frame),plan=scenePlan();
    renderer.r3dSetSourceTowerView?.(null);renderer.r3dSetPlan?.(plan.rgba,plan.size,plan.size,plan.material);renderer.r3dSetLightingContext?.(lightingContext);setScene(renderer,physical);
    releaseRange=props.setAuthoredPropRange?.(owner,320);
    try{
      const captured=renderer.r3dCaptureTowerView?.(drawState(physical),{yaw:virtualYaw,pitch:0,allowSource:true,sourceVoidPhysical:false,sourceEye:[...eye],sourceYaw:yaw,key:'standing-tear-preview'});if(!captured)return false;
      const x=site.x,z=site.z,y=site.feet,w=finite(site.width,1.4),h=finite(site.height,2.5),forward=[nx*side,nz*side],tx=nz*w/2,tz=-nx*w/2;
      last={corners:[[x-tx,y,z-tz],[x+tx,y,z+tz],[x+tx,y+h,z+tz],[x-tx,y+h,z-tz]],origin:[x,y,z],forward,width:w};
      lastCapture={eye:[...eye],yaw,side,time:captureTime};
      return renderer.r3dSetSourceTowerView?.(last)!==false;
    }finally{releaseRange?.();releaseRange=null;}
  }
  function dispose(){if(released)return false;released=true;initialized=false;releaseRange?.();releaseRange=null;renderer.r3dSetSourceTowerView?.(null);return true;}
  return{initialize,render,dispose,ready:()=>initialized&&!released,diagnostics:()=>({ready:initialized&&!released,released,error,view:last})};
}
