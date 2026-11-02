// Original AUDIOCORP field cartridge. This is a project-authored interface for
// the existing DA-1000, not a claim of DAT or Compact Cassette compatibility.
// Metric proportions are authored against the carried recorder's 274 mm body.
export const SOURCE_RECORDING_CASSETTE=Object.freeze({width:.084,height:.056,depth:.014,
  worldWidth:.35,labelWidth:512,labelHeight:256,labelTextureBudget:32,maximumWorldCases:8,
  triangleBudget:36000,axes:'X width, Y height, Z depth; index face +Z',additionalWorldLights:0,
  format:'AUDIOCORP FIELD CARTRIDGE',recorderBodyWidth:.274,recorderScale:.274/2.45,
  // The pocket is an external manufactured attachment. Nothing enters the
  // original solid chassis or the FIELD CELL battery/service cover.
  pocket:{floorY:.079,railY:.084,centre:[0,.091,.001],insideWidth:.087,insideDepth:.060}});
export const SOURCE_RECORDING_CASSETTE_MESHES=Object.freeze(['shell','inset','steel','wear','ribbon','label','shutter','index','collar','rails','fixings','display'].map(name=>'source_recording_cassette_'+name));
export const SOURCE_RECORDING_CASSETTE_CONTROLS=Object.freeze({
  rec:{position:[(459.5-368)/300,(202.5-350.5)/300,.326],radius:.125,device:true},
  stop:{position:[(558.5-368)/300,(202.5-350.5)/300,.326],radius:.125,device:true},
  takes:{position:[(657.5-368)/300,(202.5-350.5)/300,.326],radius:.125,device:true},
  shutter:{position:[-.012,-.018,.0083],radius:.010,device:false},
});
const finite=n=>Number.isFinite(Number(n))?Number(n):0,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,finite(n))),TAU=Math.PI*2;
const join=parts=>{const p=[],i=[];for(const q of parts){const offset=p.length/3;p.push(...q.p);i.push(...q.i.map(n=>n+offset));}return{p,i};};
function slab(outline,z0,z1){const p=[],i=[],count=outline.length;for(const z of[z0,z1])for(const[x,y]of outline)p.push(x,y,z);
 for(let k=1;k<count-1;k++)i.push(0,k+1,k,count,count+k,count+k+1);
 for(let k=0;k<count;k++){const n=(k+1)%count;i.push(k,n,n+count,k,n+count,k+count);}return{p,i};}
const box=(x0,x1,y0,y1,z0,z1)=>slab([[x0,y0],[x1,y0],[x1,y1],[x0,y1]],z0,z1);
function rounded(x0,x1,y0,y1,z0,z1,r=.0015){const p=[];for(const[cx,cy,start]of[[x1-r,y1-r,0],[x0+r,y1-r,Math.PI/2],[x0+r,y0+r,Math.PI],[x1-r,y0+r,Math.PI*1.5]])for(let n=0;n<=4;n++){const a=start+n*Math.PI/8;p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}return slab(p,z0,z1);}
function ring(cx,cy,inner,outer,z0,z1,segments=24){const p=[],i=[];for(const z of[z0,z1])for(let n=0;n<segments;n++)for(const r of[inner,outer]){const a=n/segments*TAU;p.push(cx+Math.cos(a)*r,cy+Math.sin(a)*r,z);}for(let n=0;n<segments;n++){const a=n*2,b=(n+1)%segments*2,t=segments*2;
 i.push(a,b,a+1,b,b+1,a+1,t+a,t+a+1,t+b,t+b,t+a+1,t+b+1,a,t+a,b,b,t+a,t+b,a+1,b+1,t+a+1,b+1,t+b+1,t+a+1);}return{p,i};}
