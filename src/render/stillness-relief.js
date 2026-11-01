// A connected anatomical deformation of its receiving material. The mesh has
// one fixed topology; only the shared neutral/strained position/normal buffers
// change. No texture, character skin, clock, gameplay or scene ownership lives
// here. The ordinary-wall proxy is shaded by MARCH; Source borrows the actual
// host primitive's material, including its physical print UV frame.
import {STILLNESS_ANATOMY,STILLNESS_ANATOMY_GRID} from '../data/generated/stillness-anatomy.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';

const states=new WeakMap();
const GRID=STILLNESS_ANATOMY_GRID;
const IDENTITY=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const MIN_AMOUNT=1e-5;
const MAX_RECEIVERS=8,IDLE_RECEIVERS=4;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const vec=(v,n=3)=>(Array.isArray(v)||ArrayBuffer.isView(v))&&v.length>=n
  ?Array.from(v).slice(0,n):null;
const finite=v=>v&&v.every(Number.isFinite);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const magnitude=v=>Math.hypot(...v);
const amountFor=frame=>clamp(Number.isFinite(frame?.amount)?frame.amount:0);
const smooth=v=>{const u=clamp(v);return u*u*(3-2*u);};
function identitySeed(id){
  let hash=2166136261;const text=String(id||'');
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return hash>>>0;
}
// A late, uneven effort under the surface, using the owner's existing clock.
// Only outward height changes: no texture slip, head translation or new clock.
// The two smooth periodic factors agree in value AND slope across each wrap.
export function stillnessReliefDepthScale(frame,receiver={}){
  const amount=amountFor(frame);
  if(amount<=.6||frame?.reducedMotion||frame?.reduceFlash)return amount;
  const seed=identitySeed(receiver.id),unit=seed/4294967295;
  const period=8+unit*6,phase=((seed>>>8)&65535)/65535;
  const seconds=Number.isFinite(frame?.motionTime)?frame.motionTime:Number.isFinite(frame?.time)?frame.time:0;
  const angle=2*Math.PI*((Math.max(0,seconds)%period)/period+phase);
  const withdrawal=(.5-.5*Math.cos(angle))*(.72+.28*(.5+.5*Math.sin(angle+.6)));
  const source=frame?.profile===1||frame?.profile===2||/^source/i.test(receiver.space||'');
  const effort=source ? .085+.035*unit : .075+.025*unit;
  return amount*(1-smooth((amount-.6)/.4)*effort*withdrawal);
}
function strainFor(frame){
  const explicit=frame?.strain??frame?.shapeMix;
  if(Number.isFinite(explicit))return clamp(explicit);
  const u=clamp((amountFor(frame)-.3)/.7);return u*u*(3-2*u);
}

// Keep the identity readable in traces and use a stable suffix to distinguish
// authored IDs which differ only in punctuation.
function meshName(id){
  return `stillness-relief-${id.replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,90)}-${identitySeed(id).toString(16)}`;
}
function receiverFrame(value){
  if(!value||value.supported===false)return{reason:'unsupported-receiver'};
  const id=typeof value.id==='string'?value.id:'';
  const origin=vec(value.origin),right=vec(value.right),up=vec(value.up),normal=vec(value.normal);
  if(!id||![origin,right,up,normal].every(finite))return{reason:'invalid-receiver-frame',id};
  if([right,up,normal].some(axis=>Math.abs(magnitude(axis)-1)>1e-3)
    ||Math.abs(dot(right,up))>1e-3||Math.abs(dot(right,normal))>1e-3||Math.abs(dot(up,normal))>1e-3
    ||dot(cross(right,up),normal)<.999)return{reason:'non-orthonormal-receiver-frame',id};
  if(![value.widthM,value.heightM,value.depthM].every(n=>Number.isFinite(n)&&n>0))
    return{reason:'invalid-receiver-dimensions',id};
  // Fit only inside the supplied patch. host.availableMin/Max describe the
  // surrounding jamb and must never stretch a human head to that full span.
  const widthM=Math.min(value.widthM,value.heightM*STILLNESS_ANATOMY.widthToHeight);
  const heightM=widthM/STILLNESS_ANATOMY.widthToHeight;
  const offset=Number.isFinite(value.surfaceOffsetM)?value.surfaceOffsetM:0;
  const centre=origin.map((v,i)=>v+normal[i]*offset);
  const source=typeof value.donorName==='string'&&value.donorName.length>0;
  if(source&&![value.uvOrigin,value.uvRight,value.uvUp].every(uv=>finite(vec(uv,2))))
    return{reason:'missing-source-uv-frame',id};
  if(!source&&!(Number.isInteger(value.materialId)&&value.materialId>=1&&value.materialId<=255))
    return{reason:'invalid-wall-material',id};
  return{receiver:value,id,origin:centre,right,up,normal,widthM,heightM,depthM:value.depthM,source};
}
function instanceFor(receiver,frame){
  const f=receiverFrame(receiver);if(f.reason)return null;
  const depthScale=stillnessReliefDepthScale(frame,receiver),depth=f.depthM*depthScale;
  const matrix=new Float32Array([
    ...f.right.map(v=>v*f.widthM),0,...f.up.map(v=>v*f.heightM),0,
    ...f.normal.map(v=>v*depth),0,...f.origin,1,
  ]);
  return{id:`stillness-relief:${f.id}`,mesh:meshName(f.id),matrix,
    x:f.origin[0],y:f.origin[1],z:f.origin[2],zone:Number.isFinite(receiver.zone)?receiver.zone:0,
    structural:true,stillnessRelief:true,stillnessReceiverId:f.id,stillnessSpace:receiver.space||'overworld',
    stillnessDepthScale:depthScale,stillnessDepthM:depth,
    cullRadius:Math.hypot(f.widthM/2,f.heightM/2,depth),
  };
}

