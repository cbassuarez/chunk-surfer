// Isolated, native proof of the actual Source runtime room. No main.js, copied
// room layout or invented inspection geometry. Original Source coordinates,
// physical floors, practicals and ordinary pixel-mesh acquisition are retained.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';

const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5319';
const out=process.env.CHUNK_SURFER_TEST_CAPTURE||'artifacts/source-last-reception/room-proof';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local renderer verification only');
mkdirSync(out,{recursive:true});
const sourceFiles=['src/data/source-last-reception.js','src/game/source-space-runtime.js','src/render/source-last-reception-meshes.js','src/render/source-last-reception-residents.js','src/render/source-last-reception-celestials.js'];
const sourceSha256=Object.fromEntries(sourceFiles.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',protocolTimeout:240000,
 args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{
 const page=await browser.newPage(),pageErrors=[],consoleErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
 await page.setViewport({width:960,height:640,deviceScaleFactor:1});await page.setRequestInterception(true);
 page.on('request',request=>request.url().includes('/@vite/client')?request.abort():request.continue());
 await page.goto(base+'/test/vigil-character-dither-harness.html',{waitUntil:'domcontentloaded',timeout:60000});
 console.log('Room proof: blank native renderer page loaded');
 const setup=await page.evaluate(async()=>{
  const source=await(await fetch('/src/render/r3d.js')).text(),propUrl=source.match(/import \* as P3 from ["']([^"']+)["']/)?.[1]||'/src/render/props3d.js';
  const[R,P,{createSourceSpaceRuntime},{buildChunkSurfGodPreset,CHUNK_SURF_GOD_PRESET},{resolveTorchLook,applySourceEmergencyTorch},{encodeH}]=await Promise.all([
   import('/src/render/r3d.js'),import(propUrl),import('/src/game/source-space-runtime.js'),import('/src/game/chunk-surf-god.js'),import('/src/render/lighting-model.js'),import('/src/world/floorplan.js')]);
  const built=buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.LAST_RECEPTION,{seed:4417,injuries:0,hasRig:false}),runtime=createSourceSpaceRuntime({initialState:built.state});
  const origin=built.state.landscapeOrigin;
  R.r3dInit(document.querySelector('#map'));R.r3dSetRenderScale(1);R.r3dSetLookProfile('explore',{transitionMs:0});
  R.r3dSetPixelMesh({reduceMotion:true,reduceFlash:true,memory:false});R.r3dSetFrontEndPlate('gameplay');R.r3dSetRainAmount(0);R.r3dSetAgitation(0);
  R.r3dSetSourceFault(0);R.r3dSetSourceEmergency(0);R.r3dSetSourceWhiteout(0);R.r3dSetSourceShore(null);R.r3dSetDynamicProps([]);
  const position=runtime.applyReceptionRelocation({x:-51.3,y:9,z:-450});
  const props=runtime.propInstances(position.x,position.y,{all:true,time:19,reducedMotion:true});
  P.setPropDiagnostics(true);P.setDiagnosticPropInstances(props);
  const required=props.filter(p=>p.lastReception||p.receptionResident||p.receptionCelestial).map(p=>p.mesh),deadline=performance.now()+120000;
  let missing=[];
  do{const diagnostic=P.propPackStats()?.diagnosticMeshes||[];missing=[...new Set(required)].filter(mesh=>!diagnostic.some(item=>item.mesh===mesh&&item.loaded));if(!missing.length)break;await new Promise(resolve=>setTimeout(resolve,100));}while(performance.now()<deadline);
  if(missing.length)throw Error('Production room meshes unavailable: '+missing.join(', '));
  const catalog=P.propPackStats().diagnosticMeshes,missingField=[...new Set(catalog.filter(p=>!p.loaded).map(p=>p.mesh))];
  P.setPropDiagnostics(false);R.r3dSetPropDiagnostics(true);R.r3dSetDiagnosticProps([]);
  // A bounded crop of the runtime's actual cell descriptors is enough for
  // practical-light visibility. Avoid the 768-square full-field plan build.
  const size=128,originX=Math.floor(origin.x-65/.5-size/2),originY=Math.floor(origin.y-455/.5-size/2),rgba=new Uint8Array(size*size*4),material=new Uint8Array(size*size);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){const cell=runtime.geometry.cellAt(originX+x+.5,originY+z+.5),at=z*size+x;if(!cell){rgba[at*4+2]=1;continue;}rgba[at*4]=encodeH(cell.floor);rgba[at*4+1]=encodeH(cell.ceil??cell.floor+32);rgba[at*4+2]=cell.flags;rgba[at*4+3]=cell.zone;material[at]=cell.material;}
  R.r3dSetPlan(rgba,size,size,material,{originX,originY});
  window.__receptionRoom={R,P,runtime,origin,resolveTorchLook,applySourceEmergencyTorch,captures:{}};
  return{origin,propCount:props.length,roomPropCount:props.filter(p=>p.lastReception).length,residents:props.filter(p=>p.receptionResident).map(p=>p.receptionResident),celestials:[...new Set(props.filter(p=>p.receptionCelestial).map(p=>p.receptionCelestial))],missingRequired:missing,missingField,loadedCharacterMeshes:P.characterStats().meshes};
 });
 console.log('Room proof: actual production assets loaded '+JSON.stringify({props:setup.propCount,residents:setup.residents.length,celestials:setup.celestials.length}));
 const shots=[
  {id:'01-entry-lounge',label:'Entry across the lounge',x:-49.3,z:-450,floor:9,targetX:-71,targetZ:-450,pitch:.09},
  {id:'02-west-source-cut',label:'Lounge under the impossible Source opening',x:-62,z:-446,floor:9,targetX:-66,targetZ:-452,pitch:.72},
  {id:'03-return-room',label:'Return room and retained chair',x:-61,z:-456.4,floor:9,targetX:-64,targetZ:-464,pitch:.18},
 ];
 const views=[];
 for(const shot of shots){
  const result=await page.evaluate(shot=>{
   const{R,P,runtime,origin,resolveTorchLook,applySourceEmergencyTorch,captures}=window.__receptionRoom;
   const sourcePosition=runtime.applyReceptionRelocation({x:shot.x,y:shot.floor,z:shot.z});
   const camera={x:origin.x*.5+shot.x,y:shot.floor+1.62,z:origin.y*.5+shot.z},yaw=Math.atan2(shot.targetX-shot.x,-(shot.targetZ-shot.z));
   const ambient=runtime.sourceAmbient(),lights=runtime.localLights({time:19,reducedMotion:true,flashMode:'reduced',torchOn:true,torchBattery:1});
   R.r3dSetLightingContext({ambientColor:[...ambient.color],ambientIntensity:ambient.intensity,whitePointScale:ambient.whitePointScale??1,captureExposure:ambient.captureExposure??1});R.r3dSetLocalLights(lights);
   const props=runtime.propInstances(sourcePosition.x,sourcePosition.y,{all:true,time:19,reducedMotion:true});R.r3dSetProps(props);
   // The physical Source room uses this exact room-memory compositor. Its code
   // is already real laminated geometry/material; the distant glyph atlas is
   // omitted from this bounded room proof to avoid booting the full game.
   R.r3dSetSourceScene({key:'source:reception-room-proof',corpus:[],staticInstances:[],dynamicInstances:[],look:runtime.sourceLook()});
   const torchLook=applySourceEmergencyTorch(resolveTorchLook({on:true,battery:1,timeSec:19,reducedEffects:true}),runtime.sourceFlashlightFrame({time:19,reducedMotion:true,flashMode:'reduced'}));
   R.r3dSetLookAngles({yaw,pitch:shot.pitch,immediate:true});R.r3dSnapCameraOnNextFrame();R.r3dResetVfdMemory();
   const state={px:camera.x/.5-.5,py:camera.z/.5-.5,floorH:shot.floor,yawOffset:0,tileW:12,tileH:12,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,hushBodyAllowed:false,audio:0,light:1,torchLook,sensoryProfile:'story',plan:true,textSpace:runtime.textSpaceActive(),sourceVoidPhysical:false,sourceVoidRain:0,water:{active:false}};
   R.r3dFrame(state);R.r3dFrame(state);
   const stages={};for(const stage of['props','scene','vfd']){const canvas=R.r3dCaptureStageCanvas(stage);captures[shot.id+'-'+stage]=canvas.toDataURL('image/png');stages[stage]={width:canvas.width,height:canvas.height,bytes:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data};}
   const material=stages.props,scene=stages.scene,final=stages.vfd;let covered=0,composed=0,encoded=0,transition=0,nonblack=0;
   for(let i=0;i<material.bytes.length;i+=4){if(final.bytes[i]+final.bytes[i+1]+final.bytes[i+2]>24)nonblack++;if(material.bytes[i+3]!==255)continue;covered++;const diff=(a,b)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(diff(material.bytes,scene.bytes)<16)composed++;if(diff(scene.bytes,final.bytes)>20)encoded++;if((i/4)%final.width>0&&material.bytes[i-1]===255&&Math.abs(final.bytes[i]-final.bytes[i-4])>90)transition++;}
   const culledRoomFurniture=props.filter(p=>p.lastReception===true&&p.id?.startsWith('source-reception:')&&!P.propInstanceVisible(p,[camera.x,camera.y,camera.z])).map(p=>p.id);
   return{...shot,camera,yaw,sourcePosition,translation:[0,0,0],floor:runtime.geometry.renderedFloorAt(),propCount:props.length,culledRoomFurniture,residents:props.filter(p=>p.receptionResident).map(p=>p.receptionResident),celestials:[...new Set(props.filter(p=>p.receptionCelestial).map(p=>p.receptionCelestial))],covered,composed,encoded,transition,nonblack,lighting:R.r3dLightingDebug(),display:R.r3dPixelMeshStatus(),poseErrors:P.characterStats().poseErrors,diagnostics:P.propPackStats().diagnostics,glError:R.r3dCanvas().getContext('webgl2').getError()};
  },shot);
  views.push(result);
  const captures=await page.evaluate(id=>Object.fromEntries(Object.entries(window.__receptionRoom.captures).filter(([name])=>name.startsWith(id+'-'))),shot.id);
  for(const[name,url]of Object.entries(captures))writeFileSync(out+'/'+name+'.png',Buffer.from(url.split(',')[1],'base64'));
  console.log('Room proof captured '+shot.id+' '+JSON.stringify({covered:result.covered,encoded:result.encoded,glError:result.glError}));
 }
 const report={sourceSha256,setup,views,pageErrors,consoleErrors,notes:['Isolated native r3d renderer, production Source runtime.propInstances and original Source coordinates.','A bounded128square plan samples actual runtime.geometry.cellAt for local light visibility.','Actual room-memory compositor, ambient, practical lights and normal Source physical flashlight.','The distant atlas glyph field is omitted; physical code geometry/materials and the full production prop field remain.']};
 writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');
 assert.deepEqual(pageErrors,[]);assert.equal(setup.residents.length,6);assert.equal(setup.celestials.length,3);assert.deepEqual(setup.missingRequired,[]);
 for(const view of views){assert.equal(view.glError,0,view.id+' GPU error');assert.equal(view.display.shaderReady,true);assert.equal(view.display.sourceRoomMemoryActive,true);assert.equal(view.display.bypassedByTextSpace,false);assert.deepEqual(view.poseErrors,[]);assert.deepEqual(view.culledRoomFurniture,[],view.id+' locally placed native furniture was incorrectly culled');assert.ok(Math.abs(view.floor-9)<.08,view.id+' left its actual 9m floor');assert.ok(view.covered>20000,view.id+' missing room geometry');assert.ok(view.composed>view.covered*.85,view.id+' failed physical world depth composition');assert.ok(view.encoded>view.covered*.2,view.id+' bypassed final acquisition');assert.ok(view.transition>250,view.id+' lost normal dither');}
 console.log('Source reception room proof passed');
}finally{await browser.close();}
