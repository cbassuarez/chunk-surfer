import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as FP from '../../../src/world/floorplan.js';
import * as PROPS from '../../../src/game/props.js';
import {conservatory} from '../../../src/data/floorplan/conservatory.js';
import {WORLD_INSCRIPTIONS} from '../../../src/data/world-inscriptions.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
const placements=PROPS.propsInit(FP),hosts=PROPS.renderInstances({inscriptions:false});
const final=PROPS.attachInscriptions(hosts),byId=new Map(hosts.map(p=>[p.id,p]));
const data=readFileSync('public/assets/conservatory-props.glb'),json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString()),meshNames=new Set(json.meshes.map(m=>m.name));
const point=(host,p)=>{const s=host.scale||1,sx=s*(host.scaleX??1),sy=s*(host.scaleY??1),sz=s*(host.scaleZ??1),c=Math.cos(host.yaw||0),n=Math.sin(host.yaw||0);
  return[host.x+c*p[0]*sx-n*p[2]*sz,(host.y||0)+p[1]*sy,host.z+n*p[0]*sx+c*p[2]*sz];};
const entries=WORLD_INSCRIPTIONS.map(record=>{
  const host=byId.get(record.hostId);assert.ok(host,`Missing exact host ${record.hostId}`);assert.equal(host.mesh,record.hostMesh,`Host mesh changed for ${record.id}`);
  const attached=final.filter(p=>p.letteringId===record.id);assert.equal(attached.length,1,`Expected exactly one attachment for ${record.id}`);
  const ink=attached[0];assert.ok(meshNames.has(ink.mesh),`Installed production mesh missing ${ink.mesh}`);
  for(const key of['x','y','z','yaw','scale','scaleX','scaleY','scaleZ','zone','structural','waterlineBody','waterlineOffset'])assert.equal(ink[key],host[key],`${record.id}:${key} moved away from host`);
  assert.equal(ink.blocks,false);assert.equal(ink.interactive,false);
  const worldCorners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>point(host,record.center.map((v,i)=>v+record.readerRight[i]*x*record.widthM/2+record.up[i]*y*record.heightM/2)));
  return{id:record.id,copy:record.copy,mesh:record.mesh,hostId:host.id,hostMesh:host.mesh,host,
    hostLocalCenter:record.center,worldCenter:point(host,record.center),worldCorners,readerRight:record.readerRight,up:record.up,widthM:record.widthM,heightM:record.heightM};
});
const groups=[...new Set(placements.flatMap(p=>p.renderGroups||[p.renderGroup]))].filter(Boolean);
for(const group of groups){const list=PROPS.renderInstances({group}),ids=new Set(list.map(p=>p.id));
  for(const ink of list.filter(p=>p.letteringHostId))assert.ok(ids.has(ink.letteringHostId),`Orphan attachment in ${group}`);}
const report={date:new Date().toISOString(),count:entries.length,groups,packSha256:createHash('sha256').update(data).digest('hex'),entries,
  scope:'Production compiled host placements, group visibility and installed attachment mesh identity. Main state/door/waterline visibility behavior is tested separately; this is not a rendered or human reading acceptance.'};
mkdirSync('artifacts/lettering-production',{recursive:true});writeFileSync('artifacts/lettering-production/attachment-report.json',`${JSON.stringify(report,null,2)}\n`);
console.log(`Verified ${entries.length} exact host attachments across ${groups.length} groups`);
