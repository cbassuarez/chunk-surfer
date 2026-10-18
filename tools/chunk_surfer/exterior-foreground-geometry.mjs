// Cultivated low foreground for the existing Ellery yard. Physical world X/Z
// are converted to small, centred owner-local coordinates here; placement is
// data-owned. Ground paths, lawn, water, trees and every interaction stay out
// of this builder. All detail enters the ordinary opaque prop/depth pass.
import {ROOF_GARDEN_FLORA_MATERIALS} from './roof-garden-flora.mjs';
import {EXTERIOR_FOREGROUND} from '../../src/data/exterior-foreground.js';
import {YARD_PARK_PROPS} from '../../src/data/yard-park.js';

const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
export const EXTERIOR_FOREGROUND_OWNER_ORIGINS=freeze({
  exterior_garden_hardscape:{x:EXTERIOR_FOREGROUND.garden.fountain.x,z:EXTERIOR_FOREGROUND.garden.fountain.z},
  exterior_garden_planting:{x:EXTERIOR_FOREGROUND.garden.fountain.x,z:EXTERIOR_FOREGROUND.garden.fountain.z},
  exterior_arrival_planting:{x:(EXTERIOR_FOREGROUND.arrival.bounds.x0+EXTERIOR_FOREGROUND.arrival.bounds.x1)/2,
    z:(EXTERIOR_FOREGROUND.arrival.bounds.z0+EXTERIOR_FOREGROUND.arrival.bounds.z1)/2},
});
const bedRhythms=[{seed:17,density:.88},{seed:29,density:.69},{seed:43,density:.78},{seed:61,density:.92}];
export const EXTERIOR_GARDEN_BEDS=freeze(EXTERIOR_FOREGROUND.garden.beds.map((bed,i)=>({...bed,...bedRhythms[i]})));
// Placement limits come from the shared lawn/path contract. The narrow planted
// shoulder stays away from the remaining open arrival lawn and central path.
export const EXTERIOR_ARRIVAL_BEDS=freeze(EXTERIOR_FOREGROUND.arrival.lawns.map((lawn,i)=>({
  id:`arrival-${i===0?'west':'east'}`,x0:lawn.x0+.25,x1:lawn.x1-.25,
  z0:lawn.z0+.35,z1:Math.min(lawn.z1-.25,lawn.z0+1.35),seed:i===0?73:101,density:i===0?.94:.83,
})));
export const EXTERIOR_FOREGROUND_CONTRACT=freeze({
  gardenBounds:EXTERIOR_FOREGROUND.garden.bounds,
  arrivalBounds:EXTERIOR_FOREGROUND.arrival.bounds,
  arrivalPath:EXTERIOR_FOREGROUND.arrival.path,
  clearApron:EXTERIOR_FOREGROUND.garden.apron,
  northSouthPath:EXTERIOR_FOREGROUND.garden.paths.spine,
  eastWestPath:EXTERIOR_FOREGROUND.garden.paths.cross,
  fountain:{x:EXTERIOR_FOREGROUND.garden.fountain.x,z:EXTERIOR_FOREGROUND.garden.fountain.z,radius:EXTERIOR_FOREGROUND.garden.fountain.actualRadius},
  treeAnchors:YARD_PARK_PROPS.filter(p=>p.id.startsWith('yard-park-tree-')).map(p=>({x:p.x-50,z:p.y-200})),
  trunkClearance:.85,
  maximumPlantHeight:.72,
  maximumArrivalHeight:.55,
  maximumHardscapeHeight:.44,
  maximumTriangles:16000,
  maximumFallbackMaterials:6,
  newTreeCount:0,
  groundOwner:'floorplan/conservatory.js',
  noGroundPaving:true,
});

const stone={name:'roof carved rain-worn limestone',pbrMetallicRoughness:{baseColorFactor:[.355,.320,.255,1],metallicFactor:0,roughnessFactor:.96}};
const iron={name:'roof charcoal bronze and iron',pbrMetallicRoughness:{baseColorFactor:[.026,.038,.040,1],metallicFactor:0,roughnessFactor:1},extras:{fireEscapeRole:'quiet-metal'}};
const bronze={name:'roof restrained tarnished gilt bronze',pbrMetallicRoughness:{baseColorFactor:[.235,.165,.070,1],metallicFactor:.08,roughnessFactor:.94}};
const PALETTE=freeze({stone,iron,bronze,ivy:ROOF_GARDEN_FLORA_MATERIALS.ivy,
  fern:ROOF_GARDEN_FLORA_MATERIALS.fern,soil:ROOF_GARDEN_FLORA_MATERIALS.soil});
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,n)=>a.map(v=>v*n);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const random=(seed,index)=>{
  const n=Math.sin(seed*127.1+index*311.7)*43758.5453123;
  return n-Math.floor(n);
};

