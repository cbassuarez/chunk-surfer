import {SCENE_DOCK_FABRIC as F,SCENE_DOCK_PORTALS} from '../../src/data/scene-dock-dressing.js';

// Open interiors, folded edges and material divisions survive torch/dither
// where a flat generic model and tiny printed details do not.
export function buildSceneDockDressing({mesh,addBox,addBeam,addCylinder,addCylinderX,MAT}){
 const box=(m,p,s,mat=MAT.steel,yaw=0,pitch=0)=>addBox(m,p,s,mat,yaw,pitch);
 const beam=(m,a,b,w=.025,mat=MAT.steel)=>addBeam(m,a,b,w,mat);
 const wheel=(m,x,z,y=.115,r=.11)=>{
  addCylinderX(m,[x,y,z],r,.065,MAT.cone,14);addCylinderX(m,[x,y,z],r*.47,.073,MAT.steel,12);
  box(m,[x,y+.07,z],[.055,.12,.055]);
 };
 {
  const m=mesh('scene_dock_dispatch_desk');
  // Preserve the historical .7175m clipboard work plane.
  box(m,[0,.6875,0],[1.55,.06,.74],MAT.wood);box(m,[0,.646,.354],[1.52,.045,.025],MAT.dark);
  for(const x of[-.72,.72])for(const z of[-.29,.29]){
   box(m,[x,.33,z],[.045,.65,.045]);box(m,[x,.018,z],[.075,.036,.075],MAT.cone);
  }
  beam(m,[-.72,.13,.29],[.72,.13,.29],.035);box(m,[-.47,.348,0],[.43,.61,.61],MAT.pubGreen);
  for(const y of[.15,.34,.53]){
   box(m,[-.47,y,.314],[.39,.167,.018],MAT.agedWhite);box(m,[-.47,y+.035,.333],[.13,.019,.025]);
   box(m,[-.47,y-.036,.328],[.12,.037,.008],MAT.paper);
  }
  // Pigeonholes face the room; their upper ledges are too small to host paper.
  box(m,[.36,.875,-.293],[.72,.31,.055],MAT.dark);
  for(const x of[.015,.365,.715])box(m,[x,.875,-.17],[.025,.31,.27],MAT.wood);
  for(const y of[.73,.88,1.03])box(m,[.365,y,-.17],[.72,.025,.27],MAT.wood);
  for(const [x,y] of[[.19,.77],[.51,.92]])box(m,[x,y,-.155],[.24,.025,.22],MAT.paper,.03);
  box(m,[-.55,.738,-.20],[.18,.04,.20],MAT.dark);box(m,[-.55,.78,-.20],[.065,.045,.08],MAT.black);
 }
 {
  const m=mesh('scene_dock_hand_truck');
  for(const x of[-.23,.23]){
   beam(m,[x,.12,.12],[x,1.16,.23],.04);beam(m,[x,1.16,.23],[x,1.25,.07],.04);
   box(m,[x,1.25,-.015],[.055,.055,.19],MAT.cone);
  }
  for(const y of[.2,.49,.78,1.06])beam(m,[-.23,y,.12+y*.095],[.23,y,.12+y*.095],.03);
  box(m,[0,.055,-.09],[.52,.05,.43]);box(m,[0,.62,.175],[.54,.055,.025],MAT.cloth);
  box(m,[.04,.62,.152],[.085,.075,.025],MAT.brass);wheel(m,-.275,.19);wheel(m,.275,.19);
  beam(m,[-.28,.115,.19],[.28,.115,.19],.03);box(m,[0,.063,-.265],[.5,.018,.018],MAT.agedWhite);
 }
 const crate=(m,c,w,h,d)=>{
  const[x,y,z]=c;box(m,[x,y+.03,z],[w,.06,d],MAT.wood);box(m,[x,y+.07,z],[w-.09,.035,d-.09],MAT.dark);
  for(const dx of[-w/2+.025,w/2-.025])for(const dz of[-d/2+.025,d/2-.025])box(m,[x+dx,y+h/2,z+dz],[.05,h,.05],MAT.wood);
  for(const yy of[.12,h-.08]){
   for(const dz of[-d/2+.02,d/2-.02])box(m,[x,y+yy,z+dz],[w,.085,.045],MAT.wood);
   for(const dx of[-w/2+.02,w/2-.02])box(m,[x+dx,y+yy,z],[.045,.085,d],MAT.wood);
  }
  for(const dx of[-w/2+.023,w/2-.023])for(const dz of[-d/2+.02,d/2-.02])box(m,[x+dx,y+.10,z+dz],[.065,.17,.065]);
  box(m,[x,y+h-.095,z-d/2-.004],[w*.43,.09,.013],MAT.paper);
 };
 {
  const m=mesh('scene_dock_freight_crates');
  crate(m,[0,0,0],.84,.53,.70);crate(m,[.01,.54,0],.82,.52,.68);crate(m,[-.015,1.07,.01],.80,.53,.68);
  for(const z of[-.24,.24])box(m,[0,.035,z],[.86,.07,.09],MAT.dark);
 }
 {
  const m=mesh('scene_dock_crate_low');crate(m,[0,0,0],1.2,.43,.47);
  box(m,[0,.423,0],[1.16,.025,.43],MAT.wood);for(const x of[-.48,.48])box(m,[x,.443,0],[.08,.025,.45]);
 }
 {
  const m=mesh('scene_dock_road_case_open'),w=1.2,d=.48,base=.07,top=.34;
  box(m,[0,base,0],[w,.09,d],MAT.black);
  for(const x of[-w/2+.025,w/2-.025])box(m,[x,.21,0],[.05,.28,d],MAT.pubGreen);
  for(const z of[-d/2+.025,d/2-.025])box(m,[0,.21,z],[w,.28,.05],MAT.pubGreen);
  box(m,[0,.125,0],[1.09,.035,.37],MAT.cone);
  // Foam rails leave the recorder-shaped absence promised by the encounter.
  for(const x of[-.38,.38])box(m,[x,.20,0],[.16,.12,.35],MAT.cone);
  for(const y of[.087,top])for(const z of[-.24,.24])box(m,[0,y,z],[1.2,.025,.025]);
  for(const x of[-.58,.58])for(const z of[-.22,.22])box(m,[x,.21,z],[.035,.27,.035]);
  box(m,[0,.31,-.262],[.23,.035,.035]);for(const x of[-.19,.19])box(m,[x,.27,-.263],[.055,.085,.035],MAT.brass);
  box(m,[0,.55,.27],[1.18,.51,.045],MAT.pubGreen,0,-.13);box(m,[0,.55,.24],[1.07,.41,.025],MAT.cone,0,-.13);
  for(const x of[-.57,.57])beam(m,[x,.32,.23],[x,.79,.30],.025);box(m,[0,.795,.30],[1.18,.025,.025]);
  for(const x of[-.49,.49])for(const z of[-.15,.15])wheel(m,x,z,.04,.035);
 }
 {
  const m=mesh('scene_dock_cable_reel');
  // A cable drum, not the swimming-lane rope reel formerly used here.
  for(const x of[-.29,.29]){
   beam(m,[x,.05,-.30],[x,.56,.02],.035);beam(m,[x,.05,.30],[x,.56,.02],.035);box(m,[x,.025,0],[.065,.05,.68],MAT.cone);
  }
  beam(m,[-.29,.56,.02],[.39,.56,.02],.035);addCylinderX(m,[0,.56,.02],.32,.08,MAT.wood,24);
  for(const x of[-.20,.20]){
   addCylinderX(m,[x,.56,.02],.40,.045,MAT.wood,28);addCylinderX(m,[x*1.16,.56,.02],.07,.02,MAT.steel,14);
   for(let i=0;i<6;i++){const a=i*Math.PI/3;box(m,[x*1.13,.56+Math.sin(a)*.22,.02+Math.cos(a)*.22],[.025,.047,.047],MAT.dark);}
  }
  beam(m,[.27,.56,.02],[.37,.78,.02],.025);addCylinderX(m,[.40,.78,.02],.035,.10,MAT.cone,12);
  box(m,[-.08,.56,-.39],[.18,.10,.012],MAT.paper);
 }
 {
  const m=mesh('scene_dock_shutter_bar');
  box(m,[0,1.35,0],[2.36,.09,.085]);box(m,[0,1.405,.034],[2.36,.025,.15]);box(m,[0,1.295,.034],[2.36,.025,.15]);
  for(const x of[-.95,.95]){
   box(m,[x,1.33,.10],[.18,.29,.055],MAT.agedWhite);box(m,[x,1.26,-.07],[.14,.09,.20]);
   for(const y of[1.41,1.25])addCylinderX(m,[x,y,.13],.012,.018,MAT.brass,8);
  }
  for(const x of[-.37,.37])box(m,[x,1.35,-.055],[.07,.07,.025],MAT.brass);
 }
 {
  const m=mesh('scene_dock_chandelier_cage');
  for(const x of[-.94,.94])for(const z of[-.76,.76]){
   wheel(m,x,z,.08,.07);box(m,[x,.17,z],[.14,.18,.14]);beam(m,[x,.22,z],[x,2.69,z],.045);
  }
  for(const y of[.24,2.68]){
   for(const z of[-.76,.76])beam(m,[-1.04,y,z],[1.04,y,z],.065);for(const x of[-1.04,1.04])beam(m,[x,y,-.84],[x,y,.84],.065);
  }
  for(const x of[-1.01,1.01]){
   beam(m,[x,.26,-.77],[x,2.65,.77],.018);beam(m,[x,.26,.77],[x,2.65,-.77],.018);
   for(const y of[.70,1.18,1.66,2.14])beam(m,[x,y,-.77],[x,y,.77],.016);
  }
  for(const x of[-.70,-.35,0,.35,.70])beam(m,[x,.28,.79],[x,2.65,.79],.014);
  beam(m,[-1.03,2.51,0],[1.03,2.51,0],.07);box(m,[0,.30,0],[2.06,.065,1.68],MAT.wood);
  box(m,[.79,1.10,.81],[.11,.17,.035],MAT.brass);box(m,[-.80,2.47,-.05],[.23,.20,.025],MAT.paper,.1);
 }
 {
  const m=mesh('scene_dock_check_position');
  for(const x of[-.78,.78])box(m,[x,.006,0],[.035,.012,1.6],MAT.paper);
  for(const z of[-.78,.78])box(m,[0,.006,z],[1.6,.012,.035],MAT.paper);
  for(const x of[-.18,.18])box(m,[x,.009,0],[.035,.006,.40],MAT.agedWhite,x<0?-.45:.45);
 }
 {
  const m=mesh('scene_dock_room_fabric'),o=F.origin,r=F.room;
  const b=(x,y,z,w,h,d,mat)=>box(m,[x-o.x,y,z-o.z],[w,h,d],mat);
  // Shallow, worn granolithic slab joints avoid another collision/floor plane.
  for(let x=r.x0+.035;x<r.x1-.05;x+=2)for(let z=r.z0+.035;z<r.z1-.05;z+=2){
   const w=Math.min(1.982,r.x1-.035-x),d=Math.min(1.982,r.z1-.035-z);
   b(x+w/2,.003,z+d/2,w,.010,d,(Math.round(x+z)%3)?MAT.concrete:MAT.stone);
  }
  const south=SCENE_DOCK_PORTALS.find(p=>p.id==='dock-inner-service');
  for(const [a,c] of[[r.x0,south.x-south.width/2-.10],[south.x+south.width/2+.10,r.x1]]){
   b((a+c)/2,.015,r.z1-.20,c-a,.022,.30,MAT.slate);b((a+c)/2,.68,r.z1-.035,c-a,1.34,.07,MAT.glazedBrick);
   for(const y of[.20,.92])b((a+c)/2,y,r.z1-.09,c-a,.11,.055,MAT.dark);
  }
  b((r.x0+r.x1)/2,.68,r.z0+.035,r.x1-r.x0,1.34,.07,MAT.glazedBrick);
  b((r.x0+r.x1)/2,1.40,r.z0+.085,r.x1-r.x0,.10,.08,MAT.stone);
  for(let x=r.x0+.85;x<r.x1-.25;x+=2.35){
   b(x,2.74,r.z0+.08,.20,5.34,.16,MAT.plaster);
   if(Math.abs(x-south.x)>south.width/2+.22)b(x,1.70,r.z1-.08,.19,3.26,.16,MAT.plaster);
  }
  // Canonical apertures own the clear openings; guard strips sit outside them.
  for(const p of SCENE_DOCK_PORTALS){
   const isX=p.axis==='x',half=p.width/2;
   for(const sign of[-1,1]){
    const x=p.x+(isX?sign*(half+.10):-.10),z=p.z+(isX?-.10:sign*(half+.10));
    b(x,1.58,z,isX?.11:.13,3.16,isX?.13:.11,MAT.steel);b(x,.24,z,isX?.15:.17,.48,isX?.17:.15,MAT.slate);
   }
   box(m,[p.x-o.x,.012,p.z-o.z],isX?[p.width,.024,.30]:[.30,.024,p.width],MAT.steel);
   for(let t=-half+.08;t<half;t+=.13)b(p.x+(isX?t:0),.025,p.z+(isX?0:t),isX?.025:.25,.002,isX?.25:.025,MAT.cone);
  }
  // A dispatch bay, real services and a maintenance ledge articulate the edges.
  for(const y of[.32,.92,1.53])b(58.16,y,6.0,.10,.10,3.0,MAT.dark);
  b(58.13,2.16,6.0,.14,.10,4.5,MAT.agedWhite);
  for(let z=4.2;z<8.1;z+=.5)b(58.21,2.16,z,.035,.16,.025,MAT.steel);
  b(70.8,.795,4.25,2.2,.07,.62,MAT.wood);
  for(const x of[69.85,71.75])for(const z of[4.04,4.47])b(x,.39,z,.045,.78,.045,MAT.steel);
  b(70.8,.13,4.25,2.10,.05,.56,MAT.dark);
  // Truss knees, a cable ladder and vertical riser make the high roof legible.
  for(const x of[59.0,63.7,68.4,72.0]){
   beam(m,[x-o.x,5.02,r.z0+.12-o.z],[x-o.x,4.67,r.z0+.82-o.z],.045);
   beam(m,[x-o.x,5.02,r.z1-.12-o.z],[x-o.x,4.67,r.z1-.82-o.z],.045);
  }
  for(const z of[5.0,5.36])beam(m,[58.0-o.x,4.72,z-o.z],[72.6-o.x,4.72,z-o.z],.025);
  for(let x=58.1;x<72.5;x+=.42)beam(m,[x-o.x,4.72,5.0-o.z],[x-o.x,4.72,5.36-o.z],.018);
  b(72.72,2.5,4.17,.11,4.9,.13,MAT.agedWhite);
 }
}
