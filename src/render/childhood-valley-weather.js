import { HOME_APPROACH_WALLS } from '../data/childhood-grounds.js';
import { HOME_HOUSE } from '../data/childhood-house.js';
import { HOME_VALLEY_SITES } from '../data/childhood-valley.js';
import { HOME_FOREST_STANDS, HOME_MOUNTAIN_SITES } from '../data/childhood-valley-trail.js';

const f = value => Number(value).toFixed(4);
const v2 = (x,z) => `vec2(${f(x)},${f(z)})`;
const valleyShelters = [
  { x0:HOME_HOUSE.x0,x1:HOME_HOUSE.x1,z0:HOME_HOUSE.z0,z1:HOME_HOUSE.z1, weight:1 },
  ...[...HOME_VALLEY_SITES,...HOME_MOUNTAIN_SITES].flatMap(({pieces})=>pieces
    .filter(piece=>piece.id.endsWith('closed-envelope')||piece.id==='timber-rest-floor'||piece.id==='stop-roof')
    .map(piece=>({...piece,weight:piece.id.endsWith('closed-envelope')?1:.7}))),
];
const wallShelters = HOME_APPROACH_WALLS.filter(({id})=>id.startsWith('lane-wall')||id.startsWith('house-boundary'));

export const CHILDHOOD_VALLEY_WEATHER_GLSL = `
const vec2 homeWind = vec2(.8994,.4371);
const vec3 homeCloudLight = vec3(-.642,.566,-.516);
float ewHomeSoftPlan(vec2 p,vec2 centre,vec2 halfSize,float spread){
  vec2 d=abs(p-centre)-halfSize;
  return 1.0-smoothstep(0.0,spread,max(d.x,d.y));
}
float ewHomeCanopy(vec2 p){
  float cover=0.0;
${HOME_FOREST_STANDS.map(([x,z,rx,rz])=>`  cover=max(cover,1.0-smoothstep(.52,1.40,length((p-${v2(x,z)})/${v2(rx,rz)}))); `).join('\n')}
  return cover;
}
float ewHomeBuildingLee(vec2 p){
  float lee=0.0;
${valleyShelters.map(({x0,x1,z0,z1,weight})=>`  lee=max(lee,${f(weight)}*ewHomeSoftPlan(p-homeWind*1.3,${v2((x0+x1)/2,(z0+z1)/2)},${v2((x1-x0)/2,(z1-z0)/2)},2.2));`).join('\n')}
${wallShelters.map(({x0,x1,z0,z1})=>`  lee=max(lee,.53*ewHomeSoftPlan(p-homeWind*.7,${v2((x0+x1)/2,(z0+z1)/2)},${v2((x1-x0)/2,(z1-z0)/2)},.9));`).join('\n')}
  return lee;
}
// The advancing squall controls atmosphere and the local density of snow.
// Fixed shelter softens the squall without changing a flake's trajectory.
vec2 ewHomeWeather(vec3 p,float t){
  float time=t*(1.0-uCalm);
  vec2 moving=(p.xz-homeWind*time*.58)*.031;
  float front=smoothstep(.35,.80,ewNoise(moving)+.12*sin(time*.089+p.z*.039-p.x*.052));
  float shelter=max(.76*ewHomeCanopy(p.xz),.85*ewHomeBuildingLee(p.xz));
  float high=smoothstep(6.0,27.0,p.y);
  float squall=clamp(.14+.49*front+.18*high-.16*shelter,0.0,1.0);
  return vec2(squall,shelter);
}
vec3 ewHomeMistColour(float squall){
  return mix(vec3(.536,.557,.566),vec3(.650,.661,.667),squall);
}
vec3 ewHomeSky(vec3 rd,float t){
  float high=smoothstep(-.07,.77,rd.y);
  vec2 plane=rd.xz/(max(rd.y,0.0)+.65);
  float ceiling=ewNoise(plane*2.3+vec2(-3.2,7.7)-homeWind*t*.009);
  float aperture=pow(max(dot(rd,normalize(homeCloudLight)),0.0),5.0);
  vec3 sky=mix(vec3(.618,.634,.643),vec3(.425,.451,.466),high);
  return sky+(.065*aperture-.043*smoothstep(.38,.82,ceiling)*high);
}
vec3 ewHomeAerial(vec3 rgb,vec3 p,float dist,float squall){
  float inBasin=1.0-smoothstep(0.0,31.0,p.y);
  float thickness=.0018+.0038*squall+.0025*inBasin;
  float haze=1.0-exp(-max(0.0,dist-2.6)*thickness);
  return mix(rgb,ewHomeMistColour(squall),haze);
}
// A low body of snow haze hangs in the yard. Integrate only the metres the
// ray actually spends in it, up to its first surface. This gives the gate,
// eaves and snowline different silhouettes from the road and the side paths.
float ewHomeYardHaze(vec3 ro,vec3 rd,float hit){
  const vec3 centre=vec3(.70,.47,65.90);
  const vec3 halfSize=vec3(10.1,2.13,8.55);
  vec3 start=(ro-centre)/halfSize,dir=rd/halfSize;
  float a=dot(dir,dir),b=dot(start,dir),c=dot(start,start)-1.0;
  float discriminant=b*b-a*c;
  if(discriminant<=0.0)return 0.0;
  float root=sqrt(discriminant);
  float nearT=max(0.0,(-b-root)/a),farT=min(hit,(-b+root)/a);
  if(farT<=nearT)return 0.0;
  // Integrate a density that falls to zero at the boundary of the yard.
  float span=farT-nearT;
  vec3 middle=start+dir*(.5*(nearT+farT));
  float density=max(0.0,1.0-dot(middle,middle)-a*span*span/12.0);
  return span*density;
}
vec3 ewHomeFlakeSeed(vec3 p){
  p=fract(p*vec3(.1031,.1030,.0973));
  p+=dot(p,p.yxz+33.33);
  return fract((p.xxy+p.yxx)*p.zyx);
}
vec3 ewHomeSnowStream(vec3 ro,vec3 rd,vec3 rgb,float maximum,float clock,vec2 weather,
    vec2 normal,float spacing,float cellSize,float family){
  float facing=dot(rd.xz,normal);
  float planeWeight=smoothstep(.13,.54,abs(facing));
  if(planeWeight<=0.0)return rgb;
  vec2 tangent=vec2(-normal.y,normal.x);
  vec2 acrossWind=vec2(-homeWind.y,homeWind.x);
  float phase=clock*.67+family*1.61;
  float forward=clock*(.53+.14*family)+.47*sin(phase);
  float crosswind=.25*sin(clock*.94+family*2.3);
  float fall=.71+.22*family;
  vec2 transport=homeWind*forward+acrossWind*crosswind;
  vec3 origin=ro-vec3(transport.x,-clock*fall,transport.y);
  float speed=.53+.14*family+.315*cos(phase);
  vec3 fallAxis=normalize(vec3(homeWind.x*speed,-fall,homeWind.y*speed));
  // Intersect the advecting world planes directly. A flake keeps its tile,
  // depth and speed as the eye moves; the second crossed stream covers
  // glancing bearings where the first stream's planes recede edge-on.
  float base=dot(origin.xz,normal)/spacing;
  float nearPlane=base+facing*.30/spacing;
  float advance=sign(facing);
  float plane=facing>0.0?floor(nearPlane)+1.0:ceil(nearPlane)-1.0;
  float interval=spacing/abs(facing);
  float metres=(plane-base)*spacing/facing;
  float density=mix(.46,.88,weather.x)*(1.0-.57*weather.y);
  for(int i=0;i<6;i++,plane+=advance,metres+=interval){
    if(metres>maximum+.10)break;
    vec3 onPlane=origin+rd*metres;
    vec2 field=vec2(dot(onPlane.xz,tangent),onPlane.y)/cellSize;
    vec3 seed=ewHomeFlakeSeed(vec3(floor(field)+family*17.31,plane));
    float present=1.0-smoothstep(density-.14,density+.10,seed.z);
    if(present<.001)continue;
    float tumble=sin(clock*(2.1+seed.x)+seed.y*6.2831853);
    vec2 spot=mix(vec2(.22),vec2(.78),seed.xy)+vec2(.035,.023)*tumble;
    vec2 local=(spot-fract(field))*cellSize;
    // Restrict the footprint to its tile at grazing angles. This keeps
    // continuous flake edges without neighbouring-cell tests per pixel.
    float radius=mix(.012,.036,seed.x*seed.x)+min(.017,metres*.0012);
    radius*=mix(.72,1.16,abs(tumble));
    vec2 edge=min(spot,1.0-spot);
    radius=min(radius,cellSize*min(edge.x,edge.y)/1.82);
    if(max(abs(local.x),abs(local.y))>radius*1.82)continue;
    vec3 offset=vec3(tangent.x*local.x,local.y,tangent.y*local.x);
    float along=dot(offset,rd);
    float at=metres+along;
    if(at>=maximum-.014)continue;
    vec3 radial=offset-rd*along;
    float elongation=dot(radial,fallAxis);
    float distanceM=sqrt(max(0.0,dot(radial,radial)-elongation*elongation*.47));
    float body=1.0-smoothstep(radius*.29,radius,distanceM);
    float nearFade=smoothstep(.42,1.20,at);
    float farFade=1.0-smoothstep(7.0,18.6,at);
    float obstruction=smoothstep(.014,.095,maximum-at);
    float alpha=body*present*planeWeight*nearFade*farFade*obstruction;
    if(alpha<.001)continue;
    // Keep the motion large enough for the acquisition cells to follow.
    // The finer distant snow becomes the existing aerial haze.
    // In diffuse overcast light the flakes brighten dark surfaces and
    // disappear against the bright sky. Lowering a near-white background
    // would engrave isolated black blocks into the final dither.
    float scatter=mix(.72,.89,seed.y);
    vec3 scattered=vec3(scatter*.983,scatter,scatter*1.011);
    rgb+=max(vec3(0.0),scattered-rgb)*alpha*(.53-.23*uCalm);
  }
  return rgb;
}
vec3 ewHomeFallingSnow(vec3 ro,vec3 rd,vec3 rgb,float hit,float t,vec2 weather){
  // The close depth includes the pane, while the room keeps its actual
  // acquisition depth. Flakes never pass through a nearer solid or window.
  float maximum=min(18.7,hit>0.0?hit:18.7);
  float clock=t*(1.0-uCalm);
  rgb=ewHomeSnowStream(ro,rd,rgb,maximum,clock,weather,vec2(.793,.609),3.25,.48,0.0);
  return ewHomeSnowStream(ro,rd,rgb,maximum,clock,weather,vec2(-.609,.793),3.72,.54,1.0);
}
// The drift layer belongs to the struck ground plane. It fades up under
// exposed gusts and leaves lee walls, interiors and the tree line quiet.
vec3 ewHomeSpindrift(vec3 rgb,vec3 p,vec3 rd,float distanceM,float t,vec2 weather){
  if(distanceM>42.0||uCalm>.5)return rgb;
  vec2 windSpace=vec2(dot(p.xz,homeWind),dot(p.xz,vec2(-homeWind.y,homeWind.x)));
  float ribbon=ewNoise(windSpace*vec2(.105,.83)-vec2(t*.38,0.0));
  float veil=smoothstep(.55,.82,ribbon)*smoothstep(.25,.71,weather.x)*(1.0-weather.y);
  veil*=smoothstep(2.8,8.0,distanceM)*(1.0-smoothstep(25.0,42.0,distanceM))
    *(1.0-smoothstep(.11,.46,abs(rd.y)));
  return mix(rgb,ewHomeMistColour(weather.x),veil*.25);
}
`;
