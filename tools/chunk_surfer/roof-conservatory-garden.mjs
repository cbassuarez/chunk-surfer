// An inherited, cultivated belvedere: three asymmetric shoulders of climbing
// growth, substantial hanging flower racemes and settled urn crowns. These
// are opaque authored surfaces in the existing structure mesh, not particles,
// texture cards or a continuous ivy wall. The quieter garden remains intact.
import {ROOF_GARDEN_FLORA_MATERIALS} from './roof-garden-flora.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const ROOF_CONSERVATORY_GARDEN_PLACEMENTS=freeze([
  {id:'west-arrival-flowering-shoulder',kind:'arch',x:-11.5,fromZ:-9,toZ:-3,
    interval:[.08,.86],leaves:46,racemes:8,climbZ:-9,seed:11,petal:'cream'},
  {id:'east-middle-flowering-shoulder',kind:'arch',x:11.5,fromZ:-3,toZ:3,
    interval:[.18,.97],leaves:42,racemes:7,climbZ:3,seed:23,petal:'pink'},
  {id:'west-garden-flowering-shoulder',kind:'arch',x:-11.5,fromZ:3,toZ:9,
    interval:[.51,.94],leaves:24,racemes:4,climbZ:9,seed:37,petal:'cream'},
  {id:'southwest-generous-urn',kind:'urn',x:-11.5,y:1.34,z:12.95,seed:43,petal:'cream'},
  {id:'southeast-generous-urn',kind:'urn',x:11.5,y:1.34,z:12.95,seed:47,petal:'pink'},
  {id:'west-generous-urn',kind:'urn',x:-11.5,y:1.34,z:7.5,seed:53,petal:'cream'},
  {id:'east-generous-urn',kind:'urn',x:11.5,y:1.34,z:7.5,seed:59,petal:'cream'},
  {id:'west-contained-evergreen-colony',kind:'colony',x:-11.5,y:.35,z:-6.9,seed:67},
  {id:'east-contained-evergreen-colony',kind:'colony',x:11.5,y:.35,z:4.6,seed:71},
]);
export const ROOF_CONSERVATORY_GARDEN_CONTRACT=freeze({
  owner:'academic_roof_structure',bounds:{x0:-12.04,x1:12.04,z0:-13.54,z1:13.54},
  sideBoundaryMinAbsX:11,southBoundaryMinZ:12.5,overheadMinimumY:2.75,
  archSpring:2.90,archCrown:4.01,minimumRacemeAxisEndY:2.92,
  maximumAddedTriangles:12000,newMeshCount:0,newMaterialCountWhenGardenPresent:0,
  strategy:'Three unequal arch shoulders leave the other bays and eye-level city openings clear; low growth stays inside the old perimeter collision.',
  existingFlora:'Unmodified; this helper adds a separately auditable layer.',
});
const add=(a,b)=>a.map((n,i)=>n+b[i]),mul=(a,n)=>a.map(v=>v*n),sub=(a,b)=>a.map((n,i)=>n-b[i]);
const lerp=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a)||1;return mul(a,1/length);};

