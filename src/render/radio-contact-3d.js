// A scene-owned physical radio, acquired through the game's actual transparent
// pixel-mesh pipeline. This renderer never owns an animation loop or audio.
import * as THREE from 'three';
import { assetUrl } from '../platform/paths.js';
import { buildRadioContactModel, RADIO_CONTACT_CONTROLS } from './radio-contact-model.js';
import { createBattleHandRig, loadBattleHandTemplate } from './battle-hand-rig.js';
import { createRecordistHandMaterial, addRecordistForearm, shapeRecordistForearm,
  recordistHandsDisplay } from './battle-hands.js';
import { createTransparentPixelMesh } from './pixel-mesh/transparent.js';
import { BOX_CRADLE } from './battle-hand-box-grips.js';
import { FRONT_CONTROL } from './battle-hand-controls.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
let current=null,pending=null,unavailable=null,generation=0;
let diagnostic={ready:false,error:null};
const lifetime={created:0,disposed:0};
const STRAP_REST=[.072,-.020,.015];

// This exact transform is shared by drawing and pointer targets. Movement is
// driven by the radio scene's frozen/resumed clock, never wall-clock timers.
export function radioContactView({width=736,height=460,frame={}}={}){
  const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1),aspect=w/h;
  const release=clamp(frame.release),extent=Math.max(.395+release*.065,.32/aspect),halfWidth=extent*aspect/2;
  const rise=frame.reducedMotion?1:clamp(frame.raise??1);
  const gap=clamp(frame.batteryGap),press=clamp(frame.batteryPress);
  const inspect=smooth(gap)*(1-press*.15);
  return{width:w,height:h,extent,halfWidth,
    position:[halfWidth*.22,-.035-(1-rise)*.28-release*.055,0],
    rotation:[.11+inspect*.10,.39-inspect*.95,-.045+(1-rise)*.20],
    cameraY:.045};
}

export function radioContactReleaseOffset(frame={},size={}){
  const view=radioContactView({...size,frame}),origin=radioContactView({...size,frame:{...frame,release:0}});
  const inverse=new THREE.Quaternion().setFromEuler(new THREE.Euler(...view.rotation)).invert();
  return new THREE.Vector3(...origin.position).sub(new THREE.Vector3(...view.position)).applyQuaternion(inverse).toArray();
}

const matrixFor=view=>new THREE.Matrix4().compose(new THREE.Vector3(...view.position),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(...view.rotation)),new THREE.Vector3(1,1,1));
export function radioContactProjectPoint(point,options={}){
  const view=radioContactView(options),p=new THREE.Vector3(...point).applyMatrix4(matrixFor(view));
  return{x:(p.x/view.halfWidth+1)*view.width/2,
    y:(1-(p.y-view.cameraY)/(view.extent/2))*view.height/2,depth:p.z};
}