function radialRect(radius,width,length,angle,z0,z1){const c=Math.cos(angle),s=Math.sin(angle),q=box(radius-length/2,radius+length/2,-width/2,width/2,z0,z1);return{p:q.p.map((v,k)=>k%3===0?c*v-s*q.p[k+1]:k%3===1?s*q.p[k-1]+c*v:v),i:q.i};}
const moved=(q,x=0,y=0,z=0)=>({p:q.p.map((v,k)=>v+[x,y,z][k%3]),i:[...q.i]});
const quad=(x0,x1,y0,y1,z,back=false)=>({p:[x0,y0,z,x1,y0,z,x1,y1,z,x0,y1,z],i:back?[0,2,1,0,3,2]:[0,1,2,0,2,3]});
let library,deviceParts=[];
export function sourceRecordingCassetteGeometry(){
 if(library)return library;const out={},add=(suffix,q,base,roughness=.8,metallic=0)=>out['source_recording_cassette_'+suffix]={...q,base:[...base,1],roughness,metallic,triangles:q.i.length/3};
 // Two shells close around a protected transport edge. A keyed upper-right
 // corner makes the direction of loading recognizable on front and reverse.
 const outline=[[-.042,-.028],[.042,-.028],[.042,.020],[.034,.028],[-.042,.028]],
  front=join([slab([[-.042,-.015],[.042,-.015],[.042,.020],[.034,.028],[-.042,.028]],.0057,.007),
   box(-.042,.042,-.028,-.023,.0057,.007),box(-.042,-.024,-.023,-.015,.0057,.007),box(.002,.042,-.023,-.015,.0057,.007)]),back=slab(outline,-.007,-.0057),rim=[];
 rim.push(box(-.042,-.0406,-.028,.028,-.0057,.0057),box(.0406,.042,-.028,.020,-.0057,.0057),
  box(-.042,.034,.0266,.028,-.0057,.0057),box(-.042,.042,-.028,-.0266,-.0057,.0057));
 add('shell',join([front,back,...rim]),[.185,.215,.167],.61,.08);
 // A recessed plate, moulding seam and reinforced locating notches read as
 // manufactured casework, rather than two ornamental exposed reels.
 add('inset',join([rounded(-.037,.035,-.010,.023,.00702,.00725,.0018),
  rounded(-.037,.035,-.010,.023,-.00725,-.00702,.0018),
  box(-.0425,-.0405,-.019,-.013,-.0064,.0064),box(.0405,.0425,-.019,-.013,-.0064,.0064),
  box(-.041,.041,-.00018,.00018,-.0072,-.0071)]),[.055,.071,.052],.81);
 const fasteners=[];for(const[x,y]of[[-.038,.024],[.030,.024],[-.038,-.023],[.038,-.023]]){
  fasteners.push(ring(x,y,.00035,.00125,-.0075,-.00725,12));
  fasteners.push(box(x-.0008,x-.00016,y-.00045,y+.00045,-.0076,-.00745),box(x+.00016,x+.0008,y-.00045,y+.00045,-.0076,-.00745));}
 // Recessed couplings on the reverse are shielded drive interfaces, not reels.
 for(const x of[-.019,.019])fasteners.push(ring(x,-.017,.0022,.0035,-.0076,-.00715,24));
 add('steel',join(fasteners),[.40,.43,.37],.32,.79);
 add('wear',join([-1,1].map(side=>box(side<0?-.040:.031,side<0?-.033:.039,-.0276,-.0272,.0071,.00718))),[.38,.40,.31],.74);
 // The shutter protects the tape edge; it travels along a captive fold with
 // end stops. It is deliberately not a naked tape/reel animation.
 add('shutter',join([rounded(-.030,.005,-.025,-.011,.0074,.0082,.001),box(-.030,.005,-.025,-.023,-.0076,.0078),
  box(-.028,.003,-.023,-.011,-.0082,-.0075)]),[.41,.44,.38],.34,.82);
 add('ribbon',box(-.022,0,-.022,-.019,.00726,.00732),[.115,.057,.026],.40);
 add('index',join([slab([[-.036,.015],[-.032,.015],[-.034,.019]],.0073,.00745),
  box(.029,.033,-.007,-.004,.00735,.0076),box(.030,.032,-.0065,-.0045,.0076,.008)]),[.60,.56,.34],.57,.12);
 const label=join([quad(-.030,.030,-.008,.022,.00732),quad(-.034,.032,-.007,.022,-.00732,true)]),
  spine={p:[-.034,.02815,-.004,.030,.02815,-.004,.030,.02815,.004,-.034,.02815,.004],i:[0,2,1,0,3,2]};
 add('label',join([label,spine]),[.66,.68,.56],.91);out.source_recording_cassette_label.label=true;
 // External top-loading collar. The original chassis ends at y=.07549 m.
 // A real open pocket, support rails and folded mounting ears clear that body.
 add('collar',join([box(-.049,.049,.0765,.079,-.034,.036),
  box(-.049,-.0435,.079,.105,-.034,.036),box(.0435,.049,.079,.105,-.034,.036),
  box(-.0435,.0435,.079,.101,-.034,-.0295),box(-.0435,.0435,.079,.087,.031,.036),
  box(-.064,-.048,.0755,.081,-.026,.026),box(.048,.064,.0755,.081,-.026,.026)]),[.16,.19,.145],.58,.28);
 add('rails',join([box(-.035,-.028,.079,.084,-.029,.031),box(.028,.035,.079,.084,-.029,.031),
  box(-.049,-.043,.101,.106,-.034,.036),box(.043,.049,.101,.106,-.034,.036)]),[.43,.46,.40],.30,.83);
 const fixings=[];for(const x of[-.057,.057])for(const z of[-.020,.020]){
  // Slots face upward, including visible counterbored head shoulders.
  const q=ring(0,0,.00035,.0022,-.001,.001,16);fixings.push({p:q.p.map((v,k)=>k%3===0?v+x:k%3===1?q.p[k+1]+.082:-q.p[k-1]+z),i:q.i});}
 add('fixings',join(fixings),[.48,.49,.41],.30,.85);
 // This exact live optical substrate replaces only the imported idle zeros.
 // Its drawing comes from recorder-instrument.js, not a new screen design.
 const sc=SOURCE_RECORDING_CASSETTE.recorderScale,x=333/300*sc,y=(202.5-195.5)/300*sc,h=119.5/300*sc;
 add('display',quad(-x,x,y-h,y+h,.251*sc),[1,1,1],.37,.05);out.source_recording_cassette_display.display=true;
 library=out;return out;
}
const components={5120:[Int8Array,1],5121:[Uint8Array,1],5122:[Int16Array,2],5123:[Uint16Array,2],5125:[Uint32Array,4],5126:[Float32Array,4]},lanes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
// Read the actual original DA-1000 GLB at runtime. No duplicated front-only
// proxy and no shared pack rebuild. Material batches retain all back/side work.
export function installSourceRecordingDA1000Geometry(buffer){
 const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67)throw Error('DA-1000 reference is not GLB.');
 let json,bin;for(let at=12;at<buffer.byteLength;){const len=view.getUint32(at,true),type=view.getUint32(at+4,true);if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,at+8,len)));else if(type===0x004e4942)bin=new Uint8Array(buffer,at+8,len);at+=8+len;}
 if(!json||!bin||json.textures?.length)throw Error('DA-1000 geometry contract changed.');
 const read=index=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView],[Type,size]=components[a.componentType]||[],width=lanes[a.type],stride=v.byteStride||size*width;
  if(!Type||!width||a.sparse)throw Error('Unsupported DA-1000 accessor.');const out=[],offset=bin.byteOffset+(v.byteOffset||0)+(a.byteOffset||0);for(let n=0;n<a.count;n++){const row=new Type(buffer,offset+n*stride,width);out.push(...row);}return out;};
 const transform=n=>{if(n.matrix)return new Float32Array(n.matrix);const[x,y,z,w]=n.rotation||[0,0,0,1],[sx,sy,sz]=n.scale||[1,1,1],t=n.translation||[0,0,0];
  return new Float32Array([(1-2*y*y-2*z*z)*sx,(2*x*y+2*w*z)*sx,(2*x*z-2*w*y)*sx,0,(2*x*y-2*w*z)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*w*x)*sy,0,(2*x*z+2*w*y)*sz,(2*y*z-2*w*x)*sz,(1-2*x*x-2*y*y)*sz,0,...t,1]);};
 const batches=new Map(),scale=SOURCE_RECORDING_CASSETTE.recorderScale;
 function visit(index,parent,role='body',excluded=false){const n=json.nodes[index],name=n.name||'',skip=excluded||name==='recorder-idle-electrodes'||name==='recorder-front-cover-glass'||name==='recorder-display-substrate';
  const matrix=multiply(parent,index===0?identity():transform(n)),key=/transport-(REC|STOP|TAKES)-actuator/.exec(name);if(key)role=key[1].toLowerCase();
  if(!skip&&n.mesh!==undefined)for(const primitive of json.meshes[n.mesh].primitives){const material=json.materials[primitive.material]||{},pbr=material.pbrMetallicRoughness||{},batchKey=role+'_'+primitive.material;
   if(!batches.has(batchKey))batches.set(batchKey,{p:[],i:[],base:pbr.baseColorFactor||[1,1,1,1],roughness:pbr.roughnessFactor??1,metallic:pbr.metallicFactor??0,role,sourceNodes:[]});
   const q=batches.get(batchKey),position=read(primitive.attributes.POSITION),indices=read(primitive.indices),offset=q.p.length/3;q.sourceNodes.push(name);
   for(let k=0;k<position.length;k+=3)for(let axis=0;axis<3;axis++)q.p.push((matrix[axis]*position[k]+matrix[axis+4]*position[k+1]+matrix[axis+8]*position[k+2]+matrix[axis+12])*scale);
   q.i.push(...indices.map(k=>k+offset));}
  for(const child of n.children||[])visit(child,matrix,role,skip);
 }
 visit(0,identity());const out=sourceRecordingCassetteGeometry();for(const name of deviceParts.map(p=>p.mesh))delete out[name];deviceParts=[];
 for(const[key,q]of batches){const mesh='source_recording_da1000_'+key;out[mesh]={...q,triangles:q.i.length/3};deviceParts.push({mesh,role:q.role,sourceNodes:q.sourceNodes});}
 return sourceRecordingDA1000Status();
}
export function sourceRecordingDA1000Status(){const g=sourceRecordingCassetteGeometry();return{ready:deviceParts.length>0,source:'assets/items/field-recorder.glb',authorship:'Original AUDIOCORP geometry',
 meshes:deviceParts.map(p=>p.mesh),triangles:deviceParts.reduce((n,p)=>n+g[p.mesh].triangles,0),sourceNodes:deviceParts.flatMap(p=>p.sourceNodes),scale:SOURCE_RECORDING_CASSETTE.recorderScale};}
