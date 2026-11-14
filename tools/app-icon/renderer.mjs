import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {VAN_ICON_LAUNCH,vanIconPose,vanTyreContact,startupVanLoopPose} from './motion.mjs';
import {createVanIconAcquisition} from './acquisition.mjs';
import {createVanIconWeather} from './weather.mjs';
const host=document.getElementById('stage'),status=document.getElementById('status');
const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(1024,1024,false);renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;host.append(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,4,-4,.1,80);
camera.position.set(4.4,3.0,10);camera.lookAt(0,0,0);
scene.add(new THREE.HemisphereLight(0xd6e2ea,0x38444e,2.3));
const key=new THREE.DirectionalLight(0xe1e8ed,2.6);key.position.set(-4,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:1,far:24});key.shadow.bias=-.00015;key.shadow.normalBias=.025;scene.add(key);
const rim=new THREE.DirectionalLight(0xbdccde,1.4);rim.position.set(4,4,-6);scene.add(rim);
const fill=new THREE.DirectionalLight(0xdde4e8,1.15);fill.position.set(-5,1,-2);scene.add(fill);
const rig=new THREE.Group();scene.add(rig);
const gltf=await new GLTFLoader().loadAsync('./transit.glb');rig.add(gltf.scene);
const box=new THREE.Box3().setFromObject(rig),center=box.getCenter(new THREE.Vector3());gltf.scene.position.sub(center);
const staticBox=new THREE.Box3().setFromObject(rig),shadow=new THREE.Mesh(new THREE.PlaneGeometry(14,14),new THREE.ShadowMaterial({color:0x17151d,opacity:.25}));
// The photographic ground receiver feathers before the actual acquisition;
// its old broad rectangle must never clip at a transparent icon's outer edge.
shadow.material.onBeforeCompile=shader=>{
 shader.vertexShader='varying vec4 vIconStageClip;\n'+shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvIconStageClip=gl_Position;');
 shader.fragmentShader='varying vec4 vIconStageClip;\n'+shader.fragmentShader.replace('#include <tonemapping_fragment>',
  'vec2 iconStage=abs(vIconStageClip.xy/vIconStageClip.w);\n gl_FragColor.a*=1.0-smoothstep(.78,.92,max(iconStage.x,iconStage.y));\n #include <tonemapping_fragment>');
};
shadow.material.customProgramCacheKey=()=> 'icon-safe-physical-shadow-v1';
shadow.rotation.x=-Math.PI/2;shadow.position.y=staticBox.min.y-.006;shadow.receiveShadow=true;scene.add(shadow);
const tyres=[],lamps=[],headlamps=[];const materials=new Map();
rig.traverse(object=>{
  if(/^icon-wheel-(?:front|rear)-(?:left|right)$/.test(object.name))tyres.push(object);
  if(!object.isMesh)return;object.castShadow=true;object.receiveShadow=true;
  const source=Array.isArray(object.material)?object.material:[object.material];
  const next=source.map(material=>{if(materials.has(material))return materials.get(material);const result=material.clone();
    result.roughness=Math.max(.28,Math.min(.88,result.roughness??.75));
    if(/glass|window/i.test(result.name)){result.color.set(0x101c22);result.roughness=.17;result.metalness=.23;}
    if(/cream|enamel|van_body|vehicle_body/i.test(result.name)){result.color.set(0xc8c7be);result.roughness=.38;}
    if(/tail|safety red|rear reflector red|red.*lamp|lamp.*red/i.test(result.name)){result.emissive=new THREE.Color(0xc92817);result.emissiveIntensity=.3;lamps.push(result);}
    if(/powered headlamp/i.test(result.name)){result.emissive=new THREE.Color(0xffe0ac);result.emissiveIntensity=0;headlamps.push(result);}
    materials.set(material,result);return result;});object.material=Array.isArray(object.material)?next:next[0];
});
const body=new THREE.Group();body.name='icon-body-suspension';
for(const node of [...gltf.scene.children])if(!/^icon-wheel-/.test(node.name))body.add(node);
gltf.scene.add(body);
rig.updateMatrixWorld(true);
const groundY=staticBox.min.y+.008;
const tyreLocations=tyres.map(wheel=>({wheel,point:wheel.getWorldPosition(new THREE.Vector3())}));
function radialTexture(smoke=false){
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
 if(smoke){for(let i=0;i<7;i++){const x=38+(i*37%54),y=40+(i*23%45),r=28+(i%3)*8,g=ctx.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,'rgba(170,174,184,.32)');g.addColorStop(.5,'rgba(130,136,146,.16)');g.addColorStop(1,'rgba(115,123,138,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);}}
 else{const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.15,'rgba(255,255,255,.65)');g.addColorStop(.5,'rgba(255,255,255,.15)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);}
 return new THREE.CanvasTexture(c);
}
const glowMap=radialTexture(),smokeMap=radialTexture(true),lampGlows=[],pools=[];
// Lamp centres come from the source faces, split into left/right units.
body.updateMatrixWorld(true);
body.traverse(mesh=>{
 if(!mesh.isMesh||!mesh.geometry.attributes.position)return;
 const material=mesh.material;if(Array.isArray(material))return;
 const isHead=/powered headlamp/i.test(material.name),isRear=/rear reflector red/i.test(material.name);if(!isHead&&!isRear)return;
 const sums=[new THREE.Vector3(),new THREE.Vector3()],counts=[0,0],v=new THREE.Vector3(),position=mesh.geometry.attributes.position;
 for(let i=0;i<position.count;i++){v.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);const side=v.x<0?0:1;sums[side].add(v);counts[side]++;}
 for(let side=0;side<2;side++)if(counts[side]){
  const point=sums[side].multiplyScalar(1/counts[side]);body.worldToLocal(point);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color:isHead?0xffdf9c:0xff3219,transparent:true,depthWrite:false,opacity:0}));
  glow.position.copy(point);glow.position.z+=isHead?-.018:.018;glow.scale.setScalar(isHead?.26:.30);body.add(glow);lampGlows.push({glow,isHead});
  const pool=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:glowMap,color:isHead?0xffd99c:0xff391f,transparent:true,depthWrite:false,opacity:0}));
  pool.rotation.x=-Math.PI/2;pool.scale.set(isHead?.8:.65,isHead?1.4:1.1,1);scene.add(pool);pools.push({pool,glow,isHead});
  const light=new THREE.PointLight(isHead?0xffe4b2:0xff3c22,0,2.8,2);light.position.copy(point);body.add(light);lampGlows.at(-1).light=light;
 }
});
const tracks=[];
for(const {point}of tyreLocations){
 // Two-tone rubber scuff: a dark centre and narrow abraded edge keep the same
 // physical contact strip readable on both a light Dock and the dark review.
 const layers=[];for(const [halfWidth,color,lift]of[[.13,0xa5a2a4,.001],[.095,0x16121a,.003]]){
  const vertices=[];for(let t=.95;t<1.27-.005;t+=.01){const a=vanTyreContact(point,t,groundY),b=vanTyreContact(point,Math.min(1.27,t+.01),groundY),dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1,nx=-dz/l*halfWidth,nz=dx/l*halfWidth,y=groundY+lift;
   vertices.push(a.x+nx,y,a.z+nz,a.x-nx,y,a.z-nz,b.x+nx,y,b.z+nz,b.x+nx,y,b.z+nz,a.x-nx,y,a.z-nz,b.x-nx,y,b.z-nz);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setDrawRange(0,0);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));scene.add(mesh);layers.push(mesh);
 }tracks.push(layers);
}
const smoke=[];
for(const {wheel,point}of tyreLocations.filter(({wheel})=>wheel.name.includes('rear')))for(let i=0;i<7;i++){
 const born=.97+i*.025,at=vanTyreContact(point,born,groundY),side=point.x<0?-1:1;
 const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeMap,transparent:true,depthWrite:false,opacity:0,color:0xb8bec9}));scene.add(sprite);smoke.push({sprite,born,at,side});
}
// The fit is measured from the actual isolated model, not guessed from a page screenshot.
let maxX=0,maxY=0;
camera.updateMatrixWorld();camera.updateProjectionMatrix();
for(let sample=0;sample<=84;sample++){
 const pose=vanIconPose(sample/84*VAN_ICON_LAUNCH.durationSeconds),c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
 for(const x of[staticBox.min.x,staticBox.max.x])for(const y of[staticBox.min.y-.28,staticBox.max.y+.22])for(const z of[staticBox.min.z,staticBox.max.z]){const p=new THREE.Vector3(pose.x+c*x+s*z,y,pose.z-s*x+c*z).project(camera);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));}
}
camera.zoom=Math.min(.86/maxX,.86/maxY);camera.updateProjectionMatrix();
const weather=createVanIconWeather(THREE,scene,{groundY,camera});
const acquisition=createVanIconAcquisition(THREE,renderer);
if(!await acquisition.ready)throw Error('The game acquisition shader could not prepare.');
let raf=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let currentSize=1024,lastTime=VAN_ICON_LAUNCH.durationSeconds,currentVariant='detail';
function renderAt(t=VAN_ICON_LAUNCH.durationSeconds,{size=currentSize,reducedMotion=false,reduceFlash=false,variant='detail',startupLoop=false}={}){
  size=Math.max(1,Math.min(4096,Math.round(size)));if(size!==currentSize){currentSize=size;renderer.setSize(size,size,false);}
  lastTime=t;currentVariant=variant;
  const p=startupLoop?startupVanLoopPose(t):vanIconPose(t);rig.position.set(p.x,0,p.z);rig.rotation.y=p.yaw;
  body.position.y=p.body.heave;body.rotation.set(p.body.pitch,0,p.body.roll);
  for(const wheel of tyres)wheel.rotation.x=p.wheelAngle;
  for(const material of lamps)material.emissiveIntensity=p.brake;
  for(const material of headlamps)material.emissiveIntensity=3.5*p.head;
  rig.updateMatrixWorld(true);
  for(const {glow,isHead,light}of lampGlows){glow.material.opacity=isHead?.8*p.head:.45*Math.min(1,p.brake/2);light.intensity=isHead?3*p.head:1.8*Math.max(0,p.brake-.28);}
  for(const {pool,glow,isHead}of pools){const at=glow.getWorldPosition(new THREE.Vector3());pool.position.set(at.x,groundY+.004,at.z+(isHead?-.55:.45));pool.rotation.z=p.yaw;pool.material.opacity=(isHead?.12:.14)*p.pool;}
  for(const layers of tracks)for(const track of layers){track.material.opacity=p.tracks;track.geometry.setDrawRange(0,Math.max(0,Math.min(track.geometry.attributes.position.count,Math.floor((p.t-.95)/.01)*6)));}
  for(const cloud of smoke){const age=p.t-cloud.born,alive=age>0&&age<.44;cloud.sprite.visible=alive;
    if(alive){cloud.sprite.position.set(cloud.at.x+cloud.side*(.06+.32*age),groundY+.05+.28*age,cloud.at.z-.18*age);cloud.sprite.scale.setScalar(.16+.34*age/.44);cloud.sprite.material.opacity=.85*Math.sin(age/.44*Math.PI)*p.smoke;}}
  weather.update(t,{size,reducedMotion,reduceFlash,lamps:lampGlows.map(({glow,isHead,light})=>({position:glow.getWorldPosition(new THREE.Vector3()),isHead,intensity:light.intensity}))});
  if(!acquisition.render(scene,camera,{width:size,height:size,time:t,reducedMotion,reduceFlash,variant}))throw Error('The van did not pass through game acquisition.');
  return true;
}
function play(){cancelAnimationFrame(raf);if(reduced.matches){renderAt(undefined,{size:512,reducedMotion:true,reduceFlash:true});return;}const start=performance.now();const frame=now=>{const t=(now-start)/1000;renderAt(t,{size:512});if(t<VAN_ICON_LAUNCH.durationSeconds)raf=requestAnimationFrame(frame);else renderAt();};raf=requestAnimationFrame(frame);}
document.getElementById('replay').onclick=play;document.getElementById('still').onclick=()=>{cancelAnimationFrame(raf);renderAt(undefined,{size:512,reducedMotion:true,reduceFlash:true});};
reduced.addEventListener('change',()=>{cancelAnimationFrame(raf);renderAt(undefined,{size:512,reducedMotion:reduced.matches,reduceFlash:reduced.matches});});
renderAt();
for(const kind of['light','dark'])for(const size of[16,24,32,48,64,128]){renderAt(undefined,{size,reducedMotion:true,reduceFlash:true});const item=document.createElement('div');item.className='sample';const img=new Image();img.src=renderer.domElement.toDataURL('image/png');img.width=size;img.height=size;item.append(img,document.createTextNode(size+' px'));document.getElementById('sizes-'+kind).append(item);}
renderAt(undefined,{size:512,reducedMotion:reduced.matches,reduceFlash:reduced.matches});
status.textContent='Ready · actual game dither, physical rain · replay is silent';
window.__vanIconStudy={ready:true,renderAt,play,poseAt:vanIconPose,launch:VAN_ICON_LAUNCH,canvas:renderer.domElement,
 acquisition:()=>acquisition.debug(),weather:()=>weather.debug(),current:()=>({size:currentSize,time:lastTime,variant:currentVariant}),
 // Matched diagnostic ablation only; no exported production raster uses this.
 rawStill:(time=3.4,size=256,variant='detail')=>{renderAt(time,{size,variant});renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');},
 lampCentres:()=>lampGlows.filter(l=>!l.isHead).map(({glow})=>{const at=glow.getWorldPosition(new THREE.Vector3()).project(camera);return{x:(at.x+1)/2,y:(1-at.y)/2};}),
 fit:{bounds:staticBox,zoom:camera.zoom,tyres:tyres.length,lamps:lamps.length,headlamps:headlamps.length,trackLanes:tracks.length,puffs:smoke.length},still:(size=1024,variant='detail')=>{renderAt(undefined,{size,variant});return renderer.domElement.toDataURL('image/png');}};
