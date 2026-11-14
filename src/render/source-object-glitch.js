export const SOURCE_OBJECT_NEGATIVE_MARK_GLSL = `
// The five levels fit between the chunk fault tag (249) and the usual
// capture sentinel (255), leaving the RGB engraving channels intact.
float sourceObjectNegativeMark(float amount){
  float level=floor(clamp(amount,0.0,1.0)*5.0+.5);
  return level<1.0?0.0:(249.0+level)/255.0;
}

float sourceObjectNegativeAmount(float tag){
  float level=floor(tag*255.0+.5)-249.0;
  return level>=1.0&&level<=5.0?level*.2:0.0;
}
`;

export const SOURCE_OBJECT_NEGATIVE_COLOR_GLSL = SOURCE_OBJECT_NEGATIVE_MARK_GLSL+`
vec3 sourceObjectNegativeColor(vec3 acquired,float amount){
  vec3 reference=vec3(.86,.92,.98);
  vec3 negative=abs(clamp(acquired,0.0,1.0)-reference);
  return mix(acquired,negative,clamp(amount,0.0,1.0));
}
`;

export const SOURCE_OBJECT_GLITCH_GLSL = SOURCE_OBJECT_NEGATIVE_MARK_GLSL+`
float sourceObjectCellHash(vec2 cell,float seed){
  vec3 p=fract(cell.xyx*vec3(.1031,.1030,.0973)+fract(seed*.137)*.47);
  p+=dot(p,p.yzx+33.33);
  return fract((p.x+p.y)*p.z);
}

vec2 sourceObjectFacePoint(vec3 point,vec3 localNormal){
  vec3 facing=abs(localNormal);
  if(facing.z>=max(facing.x,facing.y))return point.xy;
  return facing.x>=facing.y?point.zy:point.xz;
}

// Failed reads invert the acquired ink in irregular rows. Cell addresses are
// fixed to the mesh, and the rows clear at separate points in the burst.
float sourceObjectNegativeMask(vec3 point,vec3 localNormal,float seed,float progress){
  vec2 surface=sourceObjectFacePoint(point,localNormal);
  float band=floor(surface.y*3.0);
  float column=floor(surface.x*12.0);
  float phase=sourceObjectCellHash(vec2(band,9.0),seed);
  float edge=sourceObjectCellHash(vec2(column,band),seed);
  float from=.10+.25*phase+.06*floor(edge*3.0);
  float height=.24+.13*phase;
  float y=fract(surface.y*3.0);
  float left=band==0.0?0.0:.22+.12*phase;
  float right=band==2.0?1.0:.69+.24*phase;
  if(y<=from||y>=from+height||surface.x<left||surface.x>right)return 0.0;
  float recovered=.67+.24*phase+.07*edge;
  return 1.0-smoothstep(recovered-.08,recovered,progress);
}

// The intact and shifted draws ask the exact same question in the original
// mesh's coordinates. No packet exists at both positions.
bool sourceObjectDisplacedSector(vec3 point,vec3 localNormal,float seed,float progress){
  vec2 surface=sourceObjectFacePoint(point,localNormal);
  float row=floor(surface.y*14.0);
  float column=floor(surface.x*9.0);
  float phase=sourceObjectCellHash(vec2(12.0,4.0),seed);
  float offset=floor(phase*3.0);
  float tear=step(.58,sourceObjectCellHash(vec2(column,offset),seed));
  bool wideBand=row>=5.0+offset+tear&&row<=7.0+offset+tear;
  bool narrowBand=row==2.0+offset&&column>=4.0;
  return (wideBand&&progress<.88)||(narrowBand&&progress<.56);
}

// Keep actual chunks of the donor model, including their material boundaries.
// Two overlapping page runs sample unrelated parts of the donor's silhouette.
bool sourceObjectDonorFragment(vec3 point,vec3 localNormal,float seed,float progress){
  vec2 cell=floor(sourceObjectFacePoint(point,localNormal)*vec2(7.0,8.0));
  float shift=floor(sourceObjectCellHash(vec2(6.0,2.0),seed)*2.0);
  bool lower=cell.y>=2.0&&cell.y<=3.0&&cell.x>=1.0+shift&&cell.x<=4.0+shift;
  bool upper=cell.y>=4.0&&cell.y<=5.0&&cell.x>=3.0-shift&&cell.x<=5.0-shift;
  return (lower&&progress<.88)||(upper&&progress<.68);
}
`;
