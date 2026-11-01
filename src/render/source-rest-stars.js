// A fixed procedural celestial sphere, not a catalogue, particle emitter or
// camera overlay. One angular-cell lookup supplies varied stellar magnitudes.
// The ordinary Source acquisition still owns the marks and final display.
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0)),fract=n=>n-Math.floor(n),
  smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);},
  unit=v=>{const length=Math.hypot(...v);return length>0&&Number.isFinite(length)?v.map(n=>n/length):[0,1,0];},
  dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),NORMAL=unit([.18,.63,.70]),GRID=88;
const hash=cell=>[0,41.3,93.7].map(offset=>fract(Math.sin(cell[0]*127.1+cell[1]*311.7+offset)*43758.5453));

/** CPU coordinate reference. No eye position or camera frame participates. */
export function sourceRestStarCoordinates(direction){
  const ray=unit(direction),a=ray.map(Math.abs);let uv,face,major;
  if(a[0]>=a[1]&&a[0]>=a[2]){major=a[0];uv=[ray[2]/major,ray[1]/major];face=ray[0]>=0?0:1;}
  else if(a[1]>=a[2]){major=a[1];uv=[ray[0]/major,ray[2]/major];face=ray[1]>=0?2:3;}
  else{major=a[2];uv=[ray[0]/major,ray[1]/major];face=ray[2]>=0?4:5;}
  const p=uv.map(n=>(n*.5+.5)*GRID),cell=p.map(Math.floor),random=hash([cell[0]+face*17.13,cell[1]+face*7.31]),
    center=random.slice(0,2).map(n=>.30+.40*n),magnitude=random[2]**8,selector=fract(random[0]*13.37+random[1]*7.71);
  return{ray,face,major,uv,cell,position:p.map(fract),center,magnitude,selector};
}

/** CPU mirror for optics/ownership tests; GPU hash precision can differ. */
export function sourceRestStarsFrame({ray=[0,1,0],reveal=0,cloudCover=0,stormCover=0,pixelCellWidth=.10}={}){
  const at=sourceRestStarCoordinates(ray),r=clamp(reveal),horizon=smooth(.08,.35,at.ray[1]),
    visibility=horizon*(1-clamp(cloudCover))**2*(1-clamp(stormCover))**2,
    density=(.003+.042*r+.060*at.magnitude)*at.major**3,present=at.selector<=density?1:0,
    radius=.014+.038*at.magnitude,aa=Math.min(.24,Math.max(.001,pixelCellWidth)*.55),
    distance=Math.hypot(...at.position.map((n,i)=>n-at.center[i])),
    core=present*(1-smooth(Math.max(0,radius-aa),radius+aa,distance)),
    latitude=dot(at.ray,NORMAL),curl=.025*Math.sin(dot(at.ray,[.91,-.26,0])*11),
    band=Math.exp(-(((latitude+curl)/.095)**2)),rift=smooth(.010,.040,Math.abs(latitude-.025*Math.sin(dot(at.ray,[.18,.22,-.87])*14))),
    dust=band*(.008+.018*rift)*r*r,
    star=core*(.22+.68*at.magnitude),rgb=[.82,.83,.77].map((n,i)=>(n*star+[.85,.94,1][i]*dust)*visibility);
  return{rgb,visibility,star:star*visibility,dust:dust*visibility,coordinates:at};
}

export const SOURCE_REST_STARS_GLSL=`
vec3 sourceRestStarHash(vec2 cell){
  return fract(sin(dot(cell,vec2(127.1,311.7))+vec3(0.0,41.3,93.7))*43758.5453);
}
vec3 sourceRestStars(vec3 worldRay,float reveal,float cloudCover,float stormCover){
  vec3 ray=normalize(worldRay),a=abs(ray);vec2 angular;float face,major;
  if(a.x>=a.y&&a.x>=a.z){major=a.x;angular=ray.zy/major;face=ray.x>=0.0?0.0:1.0;}
  else if(a.y>=a.z){major=a.y;angular=ray.xz/major;face=ray.y>=0.0?2.0:3.0;}
  else{major=a.z;angular=ray.xy/major;face=ray.z>=0.0?4.0:5.0;}
  vec2 p=(angular*.5+.5)*88.0,cell=floor(p);
  vec3 random=sourceRestStarHash(cell+face*vec2(17.13,7.31));
  float magnitude=random.z*random.z;magnitude*=magnitude;magnitude*=magnitude;
  float seen=clamp(reveal,0.0,1.0),selector=fract(random.x*13.37+random.y*7.71);
  // major^3 compensates the cube projection's solid-angle density. Star
  // centres stay inside their cells; no neighbour searches or hash loops.
  float present=step(selector,(.003+.042*seen+.060*magnitude)*major*major*major);
  vec2 delta=fract(p)-(.30+.40*random.xy);
  float radius=.014+.038*magnitude,aa=min(.24,max(.001,max(fwidth(p).x,fwidth(p).y))*.55);
  float core=present*(1.0-smoothstep(max(0.0,radius-aa),radius+aa,length(delta)));
  float latitude=dot(ray,vec3(${NORMAL.map(n=>n.toFixed(9)).join(',')}));
  float curl=.025*sin(dot(ray,vec3(.91,-.26,0.0))*11.0);
  float bandLatitude=(latitude+curl)/.095,band=exp(-bandLatitude*bandLatitude);
  float rift=smoothstep(.010,.040,abs(latitude-.025*sin(dot(ray,vec3(.18,.22,-.87))*14.0)));
  float dust=band*(.008+.018*rift)*seen*seen;
  float clear=1.0-clamp(cloudCover,0.0,1.0),storm=1.0-clamp(stormCover,0.0,1.0);
  float visibility=smoothstep(.08,.35,ray.y)*clear*clear*storm*storm;
  return (vec3(.82,.83,.77)*core*(.22+.68*magnitude)+vec3(.85,.94,1.0)*dust)*visibility;
}
`;
