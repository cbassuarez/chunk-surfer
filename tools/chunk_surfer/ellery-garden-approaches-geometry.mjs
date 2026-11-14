// New masonry/iron/rainwater joints only. Existing rooms are extracted from
// delivered packs by the builder, not regenerated from today's shared source.
import {HALL_STAGE_SERVICE_STAIR as S,hallServiceTreadHeight} from '../../src/data/atrium-circulation.js';
export const APPROACH_MATERIALS=[
 {name:'garden setback old red brick',color:[.25,.105,.065],roughness:.94},
 {name:'garden setback rubbed sandstone',color:[.37,.37,.32],roughness:.90},
 {name:'garden setback mortar recess',color:[.13,.14,.12],roughness:.96},
 {name:'garden approach wet flags',color:[.25,.275,.26],roughness:.74},
 {name:'garden approach repaired flag',color:[.29,.30,.27],roughness:.83},
 {name:'garden gate blackened iron',color:[.025,.034,.032],roughness:.68,metallic:.58},
 {name:'baths weathered steel rainwater',color:[.14,.18,.17],roughness:.73,metallic:.48},
 {name:'baths rainwater inner shadow',color:[.035,.049,.044],roughness:.88,metallic:.15},
 {name:'garden service green joinery',color:[.06,.085,.069],roughness:.81},
];
const sub=(a,b)=>a.map((v,i)=>v-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function buildApproachEdges(){
 const meshes=[];
 function owner(name,anchor){
  const m={name,anchor,groups:new Map(),parts:[],apertures:[]};meshes.push(m);
  const group=i=>m.groups.get(i)||(m.groups.set(i,{positions:[],normals:[],uvs:[],indices:[]}),m.groups.get(i));
  function quad(world,mat){const p=world.map(v=>[v[0]-anchor.x,v[1],v[2]-anchor.z]),n=cross(sub(p[1],p[0]),sub(p[2],p[0])),len=Math.hypot(...n);if(len<1e-10)throw Error('Degenerate approach face');const normal=n.map(v=>v/len),axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),uv=axis===0?[2,1]:axis===1?[0,2]:[0,1],g=group(mat),start=g.positions.length/3;for(const v of p){g.positions.push(...v);g.normals.push(...normal);g.uvs.push(v[uv[0]],v[uv[1]]);}g.indices.push(start,start+1,start+2,start,start+2,start+3);}
  function box(id,c,size,mat){const h=size.map(v=>v/2),p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+(i&(1<<k)?h[k]:-h[k])));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(f.map(i=>p[i]),mat);m.parts.push({id,center:c,size,material:mat});}
  function beam(id,a,b,width,mat){const d=sub(b,a),len=Math.hypot(...d),u=d.map(v=>v/len),ref=Math.abs(u[1])<.9?[0,1,0]:[1,0,0],v0=cross(u,ref),vl=Math.hypot(...v0),v=v0.map(n=>n/vl),w=cross(u,v),p=Array.from({length:8},(_,i)=>[0,1,2].map(k=>(i&1?b:a)[k]+v[k]*(i&2?width/2:-width/2)+w[k]*(i&4?width/2:-width/2)));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(f.map(i=>p[i]),mat);m.parts.push({id,a,b,width,material:mat});}
  return{m,box,beam,quad};
 }
 {
  const{m,box,beam}=owner('ellery_garden_built_edges',{x:72,z:2});
  for(const s of[
   {name:'west',x:70.5,z0:3,z1:15,height:5.5,doorZ:13.5,public:1},
   {name:'east',x:101.5,z0:4,z1:15,height:9.5,doorZ:11.5,public:-1},
  ]){
   const z0=s.doorZ-.6,z1=s.doorZ+.6;
   m.apertures.push({id:s.name+'-service',axis:'x',x0:s.x-.25,x1:s.x+.25,z0,z1,sill:0,head:3.4});
   for(const[a,b]of[[s.z0,z0],[z1,s.z1]])box(s.name+'-deep-masonry-side-'+a,[s.x,s.height/2,(a+b)/2],[.5,s.height,b-a],0);
   box(s.name+'-load-bearing-lintel-masonry',[s.x,(3.4+s.height)/2,s.doorZ],[.5,s.height-3.4,1.2],0);
   for(const z of[z0-.09,z1+.09]){
    box(s.name+'-service-stone-jamb-'+z,[s.x+s.public*.015,1.70,z],[.57,3.4,.18],1);
    box(s.name+'-service-dressed-jamb-foot-'+z,[s.x+s.public*.015,.25,z],[.61,.50,.22],1);
   }
   box(s.name+'-service-stone-lintel',[s.x+s.public*.015,3.49,s.doorZ],[.61,.18,1.60],1);
   box(s.name+'-service-threshold',[s.x,.008,s.doorZ],[.58,.016,1.19],1);
   for(const z of[z0+.018,z1-.018])box(s.name+'-inner-timber-stop-'+z,[s.x-s.public*.11,1.69,z],[.055,3.38,.036],8);
   // A restrained civic wall: actual piers, deep windowless bays and coherent
   // horizontal courses. The opening interrupts every low course.
   for(const y of[.32,1.20,3.72])for(const[a,b]of[[s.z0,z0-.18],[z1+.18,s.z1]])if(b>a)box(s.name+'-stone-course-'+y+'-'+a,[s.x+s.public*.273,y,(a+b)/2],[.085,.10,b-a],1);
   for(let z=s.z0+.20;z<s.z1-.2;z+=2.35){
    if(Math.abs(z-s.doorZ)<.85)continue;
    box(s.name+'-structural-bay-pier-'+z,[s.x+s.public*.25,s.height/2,z],[.16,s.height,.24],0);
    box(s.name+'-pier-stone-foot-'+z,[s.x+s.public*.27,.23,z],[.20,.46,.36],1);
    box(s.name+'-pier-cap-'+z,[s.x+s.public*.28,s.height-.30,z],[.22,.13,.38],1);
   }
   box(s.name+'-continuous-bearing-cornice',[s.x+s.public*.27,s.height-.08,(s.z0+s.z1)/2],[.32,.16,s.z1-s.z0+.1],1);
   box(s.name+'-roof-edge-coping',[s.x+s.public*.22,s.height+.035,(s.z0+s.z1)/2],[.48,.07,s.z1-s.z0+.12],1);
   // Close the severed end into the wing, away from the public air band.
   box(s.name+'-deep-end-return',[s.x-s.public*.18,s.height/2,15.05],[.86,s.height,.30],0);
   box(s.name+'-end-return-stone-cap',[s.x-s.public*.18,s.height-.08,15.05],[.90,.16,.36],1);
  }
  for(const s of[{id:'west',x0:71,x1:74,z1:18,drainX:71.13,gateX:71.13,gateZ:16.0},{id:'east',x0:98,x1:101,z1:15,drainX:100.87,gateX:100.87,gateZ:13.5}]){
   // Millimetre-level joints remain geometry rather than a grid of emissive
   // marks; the large wet flags read at the actual approach distance.
   for(let z=.02;z<s.z1-.02;z+=1.20)for(let i=0;i<3;i++){
    const d=Math.min(1.18,s.z1-z-.02),x=s.x0+.50+i;
    box(s.id+'-paving-'+i+'-'+z,[x,.003,z+d/2],[.982,.010,d],(i+Math.round(z*5))%7===0?4:3);
   }
   box(s.id+'-recessed-drain-shadow',[s.drainX,.003,s.z1/2],[.18,.014,s.z1-.08],7);
   for(let z=.10;z<s.z1-.1;z+=.23)box(s.id+'-drain-cross-bar-'+z,[s.drainX,.006,z],[.18,.014,.018],5);
   // Gates are visibly held open flat to the boundary, preserving >2.4m of
   // the route. Their pins, posts and returned top rail have real thickness.
   for(const z of[s.gateZ-.85,s.gateZ+.85]){
    box(s.id+'-gate-hinge-post-'+z,[s.gateX,.82,z],[.075,1.64,.075],5);
    box(s.id+'-gate-post-stone-shoe-'+z,[s.gateX,.11,z],[.16,.22,.16],1);
   }
   for(const y of[.20,1.40])beam(s.id+'-parked-gate-rail-'+y,[s.gateX,y,s.gateZ-.80],[s.gateX,y,s.gateZ+.80],.026,5);
   for(let n=0;n<9;n++)beam(s.id+'-parked-gate-spindle-'+n,[s.gateX,.20,s.gateZ-.76+n*.19],[s.gateX,1.48,s.gateZ-.76+n*.19],.018,5);
  }
 }
 {
  const{box,beam}=owner('ellery_garden_steps',{x:S.at.x,z:S.at.y});
  const l=S.landing,runZ=S.from.y,x0=S.from.x,z0=l.y,z1=l.y+l.depth;
  // Turning landing: the west service door meets its long southern end; the
  // descent leaves the north end. A copied straight landing collided with
  // the existing downstage stairs and could never satisfy that relationship.
  box('L-service-turning-landing',[l.x+l.width/2,-.09,l.y+l.depth/2],[l.width,.18,l.depth],6);
  for(const x of[l.x+.09,l.x+l.width-.09])for(const z of[z0+.10,z1-.10]){
   box('landing-support-'+x+'-'+z,[x,(-.18+S.toH)/2,z],[.07,-.18-S.toH,.07],5);
   box('landing-support-foot-'+x+'-'+z,[x,S.toH+.02,z],[.14,.04,.14],5);
  }
  for(let i=0;i<S.treads;i++){
   const x=x0+i*S.going,h=hallServiceTreadHeight(i);
   box('service-tread-'+i,[x+S.going/2,h-.05,runZ+S.width/2],[S.going,.10,S.width],6);
   box('service-tread-worn-nosing-'+i,[x+S.going-.026,h+.001,runZ+S.width/2],[.052,.002,S.width-.06],1);
   if(i>0){const previous=hallServiceTreadHeight(i-1);box('service-closed-riser-'+i,[x+.010,(previous+h)/2,runZ+S.width/2],[.020,previous-h,S.width],6);}
  }
  for(const z of[runZ+.045,runZ+S.width-.045]){
   // The continuous steel stringer meets the folded risers from below. Two
   // short level returns support the full first and last tread; no solid
   // triangular wedge fills the underside or the player's walking space.
   const a=[x0+S.going/2,S.fromH-.105,z],b=[x0+(S.treads-.5)*S.going,S.toH-.105,z];
   beam('service-stringer-first-return-'+z,[x0,S.fromH-.105,z],a,.10,5);
   beam('service-diagonal-stringer-'+z,a,b,.10,5);
   beam('service-stringer-last-return-'+z,b,[x0+S.treads*S.going,S.toH-.105,z],.10,5);
  }
  function guard(id,a,b,base){
   const len=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.max(1,Math.ceil(len/.8));
   for(let i=0;i<=count;i++){const t=i/count,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t,y=typeof base==='function'?base(x,z):base;box(id+'-post-'+i,[x,y+S.railHeight/2,z],[.045,S.railHeight,.045],5);box(id+'-post-shoe-'+i,[x,y+.025,z],[.09,.05,.09],6);}
   for(const height of[S.railHeight,S.railHeight*.48]){const ya=typeof base==='function'?base(...a):base,yb=typeof base==='function'?base(...b):base;beam(id+'-rail-'+height,[a[0],ya+height,a[1]],[b[0],yb+height,b[1]],height===S.railHeight?.038:.025,5);}
  }
  guard('landing-north-guard',[l.x+.025,z0-.035],[l.x+l.width-.025,z0-.035],0);
  guard('landing-south-guard',[l.x+.025,z1+.035],[l.x+l.width-.025,z1+.035],0);
  guard('landing-east-guard',[l.x+l.width+.035,runZ+S.width+.035],[l.x+l.width+.035,z1],0);
  // Keep the actual west leaf's z11..12 entry wholly clear.
  const doorClearStart=11.0;
  if(doorClearStart-z0>.2)guard('landing-west-guard',[l.x-.035,z0],[l.x-.035,doorClearStart-.08],0);
  // Run rails pass through the centres of their tread posts, with short
  // level returns. They end before the flat stage, so departure stays open.
  for(const z of[runZ-.035,runZ+S.width+.035]){
   for(let i=0;i<S.treads;i++){const x=x0+(i+.5)*S.going,h=hallServiceTreadHeight(i);box('run-rail-post-'+i+'-'+z,[x,h+S.railHeight/2,z],[.045,S.railHeight,.045],5);}
   for(const railH of[S.railHeight,S.railHeight*.48]){
    const points=[[x0,S.fromH+railH,z],...Array.from({length:S.treads},(_,i)=>[x0+(i+.5)*S.going,hallServiceTreadHeight(i)+railH,z]),[x0+S.treads*S.going,S.toH+railH,z]];
    for(let i=1;i<points.length;i++)beam('run-continuous-rail-'+z+'-'+railH+'-'+i,points[i-1],points[i],railH===S.railHeight?.038:.025,5);
   }
  }
 }
 {
  const{box,beam}=owner('ellery_baths_roof_exterior',{x:83,z:38.5});
  // The original perforated steel arches and broken panes remain untouched.
  // These are bearing seats and open rainwater channels, never a replacement
  // slab across the roof or an invented second ceiling below the sky holes.
  for(const x of[71.65,94.35]){
   const sign=x<83?-1:1,g=x+sign*.27;
   box('roof-bearing-wallplate-'+x,[x,5.10,38.5],[.32,.16,19.78],1);
   for(let z=28.75;z<=48.25+.01;z+=3.25){
    box('steel-arch-bearing-shoe-'+x+'-'+z,[x,5.21,z],[.30,.10,.34],6);
    for(const zz of[z-.11,z+.11])box('bearing-anchor-bolt-'+x+'-'+zz,[x,5.27,zz],[.030,.035,.030],5);
   }
   box('eaves-gutter-bottom-'+x,[g,5.055,38.5],[.25,.025,19.78],6);
   box('eaves-gutter-open-channel-'+x,[g,5.072,38.5],[.20,.010,19.70],7);
   for(const edge of[-1,1])box('eaves-gutter-upstand-'+x+'-'+edge,[g+edge*.12,5.105,38.5],[.022,.10,19.78],6);
   for(const z of[28.61,48.39])box('gutter-end-stop-'+x+'-'+z,[g,5.105,z],[.25,.10,.022],6);
   for(const z of[29.0,47.9]){
    const pipe=g+sign*.03;
    beam('gutter-outlet-neck-'+x+'-'+z,[g,5.055,z],[pipe,4.82,z],.075,6);
    beam('rainwater-downpipe-'+x+'-'+z,[pipe,4.82,z],[pipe,.24,z],.075,6);
    for(const y of[1.1,2.85,4.4])box('rainwater-wall-strap-'+x+'-'+z+'-'+y,[pipe,y,z],[.115,.045,.115],5);
    beam('rainwater-shoe-'+x+'-'+z,[pipe,.24,z],[pipe+sign*.12,.09,z],.09,6);
   }
  }
 }
 return{materials:APPROACH_MATERIALS,meshes};
}
