// Original, opaque leaf geometry for the old school's British roof garden.
// Added to the existing structure owner; no atlas, cutout card, emitter, wind
// pass or new gameplay footprint is needed. The shared prop acquisition and
// its existing vegetation response supply the lighting and final dither.
const freeze=value=>{
  if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
const material=(name,rgb,kind,{transmission=.12,wetness=.55}={})=>({
  name,alphaMode:'OPAQUE',doubleSided:true,
  pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:0,roughnessFactor:.94},
  extras:{vegetationClass:kind,vegetationTransmission:transmission,vegetationWetness:wetness},
});
export const ROOF_GARDEN_FLORA_MATERIALS=freeze({
  ivy:material('roof garden weathered ivy leaf',[.095,.175,.110],'leaf',{transmission:.22,wetness:.65}),
  fern:material('roof garden shaded fern leaf',[.145,.235,.150],'leaf',{transmission:.25,wetness:.58}),
  stem:material('roof garden woody stems',[.135,.125,.070],'stem',{transmission:0,wetness:.42}),
  grass:material('roof garden hardy ochre grass',[.245,.235,.125],'leaf',{transmission:.12,wetness:.36}),
  soil:material('roof garden rain-dark urn soil',[.060,.050,.035],'soil',{transmission:0,wetness:.22}),
  cream:material('roof garden muted cream petals',[.580,.550,.405],'leaf',{transmission:.06,wetness:.22}),
  pink:material('roof garden faded pink petals',[.405,.245,.265],'leaf',{transmission:.06,wetness:.22}),
  ochre:material('roof garden old gold wallflower petals',[.465,.320,.115],'leaf',{transmission:.06,wetness:.22}),
});

const urns=[
  {id:'southwest-planted-urn',kind:'urn',x:-11.5,y:1.28,z:12.95,height:.72,petal:'cream',seed:1},
  {id:'southeast-planted-urn',kind:'urn',x:11.5,y:1.28,z:12.95,height:.77,petal:'pink',seed:4},
  {id:'west-planted-urn',kind:'urn',x:-11.5,y:1.28,z:7.5,height:.64,petal:'ochre',seed:7},
  {id:'east-planted-urn',kind:'urn',x:11.5,y:1.28,z:7.5,height:.68,petal:'cream',seed:9},
];
const ferns=[
  ...[-1,1].flatMap(side=>[.3,5.1,10.6].map((z,i)=>({
    id:`${side<0?'west':'east'}-shaded-fern-${i}`,kind:'fern',x:side*11.55,y:.35,z,
    scale:.87+i*.045,height:.43+i*.025,seed:12+i+(side>0?3:0),
  }))),
  ...[-9.2,-3.5,1.7,8.9].map((x,i)=>({id:`south-shaded-fern-${i}`,kind:'fern',x,y:.35,z:13.02,
    scale:.88+(i%2)*.05,height:.43+(i%2)*.04,seed:20+i})),
];
const flowers=[
  ...[-1,1].flatMap(side=>[1.7,5.95,11.4].map((z,i)=>({
    id:`${side<0?'west':'east'}-wallflowers-${i}`,kind:'wallflower',x:side*11.53,y:.35,z,
    scale:.72,height:.37+(i%2)*.05,petal:['ochre','cream','pink'][i],seed:30+i+(side>0?4:0),
  }))),
  ...[-6.0,-.7,6.6].map((x,i)=>({id:`south-wallflowers-${i}`,kind:'wallflower',x,y:.35,z:13.03,
    scale:.76,height:.40,petal:['pink','ochre','cream'][i],seed:40+i})),
];
const grasses=[
  ...[-1,1].flatMap(side=>[-.8,2.45,6.3,11.65].map((z,i)=>({
    id:`${side<0?'west':'east'}-hardy-grass-${i}`,kind:'grass',x:side*11.57,y:.35,z,
    scale:.72,height:.29+(i%3)*.025,seed:50+i+(side>0?5:0),
  }))),
  ...[-10,-5.7,-.1,6.9,10.2].map((x,i)=>({id:`south-hardy-grass-${i}`,kind:'grass',x,y:.35,z:13.07,
    scale:.70,height:.28+(i%2)*.04,seed:62+i})),
];
const ivy=[-1,1].flatMap(side=>[3,9].map((z,i)=>({
  id:`${side<0?'west':'east'}-pier-ivy-${i}`,kind:'ivy',x:side*11.18,y:3.33,z,
  side,drop:1.78+(i%2)*.16,seed:74+i+(side>0?3:0),
})));
export const ROOF_GARDEN_FLORA_PLACEMENTS=freeze([...urns,...ferns,...flowers,...grasses,...ivy]);
export const ROOF_GARDEN_FLORA_CONTRACT=freeze({
  owner:'academic_roof_structure',bounds:{x0:-12.04,x1:12.04,z0:-13.54,z1:13.54},
  standingSideMinAbsX:11,standingSouthMinZ:12.5,overheadMinY:2.75,
  urnLipY:1.28,urnSoilTopY:1.32,maximumUrnCrownY:2.15,
  materialCount:8,maximumAddedTriangles:8000,newMeshCount:0,
  protected:'North bridge, northern skyline opening, supported glass, both seats, main promenade, Ren and quest geometry.',
});