export function radioContactControlRects({width=736,height=460,frame={},minTarget=24}={}){
  const w=Math.max(1,Number(width)||1),h=Math.max(1,Number(height)||1),view=radioContactView({width:w,height:h,frame});
  return Object.fromEntries(Object.entries(RADIO_CONTACT_CONTROLS).map(([id,control])=>{
    if(id==='battery'&&clamp(frame.batteryGap)*(1-clamp(frame.batteryPress))<=.12)return null;
    const normal=new THREE.Vector3(...control.normal).applyEuler(new THREE.Euler(...view.rotation));
    // The open plate is approached at its exposed corner. Other controls must
    // actually face the player: hidden side keys cannot become invisible UI.
    if(id!=='battery'&&normal.z<.04)return null;
    const position=[...(control.pickCenter||control.position)];
    if(id==='ptt')position[0]+=clamp(frame.ptt)*.0016;
    // The open plate's right corner follows the model's actual hinge matrix.
    if(id==='battery'){
      const gap=clamp(frame.batteryGap)*(1-clamp(frame.batteryPress));
      const matrix=new THREE.Matrix4().compose(new THREE.Vector3(-.035,-.012,-.026-gap*.0018),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(gap*.035,gap*.095,0)),new THREE.Vector3(1,1,1));
      position.splice(0,3,...new THREE.Vector3(.069,-.060,-.018).applyMatrix4(matrix).toArray());
    }
    if(id.startsWith('key:')||['confirm','back','select'].includes(id)){
      const active=frame.interaction?.id===id;position[2]-=active?clamp(frame.interaction?.pressure??1)*.0009:0;
    }else if(id==='previous'||id==='next')position[0]+=frame.interaction?.id===id?clamp(frame.interaction?.pressure??1)*.0007:0;
    const center=radioContactProjectPoint(position,{width:w,height:h,frame});
    if(center.x<0||center.x>w||center.y<0||center.y>h)return null;
    let targetW=(control.radius||.01)*2/view.extent*h,targetH=targetW;
    if(control.pickBounds){
      const points=[];for(const x of[control.pickBounds.min[0],control.pickBounds.max[0]])for(const y of[control.pickBounds.min[1],control.pickBounds.max[1]])for(const z of[control.pickBounds.min[2],control.pickBounds.max[2]])points.push(radioContactProjectPoint([x,y,z],{width:w,height:h,frame}));
      targetW=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));
      targetH=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
    }
    const sizeW=Math.min(w,Math.max(Number(minTarget)||24,targetW)),sizeH=Math.min(h,Math.max(Number(minTarget)||24,targetH));
    const x=clamp(center.x-sizeW/2,0,Math.max(0,w-sizeW)),y=clamp(center.y-sizeH/2,0,Math.max(0,h-sizeH));
    return[id,{id,x,y,w:sizeW,h:sizeH,center:{x:center.x,y:center.y},position,contactPosition:[...control.position]}];
  }).filter(Boolean));
}

// Baked on the corrected 25-joint WebXR hand. Pads support the rear battery;
// the opposed thumb reaches the side PTT. The rigid wrist is parented to the
// radio, so no settle, plate movement or stage resize can shear the grip.
export const RADIO_CONTACT_LEFT_GRIP=Object.freeze({
  wrist:{position:[-.13310679618,-.073,.01890702554],quaternion:[-.26558171872,.42005674822,-.46373406245,.73346397204]},
  pose:{index:[.24948412186,1.02752656906,.72887927549],middle:[.31200751747,1.37018533058,.64684458736],
    ring:[.28440861411,1.22075764302,.52226618193],pinky:[.21500515995,1.04011407145,.64262293909],
    spread:{index:-.1234283668,middle:-.21516058308,ring:.08217460599,pinky:-.05639337602},
    thumb:{opposition:0,abduction:.10903684192,mcp:-.02988693462,ip:.13981060216}},
});

function blendPose(a,b,t){
  const mix=(x,y)=>(Number(x)||0)+((Number(y)||0)-(Number(x)||0))*clamp(t);
  return{...Object.fromEntries(['index','middle','ring','pinky'].map(d=>[d,(a[d]||[0,0,0]).map((x,i)=>mix(x,b[d]?.[i]))])),
    thumb:Object.fromEntries(['opposition','abduction','mcp','ip'].map(k=>[k,mix(a.thumb?.[k],b.thumb?.[k])])),
    spread:Object.fromEntries(['index','middle','ring','pinky'].map(k=>[k,mix(a.spread?.[k],b.spread?.[k])]))};
}
function localWorld(group,target){return{position:group.localToWorld(new THREE.Vector3(...target.position)),
  normal:target.normal?new THREE.Vector3(...target.normal).transformDirection(group.matrixWorld):undefined};}

