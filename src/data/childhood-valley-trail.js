// Local metres in the same frame as the closed house and the grey door.
// The low road climbs to a shelter used by the people who cut and hauled wood.
// The old uphill track returns via a spring and a separate, exposed shoulder.
import { homeValleyRise, HOME_VALLEY_ROADS } from './childhood-valley.js';
import { homeApproachRise } from './childhood-grounds.js';

export const HOME_MOUNTAIN_BOUNDS = Object.freeze({ x0:-94,x1:-30,z0:75,z1:154,bottom:-7,top:38 });
export const HOME_MOUNTAIN_GRADES = Object.freeze([
  [-73,125,41,51,22.7], [-83,143,23,32,9.5], [-47,114,24,29,4.4],
  [-56,98,20,19,2.25], [-68,130,14,20,3.8],
  // Overlapping shoulders break the smooth hill profile. Low crests run
  // with the prevailing wind and collect snow beside the worn tracks.
  [-49,93,5.3,2.3,.25], [-55,101.8,4.2,2.4,.34], [-54.6,104.7,5.5,2.0,.29],
  [-60.4,111.5,4.2,2.3,.37], [-68,116.7,4.4,2.2,.30], [-70.4,123.5,4.6,2.5,.28],
  [-77.4,126,4.6,2.3,.25], [-69.7,131.2,4.6,2.6,.30], [-59.4,131.2,4.7,2.3,.48],
  [-57.8,123,4.9,2.8,.42], [-46.4,120.5,6.1,2.3,.31], [-44.4,110,4.3,2.6,.25],
  [-37.8,100.2,5.4,2.9,.43],
].map(([x,z,rx,rz,rise])=>Object.freeze({x,z,rx,rz,rise})));
export function homeMountainRise(x,z) {
  return HOME_MOUNTAIN_GRADES.reduce((y,{x:cx,z:cz,rx,rz,rise})=>{
    const k=Math.max(0,1-((x-cx)/rx)**2-((z-cz)/rz)**2);
    return y+rise*k*k;
  },0);
}

export const HOME_MOUNTAIN_TRAILS = Object.freeze([
  { id:'hay-cut', width:1.02, points:[[-25.2,85],[-32,87],[-43,90]] },
  { id:'timber-track', width:.89, points:[[-43,90],[-48,95],[-55,94],[-60,100],[-57,109],[-65,116],[-71,119],[-74,127],[-74,129]] },
  { id:'spring-track', width:.70, points:[[-74,129],[-66,134],[-56,128],[-52,120],[-45,116],[-41,107],[-43,98],[-43,90]] },
  { id:'woodcutters-rest', width:.54, points:[[-57,109],[-61,108],[-64,107]] },
  { id:'spring-spur', width:.51, points:[[-45,116],[-47.4,115.6],[-49.9,114.6]] },
  { id:'lookout-spur', width:.52, points:[[-74,129],[-76.0,129.2],[-78.5,130.0]] },
].map(({points,...path})=>Object.freeze({...path,points:Object.freeze(points.map(Object.freeze))})));

