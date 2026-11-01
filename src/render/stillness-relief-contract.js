// A native depth-writing architectural proxy, not an acquired colour.
// Keep four bytes clear of the roof/iron identities on either side.
export const STILLNESS_RELIEF_PROXY_BYTE=233;
export const STILLNESS_RELIEF_PROXY_TAG=STILLNESS_RELIEF_PROXY_BYTE/255;
export const STILLNESS_RELIEF_PROXY_GLSL=`
const float STILLNESS_RELIEF_PROXY_TAG=233.0/255.0;
float stillnessReliefProxyTag(float value){
  return 1.0-step(.5/255.0,abs(value-STILLNESS_RELIEF_PROXY_TAG));
}
vec3 stillnessReliefEncodeNormal(vec3 normal){return(normal*127.0+128.0)/255.0;}
vec3 stillnessReliefDecodeNormal(vec3 encoded){return normalize((encoded*255.0-128.0)/127.0);}
`;
