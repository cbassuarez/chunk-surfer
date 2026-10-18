// Original small municipal tree geometry. World metres, Y up. Each LOD keeps
// every rooted bough and crown cluster; fewer, broader folded leaves replace
// source-face deletion. No texture/alpha dependency carries the silhouette.
export const TREE_CROWN_REVISION=1;
export const TREE_CROWN_NAMES=['opening_street_tree_small','opening_street_tree_small_b','opening_street_tree_small_c'];
const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,s)=>a.map(x=>x*s);
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function buildTreeCrown(variant=0,lod=0){
  if(![0,1,2].includes(variant)||![0,1,2].includes(lod))throw Error('Unknown crown variant or LOD');
  const shape=[[1,1,0],[1.10,.86,.16],[.88,1.01,-.13]][variant];
  const transform=([x,y,z])=>[x*shape[0]+shape[2]*(y/4.6)**2,y,z*shape[1]];
  const groups={branch:[],leaf:[]},segments=[],clusters=[];
  const triangle=(role,a,b,c)=>{const p=[a,b,c].map(transform),normal=unit(cross(sub(p[1],p[0]),sub(p[2],p[0])));groups[role].push({p,n:normal});};
  const beam=(a,b,r0,r1,parent)=>{
    const id=segments.length;segments.push({a,b,r0,r1,parent});
    const axis=unit(sub(b,a)),u=unit(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),v=cross(axis,u),sides=[8,6,5][lod];
    for(let k=0;k<sides;k++){
      const radial=t=>add(mul(u,Math.cos(t)),mul(v,Math.sin(t))),q=radial(k/sides*Math.PI*2),r=radial((k+1)/sides*Math.PI*2);
      const a0=add(a,mul(q,r0)),a1=add(a,mul(r,r0)),b0=add(b,mul(q,r1)),b1=add(b,mul(r,r1));
      triangle('branch',a0,b0,b1);triangle('branch',a0,b1,a1);
      if(parent===null)triangle('branch',a,a1,a0);
      triangle('branch',b,b0,b1);
    }return id;
  };
  const root=[0,0,0],fork=[.055,1.72,-.035],top=[-.035,3.87,.055];
  const trunk=beam(root,fork,.13,.081,null),leader=beam(fork,top,.085,.024,trunk);
  // Unequal, overlapping crowns. The low outer boughs carry a broad canopy;
  // the upper group rises without becoming a geometrical ball or flat card.
  const centres=[[-.82,2.88,-.94],[.73,2.96,-.94],[-.91,3.13,.42],[.86,3.17,.38],
    [-.48,3.62,-.57],[.43,3.68,-.40],[-.48,3.75,.60],[.39,3.76,.68],
    [.02,4.03,.00],[-.20,3.02,1.47],[.12,3.04,-1.58],[-.92,3.42,-.21],[.93,3.46,-.13]];
  for(let index=0;index<centres.length;index++){
    const centre=centres[index],base=index===8?top:fork,mid=add(mul(base,.40),mul(centre,.60));
    mid[1]-=.18;const limb=beam(base,mid,.045,.022,index===8?leader:trunk);
    beam(mid,centre,.024,.008,limb);
    const radius=[.49+(index%3)*.025,.43+(index%2)*.035,.59];
    clusters.push({centre:transform(centre),radius,branch:segments.length-1});
    // A small irregular opaque inner crown retains volume as leaves minify.
    const sides=7,rings=[[-.72,.54],[0,1],[.72,.54]];
    const ring=(r,k)=>{const a=k/sides*Math.PI*2+.23*index;return add(centre,[Math.cos(a)*radius[0]*r[1]*.72,r[0]*radius[1]*.72,Math.sin(a)*radius[2]*r[1]*.72]);};
    for(let k=0;k<sides;k++){
      for(let j=0;j<2;j++){const a=ring(rings[j],k),b=ring(rings[j],k+1),c=ring(rings[j+1],k),d=ring(rings[j+1],k+1);triangle('leaf',a,c,d);triangle('leaf',a,d,b);}
      triangle('leaf',add(centre,[0,-radius[1]*.84,0]),ring(rings[0],k+1),ring(rings[0],k));
      triangle('leaf',add(centre,[0,radius[1]*.84,0]),ring(rings[2],k),ring(rings[2],k+1));
    }
    const rand=random(9301+variant*137+index*67),count=[44,23,11][lod],size=[1,1.18,1.50][lod];
    for(let k=0;k<count;k++){
      const yy=1-2*(k+.5)/count,a=k*2.3999632297+rand()*.4,rr=Math.sqrt(1-yy*yy);
      const normal=unit([Math.cos(a)*rr,yy*.75+.25,Math.sin(a)*rr]);
      const at=add(centre,[Math.cos(a)*rr*radius[0],yy*radius[1],Math.sin(a)*rr*radius[2]]);
      const tangent=unit(cross(normal,Math.abs(normal[1])<.85?[0,1,0]:[1,0,0])),side=cross(normal,tangent);
      const length=(.265+rand()*.10)*size,width=(.17+rand()*.06)*size,rotation=rand()*Math.PI*2;
      const u=add(mul(tangent,Math.cos(rotation)),mul(side,Math.sin(rotation))),v=cross(normal,u);
      const outline=[[-.5,0],[-.28,-.47],[.15,-.5],[.5,0],[.15,.5],[-.28,.47]];
      const points=outline.map(([x,y])=>add(at,add(mul(u,x*length),mul(v,y*width))));
      const ridge=add(at,mul(normal,.022*size));
      for(let q=0;q<points.length;q++)triangle('leaf',ridge,points[q],points[(q+1)%points.length]);
    }
  }
  const primitives=Object.entries(groups).map(([role,triangles])=>({role,positions:triangles.flatMap(t=>t.p.flat()),normals:triangles.flatMap(t=>t.p.flatMap(()=>t.n)),uvs:triangles.flatMap(()=>[0,0,1,0,0,1]),indices:Array.from({length:triangles.length*3},(_,i)=>i)}));
  return{primitives,extras:{treeCrownRevision:TREE_CROWN_REVISION,variant,lod,rootedSegments:segments.map(s=>({...s,a:transform(s.a),b:transform(s.b)})),crownClusters:clusters}};
}
