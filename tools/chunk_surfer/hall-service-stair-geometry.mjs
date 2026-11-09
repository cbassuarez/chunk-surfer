import{HALL_STAGE_SERVICE_STAIR as S,hallServiceTreadHeight}from'../../src/data/atrium-circulation.js';
export function buildHallServiceStair({mesh,MAT,addBox,addBeam}){
  const m=mesh(S.mesh),point=(x,y,z)=>[x-S.at.x,y,z-S.at.y];
  addBox(m,point(99.5,-.08,11),[1,.16,2],MAT.wood);
  for(let i=0;i<S.treads;i++){
    const x=100+i*.5+.25,h=hallServiceTreadHeight(i);
    addBox(m,point(x,(h-1.68)/2,10.75),[.5,h+1.68,S.width],MAT.dark);
    addBox(m,point(x,h-.025,10.75),[.5,.05,S.width],MAT.wood);
    addBox(m,point(x-.24,h+.004,10.75),[.02,.008,S.width],MAT.brass);
    for(const z of[10,11.5]){
      if(i%2===0||i===7)addBeam(m,point(x,h,z),point(x,h+.95,z),.045,MAT.dark);
      if(i<7)addBeam(m,point(x,h+.95,z),point(x+.5,hallServiceTreadHeight(i+1)+.95,z),.055,MAT.dark);
    }
  }
  for(const z of[10,12]){
    for(const x of[99.05,99.95])addBeam(m,point(x,0,z),point(x,.95,z),.045,MAT.dark);
    addBeam(m,point(99,.95,z),point(100,.95,z),.055,MAT.dark);
  }
  addBeam(m,point(100,.95,12),point(100,.95,11.5),.055,MAT.dark);
  return m;
}
