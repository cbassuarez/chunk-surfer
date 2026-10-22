// Broad masonry belongs to the same physical wall/floor and final acquisition
// as the rest of the church. Detail is static in world metres and filtered by
// its pixel footprint: the load-bearing silhouette gets to survive the dither.
export const ST_BRENDANS_STONE_GLSL = `
float brendanStoneHash(vec2 p){
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
vec3 brendanStoneSurface(int surf,vec3 p,vec3 n){
  if(surf==3)return vec3(.30,.315,.315);
  bool floorFace=surf==2;
  vec2 uv=floorFace?p.xz:(abs(n.x)>.5?p.zy:p.xy);
  vec2 cellSize=floorFace?vec2(.86,1.18):vec2(1.02,.39);
  float row=floor(uv.y/cellSize.y);
  uv.x+=mod(row,2.0)*cellSize.x*.5;
  vec2 block=floor(uv/cellSize),within=fract(uv/cellSize)*cellSize;
  vec2 edge=min(within,cellSize-within);
  float distanceToJoint=min(edge.x,edge.y);
  float footprint=max(fwidth(uv.x),fwidth(uv.y));
  float joint=1.0-smoothstep(.005,.012+footprint,distanceToJoint);
  float grain=brendanStoneHash(block);
  vec3 mineral=floorFace?vec3(.29,.305,.30):vec3(.44,.455,.435);
  mineral*=.94+grain*.12;
  // Damp collects at the wall foot; surviving limewash remains above it.
  float damp=floorFace?0.0:(1.0-smoothstep(.12,1.05,p.y))*.085;
  mineral*=1.0-damp;
  return mix(mineral,mineral*.69,joint*.72);
}
`;
