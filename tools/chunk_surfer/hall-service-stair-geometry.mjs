import{HALL_STAGE_SERVICE_STAIR as S,hallServiceTreadHeight}from'../../src/data/atrium-circulation.js';
// Canonical actual L landing; Source retains the previously delivered mesh.
export function buildHallServiceStair({mesh,MAT,addBox,addBeam}){
 const m=mesh(S.mesh),point=(x,y,z)=>[x-S.at.x,y,z-S.at.y],L=S.landing,F=S.from;
 addBox(m,point(L.x+L.width/2,-.08,L.y+L.depth/2),[L.width,.16,L.depth],MAT.wood);
 for(let i=0;i<S.treads;i++){
  const x=F.x+i*S.going+S.going/2,h=hallServiceTreadHeight(i),z=F.y+S.width/2;
  addBox(m,point(x,(h-1.68)/2,z),[S.going,h+1.68,S.width],MAT.dark);
  addBox(m,point(x,h-.025,z),[S.going,.05,S.width],MAT.wood);
  addBox(m,point(x-S.going/2+.01,h+.004,z),[.02,.008,S.width],MAT.brass);
  for(const edge of[F.y,F.y+S.width]){
   if(i%2===0||i===S.treads-1)addBeam(m,point(x,h,edge),point(x,h+S.railHeight,edge),.045,MAT.dark);
   if(i<S.treads-1)addBeam(m,point(x,h+S.railHeight,edge),point(x+S.going,hallServiceTreadHeight(i+1)+S.railHeight,edge),.055,MAT.dark);
  }
 }
 for(const z of[L.y,L.y+L.depth]){
  for(const x of[L.x+.05,L.x+L.width-.05])addBeam(m,point(x,0,z),point(x,S.railHeight,z),.045,MAT.dark);
  addBeam(m,point(L.x,S.railHeight,z),point(L.x+L.width,S.railHeight,z),.055,MAT.dark);
 }
 const x=L.x+L.width;for(const z of[F.y+S.width,L.y+L.depth])addBeam(m,point(x,0,z),point(x,S.railHeight,z),.045,MAT.dark);
 addBeam(m,point(x,S.railHeight,F.y+S.width),point(x,S.railHeight,L.y+L.depth),.055,MAT.dark);
 return m;
}