// Pure CPU staging. The installed/update path additionally removes instances
// whose Source donor was not yet available. At zero amount no singular model
// matrix is submitted to the native inverse-transpose normal transform.
export function stillnessReliefInstances(frame,receivers=[]){
  const amount=amountFor(frame);if(amount<=MIN_AMOUNT)return[];
  const seen=new Set(),instances=[];
  for(const receiver of receivers||[]){
    if(seen.has(receiver?.id))continue;seen.add(receiver?.id);
    const instance=instanceFor(receiver,frame);if(instance)instances.push(instance);
    if(instances.length>=MAX_RECEIVERS)break;
  }
  return instances;
}

function upload(gl,target,data,usage){
  const buffer=gl.createBuffer();gl.bindBuffer(target,buffer);gl.bufferData(target,data,usage);return buffer;
}
function shapeAt(state,strain){
  const positions=state.positions,normals=state.normals,neutral=GRID.positions,strained=GRID.strainedPositions;
  let maximum=0;
  for(let i=0;i<positions.length;i+=3){
    positions[i]=neutral[i];positions[i+1]=neutral[i+1];
    positions[i+2]=neutral[i+2]+(strained[i+2]-neutral[i+2])*strain;
    maximum=Math.max(maximum,positions[i+2]);
  }
  // Differentiate the blended height itself rather than mixing normalized
  // endpoint normals. The inverse-transpose model transform then accounts for
  // the physical aspect and current outward displacement exactly.
  const cols=GRID.columns,rows=GRID.rows;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const i=(y*cols+x)*3;
    if(x===0||y===0||x===cols-1||y===rows-1){normals.set([0,0,1],i);continue;}
    const dx=(positions[i+3+2]-positions[i-3+2])*(cols-1)/2;
    const dy=(positions[i+cols*3+2]-positions[i-cols*3+2])*(rows-1)/2;
    const length=Math.hypot(dx,dy,1);normals[i]=-dx/length;normals[i+1]=-dy/length;normals[i+2]=1/length;
  }
  state.maximum=maximum;state.strain=strain;
}