export function buildRoofConservatoryGarden({m,materials,addQuad,addBeam}){
  if(!m||!Array.isArray(materials))throw Error('Conservatory garden requires its existing structure owner and materials.');
  const materialCountBefore=materials.length,ids={};
  for(const key of['ivy','fern','stem','cream','pink']){
    const descriptor=ROOF_GARDEN_FLORA_MATERIALS[key];
    let index=materials.findIndex(material=>material.name===descriptor.name);
    if(index<0){index=materials.length;materials.push(structuredClone(descriptor));}
    ids[key]=index;
  }
  const stats={owner:ROOF_CONSERVATORY_GARDEN_CONTRACT.owner,triangles:0,quads:0,beams:0,
    newMeshes:0,newMaterials:materials.length-materialCountBefore,materials:ids,flowerBells:0,racemes:0,leaves:0,placements:[]};
  let active;
  const include=point=>{for(let axis=0;axis<3;axis++){
    active.bounds.min[axis]=Math.min(active.bounds.min[axis],point[axis]);
    active.bounds.max[axis]=Math.max(active.bounds.max[axis],point[axis]);
  }};
  const quad=(a,b,c,d,mat)=>{addQuad(m,a,b,c,d,ids[mat]);[a,b,c,d].forEach(include);stats.quads++;stats.triangles+=2;active.triangles+=2;};
  const beam=(a,b,width,mat='stem')=>{
    addBeam(m,a,b,width,ids[mat]);
    for(const p of[a,b])for(const dx of[-width/Math.SQRT2,width/Math.SQRT2])
      for(const dy of[-width/Math.SQRT2,width/Math.SQRT2])for(const dz of[-width/Math.SQRT2,width/Math.SQRT2])include(add(p,[dx,dy,dz]));
    stats.beams++;stats.triangles+=12;active.triangles+=12;
  };
  const stem=(points,width)=>{
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],direction=unit(sub(b,a));
      const u=unit(cross(direction,Math.abs(direction[1])<.8?[0,1,0]:[1,0,0])),v=unit(cross(direction,u));
      for(const axis of[u,v])quad(add(a,mul(axis,-width*.5)),add(a,mul(axis,width*.5)),
        add(b,mul(axis,width*.35)),add(b,mul(axis,-width*.35)),'stem');
    }
  };
  const leaf=(base,tip,width,normal,mat='fern',lobed=false)=>{
    const along=sub(tip,base),side=unit(cross(along,normal));
    const margin=lobed?[[0,0],[-.45,.22],[-.60,.64],[-.24,.52],[0,1],[.24,.52],[.60,.64],[.45,.22]]
      :[[0,0],[-.42,.22],[-.58,.53],[-.38,.85],[0,1],[.38,.85],[.58,.53],[.42,.22]];
    const point=([u,t])=>add(add(base,mul(along,t)),mul(side,u*width));
    const outline=margin.map(point),ridge=add(lerp(base,tip,.48),mul(normal,.052));
    for(let i=0;i<8;i+=2)quad(ridge,outline[i],outline[(i+1)%8],outline[(i+2)%8],mat);
    stats.leaves++;active.leaves++;
  };
  const bell=(centre,direction,radius,length,mat,phase)=>{
    // Four flared petal panels form an open flower cup with actual depth.
    // Unequal lips avoid an ellipsoid/particle necklace in the final dither.
    const axis=unit(direction),u=unit(cross(axis,[0,1,0])),v=unit(cross(axis,u));
    const ring=(angle,front)=>{
      const r=front?radius:radius*.28;
      const lip=front?length*(1+.12*Math.sin(angle*2+phase)):0;
      return add(add(add(centre,mul(axis,lip)),mul(u,Math.cos(angle)*r)),mul(v,Math.sin(angle)*r));
    };
    for(let i=0;i<4;i++){
      const a=phase+i*Math.PI/2,b=phase+(i+1)*Math.PI/2;
      quad(ring(a,false),ring(b,false),ring(b,true),ring(a,true),mat);
    }
    stats.flowerBells++;active.flowerBells++;
  };
  const raceme=({top,drop,seed,petal,scale=1,tiers=8})=>{
    const axis=[];
    for(let i=0;i<=tiers;i++){
      const t=i/tiers;
      axis.push([top[0]+Math.sin(t*Math.PI)*.048*scale,top[1]-drop*t,
        top[2]+Math.sin(t*2.2+seed)*.030*scale]);
    }
    stem(axis,.012*scale);
    for(let tier=0;tier<tiers;tier++){
      const t=(tier+.50)/tiers,centre=lerp(axis[tier],axis[tier+1],.50);
      const width=(.030+.086*(1-t)**.65)*scale;
      for(let i=0;i<3;i++){
        const a=i*Math.PI*2/3+tier*1.41+seed;
        const p=add(centre,[Math.cos(a)*width,Math.sin(a*1.7)*.012*scale,Math.sin(a)*width]);
        bell(p,[Math.cos(a)*.78,-.58,Math.sin(a)*.78],(.026+.022*(1-t))*scale,
          (.048+.039*(1-t))*scale,i===1&&tier%4===0?'cream':petal,a*.31);
      }
    }
    stats.racemes++;active.racemes++;
  };
  const archPoint=(p,t)=>{
    const z=p.fromZ+(p.toZ-p.fromZ)*t,half=(p.toZ-p.fromZ)/2,centre=(p.fromZ+p.toZ)/2;
    return[Math.sign(p.x)*11.34,2.90+Math.sqrt(Math.max(0,1-((z-centre)/half)**2))*1.11,z];
  };
  const arch=p=>{
    const sign=Math.sign(p.x),path=[];
    for(let i=0;i<=17;i++)path.push(archPoint(p,p.interval[0]+(p.interval[1]-p.interval[0])*i/17));
    for(let i=1;i<path.length;i++)beam(path[i-1],path[i],.030);
    for(let i=0;i<p.leaves;i++){
      const t=p.interval[0]+(p.interval[1]-p.interval[0])*(i+.35)/p.leaves;
      const base=archPoint(p,t);base[0]-=sign*(.065+Math.sin(i*.71+p.seed)*.038);base[1]+=.025;
      const tip=add(base,[-sign*.015,(i%3===0?-.19:.13),i%2?.33:-.36]);
      leaf(base,tip,.285+(i%3)*.028,unit([-sign,.25+(i%2)*.25,Math.sin(i)*.25]),i%5===0?'ivy':'fern',i%7===0);
    }
    for(let i=0;i<p.racemes;i++){
      const t=p.interval[0]+(p.interval[1]-p.interval[0])*(i+.5)/p.racemes;
      const root=archPoint(p,t),top=[sign*10.99,root[1]-.065,root[2]+.035*Math.sin(i+p.seed)];
      stem([root,lerp(root,top,.5),top],.018);
      const drop=Math.min(.64+(i%3)*.125,top[1]-ROOF_CONSERVATORY_GARDEN_CONTRACT.minimumRacemeAxisEndY);
      raceme({top,drop,seed:p.seed+i*.8,petal:i%3===0?'cream':p.petal});
    }
    // Rooted at a selected existing pier rather than floating across the bay.
    const climb=[];
    for(let i=0;i<9;i++)climb.push([sign*(11.20+Math.sin(i*.8+p.seed)*.020),.40+i*.355,
      p.climbZ+Math.sin(i*.83+p.seed)*.075]);
    for(let i=1;i<climb.length;i++)beam(climb[i-1],climb[i],.026);
    for(let i=0;i<15;i++){
      const base=lerp(climb[Math.min(7,Math.floor(i*8/15))],climb[Math.min(8,Math.floor(i*8/15)+1)],(i*8/15)%1);
      leaf(base,add(base,[0,.04+(i%3)*.055,i%2?.25:-.25]),.235,[-sign,0,0],i%4===0?'ivy':'fern',i%4===0);
    }
  };
  const settledCrown=(p,{low=false}={})=>{
    const sign=Math.sign(p.x),height=low?.51:.43;
    for(const[count,radius,rise,baseLift]of[[12,.395,.075,.055],[8,.315,height,.105]]){
      for(let i=0;i<count;i++){
        const a=i/count*Math.PI*2+p.seed*.41,dir=[Math.cos(a),0,Math.sin(a)];
        const base=[p.x+dir[0]*.025,p.y+baseLift,p.z+dir[2]*.025];
        const tip=[p.x+dir[0]*radius,p.y+baseLift+rise,p.z+dir[2]*radius];
        leaf(base,tip,.295+(i%3)*.018,unit([dir[0]*.68,.56,dir[2]*.68]),i%5===0?'ivy':'fern',i%6===0);
      }
    }
    if(!low)for(const lane of[-1,1])raceme({
      top:[p.x-sign*.11,p.y+.60,p.z+lane*.14],drop:.29,seed:p.seed+lane,
      petal:p.petal,scale:.70,tiers:4,
    });
  };
  for(const placement of ROOF_CONSERVATORY_GARDEN_PLACEMENTS){
    active={id:placement.id,kind:placement.kind,triangles:0,leaves:0,racemes:0,flowerBells:0,
      bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};
    stats.placements.push(active);
    if(placement.kind==='arch')arch(placement);
    else settledCrown(placement,{low:placement.kind==='colony'});
  }
  return stats;
}
