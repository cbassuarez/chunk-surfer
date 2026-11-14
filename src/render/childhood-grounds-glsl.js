import { HOME_APPROACH_POLES, HOME_APPROACH_TREES, HOME_LANE, HOME_SERVICE_FIXING } from '../data/childhood-grounds.js';
import { HOME_VALLEY_ROADS } from '../data/childhood-valley.js';
import { HOME_COMMONS_DRAINAGE } from '../data/childhood-valley-works.js';
import { HOME_MOUNTAIN_TRAILS } from '../data/childhood-valley-trail.js';

const f = (n) => Number.isInteger(n) ? n + '.0' : String(n);
const v = (values) => 'vec3(' + values.map(f).join(',') + ')';
const mixPoint = (a, b, t) => a.map((component, axis) => component + t * (b[axis] - component));
const offsetPoint = (p, dx, dy, dz) => [p[0] + dx, p[1] + dy, p[2] + dz];
// The lane tree lost its old leader and grew back to one side. The yard
// tree was left to spread, with two competing leaders and a gap above the lane.
const bareCrowns = {
  'lane-tree': {
    stem: [[0,-.13,0], [0,.632,0], [-.019,.75,.016], [-.049,.83,.028]],
    radii: [1,.68,.42,.25],
    limbs: [
      [1,.25,[-.106,.745,-.046],[-.318,.85,-.113],1.10,.82,1],
      [1,.51,[.080,.755,.067],[.228,.94,.190],.80,.24,-1],
      [1,.80,[-.030,.75,.155],[-.125,.92,.270],.73,.58,1],
      [2,.16,[-.136,.84,.017],[-.215,1.00,.107],.62,.29,-1],
      [2,.65,[.018,.85,-.052],[.065,1.00,-.147],.50,0,1],
    ],
    fracture: [[-.049,.83,.028],[-.069,.852,.026],[-.045,.843,.044]],
  },
  'yard-tree': {
    stem: [[0,-.09,0], [0,.448,0], [-.022,.57,.021], [.015,.77,.030], [-.012,.969,.043]],
    radii: [1,.80,.52,.31,.065],
    limbs: [
      [1,.13,[-.139,.503,-.031],[-.326,.64,-.072],1.30,.82,1],
      [1,.35,[.136,.503,.089],[.312,.625,.190],1.22,.50,-1],
      [1,.57,[-.097,.578,.136],[-.197,.728,.262],.89,.52,-1],
      [1,.82,[.049,.634,-.137],[.161,.824,-.273],.98,.63,1],
      [2,.12,[-.130,.678,-.091],[-.234,.928,-.124],.94,.36,-1],
      [2,.49,[.148,.699,.056],[.246,.957,.102],.88,.59,1],
      [2,.82,[-.069,.794,.104],[-.096,.951,.202],.67,0,1],
      [3,.34,[-.045,.880,-.070],[-.091,1.007,-.151],.49,.34,-1],
    ],
  },
};

function bareLimb(stem, [joint, at, elbow, tip, weight, snow, turn], radius) {
  const root = mixPoint(stem[joint], stem[joint + 1], at);
  const dx = tip[0] - elbow[0], dz = tip[2] - elbow[2];
  const shoulder = mixPoint(root, elbow, .70);
  const diverge = mixPoint(elbow, tip, .43);
  const end = offsetPoint(mixPoint(elbow, tip, .87), -dz * turn * .66, .087, dx * turn * .66);
  const forkElbow = offsetPoint(mixPoint(shoulder, elbow, .83), dz * turn * .32, .044, -dx * turn * .32);
  const fork = offsetPoint(mixPoint(elbow, tip, .49), dz * turn * .57, .127, -dx * turn * .57);
  const forkTip = offsetPoint(mixPoint(shoulder, forkElbow, .77), dz * turn * .78, .119, -dx * turn * .78);
  const twigRoot = mixPoint(diverge, end, .58);
  const twigTip = offsetPoint(mixPoint(diverge, end, .78), -dz * turn * .15, .051, dx * turn * .15);
  const twigTop = offsetPoint(mixPoint(elbow, tip, .77), dz * turn * .26, .066, -dx * turn * .26);
  const girth = radius * weight;
  return [
    [root, shoulder, girth * .65, girth * .42, snow * .52],
    [shoulder, elbow, girth * .42, girth * .30, snow],
    [elbow, diverge, girth * .30, girth * .19, snow * .82],
    [diverge, tip, girth * .19, girth * .039, snow * .27],
    [diverge, end, girth * .16, girth * .029, snow * .20],
    [shoulder, forkElbow, girth * .235, girth * .138, snow * .37],
    [forkElbow, fork, girth * .138, girth * .030, snow * .14],
    [forkElbow, forkTip, girth * .104, girth * .025, 0],
    [twigRoot, twigTip, girth * .081, girth * .023, 0],
    [mixPoint(elbow, tip, .62), twigTop, girth * .086, girth * .025, 0],
  ];
}

