// Execute only in the fresh diagnostic-only audit context AFTER both ordinary
// routes. These are explicitly QA placements and selective layer ablations.
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const probe=window.__probe,R3=window.__roofR3,P=window.__roofProps;
const clock=window.__roofShaderClock,glass=window.__roofGlassBindingAblation;
if(!clock||!glass)throw Error('Pre-boot uniform instruments are missing');
const before={pos:probe.pos(),look:probe.lookAngles(),torch:probe.torch(),rain:R3.r3dRainAmount(),seed:probe.nightSeed(),lighting:probe.r3dLighting(),diagnostics:probe.propDiagnostics(),shaderClock:JSON.parse(JSON.stringify(clock)),glassBindingAblation:{...glass}};
const snapshots=[];let result=null;
function pressE(){for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'e',code:'KeyE',bubbles:true,cancelable:true}));}
async function settledSeat(){const start=performance.now();while(window.__scenes.top()?.view?.()?.phase!=='seated'){if(performance.now()-start>20000)throw Error('Diagnostic seat failed to settle');await wait(100);}await wait(300);}
function pose(){return{pos:probe.pos(),look:probe.lookAngles(),eye:probe.sourceShoreView()?.eye,worldYaw:R3.r3dWorldYaw(),floor:probe.floorH(),scene:window.__scenes.top()?.id,sceneView:window.__scenes.top()?.view?.(),lighting:probe.r3dLighting(),display:window.__chunkSurferPixelMesh.status(),audio:probe.roofStairAudio?.(),submittedIds:probe.props().renderedIds,viewport:[innerWidth,innerHeight],projectionTanHalfVertical:.95};}
async function rawPropFingerprint(){
  const gl=document.querySelector('canvas.r3d').getContext('webgl2'),display=window.__chunkSurferPixelMesh.status(),width=display.sceneWidth,height=display.sceneHeight;
  const previous=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),target=gl.createFramebuffer(),rgba=new Uint8Array(width*height*4);
  try{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,target);gl.framebufferTexture2D(gl.READ_FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,window.__roofP3.propTargets().color,0);if(gl.checkFramebufferStatus(gl.READ_FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Raw prop fingerprint FBO incomplete');gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);}finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,previous);gl.deleteFramebuffer(target);}
  const rgb=new Uint8Array(width*height*3),alpha=new Uint8Array(width*height),histogram={};
  for(let i=0,p=0;i<rgba.length;i+=4,p++){rgb.set(rgba.subarray(i,i+3),p*3);alpha[p]=rgba[i+3];histogram[alpha[p]]=(histogram[alpha[p]]||0)+1;}
  const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  return{method:'Direct prop color texture readPixels before Canvas premultiply/PNG encoding; RGB and categorical alpha hashed separately; GPU depth not read',width,height,rgbSha256:await sha(rgb),alphaSha256:await sha(alpha),alphaHistogram:histogram,glError:gl.getError()};
}
async function shot(name,options={}){
  probe.propDiagnostics(true,null,{excludeMeshes:options.exclude||[]});R3.r3dSetRainAmount(options.rain??before.rain);probe.setTorch(options.torch??true);R3.r3dResetVfdMemory();
  await wait(850);
  const images=Object.fromEntries(['props','scene','mark-alpha','vfd'].map(stage=>[stage,probe.sourceShoreCapture(stage)]));
  images.depth=R3.r3dDepthCanvas(512)?.toDataURL('image/png')||null;
  snapshots.push({name,diagnostic:true,fixedShaderTimeSec:clock.enabled?clock.timeSec:null,glassBindingAblation:{...glass},options,pose:pose(),rawPropFingerprint:await rawPropFingerprint(),images});
}
try{
  // Full charge keeps the live CPU filament at its normal stable color/reach;
  // pinning GPU time alone does not freeze a low-battery filament.
  probe.setTorchBattery(1);probe.setTorch(true);probe.setFlags(['roof.access']);
  probe.warpCell(205,286);probe.lookAtWorld(0,0);await wait(700);pressE();await wait(1200);
  if(window.__scenes.top()?.id!=='academic-roof-sit')throw Error('Diagnostic East seat did not enter through E');
  await settledSeat();
  const eastNativeDefault=pose();
  const mouseBegin={pose:pose(),input:window.__chunkSurferMotion.status().input,pointer:window.__chunkSurferPointer.status()};
  for(let i=0;i<15;i++){const mouseDown=new MouseEvent('mousemove',{bubbles:true,cancelable:true});Object.defineProperties(mouseDown,{movementX:{value:0},movementY:{value:12}});window.dispatchEvent(mouseDown);await wait(40);}await wait(250);
  const eastFreeLookProof={method:'Actual E in diagnostic fixture followed by ordinary relative mouse motion once seated, with no recapture click and no camera setter between E and the mouse',deltaPixels:[0,180],events:15,before:mouseBegin,after:{pose:pose(),input:window.__chunkSurferMotion.status().input,pointer:window.__chunkSurferPointer.status()}};
  await shot('east-native-mouse-down');
  clock.enabled=true;
  // Matched counterfactuals: same eye, pitch, shader time, seed, exposure, torch.
  probe.lookAtWorld(Math.PI/2,-.15);await wait(600);await shot('east-default');
  probe.lookAtWorld(-1.08,-.15);await wait(600);await shot('east-northwest');
  await shot('east-northwest-repeat-clock-control');
  await shot('east-northwest-without-roof-shell',{exclude:['academic_roof_structure']});
  await shot('east-northwest-without-glazing',{exclude:['academic_roof_glazing']});
  await shot('east-northwest-without-rain',{rain:0});
  await shot('east-northwest-without-torch',{torch:false});
  probe.lookAtWorld(-1.08,-1.05);await shot('east-northwest-supported-depth');
  glass.enabled=true;glass.forcedValue=0;await shot('east-northwest-supported-depth-without-glass-identity');glass.enabled=false;
  await shot('east-northwest-supported-depth-restored-glass-identity');
  await shot('east-northwest-supported-depth-without-torch',{torch:false});
  probe.propDiagnostics(false);R3.r3dSetRainAmount(before.rain);probe.setTorch(true);
  pressE();await wait(1100);probe.warpCell(200,289);probe.lookAtWorld(0,0);await wait(600);pressE();await wait(1200);
  if(window.__scenes.top()?.id!=='academic-roof-sit')throw Error('Diagnostic West seat did not enter through E');
  await settledSeat();
  probe.lookAtWorld(0,-.08);await shot('west-default');await shot('west-default-without-roof-shell',{exclude:['academic_roof_structure']});
  probe.propDiagnostics(false);pressE();await wait(1100);
  probe.warpRuntime(349,571);probe.lookAtWorld(5.62,-.73);await wait(1500);await shot('outward-landing-control');
  result={method:'Post-route diagnostic QA placements with actual E seats; torch charged1 to stabilize live CPU filament color/reach; pre-boot cached-uniform instrument pins uTime/uTimeSec/uTimeP only; game clocks and torch easing remain live; explicit mesh/rain/torch/identity removals; raw lighting and final VFD saved independently',before,captureTorchBatteryStart:1,eastNativeDefault,eastFreeLookProof,fixedShaderTimeSec:clock.timeSec,clockCounts:{...clock.counts},clockContexts:clock.contexts,snapshots,renderInstances:[...P.renderInstances({group:'academicRoof'}),...P.renderInstances({group:'ground'})]};
  return result;
}finally{
  clock.enabled=before.shaderClock.enabled;clock.timeSec=before.shaderClock.timeSec;
  glass.enabled=before.glassBindingAblation.enabled;glass.forcedValue=before.glassBindingAblation.forcedValue;
  probe.propDiagnostics(false);R3.r3dSetRainAmount(before.rain);probe.setTorch(before.torch.on);
  if(window.__scenes.top()?.id==='academic-roof-sit'){pressE();await wait(1100);}
  probe.warpRuntime(before.pos.x,before.pos.y);probe.lookAtWorld(before.look.yaw,before.look.pitch);await wait(500);
  probe.setTorchBattery(before.torch.battery);
  if(result)result.restored={pos:probe.pos(),look:probe.lookAngles(),torch:probe.torch(),rain:R3.r3dRainAmount(),seed:probe.nightSeed(),diagnostics:probe.propDiagnostics(),shaderClockEnabled:clock.enabled,shaderClockTimeSec:clock.timeSec,glassBindingAblation:{...glass},scene:window.__scenes.top()?.id||null};
}
