import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {mkdirSync,writeFileSync} from 'node:fs';

const base=process.env.CHUNK_SURFER_TEST_URL||'http://127.0.0.1:5334';
const out=process.env.CHUNK_SURFER_TEST_CAPTURE||'artifacts/lettering-study/production';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',args:['--use-angle=metal','--no-sandbox']});
try{
  const page=await browser.newPage();await page.setRequestInterception(true);
  page.on('request',request=>request.url().includes('/@vite/client')?request.abort():request.continue());
  await page.goto(`${base}/test/vigil-character-dither-harness.html`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const F=await import('/src/render/world-lettering-fonts.js');await F.ensureWorldLetteringFonts();
    const P=await import('/src/render/physical-source-print.js');
    const S=await import('/src/render/source-shore3d.js');
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl2',{antialias:false});
    if(!gl)throw Error('WebGL2 unavailable');
    const shaders={};
    for(const [name,source]of Object.entries({shoreMaterial:S.SOURCE_SHORE_MATERIAL_FRAG,shoreComposite:S.SOURCE_SHORE_COMPOSITE_FRAG})){
      const shader=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(shader,source);gl.compileShader(shader);
      shaders[name]={compiled:gl.getShaderParameter(shader,gl.COMPILE_STATUS),log:gl.getShaderInfoLog(shader)};gl.deleteShader(shader);
    }
    const source=P.sourcePrintTexture(gl,'divide'),fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,source,0);
    const bytes=new Uint8Array(512*512*4);gl.readPixels(0,0,512,512,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    let ground=0,paint=0,antialias=0,groundRgbMin=255;
    for(let i=0;i<bytes.length;i+=4){if(bytes[i+3]===0){ground++;groundRgbMin=Math.min(groundRgbMin,bytes[i],bytes[i+1],bytes[i+2]);}
      else if(bytes[i+3]===255)paint++;else antialias++;}
    const bitmap={width:2,height:1,pixels:new Uint8Array([80,100,120,0,200,210,220,255])};
    const test=P.uploadPhysicalPrint(gl,bitmap,{repeat:false});gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,test,0);
    const raw=new Uint8Array(8);gl.readPixels(0,0,2,1,gl.RGBA,gl.UNSIGNED_BYTE,raw);
    return{date:new Date().toISOString(),fonts:F.worldLetteringFontsStatus(),shaders,sourceMask:{ground,paint,antialias,groundRgbMin},
      opaqueGroundRgbRoundTrip:Array.from(raw),glError:gl.getError(),renderer:gl.getParameter(gl.RENDERER),
      limits:'Font/mask upload and shader compilation only. Full-game depth, final dither and human reading require separate captured acceptance.'};
  });
  writeFileSync(`${out}/runtime-print-verification.json`,`${JSON.stringify(result,null,2)}\n`);
  assert.equal(result.glError,0);assert.equal(result.fonts.ready,true);
  for(const shader of Object.values(result.shaders))assert.equal(shader.compiled,true,shader.log);
  assert.ok(result.sourceMask.ground>0&&result.sourceMask.paint>0&&result.sourceMask.antialias>0);
  assert.ok(result.sourceMask.groundRgbMin>100,'zero pigment coverage lost opaque substrate RGB');
  assert.deepEqual(result.opaqueGroundRgbRoundTrip,[80,100,120,0,200,210,220,255]);
  console.log(JSON.stringify(result));
}finally{await browser.close();}
