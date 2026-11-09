export const UNRAVELLING_GLSL = `
float unravelHash(vec2 p){float h=abs(sin(dot(p,vec2(127.1,311.7)))*43758.5);return h-floor(h);}
float unravelKeep(vec3 p,float amount){
  vec2 sector=floor(p.xz/vec2(7.0,11.0));
  float seed=unravelHash(sector);
  float remnant=step(.91,seed);
  float chunk=unravelHash(vec2(floor(p.x*.8)+floor(p.y*.7)*19.0,floor(p.z*.7)));
  float sectorLoss=smoothstep(.20+seed*.70,.24+seed*.70,amount);
  float chunkLoss=smoothstep(.20+chunk*.72,.24+chunk*.72,amount);
  return mix((1.0-sectorLoss)*(1.0-chunkLoss*.72),1.0,remnant);
}
`;
