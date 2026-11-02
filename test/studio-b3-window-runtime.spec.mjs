// Draft lives outside production until the root applies the shared partition
// and placements. Once copied into test/, imports resolve from that repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const repo=fs.existsSync(new URL('../src/world/floorplan.js',import.meta.url))?new URL('../',import.meta.url):pathToFileURL('/Users/seb/chunk-surfer/');
const {conservatory:C}=await import(new URL('src/data/floorplan/conservatory.js',repo));
const FP=await import(new URL('src/world/floorplan.js',repo));
const PROPS=await import(new URL('src/game/props.js',repo));
const {B3_WINDOW,b3WindowCrossing}=await import(new URL('src/data/studio-b3-window.js',repo));
const {b3ClearRay}=await import(new URL('src/render/studio-b3-glass.js',repo));
const {parseGlb}=await import(new URL('tools/chunk_surfer/rebuild-tree-crowns.mjs',repo));
const {readBusAccessor:readAccessor}=await import(new URL('tools/chunk_surfer/build-outskirts-bus-passage.mjs',repo));
FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
PROPS.propsInit(FP);
const drawn=new Map(PROPS.renderInstances({inscriptions:false}).map(p=>[p.id,p])),keys=new Set(['master']);
const operator=[21.6,-2.38,10.5],mouthHead=[15.5,-2.38,19];
function reachable(from,to){const todo=[from],seen=new Set([from.join(',')]);for(let i=0;i<todo.length;i++){const[x,y]=todo[i];if(x===to[0]&&y===to[1])return true;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(nx<10||nx>78||ny<10||ny>49||seen.has(k))continue;if(FP.canStep(x,y,nx,ny,{keys}).ok){seen.add(k);todo.push([nx,ny]);}}}return false;}
function declaration(source,name){const start=source.indexOf(`function ${name}(`);if(start<0)throw Error('Missing actual renderer '+name);let args=source.indexOf('(',start),parentheses=1;for(args++;parentheses;args++){if(source[args]==='(')parentheses++;else if(source[args]===')')parentheses--;}let at=source.indexOf('{',args),depth=1;for(at++;depth;at++){if(source[at]==='{')depth++;else if(source[at]==='}')depth--;}return source.slice(start,at);}
const renderer=fs.readFileSync(new URL('src/render/props3d.js',repo),'utf8'),matrixOwner={};vm.createContext(matrixOwner);vm.runInContext(['identity','multiply','nodeMatrix','modelMatrix'].map(n=>declaration(renderer,n)).join('\n')+'\nthis.pose=modelMatrix;this.nodePose=nodeMatrix;',matrixOwner);
const pack=parseGlb(fs.readFileSync(new URL('public/assets/b3-studio-props.glb',repo))),meshByName=new Map(pack.json.meshes.map((m,i)=>[m.name,{m,index:i}]));
function trianglesFor(instance){const found=meshByName.get(instance.mesh);assert.ok(found,'required B3 geometry missing: '+instance.mesh);const node=pack.json.nodes.find(n=>n.mesh===found.index)||{},matrix=matrixOwner.pose(instance,matrixOwner.nodePose(node)),point=p=>[0,1,2].map(r=>matrix[r]*p[0]+matrix[4+r]*p[1]+matrix[8+r]*p[2]+matrix[12+r]);return found.m.primitives.flatMap(p=>{const pos=readAccessor(pack,p.attributes.POSITION),ix=readAccessor(pack,p.indices);return Array.from({length:ix.length/3},(_,k)=>[0,1,2].map(c=>point(pos.slice(ix[k*3+c]*3,ix[k*3+c]*3+3))));});}
function segmentHit(from,to,tri){const sub=(a,b)=>a.map((x,k)=>x-b[k]),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],d=sub(to,from),e1=sub(tri[1],tri[0]),e2=sub(tri[2],tri[0]),p=cross(d,e2),det=dot(e1,p);if(Math.abs(det)<1e-9)return null;const tvec=sub(from,tri[0]),u=dot(tvec,p)/det;if(u<0||u>1)return null;const q=cross(tvec,e1),v=dot(d,q)/det;if(v<0||u+v>1)return null;const t=dot(e2,q)/det;return t>.001&&t<.999?t:null;}

test('the actual compiled south pane opens the console-to-B3-mouth sightline on both render sides',()=>{
 const crossing=b3WindowCrossing(operator,mouthHead);assert.equal(crossing?.paneId,'b3-control-south-window');assert.ok(Math.abs(crossing.point[2]-14.8196721311)<1e-6);assert.equal(crossing.point[1],-2.38);
 for(const observer of[[43,21],[31,35]]){const slice=FP.physicalRenderPlanFor(...observer);assert.equal(b3ClearRay(slice,operator,mouthHead),true,'real compiled geometry blocks the B3 mouth from '+observer);}
 // The added opening must not be explained by accidentally removing the pier.
 assert.equal(b3WindowCrossing(operator,[15.5,-2.38,16.4]),null,'this ray meets the retained middle pier');
});

