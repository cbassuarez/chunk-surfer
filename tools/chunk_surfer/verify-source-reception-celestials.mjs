// Render each retained third-floor creature through the shipped world colour,
// depth composition and final dither shaders. Translation frames an isolated
// inspection only; pose, scale and root orientation are the actual Source ones.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';

const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5319';
const out='artifacts/source-last-reception/celestial-proof';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'local verification only');
mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',
  args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'],
});
try{
  const page=await browser.newPage(),pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.setViewport({width:640,height:480,deviceScaleFactor:1});
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().includes('/@vite/client')?request.abort():request.continue());
  await page.goto(base+'/test/vigil-character-dither-harness.html',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    // Resolve r3d's exact P3 import, including Vite's timestamp after an edit.
    const source=await(await fetch('/src/render/r3d.js')).text();
    const propUrl=source.match(/import \* as P3 from ["']([^"']+)["']/)?.[1]||'/src/render/props3d.js';
    const [R,P,C]=await Promise.all([import('/src/render/r3d.js'),import(propUrl),import('/src/render/source-last-reception-celestials.js')]);
    R.r3dInit(document.querySelector('#map'));R.r3dSetRenderScale(1);
    const deadline=performance.now()+30000;
    while(!P.propPackStats()&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(!P.propPackStats())throw Error('base world prop catalog did not load');
    const loaded=await P.addCharacterPack('/assets/held-note.glb',{allowedMeshes:C.SOURCE_RECEPTION_CELESTIAL_MESHES});
    R.r3dSetLookProfile('explore',{transitionMs:0});
    R.r3dSetPixelMesh({reduceMotion:true,reduceFlash:true,memory:false});
    R.r3dSetFrontEndPlate('gameplay');
    R.r3dSetLightingContext({ambientIntensity:.12,ambientColor:[1,1,1]});
    R.r3dSetCaptureExposureOverride(.75);R.r3dSetRainAmount(0);R.r3dSetAgitation(0);
    const plan=new Uint8Array(32*32*4);
    for(let i=0;i<plan.length;i+=4)plan.set([64,255,4,17],i);
    R.r3dSetPlan(plan,32,32);R.r3dSetDynamicProps([]);
    const state={px:20,py:20,floorH:0,tileW:12,tileH:12,worldCount:0,
      worldTints:Array.from({length:5},()=>[1,1,1]),chunks:[],key:null,door:null,hush:null,
      audio:0,light:1,plan:true,water:{active:false},sensoryProfile:'story'};
    const read=stage=>{
      const canvas=R.r3dCaptureStageCanvas(stage);
      return{width:canvas.width,height:canvas.height,bytes:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data};
    };
    const captures={},actors=[];
    for(const actor of C.SOURCE_RECEPTION_CELESTIALS){
      const original=C.sourceLastReceptionCelestialInstances({elapsed:19}).filter(part=>part.receptionCelestial===actor.id);
      const delta=[10.25-actor.x,-actor.y,10.25-actor.z];
      const props=original.map(part=>{
        const matrix=new Float32Array(part.matrix);
        for(let axis=0;axis<3;axis++)matrix[12+axis]+=delta[axis];
        return{...part,x:matrix[12],y:matrix[13],z:matrix[14],matrix};
      });
      // Move the camera around the existing yaw instead of rotating the model.
      const distance=3.1,camX=10.25-Math.sin(actor.yaw)*distance,camZ=10.25-Math.cos(actor.yaw)*distance;
      state.px=camX/.5-.5;state.py=camZ/.5-.5;
      R.r3dSetLookAngles({yaw:Math.PI-actor.yaw,pitch:-.24,immediate:true});
      R.r3dSnapCameraOnNextFrame();R.r3dSetProps([]);R.r3dFrame(state);
      const empty=read('scene');
      R.r3dSetProps(props);R.r3dResetVfdMemory();R.r3dFrame(state);R.r3dFrame(state);
      const material=read('props'),scene=read('scene'),final=read('vfd');
      let covered=0,composed=0,encoded=0,transition=0;
      for(let i=0;i<material.bytes.length;i+=4){
        if(material.bytes[i+3]!==255)continue;
        covered++;
        const difference=(a,b)=>Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
        if(difference(empty.bytes,scene.bytes)>12&&difference(material.bytes,scene.bytes)<16)composed++;
        if(difference(scene.bytes,final.bytes)>20)encoded++;
        if((i/4)%final.width>0&&material.bytes[i-1]===255&&Math.abs(final.bytes[i]-final.bytes[i-4])>90)transition++;
      }
      const poses=P.characterStats().poses.filter(pose=>props.some(prop=>prop.id===pose.id));
      actors.push({id:actor.id,scale:actor.scale,yaw:actor.yaw,pitch:actor.pitch,
        inspectionTranslation:delta,covered,composed,encoded,transition,
        submittedMeshes:poses.map(pose=>pose.mesh).sort(),expectedMeshes:[...C.SOURCE_RECEPTION_CELESTIAL_MESHES].sort()});
      for(const stage of ['props','vfd'])captures[actor.id+'-'+stage]=R.r3dCaptureStageCanvas(stage).toDataURL('image/png');
    }
    window.__sourceReceptionCelestialCaptures=captures;
    return{loadedMeshes:loaded.meshes,actors,display:R.r3dPixelMeshStatus(),
      poseErrors:P.characterStats().poseErrors,glError:R.r3dCanvas().getContext('webgl2').getError()};
  });
  const captures=await page.evaluate(()=>window.__sourceReceptionCelestialCaptures);
  for(const[name,url]of Object.entries(captures))writeFileSync(out+'/'+name+'.png',Buffer.from(url.split(',')[1],'base64'));
  result.pageErrors=pageErrors;
  writeFileSync(out+'/report.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
  assert.deepEqual(result.pageErrors,[]);assert.equal(result.glError,0);
  assert.equal(result.display.shaderReady,true);assert.deepEqual(result.poseErrors,[]);
  for(const actor of result.actors){
    assert.deepEqual(actor.submittedMeshes,actor.expectedMeshes,actor.id+' lost a skinned anatomical part');
    assert.ok(actor.covered>1000,actor.id+' missing anatomical material geometry');
    assert.ok(actor.composed>actor.covered*.85,actor.id+' failed world depth composition');
    assert.ok(actor.encoded>actor.covered*.3,actor.id+' bypasses final acquisition shader');
    assert.ok(actor.transition>50,actor.id+' lost the final dither pattern');
  }
}finally{await browser.close();}
