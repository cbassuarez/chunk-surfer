import { HOME_APPROACH_POLES, HOME_APPROACH_TREES, HOME_SERVICE_FIXING } from '../data/childhood-grounds.js';
import { HOME_HOUSE } from '../data/childhood-house.js';
import { HOME_VALLEY_SITES } from '../data/childhood-valley.js';
import { HOME_WINDOW } from './realm-pocket-geometry.js';

// THE WALK IN. Crossing the snow door puts him in whiteout. His faculties ask
// what he walked toward, and whatever he names is where the wind parts the
// snow first: torn along the wind, with what stands near it showing through the
// gaps. Whatever that leads to comes next, and the rest arrives last, all at
// once. The things named are the valley's own geometry, read from the same data
// the valley is built from (game/home-arrival.js holds the timing).

const f = (value) => Number(value).toFixed(4);
const v3 = ([x, y, z]) => `vec3(${f(x)},${f(y)},${f(z)})`;

const fixing = (pole) => [pole.x, pole.top - .19, pole.z];
const wireRun = [...HOME_APPROACH_POLES.map(fixing), [HOME_SERVICE_FIXING.x, HOME_SERVICE_FIXING.y, HOME_SERVICE_FIXING.z]];
const roofs = [
  { x0: HOME_HOUSE.x0, x1: HOME_HOUSE.x1, y0: 0, y1: HOME_HOUSE.ridge, z0: HOME_HOUSE.z0, z1: HOME_HOUSE.z1 },
  ...HOME_VALLEY_SITES.flatMap(({ pieces }) => pieces.filter((piece) => piece.id.endsWith('closed-envelope'))),
];
const laneTree = HOME_APPROACH_TREES.find(({ id }) => id === 'lane-tree') || HOME_APPROACH_TREES[0];
const windowPoint = [HOME_WINDOW.x, (HOME_WINDOW.bottom + HOME_WINDOW.top) / 2, HOME_WINDOW.z];

export const HOME_ARRIVAL_GLSL_ANCHORS = Object.freeze({ wireRun, roofs, laneTree, windowPoint });

export const HOME_ARRIVAL_GLSL = `
// x whiteout, y the rest of the valley, z the lane tree, w the lit window.
uniform vec4 uHomeArrival;
// x the power lines, y the houses, z the ridge.
uniform vec4 uHomeArrivalNamed;
float ewHomeArrivalSegment(vec3 p,vec3 a,vec3 b){
  vec3 pa=p-a,ba=b-a;
  return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0));
}
float ewHomeArrivalLines(vec3 p){
  float d=1e5;
${HOME_APPROACH_POLES.map(({ x, z, base, top }) => `  d=min(d,ewHomeArrivalSegment(p,${v3([x, base, z])},${v3([x, top, z])}));`).join('\n')}
${wireRun.slice(1).map((point, i) => `  d=min(d,ewHomeArrivalSegment(p,${v3(wireRun[i])},${v3(point)}));`).join('\n')}
  return d;
}
float ewHomeArrivalRoofs(vec3 p){
  float d=1e5;
${roofs.map(({ x0, x1, y0, y1, z0, z1 }) => `  d=min(d,ewBox(p-${v3([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])},${v3([(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2])}));`).join('\n')}
  return d;
}
float ewHomeArrivalTree(vec3 p){
  return ewHomeArrivalSegment(p,${v3([laneTree.x, laneTree.base, laneTree.z])},${v3([laneTree.x, laneTree.base + laneTree.height, laneTree.z])});
}
// How much of the whiteout is gone at this point: near what he named, in
// streaks that run with the valley's wind; everywhere, once the rest comes in.
float ewHomeArrivalClear(vec3 ro,vec3 rd,float dist,float t){
  bool open=dist>=459.0;
  vec3 p=ro+rd*min(dist,240.0);
  vec2 wind=vec2(dot(p.xz,homeWind),dot(p.xz,vec2(-homeWind.y,homeWind.x)));
  float gust=t*(1.0-uCalm);
  float streak=.62*ewNoise(vec2(wind.x*.050-gust*.42,p.y*1.7+wind.y*.19))
    +.38*ewNoise(vec2(wind.x*.13-gust*.83,p.y*3.9+wind.y*.47)+vec2(7.3,1.9));
  float near=uHomeArrivalNamed.x*(1.0-smoothstep(.35,8.5,ewHomeArrivalLines(p)));
  near=max(near,uHomeArrivalNamed.y*(1.0-smoothstep(.6,11.0,ewHomeArrivalRoofs(p))));
  float ridge=open?1.0-smoothstep(.10,.55,rd.y):smoothstep(60.0,150.0,dist);
  near=max(near,uHomeArrivalNamed.z*ridge);
  near=max(near,uHomeArrival.z*(1.0-smoothstep(.4,6.5,ewHomeArrivalTree(p))));
  near=max(near,uHomeArrival.w*(1.0-smoothstep(.25,4.5,length(p-${v3(windowPoint)}))));
  float named=smoothstep(.28,1.0,near*1.35+(streak-.5)*.85*min(1.0,near*3.0));
  float rest=uHomeArrival.y;
  return max(named,smoothstep(0.0,1.0,rest*1.3+(streak-.5)*.7*min(1.0,rest*4.0)*(1.0-rest)));
}
float ewHomeArrivalWhite(vec3 ro,vec3 rd,float dist,float t){
  if(uHomeArrival.x<=0.0)return 0.0;
  return uHomeArrival.x*(1.0-ewHomeArrivalClear(ro,rd,dist,t));
}
vec3 ewHomeArrivalSnow(vec3 ro,vec3 rd){
  vec3 snow=vec3(.745,.756,.763);
  // Before the window itself is clear of snow, its light already reaches him
  // as a warm smudge in the white, the way a lamp reads through a blizzard.
  float aim=max(0.0,dot(rd,normalize(${v3(windowPoint)}-ro)));
  return snow+vec3(.20,.09,-.02)*pow(aim,700.0)*uHomeArrival.w;
}
`;
