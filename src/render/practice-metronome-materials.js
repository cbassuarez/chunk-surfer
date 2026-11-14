// Finite, code-authored PBR maps for the six shared instruments. These are
// ordinary resident prop materials: torch, shadows, dither and exposure remain
// the room's. Nothing here emits light or draws a screen-space instrument.
import {installProceduralMeshes} from './procedural-mesh-install.js';
import {sourceSurfaceInkRGBA} from './source-surface-lettering.js';
import {uploadPhysicalPrint} from './physical-source-print.js';
import {printedSurfaceDescriptor} from './printed-surface.js';
import {
  practiceMetronomeGeometry,practiceMetronomeWeightDistance,
  PRACTICE_METRONOME_SHAPE,PRACTICE_METRONOME_SCALE,PRACTICE_METRONOME_SCALE_SURFACE,
} from './practice-metronome-model.js';

export const PRACTICE_METRONOME_MATERIAL_SPEC=Object.freeze({
  walnut:Object.freeze({albedo:[256,512],surface:[256,512],normalScale:.40,aoStrength:.26}),
  scale:Object.freeze({albedo:[512,1024],surface:[256,512],normalScale:.12,aoStrength:.15}),
  brass:Object.freeze({albedo:[256,256],surface:[256,256],normalScale:.22,aoStrength:.12}),
  dark:Object.freeze({albedo:[64,64],surface:[64,64],normalScale:.10,aoStrength:.12}),
});
export const PRACTICE_METRONOME_TEXTURE_BYTES=Object.values(PRACTICE_METRONOME_MATERIAL_SPEC)
  .reduce((sum,s)=>sum+(s.albedo[0]*s.albedo[1]+2*s.surface[0]*s.surface[1])*4*4/3,0);
