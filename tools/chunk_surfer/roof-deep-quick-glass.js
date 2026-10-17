// Diagnostic QA fixture only. Run before the final ordinary traversal.
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const probe=window.__probe,R3=window.__roofR3,clock=window.__roofShaderClock,glass=window.__roofGlassBindingAblation;
if(!clock||!glass)throw Error('Pre-boot uniform instruments missing');
function pressE(){for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'e',code:'KeyE',bubbles:true,cancelable:true}));}
probe.setFlags(['roof.access']);probe.setTorchBattery(1);probe.setTorch(true);probe.warpCell(205,286);probe.lookAtWorld(0,0);await wait(700);pressE();
let start=performance.now();while(window.__scenes.top()?.view?.()?.phase!=='seated'){if(performance.now()-start>20000)throw Error('East seat did not settle');await wait(100);}
const mouseBefore={look:probe.lookAngles(),pointer:window.__chunkSurferPointer.status().locked,phase:window.__scenes.top()?.view?.()?.phase};
for(let i=0;i<15;i++){const event=new MouseEvent('mousemove',{bubbles:true,cancelable:true});Object.defineProperties(event,{movementX:{value:0},movementY:{value:12}});window.dispatchEvent(event);await wait(40);}await wait(250);
const freeLookProof={method:'Actual E followed by ordinary relative mouse events once seated; no camera setter or recapture click between E and mouse',deltaPixels:[0,180],before:mouseBefore,after:{look:probe.lookAngles(),pointer:window.__chunkSurferPointer.status().locked,phase:window.__scenes.top()?.view?.()?.phase}};
probe.lookAtWorld(-1.08,-1.05);clock.enabled=true;clock.timeSec=1000;
const snapshots=[];
async function shot(name){R3.r3dResetVfdMemory();await wait(1000);const targets=window.__roofP3.propTargets();snapshots.push({name,pose:{pos:probe.pos(),look:probe.lookAngles(),eye:probe.sourceShoreView()?.eye,lighting:probe.r3dLighting(),pixelMesh:window.__chunkSurferPixelMesh.status(),propTargetStatus:{ready:targets.ready,marksReady:targets.marksReady,litApparitionsVisible:targets.litApparitionsVisible,worldDataReady:targets.worldDataReady,openingMaskReady:targets.openingMaskReady}},images:Object.fromEntries(['props','scene','mark-alpha','vfd'].map(stage=>[stage,probe.sourceShoreCapture(stage)])),shaderTimeSec:clock.timeSec,glassBindingAblation:{...glass}});}
try{await shot('identity225');glass.enabled=true;glass.forcedValue=0;await shot('identity-disabled');glass.enabled=false;await shot('identity225-restored');return{method:'Actual E and ordinary seated mouse input, then QA matched camera; shader clock1000; only uRoofGlass forced0 for ablation, no RGB/depth/material changes',freeLookProof,propTargetKeys:Object.keys(window.__roofP3.propTargets()),snapshots};}finally{glass.enabled=false;clock.enabled=false;}