function text(value){return typeof value==='string'?value.trim():'';}
export function sourceRecordingCassetteIdentity(recording={}){
 const take=recording.take||recording.sourceTake||recording,ordinal=Math.max(0,Math.floor(Number(recording.takeOrdinal??take.ordinal)||0)),
  room=text(recording.place||take.place)||({main_b3:'STUDIO B3',amplifications:'AMPLIFICATIONS',natatorium:'NATATORIUM',phonetics:'PHONETICS'}[recording.roomId||take.roomId]||text(recording.roomId||take.roomId).replaceAll('_',' ').toUpperCase()),
  seconds=Math.max(0,Number(recording.durationSeconds??take.durationSeconds)||0),slate=recording.slate||take.slate,
  slateText=text(recording.slateText)||text(typeof slate==='string'?slate:slate?.text||slate?.spokenText||slate?.label),
  takeId=text(recording.takeId||take.id),receiptId=text(recording.id);
 return{ordinal,ordinalLabel:ordinal?String(ordinal).padStart(3,'0'):'—',room:room||'UNLABELLED RECORDING',seconds,
  duration:`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}.${Math.floor(seconds*10)%10}`,
  slateText,takeId,receiptId,side:'INDEX',format:SOURCE_RECORDING_CASSETTE.format,key:JSON.stringify([receiptId,takeId,ordinal,room,seconds,slateText])};
}
export function sourceRecordingCassetteLabelMesh(recording){const key=sourceRecordingCassetteIdentity(recording).key;let a=2166136261,b=2246822519;for(const c of key){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b^c.charCodeAt(0),3266489917);}return'source_recording_cassette_label_'+(a>>>0).toString(16)+(b>>>0).toString(16);}
const multiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function local(x=0,y=0,z=0,sx=1,sy=1,sz=1,rotation=0){const c=Math.cos(finite(rotation)),s=Math.sin(finite(rotation));return new Float32Array([c*sx,s*sx,0,0,-s*sy,c*sy,0,0,0,0,sz,0,x,y,z,1]);}
export function sourceRecordingCassetteRotation(yaw=0,pitch=0,roll=0){const y=finite(yaw),p=finite(pitch),r=finite(roll),cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);
 return multiply(new Float32Array([cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1]),multiply(new Float32Array([1,0,0,0,0,cp,sp,0,0,-sp,cp,0,0,0,0,1]),new Float32Array([cr,sr,0,0,-sr,cr,0,0,0,0,1,0,0,0,0,1])));}
