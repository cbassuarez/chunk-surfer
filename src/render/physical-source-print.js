// Exact Source fragments remain incidental material, never new instructions.
// RGB is opaque stock/paint; A is authored pigment coverage, not transparency.
import { physicalPrintFinish } from './physical-print-finish.js';
import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { worldLetteringFont, worldLetteringFontsStatus } from './world-lettering-fonts.js';
import { fitWorldLetteringLine } from './world-lettering-layout.js';
import {SOURCE_BLUEPRINT,sourceBlueprintRegistrationMarks} from './source-blueprint-contract.js';

export const SOURCE_PRINT_SURFACE = Object.freeze({ version:1,coverage:'baseColorAlpha',
  polarity:'dark-on-light',process:'source-fragments',emission:'none' });
const PROFILE = Object.freeze({
  divide:{rows:26,pitch:20,size:13,ground:'#d6d9d0',ink:['#768477','#a3afa0'],limit:80},
  reception:{rows:33,pitch:(512-4)/33,size:16,ground:'#d7decf',ink:['#445a46','#71836c'],limit:Infinity},
  blueprint:{rows:26,pitch:20,size:13,ground:SOURCE_BLUEPRINT.stock,ink:SOURCE_BLUEPRINT.ink,limit:80},
});
const textureCache = new WeakMap();

export function sourcePrintUV(point,normal,metres=1){
  const axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  // Vertical faces read left-to-right from their outward side; higher world Y
  // samples the top of the unflipped raw pixel upload. Horizontal sheets keep
  // their existing X/Z convention.
  return axis===1?[point[0]/metres,point[2]/metres]
    :[axis===0?-Math.sign(normal[0])*point[2]/metres:Math.sign(normal[2])*point[0]/metres,-point[1]/metres];
}

export function sourcePrintRows(profile='divide') {
  const p=PROFILE[profile];if(!p)throw new RangeError(`Unknown Source print profile ${profile}`);
  const lines=Object.values(SOURCE_ATLAS.sectors).flatMap(s=>s.sourceLines||[])
    .map(line=>line.text).filter(text=>text.trim().length>12).slice(0,p.limit);
  return Array.from({length:p.rows},(_,row)=>({text:lines[row%lines.length]||'',
    x:profile==='reception'?4:8+row%3*9,y:row*p.pitch+(profile==='reception'?2:3),
    size:p.size,height:Math.min(p.pitch-(profile==='reception'?5:3),510-(row*p.pitch+(profile==='reception'?2:3))),
    ink:p.ink[row%5===0?0:1],rule:profile==='reception'?row*p.pitch+p.pitch-2:null,
    ruleInk:row%3===0?'#70816b':'#d0d5c5'}));
}

export function sourcePrintLayout(ctx,profile='divide'){
  return sourcePrintRows(profile).map(row=>{
    const fit=fitWorldLetteringLine(ctx,row.text,{width:508-row.x,height:row.height,maxFont:row.size,minFont:.1,role:'mono'});
    if(!fit.fits)throw new Error(`Source material line cannot fit its own tile: ${profile} ${row.text}`);
    return{...row,fit,baseline:row.y+fit.ascent,drawX:row.x+fit.left};
  });
}

export function physicalPrintPixels({width,height,ground,draw,finish=null}) {
  if(!worldLetteringFontsStatus().ready)throw new Error('Physical lettering fonts must load before material baking');
  const colour=document.createElement('canvas'),mask=document.createElement('canvas');
  colour.width=mask.width=width;colour.height=mask.height=height;
  const c=colour.getContext('2d',{willReadFrequently:true}),m=mask.getContext('2d',{willReadFrequently:true});
  c.fillStyle=ground;c.fillRect(0,0,width,height);m.clearRect(0,0,width,height);
  draw(c,m);
  const rgb=c.getImageData(0,0,width,height).data,coverage=m.getImageData(0,0,width,height).data;
  // Keep unassociated stock RGB at zero ink coverage. Putting this RGBA back
  // into a Canvas would premultiply away that colour, so upload the bytes.
  for(let i=3;i<rgb.length;i+=4)rgb[i]=coverage[i];
  const bitmap={width,height,pixels:rgb};return finish?physicalPrintFinish(bitmap,finish):bitmap;
}

export function uploadPhysicalPrint(gl,bitmap,{repeat=true,srgb=true}={}) {
  const texture=gl.createTexture(),active=gl.getParameter(gl.ACTIVE_TEXTURE),binding=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const flip=gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),premultiply=gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,srgb?gl.SRGB8_ALPHA8:gl.RGBA8,bitmap.width,bitmap.height,0,gl.RGBA,gl.UNSIGNED_BYTE,bitmap.pixels);
  gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,flip);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply);gl.activeTexture(active);gl.bindTexture(gl.TEXTURE_2D,binding);
  return texture;
}

export function sourcePrintMaps(gl,profile='divide',{material=true}={}) {
  let cache=textureCache.get(gl);if(!cache){cache=new Map();textureCache.set(gl,cache);}
  if(cache.has(profile)&&(!material||cache.get(profile).normalTexture))return cache.get(profile);
  const p=PROFILE[profile];if(!p)throw new RangeError(`Unknown Source print profile ${profile}`);
  const metres=profile==='reception'?2.8:8;
  const bitmap=physicalPrintPixels({width:512,height:512,ground:p.ground,finish:{profile:'paper',widthM:metres,heightM:metres,seed:'source-'+profile,repeat:true},draw(c,m){
    if(profile==='blueprint'){
      // Metre-scaled registration belongs to this printed stock, not to the
      // camera. It follows the moving mesh and its existing material UVs.
      c.save();m.save();c.fillStyle=SOURCE_BLUEPRINT.registration;m.fillStyle='#fff';
      for(const mark of sourceBlueprintRegistrationMarks()){
        const at=mark.metres/metres*512,width=Math.max(1,mark.widthM/metres*512);
        c.globalAlpha=m.globalAlpha=mark.coverage;
        for(const ctx of[c,m]){ctx.fillRect(at,0,width,512);ctx.fillRect(0,at,512,width);}
      }
      c.restore();m.restore();
    }
    c.textBaseline=m.textBaseline='alphabetic';m.textAlign='left';m.fontKerning='none';m.fillStyle='#fff';
    for(const row of sourcePrintLayout(c,profile)){
      c.font=m.font=row.fit.font;c.fillStyle=row.ink;
      c.fillText(row.text,row.drawX,row.baseline);m.fillText(row.text,row.drawX,row.baseline);
      if(row.rule!==null){c.fillStyle=row.ruleInk;c.fillRect(0,row.rule,512,1);m.fillRect(0,row.rule,512,1);}
    }
  }});
  const maps={texture:cache.get(profile)?.texture||uploadPhysicalPrint(gl,bitmap),normalTexture:material?uploadPhysicalPrint(gl,{...bitmap,pixels:bitmap.normalPixels},{srgb:false}):null,ormTexture:material?uploadPhysicalPrint(gl,{...bitmap,pixels:bitmap.ormPixels},{srgb:false}):null,letteringFinish:bitmap.finish,finishEvidence:bitmap.finishEvidence};cache.set(profile,maps);return maps;
}

export function sourcePrintTexture(gl,profile='divide'){return sourcePrintMaps(gl,profile,{material:false}).texture;}
