// Procedural shapes for the Catch's seabed. The sand shares its relief with
// the game module, so crabs, grass and buried vans stand on the drawn dunes.
import {SOURCE_REST_SEABED,sourceRestSeabedRelief} from '../game/source-rest-seabed.js';

function sand(){
  const columns=52,rows=52,p=[],n=[],i=[],e=.25;
  for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){
    const x=-SOURCE_REST_SEABED.halfX+2*SOURCE_REST_SEABED.halfX*c/columns,z=-SOURCE_REST_SEABED.halfZ+2*SOURCE_REST_SEABED.halfZ*r/rows,
      dx=(sourceRestSeabedRelief(x+e,z)-sourceRestSeabedRelief(x-e,z))/(2*e),dz=(sourceRestSeabedRelief(x,z+e)-sourceRestSeabedRelief(x,z-e))/(2*e),
      length=Math.hypot(dx,1,dz);
    p.push(x,sourceRestSeabedRelief(x,z),z);n.push(-dx/length,1/length,-dz/length);
  }
  for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const a=r*(columns+1)+c,b=a+1,d=a+columns+1,f=d+1;i.push(a,d,b,b,d,f);}
  return{p,n,i,material:'stone',base:[.60,.53,.40,1],roughness:1};
}
// Seven tapered, bending blades from one root: eelgrass on sand.
function grass(){
  const p=[],i=[];
  for(let blade=0;blade<7;blade++){
    const turn=blade/7*Math.PI*2+.4*Math.sin(blade*2.3),lean=.18+.12*((blade*37)%5)/5,height=.55+.35*((blade*53)%7)/7,base=p.length/3;
    for(let k=0;k<=4;k++){
      const t=k/4,w=.035*(1-t*.85),bend=lean*t*t,cx=Math.cos(turn)*bend,cz=Math.sin(turn)*bend,sx=-Math.sin(turn)*w,sz=Math.cos(turn)*w;
      p.push(cx-sx,height*t,cz-sz,cx+sx,height*t,cz+sz);
    }
    for(let k=0;k<4;k++){const a=base+k*2;i.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  return{p,i,material:'linen',base:[.27,.37,.21,1],roughness:1};
}
const box=(x0,x1,y0,y1,z0,z1)=>({p:[x0,y0,z0,x1,y0,z0,x1,y0,z1,x0,y0,z1,x0,y1,z0,x1,y1,z0,x1,y1,z1,x0,y1,z1],
  i:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]});
function join(parts){const p=[],i=[];for(const g of parts){const o=p.length/3;p.push(...g.p);i.push(...g.i.map(v=>v+o));}return{p,i};}
// A shore crab: a flattened shell, four legs a side, two raised claws.
function crab(){
  const shell=[],shellIndex=[],sides=10,rings=5;
  for(let r=0;r<=rings;r++){const v=r/rings*Math.PI,y=Math.cos(v),s=Math.sin(v);
    for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2;shell.push(Math.cos(a)*s*.16,.055+y*.05,Math.sin(a)*s*.12);}}
  for(let r=0;r<rings;r++)for(let k=0;k<sides;k++){const a=r*sides+k,b=r*sides+(k+1)%sides,c=a+sides,d=b+sides;shellIndex.push(a,c,b,b,c,d);}
  const parts=[{p:shell,i:shellIndex}];
  for(const side of[-1,1])for(let leg=0;leg<4;leg++){
    const z=-.07+leg*.045;parts.push(box(side>0?.12:-.27,side>0?.27:-.12,.015,.035,z-.008,z+.008));
  }
  for(const side of[-1,1])parts.push(box(side*.05-.03,side*.05+.03,.04,.09,.12,.22),box(side*.05-.045,side*.05+.045,.06,.11,.20,.26));
  return{...join(parts),material:'linen',base:[.58,.22,.11,1],roughness:.9};
}
function lamp(){
  const p=[0,0,0],i=[],sides=12;
  for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2;p.push(Math.cos(a),Math.sin(a),0);}
  for(let k=0;k<sides;k++)i.push(0,1+k,1+(k+1)%sides);
  return{p,i,material:'linen',base:[.95,.9,.78,1],emissive:[.5,.45,.36],roughness:.3};
}
export function sourceRestSeabedGeometryLibrary(){
  return{'rest-seabed-sand':sand(),'rest-seabed-grass':grass(),'rest-seabed-crab':crab(),'rest-seabed-lamp':lamp()};
}