function prepareHands(s){
  const {model,left,right}=s;
  model.group.add(left.root,right.root);
  left.setRootPose(RADIO_CONTACT_LEFT_GRIP.wrist);left.setFingerPose(RADIO_CONTACT_LEFT_GRIP.pose);
  s.leftContact=left.getPose();
  // A lifted thumb is a different contact, never a cosmetic squelch pulse.
  left.solveGrip({thumb:{position:[-.069,.035,.012]}},{space:'world',iterations:90,normalWeight:0});
  s.leftClear=left.getPose();left.setFingerPose(s.leftContact);
  s.leftControlPoses=new Map();
  s.rightWrist=structuredClone(BOX_CRADLE.wrist);s.rightWrist.position=s.rightWrist.position.map((v,i)=>v+[-.035,-.029,0][i]);
  right.setRootPose(s.rightWrist);right.setFingerPose(BOX_CRADLE.pose);s.rightRest=right.getPose();
  s.controlPoses=new Map();
  // Opposed finger pads are 4 mm apart around the cloth. This is a folded
  // pinch, rather than asking a fully extended index to meet a short thumb.
  right.setRootPose({position:[0,0,0],quaternion:[0,0,0,1]});
  right.setFingerPose({...FRONT_CONTROL.pose,index:[1,1.5,1.1],thumb:{opposition:.25211583697,abduction:.11038033779,mcp:.76509910207,ip:1.27857559353}});
  const quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,-.5,1.1));
  const position=new THREE.Vector3(...STRAP_REST).sub(right.getPad('index','local').position.applyQuaternion(quaternion));
  s.strapGrip={position:position.toArray(),quaternion:quaternion.toArray(),pose:right.getPose()};
  right.setRootPose(s.rightWrist);right.setFingerPose(s.rightRest);
}

// CPU geometry tests use the same hand creation and posing as the live view.
// The supplied model remains caller-owned; the anatomy borrows cached source
// geometry and owns its skin materials, nails, sleeves and skeleton clones.
export function createRadioContactHands(template,model){
  const skin=createRecordistHandMaterial(THREE),left=createBattleHandRig(template,{side:'left',material:skin}),right=createBattleHandRig(template,{side:'right',material:skin});
  const armSkin=createRecordistHandMaterial(THREE,{anatomy:false,uniforms:skin.userData.handUniforms});
  const leftArm=addRecordistForearm(THREE,left,armSkin),rightArm=addRecordistForearm(THREE,right,armSkin);
  const hands={model,skin,armSkin,left,right,leftArm,rightArm};prepareHands(hands);return hands;
}

function browserCanvas(){
  if(typeof window==='undefined'||typeof document==='undefined'||typeof HTMLCanvasElement==='undefined'||typeof WebGL2RenderingContext==='undefined')return null;
  const canvas=document.createElement('canvas');return canvas instanceof HTMLCanvasElement?canvas:null;
}

