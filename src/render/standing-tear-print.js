// Standing Tear uses Source I's actual opaque black stock and coloured source
// clauses. The alpha byte remains pigment coverage, never geometry opacity.
import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with {type:'json'};
import {SOURCE_SURFACE_LETTERING,sourceSurfaceLetteringPixels,sourceSurfaceLetteringRows} from './source-surface-lettering.js';
import {uploadPhysicalPrint} from './physical-source-print.js';

export const STANDING_TEAR_SOURCE_PRINT=Object.freeze({version:1,coverage:'baseColorAlpha',polarity:'light-on-dark',process:'primordial Source clauses',emission:'pigment'});
export const STANDING_TEAR_PRINT_SCALE=Object.freeze({floor:[24,3],wall:[96,12],fold:[64,8]});
export const STANDING_TEAR_STOCK_RGB=Object.freeze([24,31,35]);
export function standingTearSourceLines(){
  return Object.values(SOURCE_ATLAS.sectors).flatMap((sector,index)=>(sector.sourceLines||[]).slice(0,12).map(line=>({...line,sourceLayer:index+1})));
}
export function standingTearSourceRows(){return sourceSurfaceLetteringRows(standingTearSourceLines());}
export function standingTearSourceBand(bitmap,layer=1){
  const width=SOURCE_SURFACE_LETTERING.width,height=SOURCE_SURFACE_LETTERING.bandHeight,index=Math.max(0,Math.min(7,Math.round(layer)-1)),start=index*height*width*4;
  return{width,height,pixels:bitmap.pixels.slice(start,start+height*width*4),layer:index+1};
}
export function standingTearSourceStock(band){
  const pixels=new Uint8Array(band.pixels);
  for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]===0)pixels.set(STANDING_TEAR_STOCK_RGB,i);
  return{...band,pixels};
}
const cache=new WeakMap();
export function standingTearSourceMaps(gl,{layer=1}={}){
  let stored=cache.get(gl);if(!stored){stored={bitmap:sourceSurfaceLetteringPixels(standingTearSourceLines()),maps:new Map()};cache.set(gl,stored);}
  const key=Math.max(1,Math.min(8,Math.round(layer)));if(stored.maps.has(key))return stored.maps.get(key);
  const band=standingTearSourceStock(standingTearSourceBand(stored.bitmap,key)),maps={texture:uploadPhysicalPrint(gl,band,{repeat:true}),normalTexture:null,ormTexture:null,letteringFinish:null,layer:key,printedSurface:STANDING_TEAR_SOURCE_PRINT};stored.maps.set(key,maps);return maps;
}
export function standingTearSourceUV(point,normal,scale=STANDING_TEAR_PRINT_SCALE.floor){
  const axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const u=axis===1?point[0]:axis===0?-Math.sign(normal[0])*point[2]:Math.sign(normal[2])*point[0],v=axis===1?point[2]:-point[1];
  return[u/scale[0],v/scale[1]];
}