export function installStillnessReliefMeshes(gl,pack){
  if(!gl||!pack?.catalog)return[];
  let state=states.get(pack);
  if(state?.gl===gl)return[...state.entries.values()].map(record=>record.name);
  if(state)releaseStillnessReliefMeshes(state.gl,pack);
  state={gl,entries:new Map(),positions:new Float32Array(GRID.positions.length),
    normals:new Float32Array(GRID.normals.length),strain:NaN,maximum:0,geometryUploads:0,
    diagnostics:{activeInstances:0,actualMaxProtrusionM:0,effectiveDepths:[],rejected:[]}};
  shapeAt(state,0);gl.bindVertexArray(null);
  state.positionBuffer=upload(gl,gl.ARRAY_BUFFER,state.positions,gl.DYNAMIC_DRAW);
  state.normalBuffer=upload(gl,gl.ARRAY_BUFFER,state.normals,gl.DYNAMIC_DRAW);
  state.indexBuffer=upload(gl,gl.ELEMENT_ARRAY_BUFFER,GRID.indices,gl.STATIC_DRAW);
  state.geometryUploads=1;states.set(pack,state);gl.bindVertexArray(null);return[];
}
function receiverUvs(f){
  if(!f.source)return new Float32Array(GRID.uvs);
  const {uvOrigin,uvRight,uvUp}=f.receiver,uvs=new Float32Array(GRID.uvs.length);
  for(let v=0;v<GRID.positions.length/3;v++){
    const x=GRID.positions[v*3]*f.widthM,y=GRID.positions[v*3+1]*f.heightM;
    uvs[v*2]=uvOrigin[0]+x*uvRight[0]+y*uvUp[0];
    uvs[v*2+1]=uvOrigin[1]+x*uvRight[1]+y*uvUp[1];
  }
  return uvs;
}
function receiverSignature(f){
  const r=f.receiver;
  return JSON.stringify([f.widthM,f.heightM,r.donorName||null,r.donorPrimitiveIndex||0,r.materialId,
    r.uvOrigin||null,r.uvRight||null,r.uvUp||null]);
}
function detach(gl,pack,record){
  if(pack.catalog.get(record.name)===record.entry)pack.catalog.delete(record.name);
  gl.deleteVertexArray(record.vao);gl.deleteBuffer(record.uvBuffer);gl.deleteBuffer(record.instanceBuffer);
}
function ensureReceiver(state,pack,f){
  const {gl}=state,r=f.receiver,name=meshName(f.id);
  const donor=f.source?pack.catalog.get(r.donorName)?.primitives?.[r.donorPrimitiveIndex||0]:null;
  if(f.source&&!donor)return{reason:'missing-source-donor',id:f.id,donorName:r.donorName};
  const signature=receiverSignature(f),existing=state.entries.get(f.id);
  if(existing&&existing.signature===signature&&existing.donor===donor&&pack.catalog.get(name)===existing.entry)return existing;
  if(existing){detach(gl,pack,existing);state.entries.delete(f.id);}
  // A foreign catalog entry is never overwritten, even if it happens to use
  // our reserved prefix. That is a visible integration error, not a fallback.
  if(pack.catalog.has(name))return{reason:'catalog-name-conflict',id:f.id,mesh:name};
  const vao=gl.createVertexArray();gl.bindVertexArray(vao);
  const attrib=(location,buffer,size)=>{
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
  };
  attrib(0,state.positionBuffer,3);attrib(1,state.normalBuffer,3);
  const uvs=receiverUvs(f),uvBuffer=upload(gl,gl.ARRAY_BUFFER,uvs,gl.STATIC_DRAW);attrib(2,uvBuffer,2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,state.indexBuffer);
  const instanceBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
  const stride=PROP_INSTANCE_FLOATS*4;
  for(let column=0;column<4;column++){
    const location=3+column;gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location,4,gl.FLOAT,false,stride,column*16);gl.vertexAttribDivisor(location,1);
  }
  for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){
    gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offset);gl.vertexAttribDivisor(location,1);
  }
  gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
  const material=donor?{...donor}:{base:[1,1,1,1],emissive:[0,0,0],texture:null,normalTexture:null,
    ormTexture:null,metallic:0,roughness:1,aoStrength:0,portrait:false,alphaCut:0,
    materialName:'native receiving wall',materialRole:'stillness-wall-proxy',stillnessProxyMaterial:r.materialId};
  // Geometry is not a character and must never sample the donor's morph atlas.
  for(const key of Object.keys(material))if(key.startsWith('characterMorph')||key==='characterVertexCount')delete material[key];
  const primitive={...material,vao,count:GRID.indices.length,indexType:gl.UNSIGNED_SHORT,
    stillnessRelief:true,stillnessReceiverId:f.id,stillnessSourceDonor:r.donorName||null};
  const entry={name,nodeMatrix:new Float32Array(IDENTITY),instanceBuffer,primitives:[primitive],
    extras:{stillnessRelief:true,anatomyId:STILLNESS_ANATOMY.id,anatomyVersion:STILLNESS_ANATOMY.version,
      sourceDonor:r.donorName||null,bounds:{min:[-.5,-.5,0],max:[.5,.5,1]}},
    cullBounds:{min:[-.5,-.5,0],max:[.5,.5,1]},cullBoundsValid:true};
  const record={name,entry,vao,uvBuffer,instanceBuffer,uvs,signature,donor};
  pack.catalog.set(name,entry);state.entries.set(f.id,record);gl.bindVertexArray(null);return record;
}

