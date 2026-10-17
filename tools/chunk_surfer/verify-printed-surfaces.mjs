// Controlled production-renderer proof. Writes only new rollout evidence.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import {PAPER_DOCUMENTS,PAPER_ATLAS} from '../../src/generated/paper-catalog.js';

const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334';
const out=process.env.PRINTED_PROOF_OUT||'artifacts/lettering-production/renderer-proof';mkdirSync(out,{recursive:true});
const baselineMode=Number(process.env.PRINTED_BASELINE_MODE||0);assert.ok([0,4].includes(baselineMode));
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const sources=['src/render/r3d.js','src/render/props3d.js','src/render/pixel-mesh/shader.js',
 'src/render/printed-surface.js','src/render/source-shore3d.js','src/render/physical-source-print.js',
 'src/main.js','src/game/props.js','src/world/prop-inscriptions.js','src/world/prop-wall-pose.js','src/data/world-inscriptions.js',
 'src/data/conservatory-props.js','src/data/exterior-district.js','src/data/generated/prop-geometry.js',
 'src/render/world-lettering-fonts.js','src/render/world-lettering-layout.js','src/render/source-text-atlas.js','src/render/source-surface-lettering.js',
 'content/chunk-surf/source-atlas.json',
 ...['NimbusMonoPS-Regular.otf','NimbusMonoPS-Bold.otf','NimbusSans-Regular.otf','NimbusSans-Bold.otf','NimbusRoman-Regular.otf'].map(p=>`public/assets/fonts/${p}`),
 'artifacts/lettering-study/review.js','artifacts/lettering-study/encounters.js','src/render/lettering-study.js',
 'public/assets/conservatory-props.lettering.json','public/assets/lettering-production/signs-printed.glb',
 'public/assets/lettering-production/polarity-printed.glb','public/assets/conservatory-props.glb',
 'assets/paper/world-pigment.png','assets/paper/world-atlas.webp','src/generated/paper-catalog.js','src/data/paper-pigment.js',
 'src/render/source-divide-meshes.js','src/render/source-last-reception-meshes.js','src/render/tower-personal-meshes.js','src/render/practice-rebus.js','src/platform/window-choreography.js',
 'tools/chunk_surfer/verify-printed-surfaces.mjs','tools/chunk_surfer/verify-lettering-motion.mjs',
 'tools/chunk_surfer/lettering/physical-lettering.mjs','scripts/build-paper-pigment.mjs','scripts/paper/build_pigment_atlas.py'];
const hashes=()=>Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const report={date:new Date().toISOString(),sourceHashes:hashes(),errors:[],console:[],failedResponses:[],failedRequests:[],captures:[],depth:[],videos:[],
 modeMeaning:{0:'prior acquisition without printed-material treatment',1:'pigment crease classification only',2:'previous full-resolution printed sampling and mixed lit endpoint acquisition',3:'production pigment-footprint contour classification and separate lit ink/stock endpoint acquisition before authored coverage selection',4:'retained prior hollow-lettering operator for controlled regression'},baselineMode,
 limits:'Controlled renderer diagnostics, not a human reading trial or full gameplay-route acceptance. Static pairs hold camera and time; reaction diffusion still evolves per frame. The same-input replay separately isolates untagged acquisition identity.'};
