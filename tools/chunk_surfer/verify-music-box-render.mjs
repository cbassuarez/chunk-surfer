// Bounded, silent production-shader inspection. This stages the final assets;
// it is not evidence of an uninterrupted native route or listening acceptance.
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {mkdir,writeFile} from 'node:fs/promises';
const port=5594,out=new URL('../../artifacts/music-box-rebuild/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null},logLevel:'error'});
let browser;const report={scope:'Final exported geometry in the production P3 renderer and acquisition shader, with staged close cameras. No native route or audio audition claimed.',silent:true,errors:[],views:[]};
try{
 await server.listen();
 browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,protocolTimeout:180000,args:['--use-angle=metal','--mute-audio','--disable-gpu-shader-disk-cache']});
 const page=await browser.newPage();await page.setViewport({width:1100,height:700,deviceScaleFactor:1});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/test/booth-workplace-harness.html`,{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const response=await fetch('/src/render/r3d.js'),source=await response.text(),specifier=source.match(/import\s+\*\s+as\s+P3\s+from\s+["']([^"']+)["']/)?.[1];
  if(!specifier)throw Error('Cannot resolve authoritative prop renderer');
  const [R,P,S,W,C,I]=await Promise.all([import(response.url),import(new URL(specifier,response.url).href),import('/src/game/opening-cab-inspection.js'),import('/src/game/coastal-memory/winding.js'),import('/src/data/music-box-construction.js'),import('/src/game/music-box-inspection.js')]);
  R.r3dInit(document.querySelector('#map'));R.r3dSetRenderScale(1);await R.r3dBasePropsReady();
  await P.addPropPack('/assets/opening-cab-objects.glb');await P.addPropPack('/assets/source-drive/coastal-memory/coastal-memory.glb');
  R.r3dSetDynamicProps([]);R.r3dSetLookProfile('explore',{transitionMs:0});R.r3dSetPixelMesh({debugSource:'final',reduceMotion:true,reduceFlash:true,memory:false});R.r3dSetFrontEndPlate('gameplay');R.r3dSetRainAmount(0);
  const plan=new Uint8Array(16*16*4);for(let i=0;i<plan.length;i+=4)plan.set([32,255,4,1],i);R.r3dSetPlan(plan,16,16);
  const matrix=(p=[0,0,0])=>[1,0,0,0,0,1,0,0,0,0,1,0,...p,1];
  const shots=[],anchor={x:0,y:0,z:0,yaw:0,zone:0},frame={px:0,py:0,floorH:0,tileW:16,tileH:16,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:false,plan:true,water:{active:false},sensoryProfile:'story',sourceVoidPhysical:true};
  const render=async(label,props,eye,target,lighting)=>{
   R.r3dSetProps(props);R.r3dSetLightingContext(lighting);R.r3dSetLocalLights([{x:eye[0]-.1,y:eye[1]+.12,z:eye[2]+.03,intensity:.7,radius:1,color:[1,.88,.68],penetration:1,castsShadow:false}]);
   const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2],camera={eye,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz))};R.r3dSnapCameraOnNextFrame();R.r3dResetVfdMemory();
   for(let i=0;i<8;i++){R.r3dFrame({...frame,sourceVoidPhysical:label.startsWith('coast'),coastalMemory:label.startsWith('coast')?{active:true,siteMatrix:matrix(),waterY:-100,time:0,lights:[],flood:0}:null,authoredCamera:camera});await new Promise(requestAnimationFrame);}
   shots.push({label,camera,lighting,final:R.r3dCanvas().toDataURL('image/png'),props:R.r3dCaptureStageCanvas('props').toDataURL('image/png')});
  };
  const warm={ambientIntensity:.28,ambientColor:[1,.82,.6],captureExposure:1.7},cold={ambientIntensity:.22,ambientColor:[.62,.69,.77],captureExposure:2.4};
  const coast=angle=>{const [x,y,z]=C.MUSIC_BOX_CONSTRUCTION.keyPivot,c=Math.cos(angle),s=Math.sin(angle),m=[c,s,0,0,-s,c,0,0,0,0,1,0,x-c*x+s*y,y-s*x-c*y,0,1];return[{id:'box',mesh:'cm_broken_music_box',matrix:matrix(),x:0,y:0,z:0,structural:true,cullRadius:2},{id:'key',mesh:'cm_broken_music_box_key',matrix:m,x:0,y:0,z:0,structural:true,cullRadius:2}];};
  await render('coast-front',coast(0),[.025,.055,.12],[0,.024,0],cold);
  await render('coast-back',coast(0),[.035,.055,-.14],[0,.024,0],cold);
  await render('coast-key-turned',coast(1.3),[.035,.055,-.14],[0,.024,0],cold);
  const cab=S.openingCabInstances(anchor,{inspect:{id:'music-box',eye:[0,.045,.18],cameraYaw:0,cameraPitch:0,center:S.openingCabTargets(anchor).find(p=>p.id==='music-box').inspectionCenter,distance:.14,yaw:0,pitch:0,roll:0,crankAngle:1.2}}).filter(p=>p.objectId==='music-box');
  await render('cab-inspection',cab,[0,.045,.18],[0,.045,0],warm);
  let q=I.freshMusicBoxInspectionRotation();
  for(const [label,delta]of [['cab-yaw-quarter',{yaw:Math.PI/2}],['cab-pitch-quarter',{pitch:Math.PI/2}],['cab-roll-quarter',{roll:Math.PI/2}],['cab-full-pitch',{pitch:Math.PI*2}]]){q=I.rotateMusicBoxInspection(q,delta);const moving=S.openingCabInstances(anchor,{inspect:{id:'music-box',eye:[0,.045,.18],cameraYaw:0,cameraPitch:0,center:S.openingCabTargets(anchor).find(p=>p.id==='music-box').inspectionCenter,distance:.14,rotation:q,crankAngle:1.2}}).filter(p=>p.objectId==='music-box');await render(label,moving,[0,.045,.18],[0,.045,0],warm);}
  const gl=R.r3dCanvas().getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{shots,settings:R.r3dPixelMeshStatus(),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,glError:gl.getError(),meshes:P.propMeshCatalog().filter(n=>n.includes('music_box'))};
 });
 for(const shot of result.shots){for(const kind of ['final','props']){const data=shot[kind];await writeFile(out+shot.label+'-'+kind+'.png',Buffer.from(data.split(',')[1],'base64'));delete shot[kind];}report.views.push(shot);}delete result.shots;Object.assign(report,result);
 if(result.glError!==0||report.errors.length)throw Error('Production-render check reported a graphics error');
 // Same exported meshes in the neutral construction comparison.
 await page.goto(`http://127.0.0.1:${port}/artifacts/music-box-rebuild/`,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('3,')||document.querySelectorAll('#views canvas').length===4,{timeout:30000});await page.screenshot({path:out+'construction.png',fullPage:true});
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();await server.close();await writeFile(out+'render-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({out,failure:report.failure||null,views:report.views.length,errors:report.errors}));}