const treeNumber = (value) => f(Math.round(value * 1e5) / 1e5);
const treeVector = (values) => `vec3(${values.map(treeNumber).join(',')})`;
const emitBareSegment = ([a,b,r0,r1,snow]) =>
  `ewBareLimb(q,${treeVector(a)},${treeVector(b)},vec3(${[r0,r1,snow].map(treeNumber).join(',')}),d,material);`;
function woodBounds(segments) {
  const lo = [0,1,2].map((axis) => Math.min(...segments.map(([a,b,r0,r1]) =>
    Math.min(a[axis] - r0, b[axis] - r1))));
  const hi = [0,1,2].map((axis) => Math.max(...segments.map(([a,b,r0,r1]) =>
    Math.max(a[axis] + r0, b[axis] + r1))));
  return {
    center: lo.map((minimum, axis) => (hi[axis] + minimum) * .5),
    half: lo.map((minimum, axis) => (hi[axis] - minimum) * .5 + .14),
  };
}
function emitBough(segments) {
  const {center,half} = woodBounds(segments);
  return `      b=ewBox(q-${treeVector(center)},${treeVector(half)});
      if(b>.16)d=min(d,b);
      else if(b<max(d,0.0)){
        ${segments.map(emitBareSegment).join('\n        ')}
      }`;
}
function crown({ id, x, z, base, height, radius, side }) {
  const { stem, radii, limbs, fracture } = bareCrowns[id];
  const scale = ([a,b,...sections]) => [a.map(n=>n*height), b.map(n=>n*height), ...sections];
  const core = stem.slice(1).map((tip,index) =>
    scale([stem[index],tip,radius*radii[index],radius*radii[index+1],0]));
  if(fracture) {
    core.push(scale([fracture[0],fracture[1],radius*.165,radius*.023,0]),
      scale([fracture[0],fracture[2],radius*.19,radius*.018,0]));
  }
  const boughs = limbs.map(limb => bareLimb(stem, limb, radius).map(scale));
  const {center,half} = woodBounds([...core,...boughs.flat()]);
  half[0]+=.085;half[2]+=.085;
  return `  {
    vec3 q=p-${v([x,base,z])};
    float b=ewBox(q-${treeVector(center)},${treeVector(half)});
    if(b>.20)d=min(d,b);
    else if(b<max(d,0.0)){
      q.xz-=ewBareWind(q,${f(height)},t,${f(side)});
      ${core.map(emitBareSegment).join('\n      ')}
${boughs.map(emitBough).join('\n')}
    }
  }`;
}
const [near, field, house] = HOME_APPROACH_POLES;
const fixing = (pole, offset) => [pole.x + offset, pole.top - .19, pole.z];
const spans = [-.39, .39].flatMap(offset => [
  [fixing(near, offset), fixing(field, offset), 1.08],
  [fixing(field, offset), fixing(house, offset), 1.26],
]);
spans.push([fixing(house, .39), [HOME_SERVICE_FIXING.x, HOME_SERVICE_FIXING.y, HOME_SERVICE_FIXING.z], .62]);

