// Small fragments of the same coastal roadside recur between Source's rooms.
// These are decorative images, never supports, barriers or a new route owner.
import {sourceRestVehicleImage} from './source-rest-memories.js';
import {coastalBodyMatrix,coastalMultiply} from '../data/coastal-memory.js';

// On the outward charts each fragment is set off the walk, at a pause where a
// turn gives time to recognize it. The rail kit is one batched prop per chart.
export const SOURCE_COASTAL_ECHOES=Object.freeze([
  Object.freeze({id:'ii-abyss',chartId:0,x:35,y:-8,z:-32,yaw:Math.PI/2,wreck:true}),
  Object.freeze({id:'outward-one',chartId:1,x:-101,y:16.8,z:-20,yaw:0}),
  Object.freeze({id:'outward-two',chartId:2,x:-142,y:8.4,z:-40,yaw:Math.PI/2}),
  Object.freeze({id:'outward-three',chartId:3,x:-160,y:0,z:-39,yaw:0,wreck:true}),
  Object.freeze({id:'outward-four',chartId:4,x:-150,y:8.4,z:-78,yaw:Math.PI/2}),
]);

// A half-buried length of crash barrier, with one surviving roadside post.
// Merged locally to cost one draw and to stay well outside walkable support.
const faces=[[0,2,3,0,1,2],[4,7,6,4,6,5],[0,4,5,0,5,1],[1,5,6,1,6,2],[2,6,7,2,7,3],[3,7,4,3,4,0]];
function box(g,x0,x1,y0,y1,z0,z1){const n=g.p.length/3;g.p.push(x0,y0,z0,x1,y0,z0,x1,y0,z1,x0,y0,z1,x0,y1,z0,x1,y1,z0,x1,y1,z1,x0,y1,z1);for(const f of faces)g.i.push(...f.map(i=>i+n));}
export function sourceCoastalEchoGeometry(){
  const g={p:[],i:[]};
  box(g,-2.4,2.4,.53,.72,-.12,.12);box(g,-2.4,2.4,.27,.39,-.09,.09);
  for(const x of[-1.8,0,1.8])box(g,x-.055,x+.055,-.3,.74,-.08,.08);
  box(g,2.85,2.98,-.25,1.22,-.065,.065);
  return {'coastal-echo-rail':{...g,material:'worn-metal',base:[.44,.43,.38,1],roughness:.85}};
}
export function sourceCoastalEchoFrame(state){
  if(state?.phase!=='wrong-return')return [];
  const chart=Number.isInteger(state.chartId)?state.chartId:null;
  return SOURCE_COASTAL_ECHOES.filter(site=>chart===null||site.chartId===chart).flatMap(site=>{
    const common={region:'wrong-return',chartId:site.chartId,coastalEcho:true,structural:false,decorative:true,collidable:false,noShadow:true,cullRadius:12};
    const rows=[{id:site.id+'-rail',mesh:'source-continuation-coastal-echo-rail',x:site.x,y:site.y,z:site.z,yaw:site.yaw,...common},
      {id:site.id+'-reflector',mesh:'source-continuation-rest-lamp-light',x:site.x+Math.cos(site.yaw)*2.92,y:site.y+1.12,z:site.z+Math.sin(site.yaw)*2.92,yaw:site.yaw,sx:.14,sy:.16,sz:.14,...common}];
    if(site.wreck){
      const body=coastalBodyMatrix({position:[site.x+5,site.y-1.7,site.z-5],heading:site.yaw+.4,pitch:-.34,roll:.25});
      for(const p of sourceRestVehicleImage('coastal-echo-'+site.id,{x:0,y:0,z:0,yaw:0},{kind:'coastal-echo-wreck'})){
        const m=coastalMultiply(body,p.matrix);rows.push({...p,...common,id:site.id+'-'+p.id,matrix:m,x:m[12],y:m[13],z:m[14],coastalEchoWreck:true});
      }
      // Two small lit lenses carry the same submerged-car memory at a glance.
      for(const side of[-1,1]){const q=[side*.6,.65,-2.2],pos=[0,1,2].map(k=>body[k]*q[0]+body[k+4]*q[1]+body[k+8]*q[2]+body[k+12]);
        rows.push({id:site.id+'-headlamp-'+side,mesh:'source-continuation-rest-lamp-light',x:pos[0],y:pos[1],z:pos[2],sx:.28,sy:.25,sz:.28,...common,coastalEchoHeadlamp:true});}
    }
    return rows;
  });
}