export const PRACTICE_METRONOME_SCALE_PRINT=Object.freeze({fontPx:38,fontWeight:600,ink:'#17170f',majorTickPx:1.6,minorTickPx:1.0});
export const PRACTICE_METRONOME_PRINT_SURFACE=printedSurfaceDescriptor({
  version:1,coverage:'baseColorAlpha',polarity:'dark-on-light',
  process:'printed mechanical tempo scale',emission:'none',
},{alphaMode:'OPAQUE',hasTexture:true});
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const noise=(x,y,s=1)=>{
  let n=Math.imul(x+Math.imul(y,374761393)+s*668265263,1274126177);n^=n>>>13;n=Math.imul(n,1274126177);return((n^(n>>>16))>>>0)/4294967295;
};
function canvasOf(width,height,factory,{alpha=false}={}){
  const canvas=factory?factory(width,height):typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(width,height):globalThis.document?.createElement('canvas');
  if(!canvas)throw new Error('Practice metronome physical materials need a 2D canvas.');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha});if(!ctx)throw new Error('Practice metronome material canvas unavailable.');
  return{canvas,ctx};
}
function grain(x,y,w,h){
  const u=x/w,v=y/h;
  const bend=Math.sin(v*10.7)*.012+Math.sin(v*37.1+u*9)*.003;
  const rings=Math.sin((u+bend)*193+Math.sin(v*5.1)*2.2),fine=Math.sin((u+bend*.72)*730+v*8.6);
  return .55*rings+.18*fine+.14*(noise(x,y,4)-.5)+.22*Math.sin(u*22+v*1.5);
}
function sample(kind,x,y,w,h){
  const n=noise(x,y,9)-.5,u=x/w,v=y/h;
  if(kind==='walnut'){
    const g=grain(x,y,w,h),pore=Math.pow(clamp((Math.sin((u+Math.sin(v*13)*.005)*426)+1)/2),14);
    return{rgb:[123+g*17-pore*10+n*3,87+g*14-pore*8+n*2,57+g*10-pore*5+n*2],height:g*.10-pore*.12,rough:.52+g*.035,metal:0,ao:.95-pore*.05};
  }
  if(kind==='scale'){
    const edge=Math.pow(Math.max(Math.abs(u-.5)*2,Math.abs(v-.5)*2),9),age=Math.sin(u*8+v*6)*1.6+n*2;
    return{rgb:[183+age-edge*13,174+age-edge*14,150+age-edge*16],height:n*.022,rough:.81+n*.025,metal:0,ao:.99-edge*.07};
  }
  if(kind==='brass'){
    const brushing=Math.sin(v*1440)*.7+Math.sin(v*473+u*6)*.6,patina=.5+.5*Math.sin(u*14+Math.sin(v*23)*1.7);
    if(u>.90&&v>.90)return{rgb:[39,35,27],height:-.1,rough:.78,metal:.45,ao:.65};
    return{rgb:[139+brushing*3-patina*9+n*2,119+brushing*2-patina*8+n*2,82+brushing-patina*6+n*2],height:brushing*.026+n*.014,rough:.51+patina*.08,metal:.64,ao:.98-patina*.025};
  }
  return{rgb:[39+n*4,36+n*3,30+n*3],height:n*.04,rough:.91,metal:.07,ao:.96};
}
function raster(kind,width,height,mode,factory){
  const{canvas,ctx}=canvasOf(width,height,factory),image=ctx.createImageData(width,height);
  const heightAt=(x,y)=>sample(kind,clamp(x,0,width-1),clamp(y,0,height-1),width,height).height;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=(y*width+x)*4,s=sample(kind,x,y,width,height);let rgb;
    if(mode==='albedo')rgb=s.rgb;
    else if(mode==='orm')rgb=[s.ao*255,s.rough*255,s.metal*255];
    else{
      const dx=(heightAt(x+1,y)-heightAt(x-1,y))*.55,dy=(heightAt(x,y+1)-heightAt(x,y-1))*.55,l=Math.hypot(dx,dy,1);
      // Canvas top becomes UV top on upload, hence the flipped derivative Y.
      rgb=[(-dx/l*.5+.5)*255,(dy/l*.5+.5)*255,(1/l*.5+.5)*255];
    }
    for(let k=0;k<3;k++)image.data[at+k]=Math.round(clamp(rgb[k],0,255));image.data[at+3]=255;
  }
  ctx.putImageData(image,0,0);return{canvas,ctx};
}
function printScale(ctx,width,height,{coverage=false}={}){
  const S=PRACTICE_METRONOME_SCALE_SURFACE,C=PRACTICE_METRONOME_SHAPE,P=PRACTICE_METRONOME_SCALE_PRINT,
    x=v=>(v-S.x0)/(S.x1-S.x0)*width,y=v=>(1-(v-S.y0)/(S.y1-S.y0))*height;
  ctx.fillStyle=coverage?'#fff':P.ink;ctx.strokeStyle=coverage?'#fff':P.ink;ctx.textAlign='right';ctx.textBaseline='middle';
  ctx.lineWidth=P.majorTickPx;
  // Actual typesetting on the material. The moving mass naturally occludes the
  // selected graduation, just as it does on a real mechanical metronome.
  ctx.font=`${P.fontWeight} ${P.fontPx}px Georgia, "Times New Roman", serif`;
  for(const tempo of PRACTICE_METRONOME_SCALE){
    const localY=C.pivotY+practiceMetronomeWeightDistance(tempo),yy=y(localY),
      glyphTop=localY+P.fontPx/height*(S.y1-S.y0)/2,
      halfWidth=.080+(.030-.080)*(glyphTop-.054)/(.401-.054),
      maxWidth=x(-.010)-x(-halfWidth+.002);
    // Reserve the complete em box inside the taper, including 40 at its narrow
    // top. Canvas only condenses if necessary; no glyph is clipped by the wood.
    ctx.fillText(String(tempo),x(-.010),yy,maxWidth);
    ctx.beginPath();ctx.moveTo(x(.009),yy);ctx.lineTo(x(.022),yy);ctx.stroke();
  }
  ctx.lineWidth=P.minorTickPx;
  for(let tempo=44;tempo<300;tempo+=4){
    if(PRACTICE_METRONOME_SCALE.includes(tempo))continue;
    const yy=y(C.pivotY+practiceMetronomeWeightDistance(tempo));
    ctx.beginPath();ctx.moveTo(x(.009),yy);ctx.lineTo(x(tempo%20===0?.017:.013),yy);ctx.stroke();
  }
  ctx.textAlign='center';ctx.font='18px Georgia, "Times New Roman", serif';ctx.fillText('M. M.',x(0),y(.385));
  ctx.font='13px Georgia, "Times New Roman", serif';ctx.fillText('MÉTRONOME',x(0),y(.105));
  ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(x(-.035),y(.116));ctx.lineTo(x(.035),y(.116));ctx.stroke();
}
// A factory makes the material contract testable without booting WebGL. Native
// rendering uses browser Canvas, with the serif face rasterised only once.
export function createPracticeMetronomeMaterialCanvases({canvasFactory}={}){
  const materials={};
  for(const[kind,spec]of Object.entries(PRACTICE_METRONOME_MATERIAL_SPEC)){
    const color=raster(kind,...spec.albedo,'albedo',canvasFactory);
    let albedoBitmap=null;
    if(kind==='scale'){
      printScale(color.ctx,...spec.albedo);
      const[width,height]=spec.albedo,mask=canvasOf(width,height,canvasFactory,{alpha:true});
      mask.ctx.clearRect(0,0,width,height);printScale(mask.ctx,width,height,{coverage:true});
      // Preserve every original stock/ink RGB byte. A names authored ink area,
      // never opacity; keep this result out of Canvas's premultiplied backing.
      albedoBitmap={width,height,pixels:sourceSurfaceInkRGBA(
        color.ctx.getImageData(0,0,width,height).data,mask.ctx.getImageData(0,0,width,height).data,
        {width,flipY:true})};
    }
    materials[kind]={albedo:color.canvas,normal:raster(kind,...spec.surface,'normal',canvasFactory).canvas,
      orm:raster(kind,...spec.surface,'orm',canvasFactory).canvas,normalScale:spec.normalScale,aoStrength:spec.aoStrength,
      albedoBitmap,printedSurface:kind==='scale'?PRACTICE_METRONOME_PRINT_SURFACE:null};
  }
  return materials;
}
const resident=new WeakMap();
function upload(gl,canvas,srgb){
  const texture=gl.createTexture();if(!texture)throw new Error('Practice metronome texture allocation failed.');
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);return texture;
}
export function practiceMetronomeMaterialMaps(gl,{canvasFactory}={}){
  let maps=resident.get(gl);
  if(maps&&(!gl.isTexture||Object.values(maps).every(m=>[m.texture,m.normalTexture,m.ormTexture].every(t=>gl.isTexture(t)))))return maps;
  if(maps&&gl.deleteTexture)for(const m of Object.values(maps))for(const t of[m.texture,m.normalTexture,m.ormTexture])gl.deleteTexture(t);
  const canvases=createPracticeMetronomeMaterialCanvases({canvasFactory});maps={};
  for(const[kind,c]of Object.entries(canvases))maps[kind]={
    texture:c.albedoBitmap?uploadPhysicalPrint(gl,c.albedoBitmap,{repeat:false,srgb:true}):upload(gl,c.albedo,true),
    normalTexture:upload(gl,c.normal,false),ormTexture:upload(gl,c.orm,false),normalScale:c.normalScale,aoStrength:c.aoStrength,
    printedSurface:c.printedSurface,
  };
  resident.set(gl,maps);return maps;
}
// Root passes this directly to P3.installAuthoredPropMeshes. Repeated calls use
// one shared map set and can reattach it after the base prop pack reloads.
export function installPracticeMetronomeMeshes(gl,pack,options={}){
  if(!gl||!pack?.catalog)return false;
  const pieces=practiceMetronomeGeometry();
  if(!installProceduralMeshes(gl,pack,pieces))return false;
  const maps=practiceMetronomeMaterialMaps(gl,options);
  for(const part of pieces){
    const mesh=pack.catalog.get(part.name);mesh.extras.practiceMetronome=true;
    for(const primitive of mesh.primitives)Object.assign(primitive,maps[part.material],{
      base:[1,1,1,1],emissive:[0,0,0],materialFactors:'gltf',metallic:1,roughness:1,
      materialName:`practice metronome ${part.material}`,materialRole:null,alphaCut:0,
    });
  }
  return true;
}