const vec2=([x,z])=>`vec2(${f(x)},${f(z)})`;
const roadLines = (paths) => paths.flatMap(({width,points}) =>
  points.slice(1).map((point,i)=>`  road=min(road,ewHomeRoadDistance(p,${vec2(points[i])},${vec2(point)})/${f(width)});`));
const {channel: commonsChannel, catchpit: commonsCatchpit}=HOME_COMMONS_DRAINAGE;
// Snow tongues follow the shallow drains below the timber-track shoulder,
// springhead and upper saddle. Width is half the settled tongue in metres.
const snowRunnels = [
  { width:1.4, points:[[-56,121],[-52.6,120.2],[-48.4,119.4],[-44.5,117.8]] },
  { width:1.0, points:[[-58,114],[-54.8,112.3],[-50.7,111.4],[-46.6,111.9],[-41.8,111.9]] },
  { width:.85, points:[[-46.1,103.1],[-42.9,101.9],[-38.5,101.9],[-34.4,103.0]] },
  { width:1.1, points:[[-63.1,104.5],[-62.2,100.6],[-61.7,97.1],[-60.2,92.2]] },
  { width:1.3, points:[[-68.4,131.4],[-66.1,135.9],[-62.6,138.1],[-57.2,141.6]] },
];

export const CHILDHOOD_GROUNDS_GLSL = `
float ewHomeWire(vec3 p,vec3 a,vec3 b,float sag){
  vec3 axis=b-a;
  float u=clamp(dot(p-a,axis)/dot(axis,axis),0.0,1.0);
  vec3 cable=mix(a,b,u)-vec3(0.0,sag*4.0*u*(1.0-u),0.0);
  return (length(p-cable)-.037)*.77;
}
float ewHomeServiceLine(vec3 p){
  float d=ewBox(p-vec3(-2.8,3.23,40.0),vec3(2.7,3.55,30.1));
  if(d>.40)return d;
  d=1e5;
${HOME_APPROACH_POLES.map(({x,z,base,top,radius})=>`  {
    vec3 q=p-${v([x,(base+top)/2,z])};
    vec2 cylinder=vec2(length(q.xz)-${f(radius)},abs(q.y)-${f((top-base)/2)});
    float pole=length(max(cylinder,0.0))+min(0.0,max(cylinder.x,cylinder.y));
    float arm=ewBox(p-${v([x,top-.31,z])},vec3(.55,.055,.073));
    vec3 peg=p-${v([x,top-.21,z])};
    peg.x=abs(peg.x)-.39;
    float insulator=ewBox(peg,vec3(.046,.082,.045));
    d=min(d,min(pole,min(arm,insulator)));
  }`).join('\n')}
${spans.map(([a,b,sag])=>`  d=min(d,ewHomeWire(p,${v(a)},${v(b)},${f(sag)}));`).join('\n')}
  return d;
}

vec2 ewBareWind(vec3 p,float height,float t,float phase){
  float crown=smoothstep(height*.42,height*.99,p.y);
  if(crown<=0.0||uCalm>.5)return vec2(0.0);
  float gust=sin(t*.88+phase*.85)+.31*sin(t*1.63+phase*1.44);
  float flex=sin(t*1.77+dot(p.xz,vec2(.77,-.64))+phase);
  vec2 across=vec2(-homeWind.y,homeWind.x);
  return crown*crown*(homeWind*gust*.043+across*flex*.016);
}
void ewBareLimb(vec3 p,vec3 a,vec3 b,vec3 profile,inout float d,inout float material){
  vec3 axis=b-a,q=p-a;
  float u=clamp(dot(q,axis)/dot(axis,axis),0.0,1.0);
  vec3 radial=q-axis*u;
  float width=mix(profile.x,profile.y,u);
  float wood=(length(radial)-width)*.82;
  if(wood<d){d=wood;material=88.0;}
  if(profile.z<.075)return;
  // A shallow saddle rests on the upper bark and ends before the twig.
  // Selected forks carry more on their lee; the bare tips can flex freely.
  float held=profile.z*(1.0-smoothstep(.75,1.0,abs(u-.44)*2.58));
  vec2 lee=homeWind*(.015*held);
  vec3 skin=radial-vec3(lee.x,width*.25+.006,lee.y);
  skin.y*=1.30;
  float drift=max(length(skin)-width*(.84+.21*held)-held*.024,width*.17-radial.y)*.72;
  if(drift<d){d=drift;material=89.0;}
}
float ewHomeTrees(vec3 p,float limit,out float material,float t){
  float d=limit;material=88.0;
${HOME_APPROACH_TREES.map(crown).join('\n')}
  return d;
}
vec3 ewHomeApproachTreeAlbedo(vec3 p,vec3 n,float material,float dist){
  float mottling=ewNoise(p.xz*3.5+vec2(p.y*.29,-p.y*.28));
  if(material>88.5){
    float lit=smoothstep(-.3,.82,n.y);
    return mix(vec3(.484,.540,.565),vec3(.701,.747,.752),lit*.81+mottling*.19);
  }
  float groove=ewNoise(vec2(dot(p.xz,vec2(11.0,17.6)),p.y*.86));
  float grain=(1.0-smoothstep(5.0,19.0,dist))*(groove-.5);
  float ridge=clamp(.16+.61*mottling+.32*grain,0.0,1.0);
  return mix(vec3(.114,.107,.092),vec3(.283,.258,.213),ridge);
}

float ewHomeRoadDistance(vec2 p,vec2 a,vec2 b){
  vec2 d=b-a,q=p-a;
  return length(q-d*clamp(dot(q,d)/dot(d,d),0.0,1.0));
}
float ewHomeValleyRoads(vec2 p){
  float road=1e5;
${roadLines(HOME_VALLEY_ROADS).join('\n')}
  return road;
}
float ewHomeTimberTracks(vec2 p){
  float road=1e5;
${roadLines(HOME_MOUNTAIN_TRAILS).join('\n')}
  return road;
}

float ewHomeSnowRunnels(vec2 p){
  float road=1e5;
${snowRunnels.map((run)=>{
  const xs=run.points.map(([x])=>x), zs=run.points.map(([,z])=>z);
  const x0=Math.min(...xs)-run.width*1.7, x1=Math.max(...xs)+run.width*1.7;
  const z0=Math.min(...zs)-run.width*1.7, z1=Math.max(...zs)+run.width*1.7;
  return `  if(p.x>${f(x0)}&&p.x<${f(x1)}&&p.y>${f(z0)}&&p.y<${f(z1)}){\n${roadLines([run]).join('\n')}\n  }`;
}).join('\n')}
  return road;
}

float ewHomeSnowRampSlope(float low,float high,float value){
  float t=clamp((value-low)/(high-low),0.0,1.0);
  return 6.0*t*(1.0-t)/(high-low);
}

vec3 ewHomeAlpineGround(vec3 albedo,vec3 p,inout vec3 n,float dist,float canopy,float lee,vec3 powder){
  // Rock sheets cross the hillside obliquely. Their fractured faces follow
  // stone bedding through elevation as the hillside turns underneath them.
  vec2 strata=vec2(dot(p.xz,vec2(.86,-.51)),p.y+dot(p.xz,vec2(.18,.34)));
  float slabVariation=ewNoise(strata*vec2(.13,.20));
  float driftBreak=ewNoise(strata*vec2(.83,.67)+vec2(13.0,7.0));
  float approach=smoothstep(82.0,92.0,p.z)*(1.0-smoothstep(-31.0,-23.0,p.x))
    *(1.0-smoothstep(78.0,110.0,dist));
  float windward=smoothstep(.05,.43,-dot(n.xz,homeWind))*(1.0-.70*canopy)*(1.0-.62*lee);
  float bank=smoothstep(.06,.46,length(n.xz));
  float sheets=smoothstep(.34,.67,slabVariation*.79+driftBreak*.21+.25*windward+.15*bank);
  float trough=1.0-smoothstep(.38,1.12,ewHomeSnowRunnels(p.xz)+.28*(driftBreak-.5));
  float exposure=approach*sheets*(.34+.47*windward+.43*bank)*(1.0-.94*trough);
  exposure=min(exposure,.94);

  // Frost broken along the bedding gives a broad step of darker scree below
  // pale, warm-grey stone. The short joints soften past inspection range.
  float jointDetail=1.0-smoothstep(6.0,26.0,dist);
  vec2 courses=strata*vec2(.71,1.12);
  courses.y+=.27*(slabVariation-.5)+.14*(driftBreak-.5);
  float course=floor(courses.y);
  float bed=fract(courses.y), joint=abs(fract(courses.x+.38*course)-.5);
  float ledge=smoothstep(.10,.19,bed)*(1.0-smoothstep(.71,.88,bed));
  float fractures=smoothstep(.40,.48,joint)*smoothstep(.24,.73,driftBreak);
  vec3 stone=mix(vec3(.27,.286,.292),vec3(.49,.48,.44),.23+.65*driftBreak);
  stone*=.89+.22*ledge*(.58+.42*jointDetail)-.13*fractures*jointDetail;
  // Give the broad exposed faces a shallow bevel in their lighting only.
  // This leaves the original walking surface and every tree root in place.
  float facet=(ewHomeSnowRampSlope(.10,.19,bed)-ewHomeSnowRampSlope(.71,.88,bed))*.023;
  vec3 gradient=vec3(.18,1.0,.34);
  n=normalize(n-(gradient-n*dot(n,gradient))*facet*exposure*jointDetail);
  albedo=mix(albedo,stone,exposure);
  albedo=mix(albedo,powder*mix(vec3(.79,.83,.87),vec3(1.0),driftBreak),trough*approach*.84);

  float track=ewHomeTimberTracks(p.xz);
  float roughWidth=.36*(driftBreak-.5)+.18*(slabVariation-.5);
  float worn=1.0-smoothstep(.43,1.09,track+roughWidth);
  float windblown=trough*(1.0-smoothstep(.05,.74,windward));
  vec3 tread=mix(vec3(.238,.252,.257),vec3(.495,.511,.523),driftBreak);
  tread=mix(tread,powder,windblown*.49);
  return mix(albedo,tread,worn*approach*(.79-.24*windblown));
}

// The distance and its gradient are in boot coordinates. A continuous
// instep joins the two loaded parts of the sole without making them equally deep.
vec3 ewHomeSolePart(vec2 p,vec2 size){
  vec2 q=p/size;
  float radius=max(.001,length(q));
  return vec3(radius-1.0,q/(radius*size));
}
vec3 ewHomeSoleJoin(vec3 a,vec3 b){
  float h=clamp(.5+.5*(b.x-a.x)/.25,0.0,1.0);
  return vec3(mix(b.x,a.x,h)-.25*h*(1.0-h),mix(b.yz,a.yz,h));
}
// Height in metres, planar slope, and packed floor coverage. At the wall
// a little broken powder piles up on the windward side of the old impression.
vec4 ewHomeFootRelief(vec2 delta,vec2 forward,float side,float powder,float detail){
  vec2 right=vec2(forward.y,-forward.x);
  vec2 sole=vec2(dot(delta,right),dot(delta,forward));
  vec3 toe=ewHomeSolePart(sole-vec2(side*.009,.054),vec2(.067,.105));
  vec3 heel=ewHomeSolePart(sole-vec2(-side*.006,-.075),vec2(.049,.072));
  vec3 arch=ewHomeSolePart(sole-vec2(-side*.011,-.016),vec2(.040,.078));
  vec3 shape=ewHomeSoleJoin(ewHomeSoleJoin(toe,heel),arch);
  float crumbs=ewNoise(sole*vec2(57.0,45.0));
  float breakage=ewNoise((delta+sole)*vec2(37.0,29.0)+vec2(side*3.0,0.0));
  float d=shape.x+((crumbs-.5)*.14+(breakage-.5)*.13)*detail;
  float packed=1.0-smoothstep(-.43,.015,d);
  float inner=1.0-smoothstep(-.12,.10,d);
  float outer=1.0-smoothstep(.10,.43,d);
  float rim=outer*(1.0-inner);
  float rimSlope=outer*ewHomeSnowRampSlope(-.12,.10,d)
    -(1.0-inner)*ewHomeSnowRampSlope(.10,.43,d);
  float windward=smoothstep(-.55,.72,dot(delta,homeWind)/max(.025,length(delta)));
  float loading=smoothstep(.008,.080,abs(sole.y+.013));
  float depth=mix(.012,.032,loading)*mix(.73,1.0,powder);
  float lifted=mix(.0008,.012,windward)*mix(.44,1.0,smoothstep(.24,.74,breakage));
  float height=-depth*packed+lifted*rim;
  float gradient=depth*ewHomeSnowRampSlope(-.43,.015,d)+lifted*rimSlope;
  vec2 slope=(right*shape.y+forward*shape.z)*gradient;
  float compressed=packed*mix(.42,1.0,loading)*mix(.78,1.0,crumbs);
  return vec4(height,slope,compressed);
}
vec3 ewHomeRememberedSteps(vec3 albedo,vec3 p,inout vec3 n,vec3 rd,float dist,float powder,out float shelter){
  shelter=0.0;
  float strength=uHomeOldv.x*(1.0-smoothstep(5.5,11.0,dist))*smoothstep(.63,.87,n.y);
  if(strength<.001||any(greaterThan(abs(p.xz-uHomeOldv.zw),vec2(10.0))))return albedo;
  float detail=1.0-smoothstep(2.5,6.0,dist);
  vec4 relief=vec4(0.0);
  for(int i=0;i<16;i++){
    vec4 footfall=uHomeOldvSteps[i];
    vec2 delta=p.xz-footfall.xy;
    if(abs(footfall.w)<.5||dot(delta,delta)>.0676)continue;
    vec2 forward=vec2(sin(footfall.z),cos(footfall.z));
    vec4 sampleRelief=ewHomeFootRelief(delta,forward,footfall.w,powder,detail);
    if(detail>.001&&abs(sampleRelief.x)>.001){
      // Approximate the view into the shallow cavity without moving the
      // saved contact point or adding another world raymarch.
      float rayDepth=max(.33,-dot(rd,n));
      vec2 shift=rd.xz*clamp(-sampleRelief.x/rayDepth,-.019,.042)*detail;
      sampleRelief=ewHomeFootRelief(delta+shift,forward,footfall.w,powder,detail);
    }
    if(sampleRelief.x<relief.x||(relief.x>=0.0&&sampleRelief.x>relief.x))relief=sampleRelief;
  }
  float floorPack=relief.w*strength;
  n=normalize(n-vec3(relief.y,0.0,relief.z)*strength*max(n.y,.4));
  shelter=floorPack*.09;
  float compact=mix(.97,.88,powder);
  vec3 compacted=albedo*compact*vec3(.972,.99,1.006);
  vec3 looseSnow=albedo+vec3(.040,.043,.044)*smoothstep(.001,.009,relief.x)*strength;
  return mix(looseSnow,compacted,floorPack);
}

vec3 ewHomeGroundAlbedo(vec3 p,inout vec3 n,vec3 rd,float dist,out float shelter){
  vec2 acrossWind=vec2(-homeWind.y,homeWind.x);
  vec2 deposit=vec2(dot(p.xz,homeWind),dot(p.xz,acrossWind));
  float detail=1.0-smoothstep(5.0,25.0,dist);
  float snow=ewNoise(deposit*vec2(.33,.92));
  float ridges=ewNoise(deposit*vec2(.61,1.63)+vec2(snow*.85,0.0));
  float grain=ewNoise(deposit*vec2(2.4,3.1));
  float lee=ewHomeBuildingLee(p.xz);
  float canopy=ewHomeCanopy(p.xz);
  float slopeAway=dot(n.xz,homeWind);
  float exposed=smoothstep(.025,.30,-slopeAway)*(1.0-lee);
  float comb=ewNoise(deposit*vec2(.74,2.45));
  vec2 unused;
  float plough=ewHomePloughBank(p.xz,unused);
  float pile=ewHomePiledSnow(p.xz,unused);
  float deposits=smoothstep(.25,.75,.54*snow+.31*ridges+.13*comb+.27*lee-.31*exposed);
  deposits=max(deposits,smoothstep(.018,.33,pile)*.95);
  // Old wind crust is cold and granular, with spatially stable, broad powder
  // tongues over it. Cleared surfaces below can interrupt both layers.
  vec3 crust=vec3(.399,.424,.437), powder=vec3(.684,.706,.714);
  vec3 albedo=mix(crust,powder,deposits)*(.91+.09*clamp(n.y,0.0,1.0));
  albedo*=1.0+detail*(.055*(grain-.5)+.10*(comb-.5));
  albedo=mix(albedo,vec3(.40,.424,.430),.17*canopy*(1.0-deposits));
  float roadX=p.x-${f(HOME_LANE.wave)}*sin(p.z*${f(HOME_LANE.rate)});
  float shoulder=1.0-smoothstep(1.03,${f(HOME_LANE.shoulder)},abs(roadX)+(ewNoise(p.xz*.73)-.5)*.26);
  float lane=shoulder*(1.0-smoothstep(58.0,65.0,p.z));
  float rut=1.0-smoothstep(.08,.27,abs(abs(roadX)-${f(HOME_LANE.track)}));
  float scour=smoothstep(.24,.71,ewNoise(vec2(p.x*2.0,p.z*.40))+.13*exposed-.12*lee);
  float dusting=smoothstep(.43,.76,.68*ridges+.32*snow-.28*exposed+.10*lee)*(1.0-.80*rut);
  vec3 packed=mix(vec3(.440,.463,.477),vec3(.245,.267,.273),(.32+.63*rut)*scour);
  packed=mix(packed,albedo,dusting*.57);
  float wallLee=smoothstep(${f(HOME_LANE.leeStart)},${f(HOME_LANE.leeStart+6)},p.z)
    *(1.0-smoothstep(${f(HOME_LANE.leeEnd-6)},${f(HOME_LANE.leeEnd)},p.z));
  float verge=(1.0-smoothstep(.40,${f(HOME_LANE.leeWidth)},abs(p.x-${f(HOME_LANE.leeX)})+(snow-.5)*.26))*wallLee;
  albedo=mix(albedo,vec3(.36,.376,.381)*(.94+.12*snow),verge*.64);
  if(dist<105.0){
    float valley=ewHomeValleyRoads(p.xz);
    float brushed=(1.0-smoothstep(.57,1.20,valley+(snow-.5)*.24))*(1.0-smoothstep(56.0,105.0,dist));
    float tracks=(1.0-smoothstep(.065,.19,abs(valley-.44)))*scour;
    vec3 road=mix(vec3(.420,.436,.443),vec3(.248,.257,.254),tracks*.90);
    albedo=mix(albedo,road,brushed*(.92-.27*dusting));
  }
  if(p.x>-24.0&&p.x<-12.0&&p.z>50.4&&p.z<55.1){
    // Plough wear exposes the compacted carriage surface. Its uphill edge
    // meets the setts, with the soft pushed ridge on the unploughed side.
    float run=(smoothstep(-24.0,-21.8,p.x)*(1.0-smoothstep(-13.0,-12.0,p.x)));
    float north=54.27+.082*sin((p.x+22.0)*.39);
    float edge=p.z-north;
    float laid=run*smoothstep(50.4,52.05,p.z)*(1.0-smoothstep(-.31,.17,edge));
    float chips=ewNoise(p.xz*6.3);
    vec3 road=mix(vec3(.318,.335,.341),vec3(.426,.446,.453),chips);
    albedo=mix(albedo,road,laid*(.86-.24*deposits));
    float drainLead=ewHomeRoadDistance(p.xz,vec2(${f(commonsCatchpit.x)},${f(commonsCatchpit.z-.17)}),
      vec2(${f(commonsChannel.x-.52)},${f(commonsCatchpit.z-.63)}));
    albedo=mix(albedo,vec3(.284,.313,.323),(1.0-smoothstep(.06,.20,drainLead))*.63);
  }
  if(p.x<-23.0&&p.z>82.0&&dist<110.0)albedo=ewHomeAlpineGround(albedo,p,n,dist,canopy,lee,powder);
  albedo=mix(albedo,packed,lane*(.91-.29*deposits)*(1.0-smoothstep(35.0,85.0,dist)));
  // Crest powder is lighter than the compacted plough cut. Break the dirty
  // edge with buried grit and a few broad scoured faces.
  float bankCover=smoothstep(.008,.093,plough);
  if(bankCover>.001){
    float scrape=smoothstep(.07,.68,-sign(roadX)*n.x);
    float cuts=ewNoise(vec2(p.z*.47,abs(roadX)*4.6));
    float crustBreak=smoothstep(.30,.77,.52*cuts+.35*comb+.25*scrape);
    vec3 cleanSnow=mix(vec3(.565,.594,.609),powder,smoothstep(.29,.69,ridges));
    vec3 cutSnow=mix(cleanSnow,vec3(.465,.478,.484),scrape*crustBreak*.74);
    albedo=mix(albedo,cutSnow,bankCover);
  }
  // A few old footfalls lead off the lane to the near clearing. Their
  // packed centres are partly filled in, distinct from the fresh impression.
  if(p.x>-9.5&&p.x<-4.0&&p.z>12.1&&p.z<15.1&&dist<15.0){
    vec2 trail=vec2(-p.x-4.05,p.z-13.35-(p.x+6.0)*.095);
    float stepIndex=floor(trail.x/.63);
    vec2 shoe=vec2(mod(trail.x,.63)-.31,trail.y-(mod(stepIndex,2.0)-.5)*.33);
    float shape=length(shoe/vec2(.156,.069));
    float trace=(1.0-smoothstep(.40,1.19,shape))*(.48+.31*snow)
      *(1.0-smoothstep(8.0,15.0,dist));
    albedo*=1.0-.30*trace;
  }
  float impression=ewHomeAngelShape(p.xz);
  // The pressed centre has a colder value. A raised powder rim follows
  // the actual swept silhouette, fading before it becomes distant noise.
  float shifted=ewHomeAngelShape(p.xz-homeWind*.075);
  float rim=max(0.0,shifted-impression);
  albedo=mix(albedo,albedo*(1.0-.37*impression)+rim*.10,1.0-smoothstep(11.0,24.0,dist));
  // Pressure is derived from the same retained contacts, including where a
  // thin scoured road crosses a deeper stretch of snow.
  return ewHomeRememberedSteps(albedo,p,n,rd,dist,deposits,shelter);
}

vec3 ewHomeStoneAlbedo(vec3 p,vec3 n){
  vec2 uv=vec2(abs(n.x)>.5?p.z:p.x,p.y);
  float course=floor(uv.y/.28),offset=mod(course,2.0)*.37;
  vec2 joint=abs(fract(vec2((uv.x+offset)/.74,uv.y/.28))-.5);
  float seam=smoothstep(.40,.48,max(joint.x,joint.y));
  vec2 cell=floor(vec2((uv.x+offset)/.74,uv.y/.28));
  float tone=ewHash(cell)*.15+ewNoise(p.xz*4.7)*.12;
  vec3 rock=mix(vec3(.37,.395,.41),vec3(.12,.145,.16),seam)*(1.0+tone);
  float cap=smoothstep(.46,.86,n.y)*(.52+.48*ewNoise(p.xz*3.5));
  return mix(rock,vec3(.61,.69,.74),cap);
}
`;