export function updateStillnessReliefMeshes(gl,pack,frame,receivers=[]){
  if(!gl||!pack?.catalog)return[];
  installStillnessReliefMeshes(gl,pack);
  const state=states.get(pack),amount=amountFor(frame),strain=strainFor(frame),rejected=[],accepted=[];
  if(amount<=MIN_AMOUNT){clearStillnessRelief(gl,pack);return[];}
  if(Math.abs(strain-state.strain)>1e-7){
    shapeAt(state,strain);
    gl.bindBuffer(gl.ARRAY_BUFFER,state.positionBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,state.positions);
    gl.bindBuffer(gl.ARRAY_BUFFER,state.normalBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,state.normals);
    state.geometryUploads++;
  }
  const seen=new Set();
  for(const receiver of receivers||[]){
    if(seen.has(receiver?.id))continue;seen.add(receiver?.id);
    const f=receiverFrame(receiver);if(f.reason){rejected.push(f);continue;}
    if(accepted.length>=MAX_RECEIVERS){rejected.push({reason:'receiver-budget',id:f.id});continue;}
    const record=ensureReceiver(state,pack,f);
    if(record.reason){rejected.push(record);continue;}
    accepted.push(receiver);
  }
  // Only the current latched bout needs receiver-local UV/VAO state. Shared
  // anatomy buffers persist, while visiting new walls cannot grow a permanent
  // cache of every plane encountered throughout a playthrough.
  const live=new Set(accepted.map(r=>r.id));
  for(const[id,record]of state.entries)if(!live.has(id)){
    detach(gl,pack,record);state.entries.delete(id);
  }
  const instances=stillnessReliefInstances(frame,accepted);
  const maxDepth=instances.reduce((m,instance)=>Math.max(m,instance.stillnessDepthM),0);
  state.diagnostics={activeInstances:instances.length,actualMaxProtrusionM:state.maximum*maxDepth,
    effectiveDepths:instances.map(instance=>({id:instance.stillnessReceiverId,scale:instance.stillnessDepthScale,
      depthM:instance.stillnessDepthM,actualMaxProtrusionM:state.maximum*instance.stillnessDepthM})),
    rejected,receiverIds:accepted.map(r=>r.id)};
  gl.bindVertexArray(null);return instances;
}

export function stillnessReliefDiagnostics(pack){
  const state=pack&&states.get(pack);
  return{installed:!!state,meshRevision:`${STILLNESS_ANATOMY.id}:${STILLNESS_ANATOMY.version}`,
    sourceSha256:STILLNESS_ANATOMY.source.sha256,nativeVertexCount:GRID.positions.length/3,
    trianglesPerInstance:GRID.indices.length/3,columns:GRID.columns,rows:GRID.rows,
    aspect:STILLNESS_ANATOMY.widthToHeight,sharedTopology:true,frameClockOwned:false,pressureMotionVersion:1,
    geometryUploads:state?.geometryUploads||0,installedReceiverCount:state?.entries.size||0,
    shapeMix:state?.strain??0,normalizedMaxHeight:state?.maximum??0,
    ...(state?.diagnostics||{activeInstances:0,actualMaxProtrusionM:0,effectiveDepths:[],rejected:[],receiverIds:[]})};
}

export function clearStillnessRelief(gl,pack){
  const state=pack&&states.get(pack);
  if(state){
    while(state.entries.size>IDLE_RECEIVERS){
      const[id,record]=state.entries.entries().next().value;
      detach(state.gl,pack,record);state.entries.delete(id);
    }
    state.diagnostics={activeInstances:0,actualMaxProtrusionM:0,effectiveDepths:[],rejected:[],receiverIds:[]};
  }
  return[];
}
export function releaseStillnessReliefMeshes(gl,pack){
  const state=pack&&states.get(pack);if(!state)return[];
  // Resources belong to the installing context. Callers may already have a new
  // context after restoration; never delete its unrelated handles by mistake.
  const owner=state.gl;
  for(const record of state.entries.values())detach(owner,pack,record);
  owner.deleteBuffer(state.positionBuffer);owner.deleteBuffer(state.normalBuffer);owner.deleteBuffer(state.indexBuffer);
  states.delete(pack);return[];
}
