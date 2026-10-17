// Explicit browser verification: real production GLBs, prop depth composition,
// then the final shared acquisition shader. Requires a local Vite server.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.env.CHUNK_SURFER_TEST_URL || 'http://127.0.0.1:5173';
const output = process.env.CHUNK_SURFER_TEST_CAPTURE;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=metal', '--no-sandbox'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
  // Other development work may rebuild assets during this explicit render;
  // keep Vite's HMR client from replacing the inspection frame mid-readback.
  await page.setRequestInterception(true);
  page.on('request', request => request.url().includes('/@vite/client') ? request.abort() : request.continue());
  await page.goto(`${base}/test/vigil-character-dither-harness.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const result = await page.evaluate(async () => {
    // Vite may give a changed dependency a timestamped URL. Read the resolved
    // props import so diagnostics observe the renderer's actual module rather
    // than a second, uninitialised copy during concurrent development.
    const rendererSource = await (await fetch('/src/render/r3d.js')).text();
    const propsModule = rendererSource.match(/from\s+["']([^"']*props3d\.js(?:\?[^"']*)?)["']/)?.[1];
    if(!propsModule)throw Error('Cannot resolve production renderer prop module');
    const [R, P, { VIGIL_CHARACTER_DESIGNS: designs }, { vigilCharacterDescriptor }] = await Promise.all([
      import('/src/render/r3d.js'), import(propsModule),
      import('/src/data/vigil-character-design.js'), import('/src/render/vigil-character-performance.js'),
    ]);
    R.r3dInit(document.querySelector('#map'));
    R.r3dSetRenderScale(1);
    const gl=R.r3dCanvas().getContext('webgl2'),drawMaterialEvidence=[];let currentDesign=null;
    const realDraw=gl.drawElementsInstanced.bind(gl);
    gl.drawElementsInstanced=(...args)=>{
      const program=gl.getParameter(gl.CURRENT_PROGRAM),location=name=>gl.getUniformLocation(program,name);
      const enabled=location('uCharacterEnabled'),normal=location('uUseNormal');
      let evidence=null,beforeHair=null,hairViewport=null;
      if(enabled&&normal&&gl.getUniform(program,enabled)>.5){
        const flag=name=>{const at=location(name);return at?gl.getUniform(program,at):0;};
        const albedo=flag('uUseTex'),normalMap=flag('uUseNormal'),orm=flag('uUseOrm'),active=gl.getParameter(gl.ACTIVE_TEXTURE),bound=[];
        for(const unit of [0,4,5]){gl.activeTexture(gl.TEXTURE0+unit);bound.push(!!gl.getParameter(gl.TEXTURE_BINDING_2D));}
        gl.activeTexture(active);evidence={albedo,normal:normalMap,orm,bound,hairVisiblePixels:0};drawMaterialEvidence.push(evidence);
        const base=flag('uBase');
        if(currentDesign&&base?.length===3&&currentDesign.hair.every((v,k)=>Math.abs(v-base[k])<1e-5)){
          hairViewport=gl.getParameter(gl.VIEWPORT);beforeHair=new Uint8Array(hairViewport[2]*hairViewport[3]*4);
          gl.readPixels(hairViewport[0],hairViewport[1],hairViewport[2],hairViewport[3],gl.RGBA,gl.UNSIGNED_BYTE,beforeHair);
        }
      }
      const result=realDraw(...args);
      if(beforeHair){
        const after=new Uint8Array(beforeHair.length);gl.readPixels(hairViewport[0],hairViewport[1],hairViewport[2],hairViewport[3],gl.RGBA,gl.UNSIGNED_BYTE,after);
        for(let at=0;at<after.length;at+=4)if(Math.abs(after[at]-beforeHair[at])+Math.abs(after[at+1]-beforeHair[at+1])+Math.abs(after[at+2]-beforeHair[at+2])>1||after[at+3]!==beforeHair[at+3])evidence.hairVisiblePixels++;
      }
      return result;
    };
    const deadline = performance.now() + 30000;
    while (Object.values(designs).some(d => !P.characterStats().meshes.includes(d.mesh)) && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const missing=Object.values(designs).filter(d=>!P.characterStats().meshes.includes(d.mesh)).map(d=>d.mesh);
    if(missing.length)throw Error(`Vigil packs unavailable: ${missing.join(', ')}; ${P.characterStats().error||'no loader error'}`);
    R.r3dSetFacing(0); R.r3dSetLookProfile('explore', { transitionMs: 0 });
    R.r3dSetPixelMesh({ reduceMotion: true, reduceFlash: true, memory: false });
    R.r3dSetFrontEndPlate('gameplay');
    // A neutral inspection light exposes the face, fingers and cloth to the
    // ordinary world path. It does not exempt or re-screen those materials.
    R.r3dSetLightingContext({ ambientIntensity: .12, ambientColor: [1, 1, 1] });
    R.r3dSetCaptureExposureOverride(.75);
    R.r3dSetRainAmount(0); R.r3dSetAgitation(0);
    const plan = new Uint8Array(32*32*4);
    for (let at=0; at<plan.length; at+=4) plan.set([64,255,4,17],at);
    R.r3dSetPlan(plan,32,32);
    R.r3dSetDynamicProps([]);
    const state = { px: 20, py: 20, floorH: 0, tileW: 12, tileH: 12, worldCount: 0,
      worldTints: Array.from({ length: 5 }, () => [1, 1, 1]), chunks: [], key: null, door: null,
      hush: null, audio: 0, light: 1, plan: true, water: { active: false }, sensoryProfile: 'story' };
    const image = stage => {
      const canvas = R.r3dCaptureStageCanvas(stage);
      return { width: canvas.width, height: canvas.height,
        bytes: canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data };
    };
    const actors = [],captures = {};
    const actions = {ruth:'binder-page',leila:'flask-check',owen:'umbrella-settle',denise:'photos-sort',malcolm:'map-fold',kit:'camera-check'};
    R.r3dSetProps([]); R.r3dFrame(state);
    const emptyScene = image('scene');
    for (const [id, design] of Object.entries(designs)) {
      let idlePixels,idleObject;
      const samples=[0,.5,1].map(phase=>({phase,action:actions[id],label:phase===0?'idle':phase===.5?'gesture':'recovery'}));
      if(id==='leila')samples.push({phase:.5,action:'window-look',label:'window-look'});
      if(id==='owen')samples.push({phase:.5,action:'key-check',label:'key-check'});
      for (const {phase,action,label} of samples) {
      currentDesign=design;
      const descriptor = vigilCharacterDescriptor(design.mesh,{action,elapsedMs:phase*1000,durationMs:1000});
      const evidenceStart=drawMaterialEvidence.length;
      R.r3dSetProps([design.mesh, design.part].map((mesh, i) => ({ id: `${id}-${i}`, mesh,
        x: 10.25, y: 0, z: 7.75, yaw: Math.PI, zone: 6, character: descriptor })));
      R.r3dResetVfdMemory(); R.r3dFrame(state); R.r3dFrame(state);
      const props = image('props'), scene = image('scene'), final = image('vfd');
      let covered = 0, composed = 0, encoded = 0, dark = 0, light = 0, transition = 0, animatedPixels = 0;
      if(phase===0){idlePixels=props.bytes;idleObject=JSON.stringify(descriptor.joints[`vigil_${id}_object`]);}
      for (let at = 0; at < props.bytes.length; at += 4) {
        if (props.bytes[at + 3] !== 255) continue;
        covered++;
        const difference = (a, b) => Math.abs(a[at]-b[at]) + Math.abs(a[at+1]-b[at+1]) + Math.abs(a[at+2]-b[at+2]);
        if(phase===.5&&difference(idlePixels,props.bytes)>12)animatedPixels++;
        if (difference(emptyScene.bytes, scene.bytes) > 12 && difference(props.bytes, scene.bytes) < 16) composed++;
        if (difference(scene.bytes, final.bytes) > 20) encoded++;
        const lum = (.2126*final.bytes[at]+.7152*final.bytes[at+1]+.0722*final.bytes[at+2])/255;
        if (lum < .08) dark++; if (lum > .55) light++;
        if ((at/4)%final.width > 0 && props.bytes[at-1] === 255 && Math.abs(final.bytes[at]-final.bytes[at-4]) > 90) transition++;
      }
      const submitted = P.characterStats().poses.map(p=>p.mesh);
      const evidence=drawMaterialEvidence.slice(evidenceStart),fullMaterialDraws=evidence.filter(e=>e.albedo>.5&&e.normal>.5&&e.orm>.5&&e.bound.every(Boolean)).length;
      const hairVisiblePixels=evidence.reduce((n,e)=>n+e.hairVisiblePixels,0);
      actors.push({ id, action,phase, covered, composed, encoded, dark, light, transition,animatedPixels,fullMaterialDraws,hairVisiblePixels,
        carryStable:label==='window-look'||label==='key-check'?JSON.stringify(descriptor.joints[`vigil_${id}_object`])===idleObject:null,
        bodySubmitted:submitted.includes(design.mesh),objectSubmitted:submitted.includes(design.part) });
      captures[`${id}-${label}-final`]=R.r3dCaptureStageCanvas('vfd').toDataURL('image/png');
      if(phase===.5)for(const stage of ['props','scene','vfd'])captures[`${id}-${label}-${stage}`]=R.r3dCaptureStageCanvas(stage).toDataURL('image/png');
      }
    }
    window.__vigilShaderCapture = {...captures,...Object.fromEntries(['props','scene','vfd'].map(stage => [stage,R.r3dCaptureStageCanvas(stage).toDataURL('image/png')]))};
    return { actors, character: P.characterStats(), display: R.r3dPixelMeshStatus(),
      glError: R.r3dCanvas().getContext('webgl2').getError() };
  });
  if (output) {
    mkdirSync(output, { recursive: true }); await page.screenshot({ path: `${output}/world-final.png` });
    const stages = await page.evaluate(() => window.__vigilShaderCapture);
    for (const [stage,url] of Object.entries(stages)) writeFileSync(`${output}/${stage}.png`,Buffer.from(url.split(',')[1],'base64'));
    writeFileSync(`${output}/dither-report.json`, JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify({actors:result.actors,display:result.display,poseErrors:result.character.poseErrors,glError:result.glError}));
  assert.equal(result.glError, 0, 'production character render has a GPU error');
  assert.equal(result.display.shaderReady, true); assert.ok(result.display.framesRendered >= 12);
  assert.deepEqual(result.character.poseErrors, []);
  for (const actor of result.actors) {
    assert.ok(actor.bodySubmitted&&actor.objectSubmitted,`${actor.id}: animated body or object lost its production skin`);
    assert.ok(actor.fullMaterialDraws>=2,`${actor.id}: loaded albedo/normal/ORM were not bound together for actual skinned draws`);
    if(actor.id!=='malcolm')assert.ok(actor.hairVisiblePixels>0,`${actor.id}: hairstyle has no visible material pixels in the production color pass`);
    if(actor.carryStable!==null)assert.ok(actor.carryStable,`${actor.id}: attention gesture dislodges the held object`);
    assert.ok(actor.covered > 1000, `${actor.id}: anatomical actor never reached the material target`);
    assert.ok(actor.composed > actor.covered*.85, `${actor.id}: material depth never reached the world composition`);
    assert.ok(actor.encoded > actor.covered*.3, `${actor.id}: actor bypasses final acquisition`);
    assert.ok(actor.dark > actor.covered*.05 && actor.light > actor.covered*.01,
      `${actor.id}: final character has no dark/light print density`);
    assert.ok(actor.transition > 50, `${actor.id}: final character lost the fine dither pattern`);
    if(actor.phase===.5)assert.ok(actor.animatedPixels>5,`${actor.id}: rig gesture never moves the rendered body and object`);
  }
} finally { await browser.close(); }