export function buildExteriorForeground({mesh,materials,addBox,addBeam,addCylinder,addQuad}){
  if(typeof mesh!=='function'||!Array.isArray(materials)||
    [addBox,addBeam,addCylinder,addQuad].some(f=>typeof f!=='function'))
    throw Error('Exterior foreground requires the ordinary mesh/material/opaque primitive builder API.');
  const beforeMaterials=materials.length,ids={};
  for(const[key,descriptor]of Object.entries(PALETTE)){
    let index=materials.findIndex(item=>item.name===descriptor.name);
    if(index<0){index=materials.length;materials.push(structuredClone(descriptor));}
    ids[key]=index;
  }
  const owners=Object.fromEntries(Object.keys(EXTERIOR_FOREGROUND_OWNER_ORIGINS).map(name=>[name,mesh(name)]));
  const stats={triangles:0,newMaterials:materials.length-beforeMaterials,materials:ids,owners:{},placements:[],newTrees:0,botanicalForms:{ivyMat:0,leafCushion:0,fernCrown:0}};
  for(const name of Object.keys(owners))stats.owners[name]={triangles:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};
  let active;
  const local=(name,p)=>{
    const origin=EXTERIOR_FOREGROUND_OWNER_ORIGINS[name];
    return[p[0]-origin.x,p[1],p[2]-origin.z];
  };
  const point=(name,p)=>{
    const q=local(name,p),bounds=stats.owners[name].bounds;
    for(let a=0;a<3;a++){
      bounds.min[a]=Math.min(bounds.min[a],q[a]);bounds.max[a]=Math.max(bounds.max[a],q[a]);
      active.bounds.min[a]=Math.min(active.bounds.min[a],p[a]);active.bounds.max[a]=Math.max(active.bounds.max[a],p[a]);
    }
  };
  const count=(name,n)=>{stats.triangles+=n;stats.owners[name].triangles+=n;active.triangles+=n;};
  const box=(name,c,size,mat)=>{
    addBox(owners[name],local(name,c),size,ids[mat]);
    for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])
      point(name,add(c,[x*size[0]/2,y*size[1]/2,z*size[2]/2]));
    count(name,12);
  };
  const beam=(name,a,b,width,mat)=>{
    addBeam(owners[name],local(name,a),local(name,b),width,ids[mat]);
    // Match the existing builder's square section at any orientation.
    for(const p of[a,b])for(const dx of[-width/Math.SQRT2,width/Math.SQRT2])
      for(const dy of[-width/Math.SQRT2,width/Math.SQRT2])for(const dz of[-width/Math.SQRT2,width/Math.SQRT2])point(name,add(p,[dx,dy,dz]));
    count(name,12);
  };
  const cylinder=(name,c,r,h,mat,sides=8)=>{
    addCylinder(owners[name],local(name,c),r,h,ids[mat],sides);
    for(let i=0;i<sides;i++)for(const y of[-h/2,h/2])point(name,[c[0]+Math.cos(i/sides*Math.PI*2)*r,c[1]+y,c[2]+Math.sin(i/sides*Math.PI*2)*r]);
    count(name,sides*4);
  };
  const quad=(name,a,b,c,d,mat)=>{
    addQuad(owners[name],local(name,a),local(name,b),local(name,c),local(name,d),ids[mat]);
    [a,b,c,d].forEach(p=>point(name,p));count(name,2);
  };
  const placement=(id,kind,owner,build)=>{
    active={id,kind,owner,triangles:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};
    stats.placements.push(active);build();
  };
  const leaf=(name,base,tip,width,normal,mat,{shape='rounded',fold=.018}={})=>{
    const axis=tip.map((v,i)=>v-base[i]),side=unit(cross(axis,normal));
    const at=(u,t)=>add(add(base,mul(axis,t)),mul(side,u*width));
    const ridge=add(at(0,.48),mul(normal,fold));
    if(shape==='lance'){
      quad(name,base,at(-.5,.45),tip,ridge,mat);
      quad(name,base,ridge,tip,at(.5,.45),mat);
      return;
    }
    const margin=shape==='ivy'
      ?[[0,0],[-.45,.22],[-.60,.64],[-.24,.52],[0,1],[.24,.52],[.60,.64],[.45,.22]]
      :[[0,0],[-.40,.24],[-.52,.58],[-.28,.85],[0,1],[.28,.85],[.52,.58],[.40,.24]];
    const outline=margin.map(([u,t])=>at(u,t));
    for(let i=0;i<8;i+=2)quad(name,ridge,outline[i],outline[(i+1)%8],outline[(i+2)%8],mat);
  };
  const stem=(name,points,width)=>{
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],axis=unit(b.map((v,j)=>v-a[j]));
      const u=unit(cross(axis,Math.abs(axis[1])<.8?[0,1,0]:[1,0,0])),v=unit(cross(axis,u));
      for(const side of[u,v])quad(name,add(a,mul(side,-width/2)),add(a,mul(side,width/2)),
        add(b,mul(side,width*.28)),add(b,mul(side,-width*.28)),'ivy');
    }
  };
  const form=kind=>{stats.botanicalForms[kind]++;active.forms??={};active.forms[kind]=(active.forms[kind]||0)+1;};
  const ivyMat=(name,x,z,seed,scale=1)=>{
    form('ivyMat');
    const angle=seed*.73,along=[Math.cos(angle),0,Math.sin(angle)],side=[-along[2],0,along[0]];
    const at=t=>[x+along[0]*(t-.5)*.62*scale+side[0]*Math.sin(t*Math.PI)*.065*scale,
      .038+.035*Math.sin(t*Math.PI),z+along[2]*(t-.5)*.62*scale+side[2]*Math.sin(t*Math.PI)*.065*scale];
    stem(name,[0,.33,.66,1].map(at),.009*scale);
    for(let i=0;i<5;i++){
      const base=at(.08+i*.20),sign=i%2?1:-1,length=(.18+.07*random(seed,i))*scale;
      const tip=add(add(base,mul(side,sign*length)),add(mul(along,.12*scale),[0,.025+.027*random(seed,i+30),0]));
      leaf(name,base,tip,(.19+.07*random(seed,i+60))*scale,[0,1,0],'ivy',{shape:'ivy',fold:.018*scale});
    }
  };
  const cushion=(name,x,z,seed,height=.40,scale=1)=>{
    form('leafCushion');
    for(let i=0;i<9;i++){
      const angle=i*2.399963+seed*.43,dir=[Math.cos(angle),0,Math.sin(angle)],upper=i>=5;
      const radius=(upper?.22:.34)*scale*(.83+.17*random(seed,i));
      const base=[x+dir[0]*.02,.039,z+dir[2]*.02];
      const tip=[x+dir[0]*radius,.05+height*(upper?.79+.18*random(seed,i+20):.23+.17*random(seed,i+20)),z+dir[2]*radius];
      leaf(name,base,tip,(upper?.21:.25)*scale,unit([dir[0]*.35,.9,dir[2]*.35]),i%5===0?'ivy':'fern',{fold:.027*scale});
    }
  };
  const fern=(name,x,z,seed,height=.64,scale=1)=>{
    form('fernCrown');
    const fronds=4+seed%3;
    for(let i=0;i<fronds;i++){
      const angle=i/fronds*Math.PI*2+seed*.37,dir=[Math.cos(angle),0,Math.sin(angle)],side=[-dir[2],0,dir[0]];
      const reach=(.37+.06*random(seed,i))*scale;
      const at=t=>[x+dir[0]*reach*t,.045+height*Math.sin(t*Math.PI*.82),z+dir[2]*reach*t];
      stem(name,[0,.32,.64,1].map(at),.009*scale);
      for(const t of[.28,.50,.73])for(const sign of[-1,1]){
        const base=at(t),length=(.18-.075*t)*scale;
        const tip=add(add(base,mul(side,sign*length)),add(mul(dir,.053*scale),[0,-.023*scale,0]));
        leaf(name,base,tip,(.075-.018*t)*scale,unit([dir[0]*.2,.95,dir[2]*.2]),'fern',{shape:'lance',fold:.011*scale});
      }
      leaf(name,at(.88),add(at(1),mul(dir,.075*scale)),.063*scale,[0,1,0],'fern',{shape:'lance',fold:.01*scale});
    }
  };
  const border=b=>{
    const name='exterior_garden_hardscape';
    // A joined stone profile with a quiet bevel: only the narrow bed rim has
    // horizontal faces. There is no pavement sheet or repeated block lattice.
    const profile=[[0,-.015],[0,.047],[.025,.079],[.105,.079],[.13,.054],[.13,-.015]];
    const ring=([inset,y])=>[[b.x0+inset,y,b.z0+inset],[b.x1-inset,y,b.z0+inset],
      [b.x1-inset,y,b.z1-inset],[b.x0+inset,y,b.z1-inset]];
    for(let j=0;j<profile.length;j++){
      const a=ring(profile[j]),next=ring(profile[(j+1)%profile.length]);
      for(let i=0;i<4;i++)quad(name,a[i],next[i],next[(i+1)%4],a[(i+1)%4],'stone');
    }
    // One paired foundry panel faces the garden axis. The two mirrored scrolls
    // form a deliberate open figure, subordinate to the continuous stone edge.
    const x=b.x1<EXTERIOR_FOREGROUND.garden.paths.spine.x0?b.x1-.30:b.x0+.30,z=(b.z0+b.z1)/2;
    for(const sign of[-1,1]){
      cylinder(name,[x,.18,z+sign*.40],.020,.36,'iron',8);
      const curve=Array.from({length:8},(_,i)=>{
        const t=i/7;return[x,.13+Math.sin(t*Math.PI)*.19,z+sign*(.035+.365*t)];
      });
      for(let i=1;i<curve.length;i++)beam(name,curve[i-1],curve[i],.022,'iron');
      cylinder(name,[x,.265,z+sign*.40],.028,.025,'bronze',8);
    }
    beam(name,[x,.12,z-.4],[x,.12,z+.4],.025,'iron');
  };
  const fits=(bed,x,z,radius)=>x>=bed.x0+radius&&x<=bed.x1-radius&&z>=bed.z0+radius&&z<=bed.z1-radius
    &&!EXTERIOR_FOREGROUND_CONTRACT.treeAnchors.some(t=>Math.hypot(x-t.x,z-t.z)<EXTERIOR_FOREGROUND_CONTRACT.trunkClearance+radius);
  for(const bed of EXTERIOR_GARDEN_BEDS){
    placement(`${bed.id}-stone-edge`,'bed-edge','exterior_garden_hardscape',()=>border(bed));
    placement(`${bed.id}-cultivated-mass`,'garden-bed','exterior_garden_planting',()=>{
      const name='exterior_garden_planting';let index=0;
      // A close, offset low layer joins the bed into a botanical mass. Curving
      // ivy shoots, uneven drift density and varied leaves suppress the old
      // isolated radial rosettes without filling any lawn or path outside it.
      for(let z=bed.z0+.55,row=0;z<bed.z1-.50;z+=.57,row++)for(let x=bed.x0+.54+(row%2)*.25;x<bed.x1-.48;x+=.57){
        const n=index++,px=x+(random(bed.seed,n)-.5)*.15,pz=z+(random(bed.seed,n+200)-.5)*.15;
        if(random(bed.seed,n+400)>.84+bed.density*.12||!fits(bed,px,pz,.47))continue;
        ivyMat(name,px,pz,bed.seed+n,.85+.12*random(bed.seed,n+600));
      }
      // Broader middle leaves rise in unequal drifting islands, rather than
      // forming a second regular planting grid or a uniform hedge wall.
      index=0;
      for(let z=bed.z0+.72,row=0;z<bed.z1-.6;z+=1.03,row++)for(let x=bed.x0+.73+(row%2)*.36;x<bed.x1-.6;x+=1.04){
        const n=index++,px=x+(random(bed.seed,n+700)-.5)*.25,pz=z+(random(bed.seed,n+800)-.5)*.23;
        const drift=Math.sin((px-bed.x0)*1.4+bed.seed)+Math.cos((pz-bed.z0)*1.1-bed.seed*.2);
        if(drift<-.7||!fits(bed,px,pz,.45))continue;
        cushion(name,px,pz,bed.seed+n,.30+.13*random(bed.seed,n+900),.89+.10*random(bed.seed,n+930));
      }
      // Sparse divided fern crowns make the high layer airy. Their arching
      // stems and paired pinnae read differently from the broad lower leaves.
      for(let i=0;i<5;i++){
        const u=[.24,.74,.52,.29,.76][i],v=[.23,.29,.55,.77,.77][i];
        const px=bed.x0+(bed.x1-bed.x0)*u,pz=bed.z0+(bed.z1-bed.z0)*v;
        if(!fits(bed,px,pz,.62))continue;
        fern(name,px,pz,bed.seed+i,.53+.12*random(bed.seed,i+950),.93);
      }
    });
  }
  for(const bed of EXTERIOR_ARRIVAL_BEDS)placement(`${bed.id}-low-planting`,'arrival-bed','exterior_arrival_planting',()=>{
    const name='exterior_arrival_planting',z=(bed.z0+bed.z1)/2;let index=0;
    for(let x=bed.x0+.49;x<=bed.x1-.48;x+=.54){
      const n=index++,px=x+(random(bed.seed,n)-.5)*.06;
      ivyMat(name,px,z,bed.seed+n,.85);
      if(n%2===0)cushion(name,px,z,bed.seed+n,.34+.08*random(bed.seed,n+30),.82);
      if(n%4===1)fern(name,px,z,bed.seed+n,.43,.72);
    }
  });
  if(stats.triangles>EXTERIOR_FOREGROUND_CONTRACT.maximumTriangles)throw Error(`Exterior foreground exceeds its bounded geometry cost: ${stats.triangles}`);
  return stats;
}