export function warmRadioContact3D(){
  if(current||pending||unavailable)return pending||Promise.resolve(current);
  const canvas=browserCanvas();if(!canvas)return Promise.resolve(null);
  const version=generation;
  pending=(async()=>{
    const [template,{RoomEnvironment}]=await Promise.all([loadBattleHandTemplate(assetUrl('assets/battle-hands/right.glb')),
      import('three/addons/environments/RoomEnvironment.js')]);
    if(version!==generation)return null;
    const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power',premultipliedAlpha:true});
    lifetime.created++;
    renderer.setClearColor(0,0);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.5,.5,.25,-.25,.01,4);
    camera.position.set(0,.045,1.8);camera.lookAt(0,.045,0);
    const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);
    let environment;try{environment=generator.fromScene(room,.04);}finally{room.dispose();generator.dispose();}
    scene.environment=environment.texture;scene.environmentIntensity=.13;
    scene.add(new THREE.HemisphereLight('#d8e1d1','#28231f',.34));
    const key=new THREE.DirectionalLight('#e9e5cc',2.6);key.position.set(-.55,.65,1);scene.add(key);key.castShadow=true;
    key.shadow.mapSize.set(512,512);Object.assign(key.shadow.camera,{left:-.42,right:.42,top:.35,bottom:-.35,near:.1,far:3});
    key.shadow.bias=-.0001;key.shadow.normalBias=.00035;
    const fill=new THREE.DirectionalLight('#a5c0bd',.65);fill.position.set(.5,.3,-.4);scene.add(fill);
    const model=buildRadioContactModel();scene.add(model.group);
    const hands=createRadioContactHands(template,model);
    const dither=createTransparentPixelMesh(THREE,renderer,{assetUrl,profile:'calm'});
    const s={canvas,renderer,scene,camera,environment,...hands,dither,lost:false,disposed:false};
    try{await dither.ready;}catch(error){release(s);throw error;}
    if(version!==generation){release(s);return null;}
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(s.disposed)return;s.lost=true;diagnostic={ready:false,error:'Radio view-model context lost'};});
    current=s;diagnostic={ready:true,error:null,model:model.diagnostics()};return s;
  })().catch(error=>{if(version===generation){unavailable=String(error?.message||error);diagnostic={ready:false,error:unavailable};}return null;}).finally(()=>{if(version===generation)pending=null;});
  return pending;
}

