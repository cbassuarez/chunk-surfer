// Authored pigment coverage, separate from opacity and from generated grain.
// These tags exist only in a depth-winning mark target. Never classify colour
// alpha as print: floating Source glyphs legitimately use fractional opacity.
export const PRINTED_SURFACE_VERSION=1;
export const PRINTED_SURFACE_LEVELS=16;
export const PRINTED_SURFACE_DARK_BYTE=136;
export const PRINTED_SURFACE_LIGHT_BYTE=156;
// Area-averaged document print needs fractional material selection, unlike
// the geometric coverage of large painted/enamelled lettering. This range is
// separate from grain planes, solid pigments and apparition/roof markers.
export const PRINTED_SURFACE_AREA_DARK_BYTE=112;
export const PRINTED_SURFACE_POLARITY=Object.freeze({'dark-on-light':1,'light-on-dark':2});

export function printedSurfaceDescriptor(value,{alphaMode='OPAQUE',hasTexture=true}={}){
  if(value==null)return null;
  if(value.version!==1||!['baseColorAlpha','solid'].includes(value.coverage)||!PRINTED_SURFACE_POLARITY[value.polarity])
    throw new Error('Invalid printedSurface material contract');
  if(alphaMode!=='OPAQUE')throw new Error('Printed pigment coverage requires an OPAQUE material');
  if(value.coverage==='baseColorAlpha'&&!hasTexture)throw new Error('Printed pigment coverage requires a base-colour texture');
  const emission=value.emission||'none';
  if(!['none','substrate','pigment'].includes(emission))throw new Error('Invalid printedSurface emission mask');
  if(value.sampling!=null&&value.sampling!=='area')throw new Error('Invalid printedSurface sampling contract');
  if(value.sampling==='area'&&(value.coverage!=='baseColorAlpha'||value.polarity!=='dark-on-light'))
    throw new Error('Area print requires dark pigment coverage from baseColorAlpha');
  return Object.freeze({version:1,coverage:value.coverage,polarity:value.polarity,
    process:String(value.process||'printed pigment'),emission,...(value.sampling==='area'?{sampling:'area'}:{})});
}

export function encodePrintedSurface(coverage,polarity='dark-on-light'){
  const kind=typeof polarity==='number'?polarity:PRINTED_SURFACE_POLARITY[polarity];
  if(kind!==1&&kind!==2)return 0;
  const amount=Math.round(Math.max(0,Math.min(1,Number(coverage)||0))*(PRINTED_SURFACE_LEVELS-1));
  return((kind===1?PRINTED_SURFACE_DARK_BYTE:PRINTED_SURFACE_LIGHT_BYTE)+amount)/255;
}
export function decodePrintedSurface(value){
  const byte=Math.round(value*255);
  if(byte>=PRINTED_SURFACE_AREA_DARK_BYTE&&byte<PRINTED_SURFACE_AREA_DARK_BYTE+PRINTED_SURFACE_LEVELS)
    return{kind:1,coverage:(byte-PRINTED_SURFACE_AREA_DARK_BYTE)/(PRINTED_SURFACE_LEVELS-1),area:true};
  for(const [kind,start]of [[1,PRINTED_SURFACE_DARK_BYTE],[2,PRINTED_SURFACE_LIGHT_BYTE]])
    if(byte>=start&&byte<start+PRINTED_SURFACE_LEVELS)return{kind,coverage:(byte-start)/(PRINTED_SURFACE_LEVELS-1)};
  return{kind:0,coverage:0};
}
export function encodePrintedAreaSurface(coverage){
  const amount=Math.round(Math.max(0,Math.min(1,Number(coverage)||0))*(PRINTED_SURFACE_LEVELS-1));
  return(PRINTED_SURFACE_AREA_DARK_BYTE+amount)/255;
}

export function packPropWorldDepth(depth){
  const v=Math.round(Math.max(0,Math.min(1,depth))*16777215);
  return[Math.floor(v/65536)/255,Math.floor(v/256)%256/255,(v%256)/255];
}
export function unpackPropWorldDepth(rgb){return(rgb[0]*16711680+rgb[1]*65280+rgb[2]*255)/16777215;}

export const PRINTED_SURFACE_GLSL=`
float printedSurfaceKind(float value){
  float byte=floor(value*255.0+.5);
  if(byte>=112.0&&byte<=127.0)return 1.0;
  if(byte>=136.0&&byte<=151.0)return 1.0;
  if(byte>=156.0&&byte<=171.0)return 2.0;
  return 0.0;
}
float printedSurfaceArea(float value){
  float byte=floor(value*255.0+.5);
  return byte>=112.0&&byte<=127.0?1.0:0.0;
}
float printedSurfaceCoverage(float value){
  float kind=printedSurfaceKind(value),byte=floor(value*255.0+.5);
  if(printedSurfaceArea(value)>.5)return(byte-112.0)/15.0;
  return kind<.5?0.0:(byte-(kind<1.5?136.0:156.0))/15.0;
}
float printedAreaSurfaceTag(float coverage){
  return(112.0+floor(clamp(coverage,0.0,1.0)*15.0+.5))/255.0;
}
float printedAreaPigmentSample(float coverage,float threshold){
  // Exact clear stock never gains ink, including a screen's zero threshold.
  return coverage<=0.0?0.0:coverage>=1.0?1.0:step(threshold,coverage);
}
float printedSurfaceTag(float coverage,float polarity){
  if(polarity<.5||polarity>2.5)return 0.0;
  return((polarity<1.5?136.0:156.0)+floor(clamp(coverage,0.0,1.0)*15.0+.5))/255.0;
}
vec3 packPropWorldDepth(float depth){
  // Integer byte extraction avoids losing another bit in floating mod on
  // Metal. Depth itself is still the actual raster fragment depth.
  highp uint value=uint(round(clamp(depth,0.0,1.0)*16777215.0));
  return vec3(float((value>>16u)&255u),float((value>>8u)&255u),float(value&255u))/255.0;
}
float unpackPropWorldDepth(vec3 value){
  highp uvec3 bytes=uvec3(round(value*255.0));
  highp uint depth=(bytes.r<<16u)|(bytes.g<<8u)|bytes.b;
  return float(depth)/16777215.0;
}
`;