test('both optical panes keep exact sill/head and block real body steps; the intermediate pier remains masonry',()=>{
 for(const pane of B3_WINDOW.panes){for(let y=pane.z0*2;y<pane.z1*2;y++)for(const x of[36,37]){
  assert.equal(FP.isSolid(x,y),false,pane.id+' is not visible air');assert.ok(FP.isCollisionOnly(x,y),pane.id+' lost body collision');assert.ok(Math.abs(FP.floorAt(x,y)-B3_WINDOW.bottom)<1e-5);assert.ok(Math.abs(FP.ceilAt(x,y)-B3_WINDOW.top)<1e-5);
  assert.deepEqual(FP.canStep(x===36?35:38,y,x,y,{keys}),{ok:false,why:'wall'});
  for(const observer of[[30,20],[42,20]]){const slice=FP.physicalRenderPlanFor(...observer),physical=FP.logicalToPhysical(x,y),i=(Math.round(physical.z)-slice.originY)*slice.w+Math.round(physical.x)-slice.originX;assert.equal(slice.solid[i],0);assert.ok(Math.abs(slice.floor[i]-B3_WINDOW.bottom)<1e-5);assert.ok(Math.abs(slice.ceil[i]-B3_WINDOW.top)<1e-5);}
 }}
 for(const y of[26,27])for(const x of[36,37])assert.equal(FP.isSolid(x,y),true,'pier at13..14m was erased');assert.deepEqual(FP.physicalSpanData().overlaps,[]);
});

test('both new frame instances survive real PROPS placement at the optical plane and basement floor',()=>{
 for(const[id,mesh,z]of[['b3-window-surround','b3_window_surround',10.5],['b3-window-south-surround','b3_window_south_surround',15.5]]){
  const authored=PROPS.propById(id),rendered=drawn.get(id);assert.ok(authored,id+' was removed by propsInit');assert.ok(rendered);assert.equal(authored.x,19,'frame anchor must sit in booth air, not the raised window cell');assert.equal(authored.renderOffsetX,-.5);assert.equal(FP.isSolid(authored.rx,authored.ry),false);assert.equal(rendered.mesh,mesh);assert.equal(rendered.x,18.5);assert.equal(rendered.y,-4);assert.equal(rendered.z,z);
  assert.ok(!trianglesFor(rendered).some(t=>segmentHit(operator,mouthHead,t)!=null),id+' visually blocks the intended optical path');
 }
});

test('actual new console, chair, patchbay and rack geometry leave the operator-to-doorhead view clear',()=>{
 for(const[id,mesh,fallback]of[['b3-control-console','b3_mixing_console',null],['b3-chair','b3_engineer_chair','chair'],['b3-patchbay','b3_patchbay','legacy_patchbay'],['b3-rack-1','b3_outboard_rack','equipment_rack']]){
  const instance=drawn.get(id);assert.ok(instance,id+' lost its stable prop identity');assert.equal(instance.mesh,mesh);if(fallback)assert.equal(instance.fallbackMesh,fallback,id+' lost its base-asset recovery');assert.ok(!trianglesFor(instance).some(t=>segmentHit(operator,mouthHead,t)!=null),id+' blocks the actual standing-operator head ray');
 }
});

test('B3 still has one southern entrance, with B2 service as the only access into the enclosed booth',()=>{
 FP.setDoorOpen('b2-corridor',true);FP.setDoorOpen('b3-b2-service',false);assert.equal(reachable([30,41],[20,20]),true);assert.equal(reachable([30,41],[44,20]),false);assert.equal(reachable([56,24],[44,20]),false);
 FP.setDoorOpen('b3-b2-service',true);assert.equal(reachable([56,24],[44,20]),true);assert.equal(reachable([30,41],[44,20]),true);
 assert.equal(FP.isSolid(42,36),true,'south booth wall gained a B3 door');for(let x=50;x>=40;x--)assert.ok(PROPS.propCanOccupy(x,24),'B2 booth approach blocked by revised furniture at '+x);
 const exits=[];for(let x=12;x<36;x++)if(FP.canStep(x,37,x,38,{keys}).ok)exits.push(x);assert.ok(exits.length,'south B3 entrance closed');assert.equal(exits.at(-1)-exits[0]+1,exits.length,'B3 has more than one separated south entrance');
});
