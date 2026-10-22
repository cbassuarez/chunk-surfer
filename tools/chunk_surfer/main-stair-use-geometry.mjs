// The retained runner follows the actual analytic treads. It owns no collision,
// floor heights, stair paths, nosings or rails.
import {MAIN_STAIR_GEOMETRY as STAIR} from '../../src/data/main-stair-geometry.js';
export const MAIN_STAIR_RUNNER_MESH='textile_stair_runner_fitted';
export function buildMainStairUse({mesh,materials,addQuad}){
 const material=(name,rgb,roughness)=>{const id=materials.length;materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:0,roughnessFactor:roughness}});return id;};
 const wool=material('main stair retained worsted wool',[.095,.077,.058],.98),binding=material('main stair bound wool edges',[.14,.112,.074],.93),backing=material('main stair compressed worn centre',[.205,.164,.105],.96);
 const m=mesh(MAIN_STAIR_RUNNER_MESH),mid=(STAIR.innerRadiusM+STAIR.outerRadiusM)/2,ri=mid-.475,ro=mid+.475;
 const point=(r,a,y)=>[Math.sin(a)*r,y,-Math.cos(a)*r];
 const q=(points,mat,want)=>{const p=[...points],a=p[1].map((v,i)=>v-p[0][i]),b=p[2].map((v,i)=>v-p[0][i]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];if(n.reduce((s,v,i)=>s+v*want[i],0)<0)p.reverse();addQuad(m,...p,mat);};
 const stats={mesh:MAIN_STAIR_RUNNER_MESH,widthM:.95,innerRadiusM:ri,outerRadiusM:ro,treadCoverBottomM:.001,treadCoverTopM:.007,stairsRevision:STAIR.revision,treads:[],quads:0};
 const emit=(p,mat,n)=>{q(p,mat,n);stats.quads++;};
 let step=0;
 for(const f of STAIR.flights){const da=f.sweep/f.rises,rise=(f.toH-f.fromH)/f.rises;
  for(let i=0;i<f.rises;i++,step++){
   const a0=f.theta0+da*i,a1=a0+da,top=f.fromH+rise*i,n=Math.max(3,Math.ceil(Math.abs(da)/.06));
   const wearHalf=.14+.025*(.5+.5*Math.sin(step*.7)),radii=[ri,ri+.025,mid-wearHalf,mid+wearHalf,ro-.025,ro],mats=[binding,wool,backing,wool,binding],samples=[];
   for(let s=0;s<n;s++){const b0=a0+da*s/n,b1=a0+da*(s+1)/n,am=(b0+b1)/2;
    for(let band=0;band<5;band++)emit([point(radii[band],b0,top+.007),point(radii[band+1],b0,top+.007),point(radii[band+1],b1,top+.007),point(radii[band],b1,top+.007)],mats[band],[0,1,0]);
    emit([point(ri,b0,top+.001),point(ro,b0,top+.001),point(ro,b1,top+.001),point(ri,b1,top+.001)],wool,[0,-1,0]);
    for(const[r,sign]of[[ri,-1],[ro,1]])emit([point(r,b0,top+.001),point(r,b1,top+.001),point(r,b1,top+.007),point(r,b0,top+.007)],binding,[sign*Math.sin(am),0,-sign*Math.cos(am)]);
    samples.push({point:point(mid,am,top+.007),surfaceY:top});
   }
   // The waterfall turns up the actual riser. Its one-millimetre stand-off
   // keeps it outside the structural face without modifying the stair shell.
   const face=a1-.001/mid,forward=[-Math.cos(face),0,-Math.sin(face)];
   for(let band=0;band<5;band++)emit([point(radii[band],face,top+.007),point(radii[band+1],face,top+.007),point(radii[band+1],face,top+rise+.007),point(radii[band],face,top+rise+.007)],band===0||band===4?binding:wool,forward);
   stats.treads.push({flight:f.id,index:i,angle0:a0,angle1:a1,surfaceY:top,rise,samples});
  }
 }
 stats.triangles=stats.quads*2;m.extras={mainStairUse:{stairsRevision:STAIR.revision,treads:step,widthM:.95,wear:'compressed centre on tread tops; bound edges retained',collision:'none; existing plan/hero stair unchanged'}};
 return stats;
}
