import {PANE_RAIN} from '../game/source-drive/weather.js';
// Contact-scale rain in cabin metres. The B/A channels come from the same
// fixed-step impacts that add water and the same rubber sweep that removes it.
export const DRIVE_PANE_RAIN_GLSL=`
vec2 paneRainCentre(ivec2 cell){
 vec2 c=vec2(cell);return(c+vec2(.22+.56*hash01(c.x+4.0,c.y+uDrivePaneSlope.z),.22+.56*hash01(c.x+uDrivePaneSlope.z,c.y+8.0)))/vec2(textureSize(uDriveWetness,0));
}
vec3 paneRainPoint(vec2 uv){return vec3(mix(uDrivePane.x,uDrivePane.y,uv.x),mix(uDrivePane.z,uDrivePane.w,uv.y),uDrivePaneSlope.x+uDrivePaneSlope.y*(uDrivePane.w-uDrivePane.z)*uv.y);}
vec4 paneRainBead(vec2 paneUv){
 ivec2 size=textureSize(uDriveWetness,0),base=ivec2(floor(paneUv*vec2(size)));vec4 best=vec4(0.0);
 vec2 metresPerUv=vec2(uDrivePane.y-uDrivePane.x,(uDrivePane.w-uDrivePane.z)*sqrt(1.0+uDrivePaneSlope.y*uDrivePaneSlope.y));
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  ivec2 cell=base+ivec2(x,y);if(any(lessThan(cell,ivec2(0)))||any(greaterThanEqual(cell,size)))continue;
  vec4 water=texelFetch(uDriveWetness,cell,0);float age=water.b*${PANE_RAIN.ageSeconds+PANE_RAIN.approachSeconds}-${PANE_RAIN.approachSeconds};
  vec2 q=(paneUv-paneRainCentre(cell))*metresPerUv;
  float seed=hash01(float(cell.x)+uDrivePaneSlope.z,float(cell.y)),r=(.0035+.0045*seed)*sqrt(water.a);
  vec2 normal=q/max(vec2(.0001),r*vec2(1.0,1.35));float radius=length(normal),drop=(1.0-smoothstep(.65,1.0,radius))*step(.025,water.a);
  float contact=age>=0.0&&age<.14?(1.0-smoothstep(.001,.003,abs(length(q)-(.002+age*.06))))*(1.0-age/.14)*water.a:0.0;
  if(drop>best.z)best.xyz=vec3(normal,drop);best.w=max(best.w,contact);
 }return best;
}
float paneRainArrival(vec3 eye,vec3 ray,float paneT,float surfaceT){
 // Search at the middle of the short flight, then test the actual 3D drop
 // against this ray. Moving the head changes parallax, never the glass UVs.
 vec3 velocity=vec3(uDriveWeatherExtra.z*.10,-3.5,4.5),n=vec3(0.0,-uDrivePaneSlope.y,1.0);
 float den=dot(n,ray);if(abs(den)<.0001)return 0.0;
 float probeT=paneT+dot(n,velocity)*(-.05)/den;
 vec3 anchor=eye+ray*probeT-velocity*(-.05);
 vec2 uv=vec2((anchor.x-uDrivePane.x)/(uDrivePane.y-uDrivePane.x),(anchor.y-uDrivePane.z)/(uDrivePane.w-uDrivePane.z));
 ivec2 size=textureSize(uDriveWetness,0),base=ivec2(floor(uv*vec2(size)));float hit=0.0;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  ivec2 cell=base+ivec2(x,y);if(any(lessThan(cell,ivec2(0)))||any(greaterThanEqual(cell,size)))continue;
  float age=texelFetch(uDriveWetness,cell,0).b*${PANE_RAIN.ageSeconds+PANE_RAIN.approachSeconds}-${PANE_RAIN.approachSeconds};if(age>=0.0)continue;
  vec3 p=paneRainPoint(paneRainCentre(cell))+velocity*age,v=-velocity*.014,w=eye-p;
  float B=dot(ray,v),C=dot(v,v),D=dot(ray,w),E=dot(v,w),d=C-B*B;
  float along=d>.000001?(B*E-C*D)/d:0.0,t=clamp((E+B*max(0.0,along))/max(.000001,C),0.0,1.0);along=max(0.0,dot(p+v*t-eye,ray));
  if(along<=paneT||along>=surfaceT)continue;
  float radius=.0035,aa=max(.001,along*.65/uRes.y),distanceM=length(eye+ray*along-p-v*t);
  hit=max(hit,(1.0-smoothstep(max(0.0,radius-aa),radius+aa,distanceM))*min(1.0,radius/aa));
 }return hit*(1.0-uReduceMotionOptical);
}
`;
