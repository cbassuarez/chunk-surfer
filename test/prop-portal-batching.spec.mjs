import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import * as P from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {BUILDING_WINDOWS} from '../src/data/building-windows.js';
import {buildingWindowInteriorInstance,shouldHideCrossEnvelopeProp} from '../src/game/prop-visibility.js';
import {portalBatchKey} from '../src/render/source-mesh-portals.js';
const path=process.env.PORTAL_RENDERER_FILE||new URL('../src/render/props3d.js',import.meta.url);
const source=readFileSync(path,'utf8');
const extracted=source.slice(source.indexOf('const SOURCE_DOOR_SCENERY='),source.indexOf('\nfunction uploadInstances('));
const skip=source.match(/const REFLECTION_SKIP=new Set\([^;]+;/)?.[0];
assert.ok(extracted.includes('function visibleGroups(')&&skip,'exercise the real visibleGroups body and its reflection policy');
function batches(instances,options={},{relief=[],pressure=[]}={}){
 const c={staticInstances:instances,dynamicInstances:[],roofWatcherInstances:[],emergencyShadowInstances:[],diagnosticInstances:[],
  stillnessReliefDrawInstances:relief,pressureSurfaceInstances:pressure,
  portalBatchKey,
  propDiagnosticsEnabled:false,propDiagnosticOptions:null,propInstanceVisible:()=>true,resolvedMeshName:p=>p.mesh,
  characterSnapshot:p=>p.character?{key:p.character}:null,pack:{catalog:new Map()}};
 vm.createContext(c);vm.runInContext(`${skip}\n${extracted}\nvar result=visibleGroups([0,0,0],90,${JSON.stringify(options)});`,c);return Array.from(c.result.values(),group=>Array.from(group));
}
FP.compile(conservatory.levels,conservatory);P.propsInit(FP);P.setColliderGroupEnabled('glass-court',true);
const w=BUILDING_WINDOWS.find(w=>w.id==='W3-foyer-north');
const selected=P.renderInstances({group:'ground',inscriptions:false})
 .filter(p=>p.mesh==='tower_bulkhead'&&!shouldHideCrossEnvelopeProp(p,{observerZone:ZONE.civicCourt,exteriorWindow:w}))
 .map(p=>buildingWindowInteriorInstance(p,w)||p);

test('actual W3 foliage fixtures and same-mesh outside fittings cannot inherit each other’s portal',()=>{
 assert.ok(selected.some(i=>i.exteriorClipPlane));assert.ok(selected.some(i=>!i.exteriorClipPlane));
 for(const order of [selected,[...selected].reverse()]) for(const mode of [{},{reflection:true}]){
  const groups=batches(order,mode);assert.equal(groups.length,2);
  const indoor=groups.find(g=>g.some(i=>i.exteriorClipPlane)),outdoor=groups.find(g=>g.some(i=>!i.exteriorClipPlane));
  assert.ok(indoor.every(i=>i.exteriorClipPlane&&JSON.stringify(i.exteriorPortal)===JSON.stringify(indoor[0].exteriorPortal)));
  assert.ok(outdoor.every(i=>!i.exteriorClipPlane));
 }
});
test('identical portals still instance together; different planes or apertures cannot share first-item uniforms',()=>{
 const plane=[0,0,1,-4],w3=[0,3,84,88,1.05,3.45];
 const a={id:'a',mesh:'board',exteriorClipPlane:plane,exteriorPortal:w3};
 const b={id:'b',mesh:'board',exteriorClipPlane:[...plane],exteriorPortal:[...w3]};
 const c={id:'c',mesh:'board',exteriorClipPlane:[0,0,-1,4],exteriorPortal:w3};
 const d={id:'d',mesh:'board',exteriorClipPlane:plane,exteriorPortal:[0,3,84,87,1.05,3.45]};
 const ordinary={id:'ordinary',mesh:'board'};
 const g=batches([a,b,c,d,ordinary]);assert.equal(g.length,4);assert.deepEqual(g.map(x=>x.map(i=>i.id)),[['a','b'],['c'],['d'],['ordinary']]);
});
test('unclipped and folded non-W3 instances retain their original independent groups',()=>{
 const normal={id:'plain',mesh:'yard_van'},fold={id:'fold',mesh:'yard_van',outskirtsFoldVisibility:.5};
 for(const opt of [{},{reflection:true}])assert.deepEqual(batches([normal,fold],opt).map(g=>g.map(i=>i.id)),[['plain'],['fold']]);
});
test('runtime relief and pressure surfaces obey the same actual portal grouping as ordinary props',()=>{
 const plane=[0,0,1,-4],portal=[0,3,84,88,1.05,3.45],otherPortal=[0,3,84,87,1.05,3.45],
   ordinary={id:'ordinary',mesh:'board'},inside={id:'inside',mesh:'board',exteriorClipPlane:plane,exteriorPortal:portal},
   relief={id:'relief',mesh:'board',exteriorClipPlane:[...plane],exteriorPortal:[...portal]},
   pressure={id:'pressure',mesh:'board',exteriorClipPlane:[...plane],exteriorPortal:otherPortal};
 for(const mode of [{},{reflection:true}]){
  const groups=batches([ordinary,inside],mode,{relief:[relief],pressure:[pressure]});
  assert.deepEqual(groups.map(group=>group.map(instance=>instance.id)),[['ordinary'],['inside','relief'],['pressure']]);
  assert.ok(groups.every(group=>group.every(instance=>JSON.stringify(instance.exteriorPortal)===JSON.stringify(group[0].exteriorPortal))));
 }
});
test('clip uniforms are explicitly uploaded for each group and the mesh name is decoded before material rules',()=>{
 assert.match(source,/gl\.uniform4fv\(U\('uExteriorClipPlane'\),list\[0\]\.exteriorClipPlane\|\|\[0,0,0,0\]\)/);
 assert.match(source,/const portal=list\[0\]\.exteriorPortal;gl\.uniform4fv\(U\('uExteriorPortalA'\)/);
 assert.match(source,/name=marker<0\?key:key\.slice\(0,marker\),m=pack\?\.catalog\.get\(groupMeshName\(name\)\)/);
});
