// GPU depth regression for perspective cast previews and orthographic hands.
// Requires the local Vite server; this is deliberately an explicit smoke test.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const base = process.env.CHUNK_SURFER_TEST_URL || 'http://127.0.0.1:5173';
const browser = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new', args:['--use-angle=metal','--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().includes('/@vite/client')?request.abort():request.continue());
  await page.goto(`${base}/test/vigil-character-dither-harness.html`,{waitUntil:'domcontentloaded'});
  const result = await page.evaluate(async()=>{
    const [THREE,{createTransparentPixelMesh}] = await Promise.all([
      import('/node_modules/three/build/three.module.js'),import('/src/render/pixel-mesh/transparent.js')]);
    const renderer = new THREE.WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true});
    renderer.setSize(320,180);renderer.toneMappingExposure=.3;document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),box = new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.4),
      new THREE.MeshBasicMaterial({color:'#806b5b'}));scene.add(box);
    const targets = [],bind = renderer.setRenderTarget.bind(renderer);
    renderer.setRenderTarget = target=>{if(target&&!targets.includes(target))targets.push(target);return bind(target);};
    const dither = createTransparentPixelMesh(THREE,renderer,{profile:'explore'});await dither.ready;
    const frames = [];
    for(const camera of [new THREE.PerspectiveCamera(48,320/180,.03,100),new THREE.OrthographicCamera(-1.6,1.6,.9,-.9,.03,100)]){
      camera.position.z=3;camera.updateMatrixWorld(true);
      dither.render(scene,camera,{width:320,height:180,snapshot:{clock:1,reducedMotion:true}});
      const acquisition = targets.find(target=>target.texture.name==='transparent-acquisition-depth');
      const pixel = new Uint16Array(4);renderer.readRenderTargetPixels(acquisition,160,90,1,1,pixel);
      const packed = THREE.DataUtils.fromHalfFloat(pixel[3]),depth=(1/packed-1)/.14;
      const pixels = new Uint8Array(320*180*4),gl=renderer.getContext();gl.readPixels(0,0,320,180,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let opaque=0,clear=0,black=0,light=0;
      for(let at=0;at<pixels.length;at+=4){if(pixels[at+3]===255){opaque++;if(pixels[at]+pixels[at+1]+pixels[at+2]<20)black++;else light++;}else if(!pixels[at+3])clear++;}
      frames.push({camera:camera.type,depth,packed,opaque,clear,black,light,error:gl.getError()});
    }
    const display=dither.debug();dither.dispose();renderer.dispose();return{frames,display};
  });
  console.log(JSON.stringify(result));
  assert.equal(result.display.depthReconstruction,'inverse-projection');
  for(const frame of result.frames){
    assert.equal(frame.error,0,`${frame.camera}: acquisition shader failed`);
    assert.ok(Math.abs(frame.depth-2.8)<.012,`${frame.camera}: near face encoded at ${frame.depth}m instead of 2.8m`);
    assert.ok(frame.opaque>1000&&frame.clear>1000&&frame.black>100&&frame.light>100,`${frame.camera}: missing dither or coverage`);
  }
}finally{await browser.close();}