const add=(a,b)=>a.map((n,i)=>n+b[i]);
const mul=(a,n)=>a.map(v=>v*n);
const sub=(a,b)=>a.map((n,i)=>n-b[i]);
const lerp=(a,b,t)=>a.map((n,i)=>n+(b[i]-n)*t);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const n=Math.hypot(...a)||1;return mul(a,1/n);};

export function buildRoofGardenFlora({m,materials,addQuad,addBeam,addCylinder}){
  if(!m||!Array.isArray(materials))throw Error('Roof garden flora needs its existing structure mesh and materials.');
  const ids={};
  for(const[key,descriptor]of Object.entries(ROOF_GARDEN_FLORA_MATERIALS)){
    let index=materials.findIndex(material=>material.name===descriptor.name);
    if(index<0){index=materials.length;materials.push(structuredClone(descriptor));}
    ids[key]=index;
  }
  const stats={owner:ROOF_GARDEN_FLORA_CONTRACT.owner,triangles:0,quads:0,beams:0,cylinders:0,
    materials:ids,placements:[]};
  let active;
  const bounds=point=>{for(let a=0;a<3;a++){
    active.bounds.min[a]=Math.min(active.bounds.min[a],point[a]);
    active.bounds.max[a]=Math.max(active.bounds.max[a],point[a]);
  }};
  const quad=(a,b,c,d,mat)=>{addQuad(m,a,b,c,d,ids[mat]);[a,b,c,d].forEach(bounds);stats.quads++;stats.triangles+=2;active.triangles+=2;};
  const beam=(a,b,width,mat)=>{
    addBeam(m,a,b,width,ids[mat]);
    // Conservative square-beam envelope at any direction, matching the root
    // geometry helper's rectangular section rather than treating it as a line.
    for(const p of[a,b])for(const dx of[-width/Math.SQRT2,width/Math.SQRT2])
      for(const dy of[-width/Math.SQRT2,width/Math.SQRT2])for(const dz of[-width/Math.SQRT2,width/Math.SQRT2])bounds(add(p,[dx,dy,dz]));
    stats.beams++;stats.triangles+=12;active.triangles+=12;
  };
  const soil=(p)=>{
    addCylinder(m,[p.x,p.y+.015,p.z],.305,.05,ids.soil,12);
    for(const dx of[-.305,.305])for(const dy of[-.025,.025])for(const dz of[-.305,.305])bounds([p.x+dx,p.y+.015+dy,p.z+dz]);
    stats.cylinders++;stats.triangles+=48;active.triangles+=48;
  };
  const stem=(points,width,mat='stem')=>{
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],direction=unit(sub(b,a));
      const side=unit(cross(direction,Math.abs(direction[1])<.8?[0,1,0]:[1,0,0]));
      const other=unit(cross(direction,side));
      for(const axis of[side,other])quad(add(a,mul(axis,-width*.5)),add(a,mul(axis,width*.5)),
        add(b,mul(axis,width*.30)),add(b,mul(axis,-width*.30)),mat);
    }
  };
  const leaf=(base,tip,width,mat,{normal=[0,1,0],lobed=false,rounded=false,fold=.018}={})=>{
    const along=sub(tip,base),side=unit(cross(along,normal));
    const point=(u,t)=>add(add(base,mul(along,t)),mul(side,u*width));
    const ridge=add(point(0,.47),mul(normal,fold));
    if(lobed||rounded){
      // An actual eight-point ivy margin, folded about its raised midrib.
      // The opaque silhouette has lobes and notches before dithering.
      const margin=rounded
        ?[[0,0],[-.42,.22],[-.58,.53],[-.38,.85],[0,1],[.38,.85],[.58,.53],[.42,.22]]
        :[[0,0],[-.45,.22],[-.60,.64],[-.24,.52],[0,1],[.24,.52],[.60,.64],[.45,.22]];
      const outline=margin.map(([u,t])=>point(u,t));
      for(let i=0;i<outline.length;i+=2)quad(ridge,outline[i],outline[(i+1)%8],outline[(i+2)%8],mat);
    }else{
      quad(base,point(-.5,.47),tip,ridge,mat);
      quad(base,ridge,tip,point(.5,.47),mat);
    }
  };
  const flower=(centre,scale,mat,angle)=>{
    const normal=unit([Math.cos(angle)*.32,.92,Math.sin(angle)*.32]);
    const u=unit(cross(normal,[0,0,1])),v=unit(cross(normal,u));
    for(let i=0;i<4;i++){
      const a=angle+i*Math.PI/2,direction=add(mul(u,Math.cos(a)),mul(v,Math.sin(a)));
      const tangent=unit(cross(normal,direction));
      const p=(r,w,lift=0)=>add(add(add(centre,mul(direction,r*scale)),mul(tangent,w*scale)),mul(normal,lift*scale));
      quad(p(.012,-.014),p(.046,-.030,.008),p(.073,0,.014),p(.046,.030,.008),mat);
    }
    quad(add(centre,mul(u,.019*scale)),add(centre,mul(v,.019*scale)),
      add(centre,mul(u,-.019*scale)),add(centre,mul(v,-.019*scale)),'ochre');
  };
  const fern=(p,fronds=6)=>{
    const scale=p.scale||1,height=p.height||.45;
    for(let i=0;i<fronds;i++){
      const angle=i/fronds*Math.PI*2+p.seed*.41,dir=[Math.cos(angle),0,Math.sin(angle)];
      const side=[-dir[2],0,dir[0]];
      const at=t=>[p.x+dir[0]*.345*scale*t,p.y+height*Math.sin(t*Math.PI*.75),p.z+dir[2]*.345*scale*t];
      stem([0,.25,.5,.75,1].map(at),.009*scale,'stem');
      for(const t of[.23,.42,.61,.80])for(const sign of[-1,1]){
        const base=at(t),length=(.13-.065*t)*scale;
        const tip=add(add(base,mul(side,sign*length)),mul(dir,.037*scale));tip[1]-=.018*scale;
        leaf(base,tip,(.074-.025*t)*scale,'fern',{fold:.010*scale});
      }
    }
  };
  const grass=p=>{
    const scale=p.scale||1;
    for(let i=0;i<7;i++){
      const a=i*2.39996+p.seed*.27,base=[p.x+Math.cos(a)*.025,p.y,p.z+Math.sin(a)*.025];
      const tip=[p.x+Math.cos(a)*.15*scale,p.y+p.height*(.72+(i%3)*.14),p.z+Math.sin(a)*.15*scale];
      leaf(base,tip,.032*scale,'grass',{normal:unit([Math.sin(a),.6,-Math.cos(a)]),fold:.024*scale});
    }
  };
  const wallflowers=(p,count=3)=>{
    const scale=p.scale||1;
    for(let i=0;i<count;i++){
      const angle=i*2.39996+p.seed*.53,dir=[Math.cos(angle),0,Math.sin(angle)],tangent=[-dir[2],0,dir[0]];
      const base=[p.x+dir[0]*.055*scale,p.y,p.z+dir[2]*.055*scale];
      const top=[p.x+dir[0]*.18*scale,p.y+p.height*(.82+(i%3)*.09),p.z+dir[2]*.18*scale];
      stem([base,lerp(base,top,.52),top],.011*scale);
      for(const t of[.30,.56]){
        const start=lerp(base,top,t),tip=add(add(start,mul(tangent,(t<.5?-1:1)*.12*scale)),[0,.045*scale,0]);
        leaf(start,tip,.065*scale,'ivy',{fold:.012*scale});
      }
      flower(top,.90*scale,p.petal,angle);
      const branch=add(add(lerp(base,top,.78),mul(tangent,.065*scale)),[0,.045*scale,0]);
      stem([lerp(base,top,.64),branch],.007*scale);
      flower(branch,.76*scale,p.petal,angle+.8);
    }
  };
  const pierIvy=p=>{
    const normal=[-p.side,0,0],points=[];
    for(let i=0;i<8;i++)points.push([p.x+Math.sin(i*.9+p.seed)*.018,p.y-p.drop*i/7,p.z+Math.sin(i*.92+p.seed)*.11]);
    for(let i=1;i<points.length;i++)beam(points[i-1],points[i],.013,'stem');
    for(let i=0;i<10;i++){
      const t=i/9,base=lerp(points[Math.min(6,Math.floor(t*7))],points[Math.min(7,Math.floor(t*7)+1)],t===1?1:(t*7)%1);
      const tip=add(base,[0,-.23-(i%2)*.035,(i%2?1:-1)*.10]);
      leaf(base,tip,.20+(i%3)*.018,'ivy',{normal,lobed:true,fold:.024});
    }
    // A short side shoot rests across the capital, remaining above headroom.
    const shoot=[[p.x,p.y-.08,p.z],[p.x,p.y-.17,p.z+.34],[p.x,p.y-.27,p.z+.61]];
    stem(shoot,.012);
    for(let i=1;i<shoot.length;i++)leaf(shoot[i],add(shoot[i],[0,-.21,.055]),.23,'ivy',{normal,lobed:true,fold:.022});
  };
  const urnCushion=p=>{
    // Two overlapping rosettes make one planted crown rather than a bouquet
    // of bare stems. Broad, folded opaque margins remain substantial at the
    // ordinary four-metre view; finer pinnae and flowers still rise above it.
    for(const[count,radius,rise,width,lift]of[[10,.31,.045,.245,.055],[6,.245,.235,.255,.090]]){
      for(let i=0;i<count;i++){
        const angle=i/count*Math.PI*2+p.seed*.43,dir=[Math.cos(angle),0,Math.sin(angle)];
        const base=[p.x+dir[0]*.025,p.y+lift,p.z+dir[2]*.025];
        const tip=[p.x+dir[0]*radius,p.y+lift+rise,p.z+dir[2]*radius];
        leaf(base,tip,width,i%4===0?'ivy':'fern',{
          normal:unit([dir[0]*.52,.72,dir[2]*.52]),rounded:true,fold:.039,
        });
      }
    }
    // Three leafy trails spill over the inward lip and down the urn's body.
    // Even the nearest edge stays inside the old outer collision strip.
    const inward=-Math.sign(p.x),normal=[inward,0,0];
    for(const lane of[-.105,0,.105]){
      const points=[[p.x+inward*.17,p.y+.08,p.z+lane],
        [p.x+inward*.285,p.y-.13,p.z+lane+.024],
        [p.x+inward*.35,p.y-.29,p.z+lane+.05]];
      stem(points,.011);
      for(const t of[.18,.54,.90]){
        const start=t<.5?lerp(points[0],points[1],t*2):lerp(points[1],points[2],(t-.5)*2);
        leaf(start,add(start,[inward*.026,-.16,.025]),.215,'ivy',{normal,lobed:true,fold:.023});
      }
    }
  };
  for(const placement of ROOF_GARDEN_FLORA_PLACEMENTS){
    active={id:placement.id,kind:placement.kind,triangles:0,bounds:{min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}};
    stats.placements.push(active);
    if(placement.kind==='urn'){
      soil(placement);
      const base={...placement,y:placement.y+.04,scale:.94};
      urnCushion(base);
      wallflowers(base,5);
      fern({...base,scale:.78,height:.49,seed:base.seed+5},4);
      grass({...base,scale:.8,height:.45,seed:base.seed+9});
    }else if(placement.kind==='fern')fern(placement);
    else if(placement.kind==='wallflower')wallflowers(placement);
    else if(placement.kind==='grass')grass(placement);
    else if(placement.kind==='ivy')pierIvy(placement);
  }
  return stats;
}
