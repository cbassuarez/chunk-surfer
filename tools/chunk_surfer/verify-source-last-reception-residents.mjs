// Real shipped anatomical meshes through props3d colour/depth and the final
// pixel-mesh acquisition shader. The isolated inspection frame is not an extra
// encounter or game appearance. Requires a local Vite server.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5347',out='artifacts/source-last-reception/resident-proof';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:640,height:480,deviceScaleFactor:1});await page.setRequestInterception(true);page.on('request',request=>request.url().includes('/@vite/client')?request.abort():request.continue());await page.goto(base+'/test/vigil-character-dither-harness.html',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  // Vite adds a timestamp to recently edited dependencies. Resolve the exact
  // P3 URL imported by r3d, so a second uninitialised module is never inspected.
  const source=await(await fetch('/src/render/r3d.js')).text(),propUrl=source.match(/import \* as P3 from ["']([^"']+)["']/)?.[1]||'/src/render/props3d.js';
  const[R,P,{SOURCE_LAST_RECEPTION_RESIDENT_DESIGNS:designs},{sourceLastReceptionResidentInstances, SOURCE_LAST_RECEPTION_RESIDENT_MESHES:meshes}]=await Promise.all([import('/src/render/r3d.js'),import(propUrl),import('/src/data/source-last-reception-resident-design.js'),import('/src/render/source-last-reception-residents.js')]);
  R.r3dInit(document.querySelector('#map'));R.r3dSetRenderScale(1);const deadline=performance.now()+30000;while(!P.propPackStats()&&performance.now()<deadline)await new Promise(r=>setTimeout(r,50));await P.addCharacterPack('/assets/source-last-reception-residents.glb',{allowedMeshes:meshes});
  R.r3dSetFacing(0);R.r3dSetLookProfile('explore',{transitionMs:0});R.r3dSetPixelMesh({reduceMotion:true,reduceFlash:true,memory:false});R.r3dSetFrontEndPlate('gameplay');R.r3dSetLightingContext({ambientIntensity:.12,ambientColor:[1,1,1]});R.r3dSetCaptureExposureOverride(.75);R.r3dSetRainAmount(0);R.r3dSetAgitation(0);
  const plan=new Uint8Array(32*32*4);for(let i=0;i<plan.length;i+=4)plan.set([64,255,4,17],i);R.r3dSetPlan(plan,32,32);R.r3dSetDynamicProps([]);
  const state={px:20,py:20,floorH:0,tileW:12,tileH:12,worldCount:0,worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,audio:0,light:1,plan:true,water:{active:false},sensoryProfile:'story'};
  const image=stage=>{const canvas=R.r3dCaptureStageCanvas(stage);return{width:canvas.width,bytes:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data};};
  R.r3dSetProps([]);R.r3dFrame(state);const empty=image('scene'),actors=[],captures={};
  for(const id of Object.keys(designs))for(const mode of id==='imprint'?['imprint']:['idle','walk','reach']){
   const props=sourceLastReceptionResidentInstances({residents:[{id,x:10.25,y:0,z:7.75,yaw:0,mode,speed:mode==='walk'?1.1:0,distance:.31,elapsed:4.2,attention:mode==='reach'?1:0}]},{zone:6,reducedMotion:true});R.r3dSetProps(props);R.r3dResetVfdMemory();R.r3dFrame(state);R.r3dFrame(state);
   const material=image('props'),scene=image('scene'),final=image('vfd');let covered=0,composed=0,encoded=0,transition=0;
   for(let i=0;i<material.bytes.length;i+=4){if(material.bytes[i+3]!==255)continue;covered++;const diff=(a,b)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(diff(empty.bytes,scene.bytes)>12&&diff(material.bytes,scene.bytes)<16)composed++;if(diff(scene.bytes,final.bytes)>20)encoded++;if((i/4)%final.width>0&&material.bytes[i-1]===255&&Math.abs(final.bytes[i]-final.bytes[i-4])>90)transition++;}
   const submitted=P.characterStats().poses.some(p=>p.mesh===designs[id].mesh);actors.push({id,mode,covered,composed,encoded,transition,submitted});for(const stage of['props','vfd'])captures[id+'-'+mode+'-'+stage]=R.r3dCaptureStageCanvas(stage).toDataURL('image/png');
  }
  window.__receptionResidentCaptures=captures;return{actors,display:R.r3dPixelMeshStatus(),poseErrors:P.characterStats().poseErrors,glError:R.r3dCanvas().getContext('webgl2').getError()};
 });
 const captures=await page.evaluate(()=>window.__receptionResidentCaptures);for(const[name,url]of Object.entries(captures))writeFileSync(out+'/'+name+'.png',Buffer.from(url.split(',')[1],'base64'));writeFileSync(out+'/report.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 assert.equal(result.glError,0);assert.equal(result.display.shaderReady,true);assert.deepEqual(result.poseErrors,[]);for(const actor of result.actors){assert.ok(actor.submitted&&actor.covered>1000,actor.id+' missing anatomical material geometry');assert.ok(actor.composed>actor.covered*.85,actor.id+' never entered world depth composition');assert.ok(actor.encoded>actor.covered*.3,actor.id+' bypasses final acquisition shader');assert.ok(actor.transition>50,actor.id+' lost the final dither pattern');}
}finally{await browser.close();}
