import {NodeIO} from '@gltf-transform/core';
import fs from 'node:fs';
const names=['yard_sign','exterior_story_plaque','public_exit_sign','notice_board','hall_entrance_sign','tower_plaque','equipment_rack','cash_terminal','pew','open_score','power_box_01','sofa_01','arm_chair_01','classic_console_01','horse_head','sofa_02','green_chair_01'];
const io=new NodeIO(),docs=await Promise.all(['public/assets/conservatory-props.glb','public/assets/conservatory-acquisitions.glb'].map(file=>io.read(file))),report={};
for(const name of names){
 const mesh=docs.flatMap(doc=>doc.getRoot().listMeshes()).find(m=>m.getName()===name);if(!mesh)throw Error('Missing '+name);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],planes=new Map();
 for(const primitive of mesh.listPrimitives()){
  const p=primitive.getAttribute('POSITION'),indices=primitive.getIndices(),material=primitive.getMaterial()?.getName();
  for(let i=0;i<p.getCount();i++){const a=p.getElement(i,[]);for(let k=0;k<3;k++){min[k]=Math.min(min[k],a[k]);max[k]=Math.max(max[k],a[k]);}}
  for(let i=0;i<(indices?.getCount()||p.getCount());i+=3){
   const [a,b,c]=[0,1,2].map(j=>p.getElement(indices?indices.getScalar(i+j):i+j,[]));
   const u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n);
   if(len<1e-12)continue;const axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs)));
   if(Math.abs(n[axis]/len)<.999)continue;
   const coordinate=(a[axis]+b[axis]+c[axis])/3,sign=Math.sign(n[axis]),key=[axis,Math.round(coordinate*10000),sign,material].join(':');
   if(!planes.has(key))planes.set(key,{axis,coordinate,sign,material,area:0,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
   const plane=planes.get(key);plane.area+=len/2;
   for(const point of[a,b,c])for(let k=0;k<3;k++){plane.min[k]=Math.min(plane.min[k],point[k]);plane.max[k]=Math.max(plane.max[k],point[k]);}
  }
 }
 report[name]={min,max,planes:[...planes.values()].toSorted((a,b)=>b.area-a.area).slice(0,40)};
}
fs.writeFileSync('artifacts/lettering-study/host-surface-planes.json',JSON.stringify(report,null,2)+'\n');
for(const name of names)console.log(JSON.stringify({name,min:report[name].min,max:report[name].max,planes:report[name].planes.slice(0,8)}));
