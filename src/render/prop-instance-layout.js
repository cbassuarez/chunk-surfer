// Four scalar flags share one location. WKWebView/ANGLE needs a spare vertex
// attribute for the character morph shader's gl_VertexID implementation.
export const PROP_INSTANCE_FLOATS=29;
export const PROP_INSTANCE_BINDINGS=Object.freeze([
  [7,4,64], // zone, portrait, structural, powered-material multiplier
  [10,4,80], // emissive RGBA
  [11,1,96], // paper index
  [12,4,100], // paper handling
]);
export function writePropInstanceFlags(data,at,{zone=0,portrait=0,structural=false,fixturePower=1}={}){
  data[at+16]=zone;data[at+17]=portrait;data[at+18]=structural?1:0;data[at+19]=fixturePower;
}
