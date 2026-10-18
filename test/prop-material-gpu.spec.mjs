// Run explicitly under the shared compute gate. This exercises the exact GLSL
// used by ordinary props and skinned pressure identity, without the game scene
// or a preview shader that might hide the signed-frame regression.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';
import {PROP_MATERIAL_GLSL} from '../src/render/prop-material-contract.js';
import {props3dDebugShaders} from '../src/render/props3d.js';

const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless:'new',args:['--use-angle=metal','--no-sandbox']});
try{
  const page=await browser.newPage();await page.setViewport({width:32,height:32,deviceScaleFactor:1});
  const result=await page.evaluate(({helper,production})=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL2 required');
    const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};
    const link=(vertex,fragment)=>{const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
      gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));return program;};
    // Compiling the live programs also catches interface/uniform mismatches;
    // the small witness below provides actual numerical normal evidence.
    link(production.vertex,production.fragment);link(production.pressureVertex,production.pressureFragment);
    const vertex=`#version 300 es
precision highp float;
uniform mat2 uUv;uniform vec3 uWorldX,uWorldY;
out vec3 world;out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);world=uWorldX*p.x+uWorldY*p.y;uv=uUv*p;}`;
    const fragment=`#version 300 es
precision highp float;
in vec3 world;in vec2 uv;
uniform vec3 uNormal,uMapped,uLight,uView,uBase;uniform float uRough,uMetal;uniform int uMode;
out vec4 color;
${helper}
void main(){vec3 n=propMappedNormal(world,uNormal,uv,uMapped);
color=uMode==0?vec4(n*.5+.5,1.0):vec4(letteringLocalReflectance(n,uView,uLight,uBase,uRough,uMetal),1.0);}`;
    const program=link(vertex,fragment);gl.useProgram(program);gl.bindVertexArray(gl.createVertexArray());gl.viewport(0,0,32,32);
    const loc=name=>gl.getUniformLocation(program,name),normal=[0,0,1],mapped=[.36,.48,.8];
    gl.uniform3fv(loc('uWorldX'),[1,0,0]);gl.uniform3fv(loc('uWorldY'),[0,1,0]);gl.uniform3fv(loc('uNormal'),normal);
    gl.uniform3fv(loc('uMapped'),mapped);gl.uniform3fv(loc('uView'),[0,0,1]);gl.uniform3fv(loc('uBase'),[.7,.35,.08]);
    gl.uniform3fv(loc('uLight'),[0,0,1]);gl.uniform1f(loc('uRough'),.5);gl.uniform1f(loc('uMetal'),0);gl.uniform1i(loc('uMode'),0);
    const cases=[
      {id:'ordinary',matrix:[1,0,0,1],expected:[.36,.48,.8]},
      {id:'mirrored-u',matrix:[-1,0,0,1],expected:[-.36,.48,.8]},
      {id:'mirrored-v',matrix:[1,0,0,-1],expected:[.36,-.48,.8]},
      {id:'mirrored-both',matrix:[-1,0,0,-1],expected:[-.36,-.48,.8]},
      {id:'rotated-uv',matrix:[0,-1,1,0],expected:[-.48,.36,.8]},
      {id:'sheared-uv',matrix:[1,0,1,1],expected:[.36,.48,.8]},
      {id:'tiny-valid-uv',matrix:[1e-8,0,0,1e-8],expected:[.36,.48,.8]},
      {id:'constant-uv',matrix:[0,0,0,0],expected:[0,0,1]},
      {id:'collinear-uv',matrix:[1,1,1,1],expected:[0,0,1]},
      {id:'nearly-collinear-uv',matrix:[1,1,1,1.000001],expected:[0,0,1]},
      {id:'backface',matrix:[1,0,0,1],normal:[0,0,-1],expected:[.36,.48,-.8]},
      {id:'deformed-world-rotation',matrix:[1,0,0,1],normal:[0,-1,0],worldY:[0,0,1],expected:[.36,-.8,.48]},
      {id:'zero-world-area',matrix:[1,0,0,1],worldX:[0,0,0],worldY:[0,0,0],expected:[0,0,1]},
    ];
    const read=()=>{gl.drawArrays(gl.TRIANGLES,0,3);const pixel=new Uint8Array(4);gl.readPixels(16,16,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
    const rows=cases.map(item=>{gl.uniformMatrix2fv(loc('uUv'),false,item.matrix);gl.uniform3fv(loc('uNormal'),item.normal||normal);
      gl.uniform3fv(loc('uWorldX'),item.worldX||[1,0,0]);gl.uniform3fv(loc('uWorldY'),item.worldY||[0,1,0]);
      return{id:item.id,pixel:read(),expected:item.expected.map(v=>Math.round((v*.5+.5)*255))};});
    gl.uniformMatrix2fv(loc('uUv'),false,[1,0,0,1]);gl.uniform3fv(loc('uNormal'),normal);
    gl.uniform3fv(loc('uWorldX'),[1,0,0]);gl.uniform3fv(loc('uWorldY'),[0,1,0]);gl.uniform3fv(loc('uMapped'),normal);
    gl.uniform1i(loc('uMode'),1);
    const finish=[];
    for(const metal of [0,1])for(const rough of [.35,.8])for(const direction of [[0,0,1],[.8,0,.6],[0,0,-1]]){
      gl.uniform1f(loc('uMetal'),metal);gl.uniform1f(loc('uRough'),rough);gl.uniform3fv(loc('uLight'),direction);
      finish.push({metal,rough,direction,pixel:read()});
    }
    // Witness the normal from the real ordinary fragment path as well. Only
    // its terminal diagnostic output changes; normal reconstruction, texture
    // sampling and two-sided handling are the production code. This catches a
    // correct helper that was accidentally left disconnected from the draw.
    const productionWitnessVertex=`#version 300 es
precision highp float;
uniform mat2 uUv;uniform vec3 uWorldX,uWorldY,uNormal;
out vec3 vWorld,vNormal;out vec2 vUv;out float vLocalHeight;flat out int vZone,vPortrait,vStructural;
flat out vec4 vEmissive;flat out int vPaperIndex;flat out vec4 vPaperHandling;flat out float vFixturePower;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);
vWorld=uWorldX*p.x+uWorldY*p.y;vUv=uUv*p;vNormal=uNormal;vLocalHeight=0.0;vZone=0;vPortrait=0;vStructural=0;
vEmissive=vec4(0.0);vPaperIndex=-1;vPaperHandling=vec4(0.0);vFixturePower=1.0;}`;
    const finalMarker='  col=col/(1.0+col*.30);';
    if(!production.fragment.includes(finalMarker))throw new Error('Production normal diagnostic insertion point missing');
    const productionWitness=link(productionWitnessVertex,production.fragment.replace(finalMarker,
      '  o=vec4(n*.5+.5,1.0);oSurfaceMarks=vec4(0.0);return;\n'+finalMarker));
    gl.useProgram(productionWitness);
    const ploc=name=>gl.getUniformLocation(productionWitness,name);
    const normalTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,normalTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,new Float32Array([.68,.74,.9,1]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.uniform1i(ploc('uNormalTex'),0);gl.uniform1f(ploc('uUseNormal'),1);gl.uniform1f(ploc('uNormalScale'),1);
    gl.uniform1f(ploc('uBaseAlpha'),1);gl.uniform3fv(ploc('uEye'),[0,0,10]);
    const productionRows=cases.filter(item=>item.id!=='backface').map(item=>{
      gl.uniformMatrix2fv(ploc('uUv'),false,item.matrix);gl.uniform3fv(ploc('uNormal'),item.normal||normal);
      gl.uniform3fv(ploc('uWorldX'),item.worldX||[1,0,0]);gl.uniform3fv(ploc('uWorldY'),item.worldY||[0,1,0]);
      return{id:item.id,pixel:read(),expected:item.expected.map(v=>Math.round((v*.5+.5)*255))};
    });
    return{rows,productionRows,finish,glError:gl.getError()};
  },{helper:PROP_MATERIAL_GLSL,production:props3dDebugShaders()});
  if(process.env.PROP_MATERIAL_GPU_REPORT)writeFileSync(process.env.PROP_MATERIAL_GPU_REPORT,JSON.stringify({kind:'prop-material-gpu',...result},null,2)+'\n');
  console.log(JSON.stringify({kind:'prop-material-gpu',...result},null,2));
  assert.equal(result.glError,0);
  for(const row of [...result.rows,...result.productionRows])for(let c=0;c<3;c++)assert.ok(Math.abs(row.pixel[c]-row.expected[c])<=2,
    `${row.id}: pixel ${row.pixel} expected ${row.expected}`);
  for(const row of result.finish){
    assert.equal(row.pixel[3],255);
    if(row.direction[2]<0)assert.deepEqual(row.pixel.slice(0,3),[0,0,0],'back-lit finish cannot create its own light');
  }
  const smooth=result.finish.find(r=>r.metal===0&&r.rough===.35&&r.direction[2]===1);
  const matte=result.finish.find(r=>r.metal===0&&r.rough===.8&&r.direction[2]===1);
  assert.ok(smooth.pixel[0]>matte.pixel[0],'roughness controls practical-light reflection');
  const gold=result.finish.find(r=>r.metal===1&&r.rough===.8&&r.direction[2]===1);
  assert.ok(gold.pixel[0]>gold.pixel[1]&&gold.pixel[1]>gold.pixel[2],'conductor reflection carries the actual base tint');
}finally{await browser.close();}
