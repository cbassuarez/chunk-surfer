// Shared airborne rain for the world march and physical Source. Distances
// are half-metre runtime cells, except the explicitly marked exposure model.
// Compose the result into scene RGB. It does not write depth or dither marks.
export const RAIN_FIELD_GLSL = `
uniform float uRainBack;
uniform float uRainClearM; // historical name; this radius is in runtime cells

const int RAIN_COLUMNS = 16;
const float RAIN_COLUMN_CELLS = 1.0;
const float RAIN_NEAR_CELLS = 0.68;
const float RAIN_FAR_CELLS = 11.0;

vec3 rainColumnSeed(vec2 cell){
  uvec2 id=uvec2(ivec2(cell));
  uint seed=(id.x*1597334677u)^(id.y*2891336453u);
  seed=(seed^(seed>>16u))*0x7feb352du;
  seed=(seed^(seed>>15u))*0x846ca68bu;
  seed^=seed>>16u;
  return vec3(uvec3(seed,seed>>10u,seed>>20u)&1023u)/1023.0;
}

// Constrain both the segment and its projected hit to the visible ray.
// Depth clipping uses the actual point on the streak, rather than the entry
// of the cell that owns it.
vec3 rainRaySegment(vec3 ro, vec3 rd, vec3 a, vec3 b, float visibleEnd) {
  vec3 v=b-a;
  float vv=dot(v,v);
  float rv=dot(rd,v);
  vec3 q=ro-a;
  float depthA=-dot(rd,q);
  float depthB=depthA+rv;
  if(max(depthA,depthB)<RAIN_NEAR_CELLS || min(depthA,depthB)>visibleEnd)
    return vec3(1e4,0.0,0.0);
  float along=(dot(v,q)+rv*depthA)/max(1e-6,vv-rv*rv);
  if(abs(rv)>1e-6){
    float nearLimit=(RAIN_NEAR_CELLS-depthA)/rv;
    float farLimit=(visibleEnd-depthA)/rv;
    along=clamp(along,max(0.0,min(nearLimit,farLimit)),min(1.0,max(nearLimit,farLimit)));
  }else{
    along=clamp(along,0.0,1.0);
  }
  float rayT=dot(a+v*along-ro,rd);
  return vec3(length(ro+rd*rayT-a-v*along),rayT,along);
}

void accumulateRainSegment(vec3 ro, vec3 rd, vec3 a, vec3 b, float visibleEnd,
                           float pixelSlope, float seed, float reduced, inout vec4 field) {
  vec3 hit=rainRaySegment(ro,rd,a,b,visibleEnd);
  float radius=mix(.005,.011,seed);
  float pixel=max(.0015,hit.y*pixelSlope);
  float core=1.0-smoothstep(max(0.0,radius-pixel),radius+pixel,hit.x);
  if(core<=.0)return;
  float exposure=smoothstep(.0,.25,hit.z)*(1.0-smoothstep(.64,1.0,hit.z));
  float taper=mix(.29,1.0,exposure);
  float sleeve=core*min(1.0,(radius+.0015)/pixel);
  float depthFade=smoothstep(RAIN_NEAR_CELLS,1.8,hit.y)
    *(1.0-smoothstep(7.4,RAIN_FAR_CELLS,hit.y));
  float coverage=sleeve*taper*depthFade*mix(1.0,.62,reduced);
  float glint=mix(.52,1.0,seed)*mix(.52,1.0,exposure);
  float strength=coverage*glint;
  field.x=1.0-(1.0-field.x)*(1.0-coverage*.70);
  if(strength>field.y) field.yzw=vec3(strength,hit.y,coverage);
}

void accumulateRainColumn(vec3 ro, vec3 rd, vec2 cell, vec2 side, float rayEntry,
                          float visibleEnd, float pixelSlope, float clock,
                          float occupancy, float period, float reduced, inout vec4 field) {
  vec3 random=rainColumnSeed(cell);
  if(random.x<1.0-occupancy)return;
  float jitterX=random.y;
  float jitterZ=random.z;
  vec2 xz=(cell+mix(vec2(.15),vec2(.85),vec2(jitterX,jitterZ)))*RAIN_COLUMN_CELLS;
  // Max side reach of the leaned streak plus its largest filtered radius.
  // Most rays crossing a column can reject it before any shelter tests.
  if(abs(dot(xz-ro.xz,side))>.13+visibleEnd*pixelSlope)return;
  if(uRainClearM>0.0 && distance(xz,ro.xz)<uRainClearM)return;
  float exposureSeconds=mix(.016,.027,jitterZ);
  float fallMetresPerSecond=mix(5.6,8.9,jitterX);
  float fallCells=fallMetresPerSecond*2.0;
  float streak=fallCells*exposureSeconds*mix(1.0,.58,reduced);
  vec2 wind=vec2(.17,.07)+vec2(.048,.027)*sin(clock*.76+cell.x*.11+cell.y*.08);
  // Sample a periodic world Y, using the ray's elevation in the column only
  // to choose a repeat. Raising the camera cannot lift the whole downpour.
  float nearY=ro.y+rd.y*rayEntry;
  float phase=random.x*period-clock*fallCells;
  float topY=nearY+mod(phase-nearY+period*.5,period)-period*.5;
  vec3 a=vec3(xz.x,topY,xz.y);
  vec3 b=a+vec3(wind.x,-1.0,wind.y)*streak;
  if(!glassCourtTrimRain(a,b))return;
  vec3 a0,b0,a1,b1;
  int pieces=outskirtsBusTrimRain(a,b,a0,b0,a1,b1);
  if(pieces>0)accumulateRainSegment(ro,rd,a0,b0,visibleEnd,pixelSlope,jitterX,reduced,field);
  if(pieces>1)accumulateRainSegment(ro,rd,a1,b1,visibleEnd,pixelSlope,jitterX,reduced,field);
}

// x accumulated coverage, y brightest droplet, z its depth, w its coverage.
// The bounded walk samples the same world columns as the player moves.
vec4 traceRainField(vec3 ro, vec3 rd, float surfaceRayCells, float pixelSlope, float amount) {
  float visibleEnd=min(surfaceRayCells,RAIN_FAR_CELLS);
  if(visibleEnd<=RAIN_NEAR_CELLS || amount<=.001)return vec4(0.0);
  float reduced=uReduceMotionOptical;
  float clock=uTime*mix(1.0,.42,reduced)*(1.0-2.0*uRainBack);
  float storm=smoothstep(1.0,5.0,amount);
  float occupancy=.79*min(amount,1.0)+.19*storm;
  float period=mix(5.4,3.2,storm);
  float horizontal=length(rd.xz);
  vec2 dir=rd.xz/max(horizontal,1e-6);
  vec2 side=vec2(-dir.y,dir.x);
  vec2 pos=ro.xz/RAIN_COLUMN_CELLS;
  vec2 cell=floor(pos);
  vec4 field=vec4(0.0);
  accumulateRainColumn(ro,rd,cell,side,0.0,visibleEnd,pixelSlope,clock,occupancy,period,reduced,field);
  if(horizontal<.001)return field;

  vec2 signDir=sign(dir);
  vec2 inv=1.0/max(abs(dir),vec2(1e-6));
  vec2 next=abs(cell+max(signDir,vec2(0.0))-pos)*inv;
  for(int i=0;i<RAIN_COLUMNS;i++){
    float entry;
    if(next.x<next.y){entry=next.x;next.x+=inv.x;cell.x+=signDir.x;}
    else {entry=next.y;next.y+=inv.y;cell.y+=signDir.y;}
    entry*=RAIN_COLUMN_CELLS/horizontal;
    if(entry>=visibleEnd)break;
    accumulateRainColumn(ro,rd,cell,side,entry,visibleEnd,pixelSlope,clock,occupancy,period,reduced,field);
  }
  return field;
}
`;