const level=(x,z)=>homeApproachRise(x,z)+homeValleyRise(x,z)+homeMountainRise(x,z);
const point=(id,x0,x1,y0,y1,z0,z1,material,detail={})=>Object.freeze({id,x0,x1,y0,y1,z0,z1,material,...detail});
const site=(id,pieces)=>Object.freeze({id,pieces:Object.freeze(pieces)});
const rest=level(-66,107), spring=level(-51,114.4), lookout=level(-79.5,132.5);
const footing=(x0,x1,z0,z1)=>Math.min(...[x0,x1].flatMap(x=>[z0,z1].map(z=>level(x,z))))-.12;
const restFloor=Math.max(rest+.14,level(-65,106.4)+.11);
export const HOME_MAUL_BLOCK=Object.freeze({x:-66.29,y:restFloor+.50,z:107.48});
const leanRoof=(id,x0,x1,y0,y1,z0,z1,material)=>point(id,x0,x1,y0,y1,z0,z1,material,{shape:'lean-roof',blocking:false});
const trim=(id,x0,x1,y0,y1,z0,z1,material,shape)=>point(id,x0,x1,y0,y1,z0,z1,material,{shape,blocking:false});
export const HOME_MOUNTAIN_SITES=Object.freeze([
  site('timber-rest',[
    point('timber-rest-retaining-foot',-68.60,-65.8,footing(-68.60,-65.8,105.2,108.4),restFloor-.03,105.2,108.4,50),
    point('timber-rest-floor',-68.50,-65.2,restFloor-.12,restFloor,105.2,108.43,51,{blocking:false}),
    point('timber-rest-back',-68.52,-68.32,restFloor,restFloor+2.34,105.19,108.46,51),
    point('timber-rest-end',-68.51,-65.38,restFloor,restFloor+1.95,108.28,108.46,51),
    point('timber-rest-post',-65.39,-65.24,restFloor-.15,restFloor+2.26,105.25,105.42,51),
    trim('timber-rest-lean-to',-68.81,-65.00,restFloor+2.05,restFloor+2.69,104.98,108.71,73,'lean-roof-snow'),
    trim('timber-rest-front-fascia',-65.26,-65.04,restFloor+2.10,restFloor+2.37,105.00,108.66,70),
    trim('timber-rest-front-bearing',-65.52,-65.35,restFloor+2.03,restFloor+2.23,105.23,108.47,70),
    trim('timber-rest-back-bearing',-68.45,-68.28,restFloor+2.31,restFloor+2.53,105.23,108.47,70),
    ...[105.22,105.90,106.61,107.38,108.25].map((z,index)=>
      leanRoof('timber-rest-rafter-'+index,-68.60,-65.10,restFloor+1.96,restFloor+2.50,z-.06,z+.06,70)),
    trim('timber-rest-back-bench',-68.33,-67.82,restFloor+.42,restFloor+.51,105.55,107.33,56),
    trim('timber-rest-bench-leg',-68.27,-67.94,restFloor,restFloor+.43,105.65,105.80,51),
    trim('timber-rest-bench-leg-b',-68.27,-67.94,restFloor,restFloor+.43,106.99,107.14,51),
    trim('timber-rest-stump',-66.55,-66.03,restFloor,restFloor+.50,107.22,107.74,62,'round-y'),
    ...Array.from({length:6},(_,i)=>{
      const row=i<3?0:1, j=i%3, z=107.60+j*.20+row*.09, y=restFloor+.10+row*.16;
      return trim('timber-rest-split-'+i,-67.51+(i%2)*.09,-66.73+(i%2)*.06,y-.09,y+.09,z-.10,z+.10,62,'round-x');
    }),
  ]),
  site('springhead',[
    point('springhead-low-wall',-52.40,-51.95,footing(-52.40,-51.95,113.62,115.39),spring+.79,113.62,115.39,50),
    point('springhead-cut-basin',-52.02,-50.74,spring-.28,spring+.39,113.78,115.20,50,{shape:'trough'}),
    trim('springhead-clear-ice',-51.88,-50.88,spring+.25,spring+.286,113.91,115.06,55),
    trim('springhead-iron-spout',-52.12,-51.45,spring+.56,spring+.64,114.37,114.47,63,'round-x'),
    trim('springhead-mug',-50.95,-50.76,spring+.39,spring+.56,114.83,115.01,63,'open-cup'),
    trim('springhead-mug-handle',-50.79,-50.65,spring+.42,spring+.54,114.884,114.942,63,'cup-handle'),
    trim('springhead-ice-run',-50.87,-50.16,spring-.06,spring+.018,114.23,114.59,55),
  ]),
  site('upper-lookout',[
    point('lookout-survey-base',-80.25,-79.59,footing(-80.25,-79.59,132.26,132.91),lookout+.22,132.26,132.91,50),
    point('lookout-survey-marker',-80.09,-79.74,lookout+.16,lookout+1.11,132.42,132.76,58),
    trim('lookout-survey-cap',-80.10,-79.73,lookout+1.095,lookout+1.15,132.41,132.77,63),
    trim('lookout-seat-plank',-79.02,-77.17,lookout+.54,lookout+.65,132.52,132.92,56),
    trim('lookout-seat-scarf',-77.80,-77.40,lookout+.635,lookout+.659,132.516,132.924,70),
    trim('lookout-seat-strap',-77.94,-77.88,lookout+.641,lookout+.665,132.512,132.928,63),
    trim('lookout-seat-old-pin',-77.925,-77.893,lookout+.66,lookout+.674,132.60,132.635,71,'round-y'),
    trim('lookout-seat-new-pin',-77.925,-77.893,lookout+.66,lookout+.674,132.80,132.835,71,'round-y'),
    point('lookout-seat-pier-a',-78.95,-78.70,footing(-78.95,-78.70,132.55,132.9),lookout+.58,132.55,132.90,50),
    point('lookout-seat-pier-b',-77.43,-77.20,footing(-77.43,-77.20,132.55,132.9),lookout+.58,132.55,132.90,50),
  ]),
]);

