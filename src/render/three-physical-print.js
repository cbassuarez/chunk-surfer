// Adapter for physical painted/printed legends in the existing Three scenes.
// Coverage and opacity are independent: a paint decal has transparent stock,
// while a paper carrier has opaque stock and an equally exact pigment mask.
import {physicalPrintFinish} from './physical-print-finish.js';

export function threePhysicalPrintPixels({width,height,colour,coverage,opaque=false,...finish}){
  if(colour?.length!==width*height*4||coverage?.length!==colour.length)throw new RangeError('Three physical print needs matching colour and pigment RGBA');
  const pixels=new Uint8Array(colour);
  for(let i=3;i<pixels.length;i+=4)pixels[i]=coverage[i];
  const bitmap=physicalPrintFinish({width,height,pixels},finish);
  // Canvas and the common physical baker use top-row image coordinates; Three
  // PlaneGeometry has V-up tangents. The uploader reverses raw rows; invert
  // the normal green channel to retain the actual relief direction.
  for(let i=0;i<pixels.length;i+=4){bitmap.pixels[i+3]=opaque?255:colour[i+3];bitmap.normalPixels[i+1]=255-bitmap.normalPixels[i+1];}
  return{...bitmap,finishEvidence:{...bitmap.finishEvidence,opacity:opaque?'opaque carrier':'pigment decal',normalY:'Three V-up tangent frame'}};
}

export function createThreePhysicalPrint(THREE,{width,height,opaque=false,anisotropy=4,...finish}){
  const make=srgb=>{
    const data=new Uint8Array(width*height*4),map=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.UnsignedByteType);
    map.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;map.flipY=false;map.generateMipmaps=true;
    map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
    map.wrapS=map.wrapT=THREE.ClampToEdgeWrapping;map.anisotropy=anisotropy;map.needsUpdate=true;return map;
  };
  const map=make(true),normalMap=make(false),ormMap=make(false),textures=[map,normalMap,ormMap];
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',map,normalMap,roughnessMap:ormMap,metalnessMap:ormMap,
    roughness:1,metalness:1,transparent:!opaque,depthWrite:opaque,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.name='physical printed legend';material.userData.physicalPrint={...finish,opaque,pending:true};
  return{material,textures,update(colourCanvas,coverageCanvas){
    const colour=colourCanvas.getContext('2d').getImageData(0,0,width,height).data;
    const coverage=coverageCanvas.getContext('2d').getImageData(0,0,width,height).data;
    const bitmap=threePhysicalPrintPixels({width,height,colour,coverage,opaque,...finish});
    for(const [texture,data]of[[map,bitmap.pixels],[normalMap,bitmap.normalPixels],[ormMap,bitmap.ormPixels]]){
      // Typed uploads use an explicit bottom-first buffer, independent of a
      // browser's DOM-image UNPACK_FLIP_Y path. This matches the old Canvas map.
      const rows=new Uint8Array(data.length),stride=width*4;
      for(let y=0;y<height;y++)rows.set(data.subarray(y*stride,(y+1)*stride),(height-1-y)*stride);
      texture.image.data=rows;texture.needsUpdate=true;
    }
    material.userData.physicalPrint={...bitmap.finishEvidence,profile:bitmap.finish.profile,pending:false};
    return bitmap.finishEvidence;
  }};
}