function applyHands(s,frame){
  const {model,left,right}=s;
  left.setFingerPose(blendPose(s.leftClear,s.leftContact,clamp(frame.thumb)));
  const pttTravel=clamp(frame.ptt)*.0016;
  // Millimetric PTT travel retains the authored hand posture and supported pads.
  left.setRootPose(RADIO_CONTACT_LEFT_GRIP.wrist);
  left.root.position.x=RADIO_CONTACT_LEFT_GRIP.wrist.position[0]+pttTravel*clamp(frame.thumb);
  const sideId=frame.interaction?.id,sidePressure=clamp(frame.interaction?.pressure);
  if(['previous','next'].includes(sideId)&&sidePressure>0){
    // The gripping hand slides down the rear shell. Curling only its thumb
    // towards these low keys would drive its proximal bone through the case.
    left.setFingerPose(blendPose(s.leftClear,s.leftContact,sidePressure));
    const delta=new THREE.Vector3(...model.controls[sideId].position).sub(new THREE.Vector3(...RADIO_CONTACT_CONTROLS.ptt.position));
    left.root.position.addScaledVector(delta,sidePressure);
  }
  const action=String(frame.handAction||frame.interaction?.id||'idle');
  const controlId=action==='battery'?'battery':RADIO_CONTACT_CONTROLS[action]?action:frame.interaction?.id;
  const target=model.controls[controlId];
  const amount=clamp(frame.handPressure??frame.interaction?.pressure??(target?1:0));
  right.setRootPose(s.rightWrist);right.setFingerPose(s.rightRest);
  if(target&&amount>.0001&&!['ptt','previous','next'].includes(controlId)){
    const key=`${controlId}:${controlId==='battery'?Math.round(clamp(frame.batteryGap)*8):0}`;
    let saved=s.controlPoses.get(key);
    if(!saved){
      const offset=FRONT_CONTROL.offset;
      const point=new THREE.Vector3(...target.position);
      // Mirrored operating-hand approach keeps its unused fingers tucked clear
      // and leaves the supporting thumb visible at the side switch.
      const position=point.clone().add(new THREE.Vector3(-offset[0],offset[1],offset[2]));
      const q=FRONT_CONTROL.quaternion;
      const quaternion=new THREE.Quaternion(q[0],-q[1],-q[2],q[3]);
      if(controlId==='battery'){
        // The right palm comes beneath the lower shoe; its thumb supplies the
        // pressure at the plate's loose right corner instead of poking air.
        position.set(.070,-.150,-.090);quaternion.setFromEuler(new THREE.Euler(0,0,.60));
      }
      right.setRootPose({position:position.toArray(),quaternion});
      right.setFingerPose(FRONT_CONTROL.pose);
      model.group.updateMatrixWorld(true);
      const world=localWorld(model.group,target);
      right.solveGrip({[controlId==='battery'?'thumb':'index']:{position:world.position}},{space:'world',iterations:70,normalWeight:0});
      saved={position:position.toArray(),quaternion:quaternion.toArray(),pose:right.getPose()};s.controlPoses.set(key,saved);
    }
    const p=new THREE.Vector3(...s.rightWrist.position).lerp(new THREE.Vector3(...saved.position),amount);
    if(controlId==='battery'){
      // Reach around the right edge before touching the rear plate. A direct
      // interpolation from the front cradle would travel through the chassis.
      p.x+=Math.sin(Math.PI*amount)*.16;p.z-=Math.sin(Math.PI*amount)*.035;
    }else p.z+=Math.sin(Math.PI*amount)*.17;
    const turn=controlId==='battery'?smooth((amount-.2)/.8):amount;
    const closure=controlId==='battery'?smooth((amount-.2)/.45):smooth(Math.min(1,amount*2));
    const q=new THREE.Quaternion(...s.rightWrist.quaternion).slerp(new THREE.Quaternion(...saved.quaternion),turn);
    right.setRootPose({position:p.toArray(),quaternion:q});right.setFingerPose(blendPose(s.rightRest,saved.pose,closure));
  }
  const released=clamp(frame.release);
  if(released>0){
    const offset=frame.strapTarget?new THREE.Vector3(...frame.strapTarget).sub(new THREE.Vector3(...STRAP_REST)):new THREE.Vector3(...radioContactReleaseOffset(frame));
    const open={...s.leftClear,index:[.08,.12,.08],middle:[.12,.18,.1],ring:[.16,.22,.12],pinky:[.23,.28,.16]};
    left.setFingerPose(blendPose(s.leftClear,open,released));
    left.root.position.add(offset).add(new THREE.Vector3(-.018*released,.006*released,.014*released));
    const restPosition=new THREE.Vector3(...s.rightWrist.position),pinch=new THREE.Vector3(...s.strapGrip.position).add(offset);
    right.setRootPose({position:restPosition.lerp(pinch,released).toArray(),quaternion:new THREE.Quaternion(...s.rightWrist.quaternion).slerp(new THREE.Quaternion(...s.strapGrip.quaternion),released)});
    right.setFingerPose(blendPose(s.rightRest,s.strapGrip.pose,smooth(Math.min(1,released*2))));
  }
  s.leftArm.root.quaternion.identity();s.rightArm.root.quaternion.identity();
  shapeRecordistForearm(THREE,s.leftArm);shapeRecordistForearm(THREE,s.rightArm);
}
export const poseRadioContactHands=applyHands;

export function radioContactResourceBudget(scene){
  let visibleDraws=0,sourceTriangles=0;const geometries=new Set(),materials=new Set();
  scene.traverseVisible(node=>{if(!node.isMesh)return;visibleDraws++;sourceTriangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;geometries.add(node.geometry);for(const m of[node.material].flat())if(m)materials.add(m);});
  return{visibleDraws,sourceTriangles,geometries:geometries.size,materials:materials.size,sourceCap:{width:1280,height:640},shadowMap:{width:512,height:512}};
}