report.expectedProductionPack=process.env.PRINTED_PROOF_PACK_SHA||JSON.parse(readFileSync('public/assets/conservatory-props.lettering.json')).packSha256;
assert.equal(report.sourceHashes['public/assets/conservatory-props.glb'],report.expectedProductionPack,'Installed production pack does not match its declared freeze');
const sourceCorpus=JSON.parse(readFileSync('content/chunk-surf/source-atlas.json'));report.sourceCorpus={corpusHash:sourceCorpus.corpusHash,stats:sourceCorpus.stats};
const save=()=>writeFileSync(`${out}/report.json`,`${JSON.stringify(report,null,2)}\n`);
async function paperProof(page){
 const{data,info}=await sharp('assets/paper/world-pigment.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const cases=['work-order','foh-overflow-note','pre-roll-analysis'].map(id=>{
  const record=PAPER_DOCUMENTS[id],index=record.pages[0].atlasIndex,ox=index%PAPER_ATLAS.columns*128,oy=Math.floor(index/PAPER_ATLAS.columns)*181;
  let bare=null,ink=null;for(let y=5;y<176;y++)for(let x=5;x<123;x++){
   const at=((oy+y)*info.width+ox+x)*4,a=data[at+3];
   if(!ink||a>ink.rgba[3])ink={x:ox+x,y:oy+y,local:[x,y],rgba:Array.from(data.subarray(at,at+4))};
   if(!bare&&a===0&&data[at]>100){let clear=true;for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++)clear&&=data[((oy+y+dy)*info.width+ox+x+dx)*4+3]===0;
    if(clear)bare={x:ox+x,y:oy+y,local:[x,y],rgba:Array.from(data.subarray(at,at+4))};}
  }assert.ok(bare&&ink.rgba[3]>0);return{id,index,processes:record.processes,semanticHash:record.semanticHash,bare,ink};
 });
 const result=await page.evaluate(async({cases,atlasWidth,atlasHeight})=>{
  const S=window.letteringStudy,e=await S.configure('services',960,600,1),gl=S.R.r3dCanvas().getContext('webgl2');
  const atlas=await S.P.loadPaperAtlas('/assets/paper/world-pigment.png',{columns:16,rows:14,pigmentCoverage:true}),uploaded=window.__printProof.readTexture(atlas,atlasWidth,atlasHeight);
  const read=(p)=>Array.from(uploaded.slice(((atlasHeight-1-p.y)*atlasWidth+p.x)*4,((atlasHeight-1-p.y)*atlasWidth+p.x)*4+4));
  const old=e.props,center=e.targetCentre,distance=.35,camera={x:center.x-distance-.4,y:center.y,z:center.z,yaw:Math.PI/2,pitch:0};
  const matrix=[0,0,1,0,-1,0,0,0,0,-1,0,0,center.x-.4,center.y,center.z,1];
  const note={id:'world-paper-proof',mesh:'loose_note',matrix,paperIndex:0,zone:old.find(p=>p.id===e.targetId).zone||0};
  e.props=[old.find(p=>p.id===e.targetId),note];const outputs=[];
  const frameData=(texture)=>{const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
   const type=gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE),data=type===gl.FLOAT?new Float32Array(960*600*4):new Uint8Array(960*600*4);
   gl.readPixels(0,0,960,600,gl.RGBA,type===gl.FLOAT?gl.FLOAT:gl.UNSIGNED_BYTE,data);gl.deleteFramebuffer(f);return{data,scale:type===gl.FLOAT?1:255};};
  try{for(const test of cases){note.paperIndex=test.index;const images={};for(const stage of['props','final']){for(let i=0;i<3;i++)S.renderSample({variant:'light-enamel',light:'torch',stage,camera,omitTarget:true});
    const s=S.renderSample({variant:'light-enamel',light:'torch',stage,camera,omitTarget:true});images[stage]=s.frame.toDataURL('image/png');}
   const t=S.P.propTargets(),marks=window.__printProof.readTexture(t.worldData,960,600),color=frameData(t.color),canvas=document.createElement('canvas');canvas.width=960;canvas.height=600;
   const c=canvas.getContext('2d'),image=c.createImageData(960,600);let tags=0;
   for(let y=0;y<600;y++)for(let x=0;x<960;x++){const a=marks[((599-y)*960+x)*4+3],v=a>=136&&a<=151?Math.round((151-a)*255/15):0;tags+=a>=136&&a<=151;const at=(y*960+x)*4;image.data.set([v,v,v,255],at);}c.putImageData(image,0,0);images.marks=canvas.toDataURL('image/png');
   const sample=(p)=>{const u=(p.local[0]+.5)/128,v=1-(p.local[1]+.5)/181,x=(u-.5)*.32,z=(.5-v)*.42,local=[x,.016,z],world={x:matrix[0]*x+matrix[4]*local[1]+matrix[8]*z+matrix[12],y:matrix[1]*x+matrix[5]*local[1]+matrix[9]*z+matrix[13],z:matrix[2]*x+matrix[6]*local[1]+matrix[10]*z+matrix[14]},projected=S.R.r3dProjectWorld(world),px=Math.round(projected.x*960),py=Math.round(projected.y*600),at=((599-py)*960+px)*4;
    return{atlasPixel:p,uploadedRgba:read(p),local,world,projected,pixel:[px,py],p3Color:Array.from(color.data.slice(at,at+4),n=>n/color.scale),markByte:marks[at+3]};};
   outputs.push({...test,images,taggedPixels:tags,bareSample:sample(test.bare),inkSample:sample(test.ink),depth:window.__printProof.depth(),glError:gl.getError()});
  }}finally{e.props=old;}
  return{scope:'Actual production loose_note mesh and catalog paper indices, inspected close in a controlled Scene Dock room fixture through P3/real depth/final acquisition. The vertical pose is an inspection fixture, not a gameplay placement or reading trial.',mesh:'loose_note',camera,matrix,atlasSize:[atlasWidth,atlasHeight],outputs};
 },{cases,atlasWidth:info.width,atlasHeight:info.height});
 for(const test of result.outputs){for(const[stage,url]of Object.entries(test.images)){const file=`world-paper-${test.id}-${stage}.png`;writeFileSync(`${out}/${file}`,Buffer.from(url.split(',')[1],'base64'));test.images[stage]=file;}
  for(const key of['bareSample','inkSample'])assert.deepEqual(test[key].uploadedRgba,test[key].atlasPixel.rgba,'GPU paper upload premultiplied or flipped authored data');
  assert.ok(test.taggedPixels>0);assert.ok(test.bareSample.p3Color[3]>.99,'bare stock became transparent');assert.ok(Math.max(...test.bareSample.p3Color.slice(0,3))>0,'bare stock RGB was erased');
  assert.equal(test.depth.bad,0);assert.equal(test.depth.glError,0);assert.equal(test.glError,0);
 }return result;
}
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',
 protocolTimeout:180000,args:['--use-angle=metal','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1400,height:1000,deviceScaleFactor:1});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('console',m=>{const entry={type:m.type(),text:m.text().slice(0,12000)};report.console.push(entry);console.log(JSON.stringify(entry));});
 page.on('response',r=>{if(r.status()>=400)report.failedResponses.push({url:r.url(),status:r.status()});});
 page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),failure:r.failure()}));
 await page.evaluateOnNewDocument(()=>{
  window.WebSocket=class extends EventTarget{static CONNECTING=0;static OPEN=1;static CLOSING=2;static CLOSED=3;
   constructor(url){super();this.url=url;this.readyState=1;queueMicrotask(()=>this.dispatchEvent(new Event('open')));}send(){}close(){this.readyState=3;}};
  const nativeNow=performance.now.bind(performance);Object.defineProperty(performance,'now',{value:()=>Number.isFinite(window.__printFixedTime)?window.__printFixedTime:nativeNow()});
  window.__printPrograms=[];const link=WebGL2RenderingContext.prototype.linkProgram;
  WebGL2RenderingContext.prototype.linkProgram=function(program){const result=link.call(this,program);
   const source=this.getAttachedShaders(program).map(s=>this.getShaderSource(s)).join('\n');
   if(source.includes('uniform float uPrintedSurfaceMode'))window.__printPrograms.push({gl:this,program});return result;};
  const drawArrays=WebGL2RenderingContext.prototype.drawArrays;
  WebGL2RenderingContext.prototype.drawArrays=function(mode,first,count){
   const program=this.getParameter(this.CURRENT_PROGRAM);
   if(window.__printPrograms.some(p=>p.gl===this&&p.program===program)){
    const active=this.getParameter(this.ACTIVE_TEXTURE),samplers=[];
    for(let i=0;i<this.getProgramParameter(program,this.ACTIVE_UNIFORMS);i++){
     const uniform=this.getActiveUniform(program,i);if(uniform.type!==this.SAMPLER_2D)continue;
     const location=this.getUniformLocation(program,uniform.name),unit=this.getUniform(program,location);
     this.activeTexture(this.TEXTURE0+unit);samplers.push({name:uniform.name,unit,texture:this.getParameter(this.TEXTURE_BINDING_2D)});
    }
    this.activeTexture(active);window.__printPixelInputs={gl:this,program,samplers,mode,first,count,
     viewport:Array.from(this.getParameter(this.VIEWPORT)),vao:this.getParameter(this.VERTEX_ARRAY_BINDING)};
   }
   return drawArrays.call(this,mode,first,count);
  };
 });
 await page.goto(`${base}/artifacts/lettering-study/review.html`,{waitUntil:'domcontentloaded',timeout:60000});
 await new Promise(r=>setTimeout(r,10000));
 report.startup=await page.evaluate(()=>({text:document.body.innerText.slice(0,2000),status:document.getElementById('status')?.textContent,
  ready:!!window.letteringStudy?.ready,pixel:window.letteringStudy?.R.r3dPixelMeshStatus(),pixelPrograms:window.__printPrograms?.length,
  resources:performance.getEntriesByType('resource').slice(-25).map(e=>e.name)}));
 console.log('Startup',JSON.stringify(report.startup));save();
 if(process.env.PRINTED_DIAG==='1')throw Error('Diagnostic-only startup snapshot saved');
 try{await page.waitForFunction(()=>window.letteringStudy?.ready&&window.letteringStudy?.polarityReady,{timeout:120000});}
 catch(error){report.loading=await page.evaluate(()=>({text:document.body.innerText.slice(0,2500),resources:performance.getEntriesByType('resource').slice(-15).map(e=>e.name)}));
  console.log(JSON.stringify(report.loading));throw error;}
 await page.evaluate(async baselineMode=>{
  window.__printBaselineMode=baselineMode;
  const {PRINTED_SURFACE_GLSL}=await import('/src/render/printed-surface.js');
  const S=window.letteringStudy;S.stop();await S.P.addPropPack('/assets/lettering-production/signs-printed.glb');
  await S.P.addPropPack('/assets/lettering-production/polarity-printed.glb');
  S.R.r3dSetPixelMesh({debugSource:'final',reduceMotion:true,reduceFlash:true,memory:false});window.__printFixedTime=100000;
  window.__printProof={};
  window.__printProof.readTexture=(texture,width,height)=>{
   const gl=S.R.r3dCanvas().getContext('webgl2'),f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
   const bytes=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);gl.deleteFramebuffer(f);return bytes;
  };
  window.__printProof.tags=(evidence)=>{
   const t=S.P.propTargets(),{width,height}=evidence.acquisition,b=window.__printProof.readTexture(t.worldData,width,height),box=evidence.bounds;
   let tagged=0,covered=0;const histogram={},top=Math.max(0,Math.floor(box.top)),bottom=Math.min(height,Math.ceil(box.bottom));
   for(let y=top;y<bottom;y++)for(let x=Math.max(0,Math.floor(box.left));x<Math.min(width,Math.ceil(box.right));x++){
    const a=b[((height-1-y)*width+x)*4+3];covered++;histogram[a]=(histogram[a]||0)+1;if(a>=136&&a<=151||a>=156&&a<=171)tagged++;
   }const input=window.__printPixelInputs,mark=input?.samplers.find(s=>s.name==='uMarks'),acquisitionHistogram={};
   if(mark){const sampled=window.__printProof.readTexture(mark.texture,width,height);for(let y=top;y<bottom;y++)for(let x=Math.max(0,Math.floor(box.left));x<Math.min(width,Math.ceil(box.right));x++){
    const a=sampled[((height-1-y)*width+x)*4+3];acquisitionHistogram[a]=(acquisitionHistogram[a]||0)+1;}}
   return{tagged,covered,box,histogram,acquisitionHistogram};
  };
  window.__printProof.depth=()=>{
   const gl=S.R.r3dCanvas().getContext('webgl2'),status=S.R.r3dPixelMeshStatus(),w=status.sceneWidth,h=status.sceneHeight,t=S.P.propTargets();
   const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,'#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}'));
   gl.attachShader(program,compile(gl.FRAGMENT_SHADER,`#version 300 es
    precision highp float;precision highp int;${PRINTED_SURFACE_GLSL}
    uniform sampler2D d,p,c;out vec4 o;void main(){ivec2 q=ivec2(gl_FragCoord.xy);float a=texelFetch(c,q,0).a;
    vec3 rgb=texelFetch(p,q,0).rgb;float packed=unpackPropWorldDepth(rgb);float actual=texelFetch(d,q,0).r;
    o=vec4(actual,packed,a,texelFetch(p,q,0).a);}`));
   gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
   if(!gl.getExtension('EXT_color_buffer_float'))throw Error('Float depth diagnostic target unavailable');
   const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,null);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
   gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,w,h);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.useProgram(program);
   for(const[unit,name,texture]of [[0,'d',t.depth],[1,'p',t.worldData],[2,'c',t.color]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,name),unit);}
   gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Float32Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,bytes);
   let bad=0,visible=0,maxLsbError=0;const samples=[],buckets={},byTag={};for(let i=0;i<bytes.length;i+=4)if(bytes[i+2]>.001){
    visible++;const units=Math.abs(bytes[i]-bytes[i+1])*16777215,tag=Math.round(bytes[i+3]*255);maxLsbError=Math.max(maxLsbError,units);
    if(units>2){bad++;const bucket=units<4?'2-4':units<256?'4-256':units<65536?'256-65536':'65536+';buckets[bucket]=(buckets[bucket]||0)+1;byTag[tag]=(byTag[tag]||0)+1;
     if(samples.length<24)samples.push({x:(i/4)%w,y:Math.floor(i/4/w),actual:bytes[i],packed:bytes[i+1],units,tag});}}
   gl.deleteFramebuffer(f);gl.deleteTexture(tex);gl.deleteProgram(program);return{width:w,height:h,bad,visible,tolerance:2/16777215,maxLsbError,buckets,byTag,samples,glError:gl.getError(),worldDataReady:t.worldDataReady};
  };
 },baselineMode);
 console.log('Production printed-material probe packs and renderer ready');
 if(process.env.PRINTED_SOURCE_ONLY==='1'){
  report.sourcePrintGrain=await page.evaluate(async()=>{
   const S=window.letteringStudy,e=await S.configure('services',960,600,1),gl=S.R.r3dCanvas().getContext('webgl2');
   // addPropPack exposes the already installed catalog. The control changes
   // only the private test catalog's descriptor, never the GLB or its texture.
   const pack=await S.P.addPropPack('/assets/lettering-production/signs-printed.glb'),target=e.props.find(p=>p.id===e.targetId),entry=pack.catalog.get(e.targetMesh);
   const originalPrimitives=entry.primitives,printed=originalPrimitives.filter(p=>p.printedSurface),descriptors=printed.map(p=>p.printedSurface),centre=e.targetCentre,base=e.camera(3),cases=[];
   if(!printed.length)throw Error('Production target has no physical printed material');
   // A positive stock-grain fixture is separate from the real glyph texture:
   // this atlas face's real UV Jacobian does not cross the existing grain
   // tangent threshold at the tested distance. Exercise ordinary axis marks
   // with explicit repeated test UVs and deterministic unlettered stock noise.
   const stockTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,stockTexture);const stockPixels=new Uint8Array(16*16*4);
   for(let i=0;i<256;i++){const v=((i*73+(i>>4)*41)%251);stockPixels.set([v,v,v,255],i*4);}gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,16,16,0,gl.RGBA,gl.UNSIGNED_BYTE,stockPixels);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
   const uvControls=printed.map(p=>{gl.bindVertexArray(p.vao);const original=gl.getVertexAttrib(2,gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);gl.bindBuffer(gl.ARRAY_BUFFER,original);const data=new Float32Array(gl.getBufferParameter(gl.ARRAY_BUFFER,gl.BUFFER_SIZE)/4);gl.getBufferSubData(gl.ARRAY_BUFFER,0,data);const control=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,control);gl.bufferData(gl.ARRAY_BUFFER,data.map(n=>n*64),gl.STATIC_DRAW);return{original,control,texture:p.texture};});
   const applyControl=synthetic=>printed.forEach((p,i)=>{const uv=uvControls[i];p.texture=synthetic?stockTexture:uv.texture;gl.bindVertexArray(p.vao);gl.bindBuffer(gl.ARRAY_BUFFER,synthetic?uv.control:uv.original);gl.vertexAttribPointer(2,2,gl.FLOAT,false,0,0);});
   const rotatePoint=(p,angle)=>{const x=p.x-centre.x,z=p.z-centre.z,c=Math.cos(angle),s=Math.sin(angle);return{x:centre.x+c*x+s*z,y:p.y,z:centre.z-s*x+c*z};};
   try{entry.primitives=printed;S.P.setDynamicPropInstances([]);S.P.setSourceTextInstances([]);
    for(const angle of[0,Math.PI/2]){
     const c=Math.cos(angle),s=Math.sin(angle),matrix=Array.from(target.matrix);
     for(let col=0;col<3;col++){const x=matrix[col*4],z=matrix[col*4+2];matrix[col*4]=c*x+s*z;matrix[col*4+2]=-s*x+c*z;}
     const origin=rotatePoint({x:matrix[12],y:matrix[13],z:matrix[14]},angle);matrix[12]=origin.x;matrix[14]=origin.z;
     const cam=rotatePoint(base,angle),camera={camX:cam.x,camY:cam.y,camZ:cam.z,yaw:base.yaw-angle,pitch:base.pitch};
     S.P.setPropInstances([{...target,matrix}]);
     for(const kind of['printed','untagged','synthetic-stock-grain']){const tagged=kind==='printed',synthetic=kind==='synthetic-stock-grain';applyControl(synthetic);
      printed.forEach((p,i)=>p.printedSurface=tagged?descriptors[i]:null);
      S.P.renderPropPass({...camera,sourceRoomLighting:true,zoneTints:new Float32Array(66).fill(1),shadowPrepared:true,light:1,reducedMotion:true});
      const bytes=window.__printProof.readTexture(S.P.propTargets().marks,960,600),histogram={};let tagPixels=0,neutralTagPixels=0,grainPixels=0;const grainPlaneHistogram={};
      for(let at=0;at<bytes.length;at+=4){const a=bytes[at+3],isTag=a>=136&&a<=151||a>=156&&a<=171;histogram[a]=(histogram[a]||0)+1;
       if(isTag){tagPixels++;if(bytes[at]===0&&bytes[at+1]===128&&bytes[at+2]===128)neutralTagPixels++;}
       if(bytes[at]>0){grainPixels++;grainPlaneHistogram[a]=(grainPlaneHistogram[a]||0)+1;}
      }
      cases.push({kind,angle,tagged,syntheticStockControl:synthetic,camera,matrix,tagPixels,neutralTagPixels,grainPixels,grainPlaneHistogram,histogram,marksReady:S.P.propTargets().marksReady,glError:gl.getError()});
     }
    }
   }finally{applyControl(false);uvControls.forEach(p=>gl.deleteBuffer(p.control));gl.deleteTexture(stockTexture);entry.primitives=originalPrimitives;printed.forEach((p,i)=>p.printedSurface=descriptors[i]);S.P.setPropInstances(e.props);}
   return{scope:'Actual installed production services printed primitives, same geometry/RGB/normal/ORM/authored mask at two world-axis orientations. Private untagged control clears only the material descriptor. The separately labelled synthetic stock control substitutes deterministic unlettered noise and64x repeated UVs solely to exercise nonzero grain-axis encoding; it is not a world material or art candidate. Tests the physical Source MRT contract, not a human reading trial.',mesh:e.targetMesh,materials:printed.map((p,i)=>({name:p.materialName,printedSurface:descriptors[i]})),cases};
  });
  for(const c of report.sourcePrintGrain.cases){assert.equal(c.glError,0);assert.equal(c.marksReady,true);if(c.tagged){assert.ok(c.tagPixels>100);assert.equal(c.neutralTagPixels,c.tagPixels);assert.equal(c.grainPixels,0);}else{assert.equal(c.tagPixels,0);if(c.syntheticStockControl)assert.ok(c.grainPixels>100);}}
  const grainControls=report.sourcePrintGrain.cases.filter(c=>c.syntheticStockControl);assert.ok(grainControls[0].grainPlaneHistogram[128]>100);assert.ok(grainControls[1].grainPlaneHistogram[255]>100);
  report.sourceHashesAfter=hashes();report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();assert.ok(report.sourcesUnchanged);assert.deepEqual(report.errors,[]);
  console.log('Physical Source printed/grain contract',JSON.stringify(report.sourcePrintGrain));await browser.close();process.exit(0);
 }
 if(process.env.PRINTED_PAPER_ONLY==='1'){
  report.paper=await paperProof(page);report.sourceHashesAfter=hashes();report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();
  console.log('World-paper GPU proof',JSON.stringify(report.paper));assert.ok(report.sourcesUnchanged);assert.deepEqual(report.errors,[]);await browser.close();process.exit(0);
 }
 if(process.env.PRINTED_TRACE_ONLY==='1'){
  report.pigmentTrace=await page.evaluate(async()=>{
   const S=window.letteringStudy;await S.configure('services',960,600,1);S.R.r3dSetPrintedSurfaceMode(3);
   for(let i=0;i<4;i++)S.renderSample({variant:'light-enamel',light:'torch'});
   const s=S.renderSample({variant:'light-enamel',light:'torch'}),input=window.__printPixelInputs,{gl,program:original,viewport}=input,w=viewport[2],h=viewport[3];
   const shaders=gl.getAttachedShaders(original),fragment=shaders.find(q=>gl.getShaderParameter(q,gl.SHADER_TYPE)===gl.FRAGMENT_SHADER),vertex=shaders.find(q=>gl.getShaderParameter(q,gl.SHADER_TYPE)===gl.VERTEX_SHADER);
   const fs=gl.getShaderSource(fragment),vs=gl.getShaderSource(vertex),marks=window.__printProof.readTexture(input.samplers.find(q=>q.name==='uMarks').texture,w,h);
   const compile=(type,source)=>{const q=gl.createShader(type);gl.shaderSource(q,source);gl.compileShader(q);if(!gl.getShaderParameter(q,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(q));return q;};
   const set=(p,name,type,value)=>{const l=gl.getUniformLocation(p,name);if(l===null)return;
    if(type===gl.FLOAT)gl.uniform1f(l,value);else if([gl.INT,gl.BOOL,gl.SAMPLER_2D,gl.SAMPLER_CUBE].includes(type))gl.uniform1i(l,value);
    else if(type===gl.FLOAT_VEC2)gl.uniform2fv(l,value);else if(type===gl.FLOAT_VEC3)gl.uniform3fv(l,value);else if(type===gl.FLOAT_VEC4)gl.uniform4fv(l,value);
    else if([gl.INT_VEC2,gl.BOOL_VEC2].includes(type))gl.uniform2iv(l,value);else if([gl.INT_VEC3,gl.BOOL_VEC3].includes(type))gl.uniform3iv(l,value);else if([gl.INT_VEC4,gl.BOOL_VEC4].includes(type))gl.uniform4iv(l,value);
    else if(type===gl.FLOAT_MAT2)gl.uniformMatrix2fv(l,false,value);else if(type===gl.FLOAT_MAT3)gl.uniformMatrix3fv(l,false,value);else if(type===gl.FLOAT_MAT4)gl.uniformMatrix4fv(l,false,value);else throw Error(`Unsupported diagnostic uniform ${name}:${type}`);};
   const uniforms=[];for(let i=0;i<gl.getProgramParameter(original,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(original,i);for(let k=0;k<u.size;k++){
    const name=u.size>1?u.name.replace('[0]',`[${k}]`):u.name;uniforms.push({name,type:u.type,value:gl.getUniform(original,gl.getUniformLocation(original,name))});}}
   const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,w,h,0,gl.RGBA,gl.FLOAT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
   const fields=[['sourceLuma','neighbourLuma','formTone','captureBit'],['printedSampling','pigmentEdge','darkCrease','brightContour'],['luma(srcFull.rgb)','luma(srcCell.rgb)','tone','hasCapturedLight'],['captureBlackProtect','stippleThreshold','halfTone','materialRelief']];
   if(fs.includes('printLumaEndpoints'))fields.push(['printCoverageSpan','printLumaEndpoints.x','printLumaEndpoints.y','printed.y']);
   const diagnostics=[];for(const names of fields){const modified=fs.replace('o = vec4(finalColor, clamp(mem, 0.0, 1.0));',`o = vec4(${names.join(',')});`);if(modified===fs)throw Error('Actual shader diagnostic output anchor not found');
    const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,modified));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);for(const u of uniforms)set(p,u.name,u.type,u.value);for(const q of input.samplers){gl.activeTexture(gl.TEXTURE0+q.unit);gl.bindTexture(gl.TEXTURE_2D,q.texture);}
    gl.viewport(...viewport);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindVertexArray(input.vao);gl.drawArrays(input.mode,input.first,input.count);
    const data=new Float32Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.FLOAT,data);const groups={};
    for(const[tag,label]of[[151,'fullyCoveredInk'],[136,'bareStock'],[140,'coverage4of15'],[144,'coverage8of15'],[148,'coverage12of15']]){const values=names.map(()=>[]),samples=[];
     for(let y=Math.max(0,Math.floor(s.evidence.bounds.top));y<Math.min(h,Math.ceil(s.evidence.bounds.bottom));y++)for(let x=Math.max(0,Math.floor(s.evidence.bounds.left));x<Math.min(w,Math.ceil(s.evidence.bounds.right));x++){
      const i=((h-1-y)*w+x)*4;if(marks[i+3]!==tag)continue;for(let k=0;k<4;k++)values[k].push(data[i+k]);if(samples.length<24)samples.push({x,y,values:Array.from(data.slice(i,i+4))});}
     groups[label]={tag,count:values[0].length,fields:Object.fromEntries(names.map((name,k)=>{const a=values[k].sort((x,y)=>x-y);return[name,{min:a[0],p10:a[Math.floor(a.length*.1)],median:a[Math.floor(a.length*.5)],p90:a[Math.floor(a.length*.9)],max:a.at(-1)}];})),samples};}
    diagnostics.push({names,groups,glError:gl.getError()});gl.deleteProgram(p);
   }
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fs));gl.deleteFramebuffer(f);gl.deleteTexture(tex);
   return{actualFragmentSha256:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),containsPreGradeMix:fs.includes('c = mix((c + blurC) * 0.2,c,printedSampling);'),containsEndpointPath:fs.includes('float printedTone=mix(endpointTone.x,endpointTone.y,printed.y);'),mode:uniforms.find(u=>u.name==='uPrintedSurfaceMode')?.value,
    copiedUniformCount:uniforms.length,selectedUniforms:Object.fromEntries(uniforms.filter(u=>/uGrade|uRecording|uCellPx|uLineAmount|uScreenKind/.test(u.name)).map(u=>[u.name,typeof u.value==='number'?u.value:Array.from(u.value)])),diagnostics,evidence:s.evidence};
  });save();console.log('GPU pigment trace',JSON.stringify(report.pigmentTrace));throw Error('Diagnostic-only pigment trace saved');
 }
 if(process.env.PRINTED_DEPTH_ONLY==='1'){
  report.depth.push(await page.evaluate(async()=>{const S=window.letteringStudy;await S.configure('services',960,600,1);for(let i=0;i<4;i++)S.renderSample({variant:'fabricated',light:'torch'});return window.__printProof.depth();}));
  save();console.log('Depth diagnostic',JSON.stringify(report.depth[0]));throw Error('Diagnostic-only depth snapshot saved');
 }
 for(const test of [{id:'services',variant:'fabricated',name:'dark-enamel'},{id:'services',variant:'light-enamel',name:'pale-enamel'},{id:'placard',variant:'fabricated',name:'brush-placard'}]){
  for(const[width,height,scale]of (process.env.PRINTED_QUICK==='1'?[[960,600,1]]:[[960,600,1],[1280,720,1],[960,600,.5]])){
   await page.evaluate(async({id,width,height,scale})=>window.letteringStudy.configure(id,width,height,scale),{id:test.id,width,height,scale});
   for(const mode of [baselineMode,1,2,3])for(const stage of mode===baselineMode||mode===3?['props','scene','final']:['final']){
    const r=await page.evaluate(({variant,mode,stage})=>{const S=window.letteringStudy;S.R.r3dSetPrintedSurfaceMode(mode);
     for(let i=0;i<3;i++)S.renderSample({variant,light:'torch',stage,distance:3});const s=S.renderSample({variant,light:'torch',stage,distance:3});
     return{url:s.frame.toDataURL('image/png'),evidence:s.evidence,tags:window.__printProof.tags(s.evidence),mode,stage};},{variant:test.variant,mode,stage});
    const file=`${test.name}-${width}x${height}-s${scale}-mode${mode}-${stage}.png`;writeFileSync(`${out}/${file}`,Buffer.from(r.url.split(',')[1],'base64'));delete r.url;
    report.captures.push({...test,width,height,scale,file,...r});assert.equal(r.evidence.glError,0);
   }
   const depth=await page.evaluate(variant=>{window.letteringStudy.renderSample({variant,light:'torch'});return window.__printProof.depth();},test.variant);
   report.depth.push({...test,width,height,scale,...depth});assert.equal(depth.glError,0);assert.equal(depth.bad,0);assert.ok(depth.visible>0);save();
   console.log('Captured',test.name,width,height,scale);
  }
 }
 report.occlusion=await page.evaluate(async()=>{
  const S=window.letteringStudy,e=await S.configure('services',960,600,1);S.R.r3dSetPrintedSurfaceMode(3);
  let s=S.renderSample({variant:'fabricated',light:'torch'});const before=window.__printProof.tags(s.evidence);
  const target=e.props.find(p=>p.id===e.targetId),matrix=Array.from(target.matrix),cam=e.camera(3),toward=[cam.x-matrix[12],cam.y-matrix[13],cam.z-matrix[14]],length=Math.hypot(...toward);
  for(let i=0;i<12;i++)if(i%4<3)matrix[i]*=1.22;
  for(let k=0;k<3;k++)matrix[12+k]+=.30*toward[k]/length;
  const obstacle={...target,id:'print-proof-opaque-occluder',mesh:'lettering_study_services_baseline',matrix};e.props.push(obstacle);
  try{for(let i=0;i<3;i++)s=S.renderSample({variant:'fabricated',light:'torch'});const after=window.__printProof.tags(s.evidence);
   return{before,after,occluder:{mesh:obstacle.mesh,matrix},glError:s.evidence.glError,url:s.frame.toDataURL('image/png')};
  }finally{e.props.pop();}
 });
 writeFileSync(`${out}/opaque-occlusion.png`,Buffer.from(report.occlusion.url.split(',')[1],'base64'));delete report.occlusion.url;
 assert.ok(report.occlusion.before.tagged>0);assert.equal(report.occlusion.after.tagged,0);assert.equal(report.occlusion.glError,0);save();
 report.depthWriters=await page.evaluate(async()=>{
  const S=window.letteringStudy,e=await S.configure('services',960,600,1),{LETTERING_STUDY_CASES}=await import('/src/render/lettering-study.js'),face=LETTERING_STUDY_CASES.services;
  const target=e.props.find(p=>p.id===e.targetId),m=target.matrix,cam=e.camera(3),eye=[cam.x,cam.y,cam.z],center=e.targetCentre;
  const toward=[eye[0]-center.x,eye[1]-center.y,eye[2]-center.z],length=Math.hypot(...toward),shift=toward.map(n=>n*.35/length);
  const point=(x,y,z)=>[m[0]*x+m[4]*y+m[8]*z+m[12]+shift[0],m[1]*x+m[5]*y+m[9]*z+m[13]+shift[1],m[2]*x+m[6]*y+m[10]*z+m[14]+shift[2]];
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>point(x*face.widthM*.75,face.centerY+y*face.heightM*.8,face.faceZ));
  const origin=corners.reduce((a,c)=>a.map((v,i)=>v+c[i]/4),[0,0,0]),normal=[toward[0]/Math.hypot(toward[0],toward[2]),0,toward[2]/Math.hypot(toward[0],toward[2])];
  const gl=S.R.r3dCanvas().getContext('webgl2'),textures=[];
  const texture=(rgb)=>{const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgb));
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t;};
  const capture={color:texture([35,42,39,255]),depth:texture([0,0,0,40]),eye,yaw:cam.yaw,aspect:960/600};
  const camera={camX:cam.x,camY:cam.y,camZ:cam.z,yaw:cam.yaw,pitch:cam.pitch};
  const cases=[];try{for(const physicalSource of[false,true])for(const kind of['opening','portal','tower-opening','tower-inside']){
   const s=S.renderSample({variant:'light-enamel',light:'torch'});
   if(physicalSource)S.P.renderPropPass({...camera,sourceRoomLighting:true,zoneTints:new Float32Array(66).fill(1),shadowPrepared:true,light:1,reducedMotion:true});
   const before=window.__printProof.tags(s.evidence);
   let drawn;if(kind==='opening')drawn=S.P.renderSourceOpenings({...camera,openings:[{corners,normal,front:[.03,.04,.035],back:[.03,.04,.035]}]});
   else if(kind==='portal')drawn=S.P.renderSourcePortals({...camera,portals:[{corners,normal,origin,variant:0,seed:1}],reducedMotion:true});
   else drawn=S.P.renderSourceTowerView({...camera,view:{corners,origin,forward:[-normal[0],-normal[2]],width:face.widthM,capture},inside:kind==='tower-inside'});
   const after=window.__printProof.tags(s.evidence);delete before.acquisitionHistogram;delete after.acquisitionHistogram;
   let neutralBad=0;if(physicalSource){const bytes=window.__printProof.readTexture(S.P.propTargets().marks,960,600),b=s.evidence.bounds;
    for(let y=Math.max(0,Math.floor(b.top));y<Math.min(600,Math.ceil(b.bottom));y++)for(let x=Math.max(0,Math.floor(b.left));x<Math.min(960,Math.ceil(b.right));x++){
     const at=((599-y)*960+x)*4;if(bytes[at]!==0||bytes[at+1]!==128||bytes[at+2]!==128||bytes[at+3]!==0)neutralBad++;}}
   cases.push({kind,physicalSource,drawn,before,after,marksReady:S.P.propTargets().marksReady,
    depth:physicalSource?null:window.__printProof.depth(),neutralBad,glError:gl.getError()});
  }}finally{textures.forEach(t=>gl.deleteTexture(t));}
  return{scope:'Actual opaque P3 opening/portal/tower draw calls over a real printed prop in ordinary depth MRT and physical Source grain MRT. Tests source writer depth/mark ownership directly; the subsequent main compositor is not rerun.',corners,origin,normal,camera,cases};
 });for(const c of report.depthWriters.cases){assert.ok(c.drawn>0);assert.ok(c.before.tagged>0);assert.equal(c.after.tagged,0);assert.equal(c.glError,0);if(c.physicalSource){assert.equal(c.neutralBad,0);assert.equal(c.marksReady,true);}else{assert.equal(c.depth.bad,0);assert.equal(c.depth.glError,0);}}save();
 report.printedContrast=await page.evaluate(async()=>{
  const S=window.letteringStudy;await S.configure('services',960,600,1);S.R.r3dSetPrintedSurfaceMode(3);
  for(let i=0;i<4;i++)S.renderSample({variant:'light-enamel',light:'torch'});const s=S.renderSample({variant:'light-enamel',light:'torch'});
  const input=window.__printPixelInputs,{gl,program,viewport}=input,w=viewport[2],h=viewport[3],marks=window.__printProof.readTexture(input.samplers.find(q=>q.name==='uMarks').texture,w,h),target=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,target);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(...viewport);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(input.vao);gl.useProgram(program);
  for(const q of input.samplers){gl.activeTexture(gl.TEXTURE0+q.unit);gl.bindTexture(gl.TEXTURE_2D,q.texture);gl.uniform1i(gl.getUniformLocation(program,q.name),q.unit);}
  const groups=[['bareStock',a=>a===136],['partialInk',a=>a>=144&&a<=150],['coverage8of15',a=>a===144],['coverage12of15',a=>a===148],['fullInk',a=>a===151]],results=[];
  for(const mode of[window.__printBaselineMode,3]){gl.uniform1f(gl.getUniformLocation(program,'uPrintedSurfaceMode'),mode);gl.drawArrays(input.mode,input.first,input.count);const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
   const bins={};for(const[name,accept]of groups){let count=0,luma=0,light=0;for(let y=Math.max(0,Math.floor(s.evidence.bounds.top));y<Math.min(h,Math.ceil(s.evidence.bounds.bottom));y++)for(let x=Math.max(0,Math.floor(s.evidence.bounds.left));x<Math.min(w,Math.ceil(s.evidence.bounds.right));x++){
    const at=((h-1-y)*w+x)*4;if(!accept(marks[at+3]))continue;const value=(bytes[at]*.2126+bytes[at+1]*.7152+bytes[at+2]*.0722)/255;count++;luma+=value;light+=value>.5;}
    bins[name]={count,meanLuma:luma/count,lightFraction:light/count};}results.push({mode,bins,contrast:bins.bareStock.meanLuma-bins.partialInk.meanLuma,glError:gl.getError()});}
  gl.deleteFramebuffer(f);gl.deleteTexture(target);return{scope:'Identical actual pale-enamel P3 scene/depth/mark/history inputs replayed through the actual linked PIXEL program. Partial ink is authored coverage8/15through14/15; contrast is bare-stock mean minus partial-ink mean.',results};
 });assert.ok(report.printedContrast.results.every(r=>r.glError===0&&r.bins.partialInk.count>100));assert.ok(report.printedContrast.results[1].contrast>report.printedContrast.results[0].contrast);save();
 report.untagged=await page.evaluate(async()=>{
  const S=window.letteringStudy,e=await S.configure('services',960,600,1),old=e.props;e.props=e.props.filter(p=>p.id===e.targetId);
  try{S.R.r3dSetPrintedSurfaceMode(window.__printBaselineMode);for(let i=0;i<4;i++)S.renderSample({variant:'baseline',light:'torch'});
   const s=S.renderSample({variant:'baseline',light:'torch'}),tags=window.__printProof.tags(s.evidence);
   const input=window.__printPixelInputs;if(!input)throw Error('Actual PIXEL acquisition inputs unavailable');
   const{gl,program,viewport}=input,w=viewport[2],h=viewport[3],target=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,target);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
   const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);
   gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(...viewport);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(input.vao);gl.useProgram(program);
   for(const{name,unit,texture}of input.samplers){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(gl.getUniformLocation(program,name),unit);}
   const frames=[];for(const mode of[window.__printBaselineMode,3]){gl.uniform1f(gl.getUniformLocation(program,'uPrintedSurfaceMode'),mode);gl.drawArrays(input.mode,input.first,input.count);
    const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);frames.push({mode,bytes,glError:gl.getError()});}
   let different=0,maxDelta=0;for(let i=0;i<frames[0].bytes.length;i++){const d=Math.abs(frames[0].bytes[i]-frames[1].bytes[i]);different+=d>0;maxDelta=Math.max(maxDelta,d);}
   gl.deleteFramebuffer(f);gl.deleteTexture(target);
   return{different,maxDelta,pixels:frames[0].bytes.length/4,tagged:[tags.tagged,tags.tagged],glErrors:frames.map(f=>f.glError),settings:S.R.r3dPixelMeshSettings(),fixedTime:window.__printFixedTime,
    samplers:input.samplers.map(({name,unit})=>({name,unit})),
    scope:'Actual untagged P3 sign plus ordinary architecture. Replay of identical actual scene, depth, mark and history textures through the linked production PIXEL program freezes frame-evolving reaction diffusion.'};
  }finally{e.props=old;}
 });assert.equal(report.untagged.different,0);assert.deepEqual(report.untagged.tagged,[0,0]);save();
 report.blackFixture=await page.evaluate(()=>{
  const entry=window.__printPrograms.find(p=>p.gl===window.letteringStudy.R.r3dCanvas().getContext('webgl2'));if(!entry)throw Error('Actual production pixel program not captured');
  const {gl,program}=entry,w=32,h=32,tex=(value)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);const data=new Uint8Array(w*h*4);for(let i=0;i<data.length;i+=4)data.set(value,i);
   gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,data);for(const name of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,name,gl.NEAREST);return t;};
  const black=tex([0,0,0,180]),previous=tex([0,0,0,0]),noise=tex([127,127,127,255]),marks=tex([0,128,128,151]),target=tex([0,0,0,0]),f=gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,w,h);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(null);gl.useProgram(program);
  for(const[unit,name,t]of [[0,'uSrc',black],[1,'uPrev',previous],[2,'uDepth',black],[3,'uMarks',marks],[4,'uNoise',noise],[5,'uRecordedPressureGeometry',previous]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(gl.getUniformLocation(program,name),unit);}
  gl.uniform2f(gl.getUniformLocation(program,'uRes'),w,h);gl.uniform2f(gl.getUniformLocation(program,'uNoiseSize'),w,h);gl.uniform1f(gl.getUniformLocation(program,'uRecordedPressureReady'),0);
  const cases=[];for(const[markByte,polarity]of[[151,'dark-on-light'],[171,'light-on-dark']]){
   const data=new Uint8Array(w*h*4);for(let i=0;i<data.length;i+=4)data.set([0,128,128,markByte],i);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,marks);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);
   const results=[],frames=[];for(const mode of [window.__printBaselineMode,3]){gl.uniform1f(gl.getUniformLocation(program,'uPrintedSurfaceMode'),mode);gl.drawArrays(gl.TRIANGLES,0,3);const bytes=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,bytes);frames.push(bytes);
    let nonzero=0,maxRgb=0;for(let i=0;i<bytes.length;i+=4){const m=Math.max(bytes[i],bytes[i+1],bytes[i+2]);nonzero+=m>0;maxRgb=Math.max(maxRgb,m);}results.push({mode,nonzero,maxRgb,glError:gl.getError()});}
   let different=0;for(let i=0;i<frames[0].length;i++)different+=frames[0][i]!==frames[1][i];cases.push({markByte,polarity,coverage:1,different,results});}
  return{cases,permittedRgbByteCeiling:2,baseline:'Existing captureDark is vec3(.0015,.005,.0045), so an exactly black input has a small authored output floor. Required proof is identical baseline/production output with no added pigment light.',pixelProgram:'Actual linked production pixel-mesh program; retained explore profile uniforms, black source, no temporal history.'};
 });assert.ok(report.blackFixture.cases.every(c=>c.different===0&&c.results.every(r=>r.maxRgb<=report.blackFixture.permittedRgbByteCeiling&&r.glError===0)));save();
 report.timings=await page.evaluate(async()=>{
  const S=window.letteringStudy;await S.configure('services',960,600,1);const gl=S.R.r3dCanvas().getContext('webgl2'),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if(!ext)return{supported:false};const results=[],queries=[];
  for(const mode of[window.__printBaselineMode,3]){S.R.r3dSetPrintedSurfaceMode(mode);for(let i=0;i<8;i++)S.renderSample({variant:'light-enamel',light:'torch'});}
  for(let i=0;i<20;i++)for(const mode of(i%2?[3,window.__printBaselineMode]:[window.__printBaselineMode,3])){S.R.r3dSetPrintedSurfaceMode(mode);const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);S.renderSample({variant:'light-enamel',light:'torch'});gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push({mode,q});}
  for(let tries=0;tries<100&&!queries.every(({q})=>gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE));tries++)await new Promise(r=>setTimeout(r,10));
  const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);for(const mode of[window.__printBaselineMode,3]){const samples=queries.filter(e=>e.mode===mode&&gl.getQueryParameter(e.q,gl.QUERY_RESULT_AVAILABLE)).map(({q})=>gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);
   const sorted=[...samples].sort((a,b)=>a-b);results.push({mode,warmupFrames:8,samplesMs:samples,medianMs:sorted[Math.floor(sorted.length/2)],p95Ms:sorted[Math.floor((sorted.length-1)*.95)],disjoint,glError:gl.getError()});}queries.forEach(({q})=>gl.deleteQuery(q));
  return{supported:true,scope:'Warmed whole-renderer GPU query span for matched pale-enamel Scene Dock fixture at960x600;20samples per mode, interleaved in alternating pair order after8warmup frames each. Includes scene/P3, acquisition, final passes and the diagnostic render call; CPU/readback costs are not separately isolated. Not per-sign cost or a gameplay frame-rate benchmark.',results};
 });if(report.timings.supported)assert.ok(report.timings.results.every(r=>!r.disjoint&&r.samplesMs.length===20&&r.glError===0));save();
 if(process.env.PRINTED_QUICK!=='1'){report.paper=await paperProof(page);save();}
 report.motionEvidence={capturedHere:false,reason:'Static proof uses a fixed clock; it must never switch backwards to native time for recording. Native monotonic media is captured separately by verify-lettering-motion.mjs.',priorPairedClips:'Rejected after decoded saved frames showed an underlit non-finite torch envelope caused by harness clock reversal. Their encoded frame count and GL0 are not accepted motion proof.',directPreview:'../direct-motion/report.json',directPreviewLimit:'Prior0dcd asset identity, internally unchanged. Services and Vigil geometry/materials are identical in final089b page6-only delta. Saved previews are lit but decoded rates5.25–7.86fps do not establish normal-speed temporal dither stability.'};
 report.sourceHashesAfter=hashes();report.sourcesUnchanged=JSON.stringify(report.sourceHashes)===JSON.stringify(report.sourceHashesAfter);save();
 assert.deepEqual(report.errors,[]);assert.ok(report.sourcesUnchanged,'Source changed during proof; re-run after freeze');
 console.log(JSON.stringify({captures:report.captures.length,depth:report.depth,occlusion:report.occlusion,untagged:report.untagged,black:report.blackFixture,sourcesUnchanged:report.sourcesUnchanged}));
}catch(e){report.failure=e.message;save();throw e;}finally{const p=browser.process();let timer;try{await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(()=>{p?.kill('SIGTERM');r();},10000);})]);}finally{clearTimeout(timer);}}
