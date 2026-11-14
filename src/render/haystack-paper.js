// One ephemeral paper master for the native surface and its in-game fallback.
// The address belongs only to these pixels: never to a save, media id or probe.
import {physicalPrintPixels} from './physical-source-print.js';
import {worldLetteringFont,worldLetteringFontsStatus,ensureWorldLetteringFonts} from './world-lettering-fonts.js';
import {fitWorldLetteringLine} from './world-lettering-layout.js';
import {assetUrl} from '../platform/paths.js';
import {WINDOW_SURFACE_LOOK_GLSL,WINDOW_RAMP,WINDOW_COHERENT_FLATTEN,WINDOW_PALETTE_AMOUNT,WINDOW_QUANT_STEPS} from './window-surface-look.js';

export const HAYSTACK_PAPER=Object.freeze({id:'paper-close',width:512,height:512,ground:'#d6d9d0',lines:Object.freeze(['this isn’t going well','is it?'])});
export function haystackPaperAddress(value){
  return [...String(value||'').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim()].slice(0,32).join('')||'you';
}
export function paintHaystackPaper(c,m,name){
  const text=(str,x,y,size,role='serif')=>{c.font=m.font=worldLetteringFont(size,role);c.fillStyle='#2f4232';m.fillStyle='#fff';c.textBaseline=m.textBaseline='alphabetic';c.textAlign=m.textAlign='left';c.fontKerning=m.fontKerning='none';c.fillText(str,x,y);m.fillText(str,x,y);};
  const rule=y=>{c.fillStyle='#70816b';m.fillStyle='#fff';c.fillRect(40,y,432,1);m.fillRect(40,y,432,1);};
  const address=haystackPaperAddress(name)+'\u2009—',fit=fitWorldLetteringLine(c,address,{width:432,height:36,maxFont:27,minFont:1,role:'serif'});
  text(address,40+fit.left,86,fit.fontSize);rule(108);
  text(HAYSTACK_PAPER.lines[0],40,196,32);text(HAYSTACK_PAPER.lines[1],40,244,32);rule(272);
}
export async function bakeHaystackPaper(name){
  if(!worldLetteringFontsStatus().ready)await ensureWorldLetteringFonts({});
  return physicalPrintPixels({width:HAYSTACK_PAPER.width,height:HAYSTACK_PAPER.height,ground:HAYSTACK_PAPER.ground,pigmentOnly:true,
    finish:{profile:'paper',widthM:.2,heightM:.2,seed:'haystack-paper',repeat:false},draw:(c,m)=>paintHaystackPaper(c,m,name)});
}
// Raw pixel rows start at the top. Both GPU consumers use this same orientation.
export const HAYSTACK_PAPER_SAMPLE_GLSL=`float haystackPaperAt(sampler2D paper,vec2 q){return texture(paper,vec2(q.x,1.0-q.y)).r;}`;

const clamp=v=>Math.max(0,Math.min(1,v));
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
// Last-resort non-WebGL presentation keeps the actual print and the window
// palette/quantization. It uses a stationary ordered mask, never a green field.
export function haystackPaperFallbackPixels(bitmap){
  const out=new Uint8ClampedArray(bitmap.width*bitmap.height*4),steps=Object.values(WINDOW_QUANT_STEPS);
  for(let y=0;y<bitmap.height;y++)for(let x=0;x<bitmap.width;x++){
    const i=(y*bitmap.width+x)*4,rgb=bitmap.pixels[i]/255,
      rank=(bayer[(y%4)*4+x%4]+.5)/16,quantRank=(bayer[((y+3)%4)*4+(x+1)%4]+.5)/16,
      t=clamp((rgb-.47)*1.18+.48)*(WINDOW_RAMP.length-1),low=Math.floor(t),threshold=rank*(1-WINDOW_COHERENT_FLATTEN)+.5*WINDOW_COHERENT_FLATTEN,
      pal=WINDOW_RAMP[Math.min(WINDOW_RAMP.length-1,low+(t-low>threshold?1:0))];
    for(let k=0;k<3;k++)out[i+k]=Math.round(clamp(Math.floor((rgb+(pal[k]-rgb)*WINDOW_PALETTE_AMOUNT)*steps[k]+quantRank)/steps[k])*255);
    out[i+3]=255;
  }
  return out;
}

