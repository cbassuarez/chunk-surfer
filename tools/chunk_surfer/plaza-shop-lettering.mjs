// Physical paint geometry, loaded only by asset builders. No runtime atlas,
// texture, emissive material or independent renderer is introduced here.
import fs from 'node:fs';
export const PLAZA_SHOP_LETTERING=Object.freeze(JSON.parse(fs.readFileSync(new URL('./generated/plaza-shop-lettering.json',import.meta.url),'utf8')));
const byText=new Map(PLAZA_SHOP_LETTERING.words.map(word=>[word.text,word]));
export function shopLetteringWord(text){const word=byText.get(String(text));if(!word)throw Error('Unbuilt shop fascia word: '+text);return word;}
export function layoutShopLettering(text,{width=Infinity,height=Infinity,capHeight=Infinity,x=0,y=0,z=0}={}){
  const word=shopLetteringWord(text),scale=Math.min(width/word.width,height/word.height,capHeight/word.capHeight);
  if(!Number.isFinite(scale)||scale<=0)throw Error('Physical lettering needs a finite positive width, height or capHeight');
  if(![x,y,z].every(Number.isFinite))throw Error('Physical lettering origin must be finite');
  // Original triangles face +Z. This right-handed isometry puts their true
  // front on +X: glyph-horizontal follows -localZ, cap-height follows localY.
  const vertices=word.vertices.map(([gx,gy])=>[x,y+gy*scale,z-gx*scale]);
  return{text:word.text,vertices,indices:word.indices,scale,capHeight:word.capHeight*scale,
    width:word.width*scale,height:word.height*scale,
    bounds:{min:[x,y+word.bounds.min[1]*scale,z-word.bounds.max[0]*scale],max:[x,y+word.bounds.max[1]*scale,z-word.bounds.min[0]*scale]},
    triangles:word.triangles,counterHoles:word.counterHoles,normal:[1,0,0]};
}
export function addShopLettering(addTriangle,text,placement,material){
  if(typeof addTriangle!=='function')throw Error('addTriangle(a,b,c,material) is required');
  const result=layoutShopLettering(text,placement);
  for(let i=0;i<result.indices.length;i+=3)addTriangle(result.vertices[result.indices[i]],result.vertices[result.indices[i+1]],result.vertices[result.indices[i+2]],material);
  return result;
}