const segments=[...HOME_MOUNTAIN_TRAILS,...HOME_VALLEY_ROADS].flatMap(({points})=>
  points.slice(1).map(([x1,z1],i)=>[...points[i],x1,z1]));
function trailDistance(x,z) {
  return Math.min(...segments.map(([a,b,c,d])=>{
    const u=Math.max(0,Math.min(1,((x-a)*(c-a)+(z-b)*(d-b))/((c-a)**2+(d-b)**2)));
    return Math.hypot(x-a-u*(c-a),z-b-u*(d-b));
  }));
}
const random=(i)=>{const u=Math.sin(i*127.13+31.47)*43758.5453;return u-Math.floor(u);};
// Clumps follow the sheltered folds. Leave the upper seat, field view and trail
// openings bare. A few near the wash yard connect the village to the treeline.
const stands=[
  [-39,84,5.7,3.1,5], [-49,88,6.1,4.6,7], [-56,100,6.4,4.6,9],
  [-64,96,7.7,5.5,7], [-64,111,7.4,5.7,9], [-70,113,8.5,6.9,7],
  [-76,122,7.5,4.9,7], [-62,124,7.1,4.6,8], [-53,113,5.7,5.4,7],
  [-40,112,4.4,4.2,5], [-51,135,5.2,6.5,6], [-80,137,7.6,4.9,6],
  [-36,102,4.9,3.8,5], [31,43,4.8,3.8,5], [11,60,3.8,3.1,3],
];
export const HOME_FOREST_STANDS=Object.freeze(stands.map(stand=>Object.freeze(stand)));
const forest=[];
let seed=79;
const pieces=HOME_MOUNTAIN_SITES.flatMap(({pieces})=>pieces);
// A break in the trees from the marked outlook to the roofs. Its edges
// follow the descending grade; trunks stay dense on either side.
function inLookoutOpening(x,z,y,height) {
  const tx=1.4,tz=73,sx=-78.5,sz=130, dx=tx-sx,dz=tz-sz;
  const u=((x-sx)*dx+(z-sz)*dz)/(dx*dx+dz*dz);
  if(u<0||u>1)return false;
  const width=2.6+u*5.2;
  const sightY=(level(sx,sz)+1.62)*(1-u)+4.75*u;
  return Math.hypot(x-sx-u*dx,z-sz-u*dz)<width&&sightY+1.2>y&&sightY-1.7<y+height;
}
for(const [cx,cz,rx,rz,count] of stands){
  let placed=0;
  for(let i=0;i<count*14&&placed<count;i++){
    const a=random(++seed)*Math.PI*2, r=Math.sqrt(random(++seed));
    const x=cx+Math.cos(a)*rx*r, z=cz+Math.sin(a)*rz*r;
    if(trailDistance(x,z)<1.68||forest.some(t=>Math.hypot(x-t.x,z-t.z)<1.65))continue;
    if((x+77.7)**2+(z-131.2)**2<25||pieces.some(p=>x>p.x0-1.5&&x<p.x1+1.5&&z>p.z0-1.5&&z<p.z1+1.5))continue;
    const height=(z>124?3.9:4.8)+random(++seed)*(z>124?2.75:4.1);
    const radius=.13+random(++seed)*.14;
    const y=level(x,z), form=random(++seed);
    if(inLookoutOpening(x,z,y,height))continue;
    forest.push(Object.freeze({x,z,y,height,radius,seed:form}));
    placed++;
  }
}
export const HOME_VALLEY_TREES=Object.freeze(forest);

export function homeMountainShelter(x,z) {
  if(x>-30||z<78)return 0;
  return stands.slice(0,-2).reduce((max,[cx,cz,rx,rz])=>
    Math.max(max,1-Math.hypot((x-cx)/(rx+6),(z-cz)/(rz+6))),0);
}