export function sourceRecordingCassetteParts(frame={},root=identity(),{labelReady=true,includeTransport=false,transportRoot=root}={}){
 const recording=frame.recording||frame.take||{},props=[],
  add=(id,mesh,m=identity(),extra={},parent=root)=>{const matrix=multiply(parent,m);props.push({id:'source-recording-cassette:'+id,mesh,x:matrix[12],y:matrix[13],z:matrix[14],matrix,
   structural:false,decorative:true,noReflection:true,sourceRecordingCassette:true,...extra});};
 for(const name of['shell','inset','steel','wear','ribbon','index'])add(name,'source_recording_cassette_'+name);
 add('shutter','source_recording_cassette_shutter',local(clamp(frame.shutterOpen)*.022,0,0),{physicalControl:'shutter'});
 add('label',labelReady?sourceRecordingCassetteLabelMesh(recording):'source_recording_cassette_label');
 if(includeTransport){
  for(const name of['collar','rails','fixings','display'])add(name,'source_recording_cassette_'+name,identity(),{sourceRecorder:true},transportRoot);
  for(const entry of deviceParts){const pressed=frame.pressedControl===entry.role?clamp(frame.pressedAmount):0;
   add(entry.mesh,entry.mesh,local(0,0,-.0018*pressed),{sourceRecorder:true,physicalControl:entry.role==='body'?undefined:entry.role,sourceDevice:entry.sourceNodes},transportRoot);}
 }
 return props;
}
export function sourceRecordingCassetteWorldProps(anchor={},options={}){
 if(![anchor.x,anchor.y,anchor.z].every(Number.isFinite))return[];
 const width=Math.max(.35,Number(anchor.worldWidth)||SOURCE_RECORDING_CASSETTE.worldWidth),scale=width/SOURCE_RECORDING_CASSETTE.width,
  root=multiply(local(anchor.x,anchor.y,anchor.z,scale,scale,scale),sourceRecordingCassetteRotation(anchor.yaw||0,anchor.pitch||0,anchor.roll||0)),recording=anchor.recording||anchor.take||{};
 return sourceRecordingCassetteParts({recording},root,{labelReady:options.labelReady!==false}).map(p=>({...anchor,...p,
  id:(anchor.id||'source-recording-return')+':'+p.id,recordingReceiptId:recording.id,sourceRecordingReturn:true,
  cullRadius:width,worldWidth:width}));
}