const vertex=`#version 300 es\nin vec2 p;out vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
export const HAYSTACK_PAPER_FRAGMENT=`#version 300 es
precision highp float;in vec2 uv;out vec4 outColor;uniform sampler2D paper;uniform sampler2D blueNoise;uniform vec2 framebufferSize,desktopOrigin;uniform float dpr;
${WINDOW_SURFACE_LOOK_GLSL}
${HAYSTACK_PAPER_SAMPLE_GLSL}
float rankAt(vec2 at){return texture(blueNoise,(mod(floor(at),vec2(64.0))+.5)/64.0).r;}
void main(){vec2 point=vec2(gl_FragCoord.x,framebufferSize.y-gl_FragCoord.y)/max(1.0,dpr)+desktopOrigin,cell=floor(point/CELL_PT);
  vec2 local=((cell+.5)*CELL_PT-desktopOrigin)*max(1.0,dpr),q=clamp(vec2(local.x,framebufferSize.y-local.y)/framebufferSize,0.0,1.0);
  outColor=vec4(windowSurfaceLook(vec3(haystackPaperAt(paper,q)),rankAt(cell),rankAt(cell+vec2(23.,47.)),1.0,0.0),1.0);}`;

export function createHaystackPaperSurface({documentApi=globalThis.document,name=null,bake=bakeHaystackPaper}={}){
  const element=documentApi.createElement('canvas');element.width=element.height=512;element.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
  element.dataset.contentId=HAYSTACK_PAPER.id;
  let disposed=false,ready=false,bitmap=null,gl=null,program=null,paper=null,noise=null,buffer=null,image=null;
  const shaders=[],uniforms=new Map();
  const U=key=>{if(!uniforms.has(key))uniforms.set(key,gl.getUniformLocation(program,key));return uniforms.get(key);};
  function gpu(){
    try{gl=element.getContext?.('webgl2',{alpha:false,depth:false,antialias:false,preserveDrawingBuffer:true});if(!gl)return false;
      const shader=(type,code)=>{const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'paper shader');return s;};
      program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,HAYSTACK_PAPER_FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'paper program');
      buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);gl.useProgram(program);const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
      const texture=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
      paper=texture();gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,bitmap.width,bitmap.height,0,gl.RGBA,gl.UNSIGNED_BYTE,bitmap.pixels);
      noise=texture();gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);const seed=new Uint8Array(64*64);for(let y=0;y<64;y++)for(let x=0;x<64;x++)seed[y*64+x]=Math.round((bayer[(y%4)*4+x%4]+.5)*16);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,64,64,0,gl.RED,gl.UNSIGNED_BYTE,seed);
      const ImageClass=documentApi.defaultView?.Image||globalThis.Image;if(ImageClass){image=new ImageClass();image.onload=()=>{if(disposed)return;gl.bindTexture(gl.TEXTURE_2D,noise);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,gl.RED,gl.UNSIGNED_BYTE,image);paint();};image.src=assetUrl('assets/blue-noise-64.png');}return true;
    }catch(_){return false;}
  }
  function paint(){
    if(!ready||disposed)return false;
    if(gl&&program){const rect=element.getBoundingClientRect?.()||{left:0,top:0,width:512,height:512},ratio=Math.max(1,Number(documentApi.defaultView?.devicePixelRatio)||1),w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));if(element.width!==w||element.height!==h){element.width=w;element.height=h;}
      gl.viewport(0,0,w,h);gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,paper);gl.uniform1i(U('paper'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,noise);gl.uniform1i(U('blueNoise'),1);gl.uniform2f(U('framebufferSize'),w,h);gl.uniform2f(U('desktopOrigin'),rect.left,rect.top);gl.uniform1f(U('dpr'),ratio);gl.drawArrays(gl.TRIANGLES,0,6);return true;
    }return !!element.dataset.paperReady;
  }
  const promise=Promise.resolve().then(()=>bake(name)).then(value=>{
    if(disposed)return false;bitmap=value;
    if(!gpu()){
      // A canvas that acquired WebGL cannot subsequently acquire 2D. Return
      // failure rather than acknowledging an invisible paper after a GPU error.
      if(gl)throw Error('Paper GPU unavailable after initialization');
      const c=element.getContext?.('2d');if(!c)throw Error('Paper canvas unavailable');
      const pixels=haystackPaperFallbackPixels(bitmap),data=c.createImageData(bitmap.width,bitmap.height);data.data.set(pixels);c.putImageData(data,0,0);
    }
    ready=true;element.dataset.paperReady='true';paint();return true;
  });
  function dispose(){if(disposed)return;disposed=true;ready=false;bitmap=null;if(image){image.onload=null;image.removeAttribute?.('src');}if(gl){for(const s of shaders)gl.deleteShader(s);if(buffer)gl.deleteBuffer(buffer);if(paper)gl.deleteTexture(paper);if(noise)gl.deleteTexture(noise);if(program)gl.deleteProgram(program);}element.remove?.();}
  return{element,ready:promise,paint,dispose};
}
