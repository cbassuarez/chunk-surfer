// Rendered continuations between the existing outer-sprawl building rows.
// These are scenery at grade, outside the playable district. They extend the
// same road grain visible from the roof without opening new walkable routes.
export const DISTRICT_SCENERY_ROADS=Object.freeze([
  {id:'north-inner-west',x:-79,z:-41.5,w:10,d:7.4},
  {id:'north-inner-east',x:93,z:-41.5,w:254,d:7.4},
  {id:'north-outer-west',x:-79,z:-63,w:10,d:7.2},
  {id:'north-outer-east',x:93,z:-63,w:254,d:7.2},
  {id:'south-inner',x:68,z:136,w:304,d:7.4},
  {id:'south-outer',x:68,z:160.5,w:304,d:7.2},
  {id:'west-inner',x:-43,z:49,w:7.4,d:134},
  {id:'west-outer',x:-67,z:49,w:7.2,d:134},
  {id:'east-inner',x:175,z:49,w:7.4,d:134},
  {id:'east-outer',x:201,z:49,w:7.2,d:134},
].map(Object.freeze));

export function buildDistrictSceneryRoads({mesh,materials,addBox,addQuad}){
  const material=(name,color,roughness)=>{
    const index=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],
      metallicFactor:.04,roughnessFactor:roughness}});
    return index;
  };
  const tarmac=material('outer district wet tarmac',[.060,.075,.084],.72);
  const pavement=material('outer district rain-dark pavement',[.105,.118,.123],.87);
  const water=material('outer district shallow road water',[.078,.105,.132],.25);
  const m=mesh('district_outer_streets');
  // This mesh shares the (-7,-7) anchor with district_outer_sprawl.
  const X=(x)=>x+7,Z=(z)=>z+7;
  for(const road of DISTRICT_SCENERY_ROADS){
    const alongX=road.w>road.d;
    addBox(m,[X(road.x),-.035,Z(road.z)],[road.w,.07,road.d],tarmac);
    // Low, dark pavements give the streets a readable width from above. They
    // are broad planes, avoiding another bright micro-geometry line lattice.
    for(const side of[-1,1]){
      const x=road.x+(alongX?0:side*(road.w/2+.58));
      const z=road.z+(alongX?side*(road.d/2+.58):0);
      addBox(m,[X(x),.025,Z(z)],alongX?[road.w,.05,1.16]:[1.16,.05,road.d],pavement);
    }
    // A few irregular sheltered wet patches catch the actual exterior light.
    // No emitted glow, road stripe or repeated light bar competes with rooms.
    const count=alongX?Math.max(1,Math.floor(road.w/57)):2;
    for(let i=0;i<count;i++){
      const along=(i+.36)/count-.5,side=(i%2?1:-1)*.66;
      const cx=road.x+(alongX?along*road.w:side);
      const cz=road.z+(alongX?side:along*road.d);
      const length=3.6+(i%3)*1.7,width=.65+(i%2)*.24;
      const p=(a,b)=>[X(cx+(alongX?a:b)),.006,Z(cz+(alongX?b:a))];
      const corners=[p(-length/2,-width/2),p(-length*.38,width/2),
        p(length*.47,width*.34),p(length/2,-width*.26)];
      if(!alongX)corners.reverse();
      addQuad(m,...corners,water);
    }
  }
}
