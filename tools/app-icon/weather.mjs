// Deterministic world-space rain for a finite, silent Dock arrival. This is
// authored weather around the real vehicle, not a screen-space overlay.
export const VAN_ICON_WEATHER=Object.freeze({rain:true,seed:1987,rainDrops:72,
 lightningAtSeconds:Object.freeze([2.42]),thunderAtSeconds:Object.freeze([2.90]),
 lightningDurationSeconds:.57,flashRanges:Object.freeze([{fromSeconds:2.38,toSeconds:2.95,safeAtSeconds:2.30}]),
 lightningPolicy:'one restrained illumination rising to2.42s then softly decaying to2.95s; no secondary flashes; disabled for Reduced Motion/reduced flash',
 nativeAudio:false});
const fract=v=>v-Math.floor(v),hash=i=>fract(Math.sin(i*127.1+1987.17)*43758.5453);
export function rainDropAt(index,time,groundY=0){
 const speed=6.2+hash(index+91)*2.8,height=4.7,cycle=fract(hash(index+3)+Math.max(0,time)*speed/height);
 return{x:(hash(index+11)-.5)*5.5-.18*cycle,y:groundY+.06+(1-cycle)*height,z:(hash(index+37)-.5)*6.8-.12*cycle,
  length:.16+hash(index+64)*.16,speed,cycle};
}
export function lightningAt(time,{reducedMotion=false,reduceFlash=false}={}){
 if(reducedMotion||reduceFlash)return 0;
 const t=Number(time),range=VAN_ICON_WEATHER.flashRanges[0],peak=VAN_ICON_WEATHER.lightningAtSeconds[0];
 if(t<=range.fromSeconds||t>=range.toSeconds)return 0;
 if(t<peak){const u=(t-range.fromSeconds)/(peak-range.fromSeconds);return u*u*(3-2*u);}
 const u=(t-peak)/(range.toSeconds-peak);return .5*(1+Math.cos(Math.PI*u));
}
export function createVanIconWeather(THREE,scene,{groundY,camera}){
 const group=new THREE.Group();group.name='icon-world-rain-and-wet-ground';scene.add(group);
 const rain=new THREE.InstancedMesh(new THREE.CylinderGeometry(.008,.006,1,4,1),
  new THREE.MeshStandardMaterial({name:'icon rain illuminated water',color:0x91b5bf,transparent:true,opacity:.5,roughness:.18,metalness:.12,depthWrite:false,emissive:0x25343d,emissiveIntensity:.18}),VAN_ICON_WEATHER.rainDrops);
 rain.name='physical falling rain';rain.frustumCulled=false;group.add(rain);
 const puddles=[];
 for(let i=0;i<7;i++){
  const puddle=new THREE.Mesh(new THREE.CircleGeometry(1,36),new THREE.MeshStandardMaterial({name:'icon rainwater puddle',color:0x26323a,roughness:.13,metalness:.28,transparent:true,opacity:.16,depthWrite:false}));
  puddle.name='wet ground island '+i;puddle.rotation.x=-Math.PI/2;
  puddle.position.set((hash(i+401)-.5)*3.7,groundY-.002,(hash(i+417)-.5)*4.5);
  puddle.scale.set(.45+hash(i+429)*.7,.18+hash(i+431)*.35,1);group.add(puddle);puddles.push(puddle);
 }
 const ripples=[];
 for(let i=0;i<12;i++){
  const ripple=new THREE.Mesh(new THREE.RingGeometry(.88,1,20),new THREE.MeshBasicMaterial({name:'icon rainwater ripple',color:0x99aeb7,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
  ripple.rotation.x=-Math.PI/2;ripple.position.set((hash(i+501)-.5)*4.6,groundY+.005,(hash(i+521)-.5)*5.4);group.add(ripple);ripples.push(ripple);
 }
 const lightning=new THREE.DirectionalLight(0xd3dff5,0);lightning.name='single restrained distant lightning';lightning.position.set(-5,7,-7);scene.add(lightning);
 const glints=[];
 for(let i=0;i<4;i++){
  const glint=new THREE.Mesh(new THREE.PlaneGeometry(.075,.4),new THREE.MeshBasicMaterial({name:'icon wet lamp glint',color:0xff4232,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));
  glint.rotation.x=-Math.PI/2;group.add(glint);glints.push(glint);
 }
 const dummy=new THREE.Object3D(),lamp=new THREE.Vector3(),projected=new THREE.Vector3();
 const safeEdge=position=>{
  projected.copy(position).project(camera);const edge=Math.max(Math.abs(projected.x),Math.abs(projected.y));
  const u=Math.max(0,Math.min(1,(edge-.78)/.11));return 1-u*u*(3-2*u);
 };
 function update(time,{reducedMotion=false,reduceFlash=false,lamps=[],size=1024}={}){
  for(let i=0;i<VAN_ICON_WEATHER.rainDrops;i++){
   const p=rainDropAt(i,time,groundY);dummy.position.set(p.x,p.y,p.z);const edge=safeEdge(dummy.position);
   dummy.rotation.set(-.027,0,.04);dummy.scale.set(edge,p.length*edge,edge);dummy.updateMatrix();rain.setMatrixAt(i,dummy.matrix);
  }rain.instanceMatrix.needsUpdate=true;
  // Dense fine rain would overwhelm a 16px silhouette. The LOD only reduces
  // the number of real droplets; the surviving droplets still use the game pass.
  rain.count=size<=32?12:size<=64?28:VAN_ICON_WEATHER.rainDrops;
  for(let i=0;i<ripples.length;i++){
   const p=fract(hash(i+589)+Math.max(0,time)*1.2);ripples[i].scale.setScalar(.03+p*.18);ripples[i].material.opacity=(1-p)*.16;
   ripples[i].visible=size>48;
  }
  lightning.intensity=.95*lightningAt(time,{reducedMotion,reduceFlash});
  for(let i=0;i<glints.length;i++){
   const item=lamps[i],glint=glints[i];glint.visible=!!item&&size>24;if(!item)continue;
   lamp.copy(item.position);const virtualY=2*groundY-lamp.y,along=(groundY-camera.position.y)/(virtualY-camera.position.y);
   glint.position.set(camera.position.x+along*(lamp.x-camera.position.x),groundY+.007,camera.position.z+along*(lamp.z-camera.position.z));
   glint.material.color.set(item.isHead?0xf0d5a3:0xe24b39);glint.material.opacity=Math.min(.3,item.intensity*.16);
  }
 }
 return{update,debug:()=>({kind:'world-space rain',rainInstances:rain.count,puddles:puddles.length,ripples:ripples.length,
  lightningIntensity:lightning.intensity,oneShot:true,screenOverlay:false,metadata:VAN_ICON_WEATHER}),dispose(){scene.remove(group,lightning);group.traverse(node=>{node.geometry?.dispose();if(node.material)node.material.dispose();});}};
}
