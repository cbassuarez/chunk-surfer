// Optional physical emitter direction. An omitted/invalid cone preserves the
// existing omnidirectional lamp. Directions point OUT from the emitter.
export function localLightConeDescriptor(light={}){
 const d=light.direction,outer=light.coneOuterCos,inner=light.coneInnerCos;
 if(!Array.isArray(d)||d.length!==3||!d.every(Number.isFinite)||!Number.isFinite(outer)||!Number.isFinite(inner)||outer< -1||inner>1||outer>=inner)return{direction:[0,0,0],outer:0,inner:1};
 const length=Math.hypot(...d);if(length<1e-8)return{direction:[0,0,0],outer:0,inner:1};
 return{direction:d.map(v=>v/length),outer,inner};
}
export function localLightConeWeight(light,ray){
 const cone=localLightConeDescriptor(light),length=Math.hypot(...ray);
 if(!cone.direction.some(Boolean))return 1;
 if(length<1e-8)return 0;
 const cosine=ray.reduce((sum,v,i)=>sum+v*cone.direction[i],0)/length;
 const x=Math.max(0,Math.min(1,(cosine-cone.outer)/(cone.inner-cone.outer)));
 return x*x*(3-2*x);
}
export const LOCAL_LIGHT_CONE_GLSL=`
uniform vec4 uLocalLightDirection[12];
uniform float uLocalLightConeInner[12];
float localEmitterCone(int index,vec3 ray){
 vec4 cone=uLocalLightDirection[index];
 if(dot(cone.xyz,cone.xyz)<.5)return 1.0;
 return smoothstep(cone.w,uLocalLightConeInner[index],dot(ray/max(length(ray),.00001),cone.xyz));
}
`;