export function drawRadioContact3D({ctx,x=0,y=0,width,height,pixelRatio=1,frame={},display}={}){
  if(!ctx||!(width>0)||!(height>0))return false;
  warmRadioContact3D();const s=current;if(!s||s.lost||s.disposed||s.renderer.getContext().isContextLost())return false;
  const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
  if(s.canvas.width!==w||s.canvas.height!==h)s.renderer.setSize(w,h,false);
  const view=radioContactView({width:w,height:h,frame});
  s.camera.left=-view.halfWidth;s.camera.right=view.halfWidth;s.camera.top=view.extent/2;s.camera.bottom=-view.extent/2;s.camera.updateProjectionMatrix();
  s.model.group.position.set(0,0,0);s.model.group.rotation.set(0,0,0);s.model.group.updateMatrixWorld(true);
  const offset=radioContactReleaseOffset(frame,{width:w,height:h}),renderedFrame={...frame,strapTarget:STRAP_REST.map((v,i)=>v+offset[i])};
  s.model.update(renderedFrame);applyHands(s,renderedFrame);
  s.model.group.position.set(...view.position);s.model.group.rotation.set(...view.rotation);s.scene.updateMatrixWorld(true);
  const look=display||recordistHandsDisplay()||{},settings=look.settings||{};
  try{
    const autoReset=s.renderer.info.autoReset;s.renderer.info.autoReset=false;s.renderer.info.reset();
    s.dither.render(s.scene,s.camera,{width:w,height:h,dpr:1,worldUnitScale:1,
      sceneScale:Math.min(1,1280/w,640/h),profile:look.profile||'calm',screen:look.screen,
      cellSize:settings.cellSize||'auto',cellScale:pixelRatio,screenScale:look.screenScale??pixelRatio,
      screenOffset:[Math.round(x),Math.round((ctx.canvas?.height||h)-y-h)],
      snapshot:{clock:Number(frame.time)||0,reducedMotion:!!(frame.reducedMotion||settings.reduceMotion),reduceFlash:!!settings.reduceFlash}});
    const render={...s.renderer.info.render},memory={...s.renderer.info.memory};s.renderer.info.autoReset=autoReset;
    ctx.save();try{ctx.imageSmoothingEnabled=false;ctx.drawImage(s.canvas,Math.round(x),Math.round(y),w,h);}finally{ctx.restore();}
    diagnostic={ready:true,error:null,viewport:{width:w,height:h},model:s.model.diagnostics(),display:s.dither.debug(),
      controls:radioContactControlRects({width:w,height:h,frame}),stage:frame.stage||'live',
      supportingThumb:s.left.getPad('thumb').position.toArray(),handAction:frame.handAction||'idle',
      resourceBudget:radioContactResourceBudget(s.scene),render,memory,lifecycle:{...lifetime,active:1}};
    return true;
  }catch(error){unavailable=String(error?.message||error);diagnostic={ready:false,error:unavailable};return false;}
}

export function radioContact3DDiagnostics(){return structuredClone({...diagnostic,lifecycle:{...lifetime,active:current&&!current.disposed?1:0,pending:!!pending}});}
export const radioContactDiagnostics=radioContact3DDiagnostics;
function release(s){
  if(!s||s.disposed)return;s.disposed=true;
  s.left.root.removeFromParent();s.right.root.removeFromParent();s.scene.add(s.left.root,s.right.root);
  s.model.dispose();
  const geometries=new Set(),materials=new Set();
  // Skeleton clones borrow the cached source skin geometry. Nail resources
  // belong to each rig's dispose(), rather than this scene's resource set.
  const borrowed=new Set([s.left.skin.geometry,s.right.skin.geometry,
    ...s.left.nails.map(n=>n.geometry),...s.right.nails.map(n=>n.geometry)]);
  const rigMaterials=new Set([...s.left.nails.map(n=>n.material),...s.right.nails.map(n=>n.material)]);
  s.scene.traverse(node=>{node.shadow?.dispose?.();if(node.geometry&&!borrowed.has(node.geometry))geometries.add(node.geometry);for(const material of[node.material].flat())if(material&&!rigMaterials.has(material))materials.add(material);});
  for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
  s.left.dispose();s.right.dispose();s.environment.dispose();s.dither.dispose();s.renderer.dispose();
  s.renderer.forceContextLoss?.();
  lifetime.disposed++;
}
export function disposeRadioContact3D(){generation++;pending=null;unavailable=null;release(current);current=null;diagnostic={ready:false,error:null};}
