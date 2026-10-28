import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFalseReturnPlan, sourceFalseReturnRenderFrame, createSourceFalseReturnRenderer, SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE } from '../src/render/source-false-return-renderer.js';
import { sourceFalseReturnDoorFraction } from '../src/game/source-false-return.js';
import { doorAssembly } from '../src/data/source-door-fields.js';
import { CELL, EYE, F, ZONE, MATERIAL } from '../src/data/floorplan/legend.js';
import * as R3 from '../src/render/r3d.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { buildSourceFalseReturnLayout } from '../src/game/source-false-return-layout.js';

const encode = h => Math.round((h + 8) / 32 * 255);
function layout() {
  const w = 36, h = 36, originX = -12, originY = -8, rgba = new Uint8Array(w*h*4), material = new Uint8Array(w*h).fill(MATERIAL.practiceFoam), ambient = new Uint8Array(w*h).fill(64);
  for (let i=0;i<w*h;i++) rgba.set([encode(4.8),encode(7.5),0,ZONE.practice],i*4);
  const kit = doorAssembly('practice-acoustic-single');
  const door = (id,x,z,nx) => ({ id,x,z,feet:4.8,yaw:Math.PI/2,width:1,halfWidth:.5,normal:{x:nx,z:0},archetype:kit.archetype,hinge:nx<0?'left':'right',swing:'room-in',frameMesh:kit.frameMesh,headMesh:kit.headMesh,mesh:kit.leafMesh,leafCount:kit.leafCount,activeLeaves:[0],aperture:kit.aperture,leaf:kit.leaf,openSeconds:.45 });
  return { plan:{rgba,w,h,material,ambient,originX,originY,heightOffset:0},
    doors:[door('practice-west-1',0,0,-1),door('practice-east-1',4,0,1),door('practice-west-2',0,4,-1),door('practice-east-2',4,4,1),door('practice-west-3',0,8,-1)],
    props:[{id:'piano-room-one',mesh:'grand_piano',x:-3,y:4.8,z:0},{id:'piano-room-five',mesh:'grand_piano',x:-3,y:4.8,z:8},{id:'corridor-chair',mesh:'chair',x:2,y:4.8,z:8}],
    lights:[{id:'practice-light-one',x:-3,y:7,z:0,radius:5,intensity:.5,color:[1,.78,.51]},{id:'practice-light-five',x:-3,y:7,z:8,radius:5,intensity:.5,color:[1,.78,.51]},{id:'corridor-light',x:2,y:7,z:8,radius:5,intensity:.5,color:[1,.78,.51]}],
    bounds:{minX:-6,maxX:11.5,minZ:-4,maxZ:13.5},spawn:{x:2,z:8,feet:4.8,yaw:-Math.PI/2,pitch:0},lightingContext:{ambientColor:[.66,.51,.35],ambientIntensity:.027,captureExposure:1,whitePointScale:1} };
}
const state = (extra={}) => ({x:2,z:8,feet:4.8,yaw:-Math.PI/2,pitch:-.2,elapsed:0,opened:[],sourceDoors:[],doorMotion:{},doorOpen:{},...extra});
function fixture({gate=null,authoredGate=null,missing=[],packFailure=false,configure=()=>{},getTorch}={}) {
  const l=layout(),calls=[],catalog=new Set(l.props.map(p=>p.mesh));
  configure(l);
  for(const p of l.props||[])if(p.mesh)catalog.add(p.mesh);
  for(const d of l.doors) for(const m of [d.frameMesh,d.headMesh,d.mesh]) if(m&&!missing.includes(m))catalog.add(m);
  let releases=0;
  const renderer=Object.fromEntries(Object.keys(R3).filter(k=>typeof R3[k]==='function').map(k=>[k,(...args)=>{calls.push({name:k,args});return k==='r3dFrame'?true:undefined;} ]));
  renderer.r3dBasePropsReady=async()=>{calls.push({name:'base',args:[]});return gate?await gate:true;};
  renderer.r3dAuthoredPropsReady=async()=>{calls.push({name:'authored',args:[]});return authoredGate?await authoredGate:renderer.r3dBasePropsReady();};
  const props={propMeshCatalog:()=>[...catalog],setPressureInstances:value=>calls.push({name:'pressure',args:[value]}),async addPropPack(url){calls.push({name:'pack',args:[url]});if(packFailure)throw Error('door bank unavailable');for(const d of l.doors)for(const m of[d.frameMesh,d.headMesh,d.mesh])if(m)catalog.add(m);}};
  const owner=createSourceFalseReturnRenderer({layout:l,renderer,props,getTorch,resolveAsset:url=>'fixture:'+url,onRelease(){releases++;calls.push({name:'release',args:[]});}});
  return {owner,l,calls,catalog,releases:()=>releases};
}
const prop = (frame,id,suffix='leaf-0') => frame.props.find(p=>p.id===`source-false-return-${id}-${suffix}`);
const transform=(m,p)=>[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);

test('the first four opened rooms retain the actual plan, props, lamps and ordinary first-person camera',()=>{
  const l=layout(),before=JSON.stringify(l),s=state({opened:l.doors.slice(0,4).map(d=>d.id),doorOpen:Object.fromEntries(l.doors.slice(0,4).map(d=>[d.id,true]))}),view=sourceFalseReturnPlan(l,s),frame=sourceFalseReturnRenderFrame(l,s,{planView:view});
  assert.deepEqual(view.plan.rgba,l.plan.rgba);assert.deepEqual(view.plan.material,l.plan.material);assert.deepEqual(view.plan.ambient,l.plan.ambient);assert.equal(view.changed,0);assert.equal(view.mask.some(Boolean),false);
  for(const p of l.props)assert.ok(frame.props.includes(p));assert.equal(frame.hiddenProps.length,0);assert.equal(frame.lights.length,l.lights.length);
  assert.deepEqual(frame.authoredCamera,{eye:[s.x,s.feet+EYE,s.z],yaw:s.yaw,pitch:s.pitch});assert.equal(JSON.stringify(l),before);
});

test('the fifth intent changes only a copied aperture-local room-side wedge, with origin and floor height intact',()=>{
  const l=layout(),s=state({opened:l.doors.slice(0,4).map(d=>d.id),sourceDoors:['practice-west-3']}),before=JSON.stringify(l),view=sourceFalseReturnPlan(l,s),door=l.doors[4];
  assert.ok(view.changed>10);assert.ok(view.changed<view.mask.length/3);assert.notEqual(view.plan.rgba,l.plan.rgba);assert.notEqual(view.plan.ambient,l.plan.ambient);
  for(let i=0;i<view.mask.length;i++){
    const x=((i%l.plan.w)+l.plan.originX+.5)*CELL,z=(Math.floor(i/l.plan.w)+l.plan.originY+.5)*CELL;
    if(view.mask[i]){assert.ok(x<door.x-.12,'no corridor cell is consumed');assert.ok(Math.abs(z-door.z)<=3.25);assert.equal(view.plan.rgba[i*4],encode(door.feet));assert.equal(view.plan.rgba[i*4+2],F.SKY);assert.equal(view.plan.rgba[i*4+3],ZONE.sourceSpace);assert.equal(view.plan.material[i],MATERIAL.sourceField);assert.equal(view.plan.ambient[i],1);}
    else{assert.deepEqual(view.plan.rgba.slice(i*4,i*4+4),l.plan.rgba.slice(i*4,i*4+4));assert.equal(view.plan.material[i],l.plan.material[i]);assert.equal(view.plan.ambient[i],l.plan.ambient[i]);}
  }
  assert.equal(JSON.stringify(l),before);view.plan.rgba.fill(0);assert.equal(JSON.stringify(l),before,'GPU-consumer mutation cannot reach FP buffers');
});

test('Source suppresses only local room-side props and lamps while retaining all physical door joinery',()=>{
  const l=layout(),s=state({sourceDoors:['practice-west-3']}),frame=sourceFalseReturnRenderFrame(l,s);
  assert.deepEqual(frame.hiddenProps,['piano-room-five']);assert.ok(frame.props.some(p=>p.id==='piano-room-one'));assert.ok(frame.props.some(p=>p.id==='corridor-chair'));
  assert.equal(frame.lights.some(p=>p.id==='practice-light-five'),false);assert.ok(frame.lights.some(p=>p.id==='practice-light-one'));
  for(const d of l.doors)for(const suffix of['frame','head','leaf-0'])assert.ok(prop(frame,d.id,suffix));
});

test('after five distinct leaves clear, every existing door visibly agrees with the controller Source-bound rule',()=>{
  const l=layout(),s=state({opened:l.doors.map(d=>d.id),sourceDoors:['practice-west-3']}),frame=sourceFalseReturnRenderFrame(l,s);
  assert.deepEqual(frame.sourceDoors,[...l.doors.map(d=>d.id)].sort());assert.ok(frame.hiddenProps.includes('piano-room-one'));assert.ok(frame.hiddenProps.includes('piano-room-five'));assert.ok(frame.props.some(p=>p.id==='corridor-chair'));
});

test('actual left and right inward hinges follow saved .45 second fractions, retain their anchors and freeze on saved time',()=>{
  const l=layout();
  for(const d of l.doors.slice(0,2)){
    const s=state({elapsed:.225,doorOpen:{[d.id]:true},doorMotion:{[d.id]:{from:0,to:1,startedAt:0,duration:.45}}}),closed=prop(sourceFalseReturnRenderFrame(l,state()),d.id),mid=prop(sourceFalseReturnRenderFrame(l,s),d.id),open=prop(sourceFalseReturnRenderFrame(l,{...s,elapsed:.45}),d.id);
    assert.equal(sourceFalseReturnDoorFraction(s,d.id),.5);assert.equal(mid.openFraction,.5);assert.deepEqual(transform(mid.matrix,[0,0,0]),transform(closed.matrix,[0,0,0]));
    assert.notDeepEqual([...mid.matrix],[...closed.matrix]);assert.notDeepEqual([...mid.matrix],[...open.matrix]);
    const left=d.hinge!=='right',reflect=left?1:-1,theta=d.yaw+(left?-1:1)*-1*Math.PI*.49*.5;
    assert.ok(Math.abs(mid.matrix[0]-Math.cos(theta)*reflect)<1e-6);assert.ok(Math.abs(mid.matrix[2]-Math.sin(theta)*reflect)<1e-6);
    assert.deepEqual(sourceFalseReturnRenderFrame(l,s),sourceFalseReturnRenderFrame(l,s),'renderer has no wall clock');
    const reversed=state({elapsed:.225,doorOpen:{[d.id]:false},doorMotion:{[d.id]:{from:.5,to:0,startedAt:.225,duration:.225}}});
    assert.deepEqual([...prop(sourceFalseReturnRenderFrame(l,reversed),d.id).matrix],[...mid.matrix]);
  }
});

test('acquisition clears Source and Horizon residue and uses the ordinary shared plan/dither path without persistent camera targets',async()=>{
  const h=fixture();assert.equal(await h.owner.initialize(),true);assert.equal(await h.owner.initialize(),true);assert.equal(h.owner.ready(),true);
  assert.ok(h.calls.some(c=>c.name==='r3dSetHorizon'&&c.args[0]===null));assert.ok(h.calls.some(c=>c.name==='r3dSetSourceCrossing'&&c.args[0]===null));assert.ok(h.calls.some(c=>c.name==='pressure'&&c.args[0].length===0));
  h.owner.render(state());const f=h.calls.findLast(c=>c.name==='r3dFrame').args[0];assert.equal(f.textSpace,false);assert.equal(f.sourceVoidPhysical,false);assert.equal(f.plan,true);assert.deepEqual(f.authoredCamera.eye,[2,4.8+EYE,8]);
  assert.equal(h.calls.some(c=>/SetLookAngles|SetCinematicLook|r3dInit/.test(c.name)),false);assert.equal(h.calls.filter(c=>c.name==='base').length,1);
  const p=h.calls.find(c=>c.name==='r3dSetPlan');assert.equal(p.args[4].originX,h.l.plan.originX);assert.equal(p.args[4].heightOffset,0);assert.deepEqual(p.args[4].ambient,h.l.plan.ambient);
  assert.deepEqual(h.calls.find(c=>c.name==='r3dSetLightingContext').args[0],{...h.l.lightingContext,captureExposure:SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE});
  h.owner.dispose();h.owner.dispose();assert.equal(h.releases(),1);assert.equal(h.owner.ready(),false);assert.equal(h.owner.render(state()),false);
});

test('plan uploads happen only on a changed truth state and the renderer detaches borrowed arrays and prop matrices',async()=>{
  const h=fixture(),saved=structuredClone(h.l),before=JSON.stringify(h.l);await h.owner.initialize();
  for(let i=0;i<20;i++)h.owner.render(state({elapsed:i/60}));assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,1);
  h.owner.render(state({sourceDoors:['practice-west-3']}));h.owner.render(state({sourceDoors:['practice-west-3'],elapsed:1}));assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,2);
  assert.equal(JSON.stringify(h.l),before);h.l.plan.rgba.fill(0);h.l.props[0].mesh='mutated-external-instance';
  h.owner.render(state());const props=h.calls.findLast(c=>c.name==='r3dSetProps').args[0],p=h.calls.findLast(c=>c.name==='r3dSetPlan').args[0];
  assert.equal(props.find(p=>p.id==='piano-room-one').mesh,'grand_piano');assert.deepEqual(p,saved.plan.rgba);assert.ok(h.owner.diagnostics().frame.counts.doors===5);h.owner.dispose();
});

test('late asset readiness cannot acquire a view after disposal and missing original meshes fail honestly',async()=>{
  let resolve;const h=fixture({gate:new Promise(r=>resolve=r)}),pending=h.owner.initialize();h.owner.dispose();resolve(true);assert.equal(await pending,false);
  assert.equal(h.calls.some(c=>c.name==='r3dSetPlan'||c.name==='r3dSetProps'),false);assert.equal(h.releases(),1);
  const other=fixture({missing:['door_leaf_practice'],packFailure:true});
  // Use an actual required name so this remains a real asset dependency test.
  other.catalog.delete(other.l.doors[0].mesh);await assert.rejects(other.owner.initialize(),/door bank unavailable/);assert.equal(other.owner.ready(),false);other.owner.dispose();
});

test('a borrowed structural mesh arriving after base readiness is awaited before acquiring Ellery',async()=>{
  let resolve;const authoredGate=new Promise(r=>resolve=r);
  const h=fixture({authoredGate,configure(l){l.props.push({id:'retained-real-stair',mesh:'main_open_well_stair',structural:true,x:2,y:4.8,z:8});}});
  h.catalog.delete('main_open_well_stair');let complete=false;
  const pending=h.owner.initialize().then(value=>{complete=true;return value;});
  await Promise.resolve();await Promise.resolve();
  assert.equal(complete,false,'base readiness is insufficient for borrowed authored architecture');
  assert.equal(h.calls.some(c=>c.name==='r3dSetPlan'),false,'incomplete architecture cannot acquire the shared renderer');
  h.catalog.add('main_open_well_stair');resolve(true);
  assert.equal(await pending,true);assert.equal(h.owner.ready(),true);h.owner.render(state());
  assert.ok(h.calls.findLast(c=>c.name==='r3dSetProps').args[0].some(p=>p.mesh==='main_open_well_stair'));
  assert.equal(h.calls.filter(c=>c.name==='authored').length,1);h.owner.dispose();
});

test('missing optional decoration is reported and omitted without hiding a colliding obstacle',async()=>{
  const h=fixture();h.catalog.delete('chair');await h.owner.initialize();assert.equal(h.owner.ready(),true);
  h.owner.render(state());assert.deepEqual(h.owner.diagnostics().omittedMeshes,['chair']);
  assert.equal(h.calls.findLast(c=>c.name==='r3dSetProps').args[0].some(p=>p.mesh==='chair'),false);h.owner.dispose();
  const colliding=fixture({configure(l){l.colliders=[{id:'corridor-chair'}];}});colliding.catalog.delete('chair');
  await assert.rejects(colliding.owner.initialize(),/original meshes missing: chair/);
  colliding.catalog.add('chair');assert.equal(await colliding.owner.retry(),true);assert.equal(colliding.owner.ready(),true);colliding.owner.dispose();
});

test('door pack loading is bounded to actual missing joinery and an invalid layout is rejected before acquisition',async()=>{
  const h=fixture();h.catalog.delete(h.l.doors[0].mesh);assert.equal(await h.owner.initialize(),true);assert.equal(h.calls.filter(c=>c.name==='pack').length,1);
  h.owner.render(state());assert.equal(h.calls.filter(c=>c.name==='pack').length,1);h.owner.dispose();
  assert.throws(()=>sourceFalseReturnPlan({plan:{w:2,h:2,rgba:new Uint8Array(3)},doors:[]}),/physical render plan/);
  assert.throws(()=>createSourceFalseReturnRenderer({layout:{plan:{},doors:[]}}),/actual Ellery floor set/);
});

test('whole-floor provider changes the faithful plan, dressing and lighting together and caches each physical slice',async()=>{
  let upper,ground;
  const h=fixture({configure(l){
    upper={...l.plan,key:'upper:practice:4.8'};ground={...l.plan,rgba:new Uint8Array(l.plan.rgba),key:'ground:foyer:0'};
    for(let i=0;i<ground.w*ground.h;i++)ground.rgba.set([encode(0),encode(7.5),0,ZONE.foyer],i*4);
    l.props.push({id:'foyer-lamp-mesh',mesh:'lamp',x:2,y:0,z:8});
    l.planFor=s=>s.feet<2?{plan:ground,props:[l.props.at(-1)],doors:l.doors,lights:[{id:'foyer-light',x:2,y:5,z:8}],lightingContext:{ambientColor:[.4,.5,.6],ambientIntensity:.022},observer:{group:'ground',spaceId:'foyer'}}
      :{plan:upper,props:l.props.slice(0,3),doors:l.doors,lights:l.lights,lightingContext:l.lightingContext,observer:{group:'upper',spaceId:'practice'}};
  }});
  await h.owner.initialize();h.owner.render(state());assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,1);
  h.owner.render(state({feet:0}));const p=h.calls.findLast(c=>c.name==='r3dSetProps').args[0],lit=h.calls.findLast(c=>c.name==='r3dSetLocalLights').args[0];
  assert.ok(p.some(p=>p.id==='foyer-lamp-mesh'));assert.equal(p.some(p=>p.id==='piano-room-one'),false);assert.equal(lit[0].id,'foyer-light');
  assert.equal(h.calls.findLast(c=>c.name==='r3dSetLightingContext').args[0].ambientIntensity,.022);
  h.owner.render(state({feet:0,elapsed:1}));assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,2);
  h.owner.render(state());assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,3);assert.deepEqual(upper.rgba,h.l.plan.rgba);h.owner.dispose();
});

test('Source apertures cannot carve another floor at the same X/Z or consume its props',()=>{
  const l=layout(),s=state({sourceDoors:['practice-west-3']}),ground={...l,plan:{...l.plan,rgba:new Uint8Array(l.plan.rgba)}};
  for(let i=0;i<ground.plan.w*ground.plan.h;i++)ground.plan.rgba[i*4]=encode(0);
  const view=sourceFalseReturnPlan(ground,s);assert.equal(view.changed,0);assert.equal(view.wedges.length,0);
  const f=sourceFalseReturnRenderFrame(ground,s,{planView:view});assert.equal(f.hiddenProps.length,0);
  const mixed=layout();let otherFloor=0;
  for(let z=0;z<mixed.plan.h;z++)for(let x=0;x<mixed.plan.w;x++)if((x+mixed.plan.originX+.5)*CELL<-3&&(z+mixed.plan.originY+.5)*CELL>7){mixed.plan.rgba[(z*mixed.plan.w+x)*4]=encode(0);otherFloor++;}
  const cut=sourceFalseReturnPlan(mixed,s);assert.ok(cut.changed>0&&otherFloor>0);
  for(let i=0;i<cut.mask.length;i++)if(mixed.plan.rgba[i*4]===encode(0))assert.equal(cut.mask[i],0);
});

test('height-offset slices encode Source floors in slice space and retain Source-sky zone parity',()=>{
  const l=layout();l.plan.heightOffset=3;
  for(let i=0;i<l.plan.w*l.plan.h;i++)l.plan.rgba[i*4]=encode(1.8);
  const v=sourceFalseReturnPlan(l,state({sourceDoors:['practice-west-3']}));assert.ok(v.changed>0);
  for(let i=0;i<v.mask.length;i++)if(v.mask[i]){assert.equal(v.plan.rgba[i*4],encode(1.8));assert.equal(v.plan.rgba[i*4+2],F.SKY);assert.equal(v.plan.rgba[i*4+3],ZONE.sourceSpace);}
});

test('the ordinary light resolver remains live when moving within the same cached physical slice',async()=>{
  const h=fixture({configure(l){l.planFor=s=>({plan:{...l.plan,key:'one-large-room'},props:l.props,doors:l.doors,
    lights:[{id:s.x>3?'far-fitting':'near-fitting',x:s.x,y:7,z:8}],lightingContext:l.lightingContext});}});
  await h.owner.initialize();h.owner.render(state());h.owner.render(state({x:5}));
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,1);
  assert.equal(h.calls.findLast(c=>c.name==='r3dSetLocalLights').args[0][0].id,'far-fitting');h.owner.dispose();
});

test('a revealed doorway opens onto Source from either physical face and preserves the occupied side',()=>{
  const l=layout(),id='practice-west-3';
  const corridor=state({x:2,z:8,sourceDoors:[id],doorOpen:{[id]:true},doorSides:{[id]:-1}});
  const room=state({x:-2,z:8,sourceDoors:[id],doorOpen:{[id]:true},doorSides:{[id]:1}});
  const a=sourceFalseReturnPlan(l,corridor),b=sourceFalseReturnPlan(l,room);
  assert.equal(a.wedges[0].normal.x,-1);assert.equal(b.wedges[0].normal.x,1);
  for(const [s,v]of[[corridor,a],[room,b]]){
    const at=(Math.floor(s.z/CELL)-l.plan.originY)*l.plan.w+Math.floor(s.x/CELL)-l.plan.originX;
    assert.equal(v.mask[at],0,'the current standing floor remains ordinary');
    for(let i=0;i<v.mask.length;i++)if(v.mask[i]){
      const x=((i%l.plan.w)+l.plan.originX+.5)*CELL;
      assert.ok((x-l.doors[4].x)*v.wedges[0].normal.x>.35,'every changed cell lies beyond the physical throat');
    }
  }
  const outward=sourceFalseReturnRenderFrame(l,room,{planView:b});
  assert.ok(outward.hiddenProps.includes('corridor-chair'));assert.equal(outward.hiddenProps.includes('piano-room-five'),false);
  const inward=sourceFalseReturnRenderFrame(l,corridor,{planView:a});
  assert.ok(inward.hiddenProps.includes('piano-room-five'));assert.equal(inward.hiddenProps.includes('corridor-chair'),false);
});

test('saved incoming side keeps the aperture stable up to its plane and a stale far-side receipt cannot erase the current room',()=>{
  const l=layout(),id='practice-west-3';
  for(const x of[-2,-.25,-.01,0]){
    const s=state({x,z:8,sourceDoors:[id],doorSides:{[id]:1}}),v=sourceFalseReturnPlan(l,s);
    assert.equal(v.wedges[0].normal.x,1);
    const at=(Math.floor(s.z/CELL)-l.plan.originY)*l.plan.w+Math.floor(s.x/CELL)-l.plan.originX;
    assert.equal(v.mask[at],0);
  }
  const crossed=sourceFalseReturnPlan(l,state({x:.01,z:8,sourceDoors:[id],doorSides:{[id]:-1}}));
  assert.equal(crossed.wedges[0].normal.x,-1,'only the new physical crossing side changes the target at the plane');
  const stale=sourceFalseReturnPlan(l,state({x:2,z:8,sourceDoors:[id],doorSides:{[id]:1}}));
  assert.equal(stale.wedges[0].normal.x,-1,'a distant old receipt yields to the actual new approach');
});

test('resident Source-plan cache includes the approach face and does not flip during a saved finite leaf swing',async()=>{
  const h=fixture(),id='practice-west-3';await h.owner.initialize();
  const s=state({x:-.5,z:8,sourceDoors:[id],doorSides:{[id]:1},doorOpen:{[id]:true},doorMotion:{[id]:{from:0,to:1,startedAt:0,duration:.45}}});
  h.owner.render(s);const first=h.calls.filter(c=>c.name==='r3dSetPlan').length;
  h.owner.render({...s,x:-.01,elapsed:.225});h.owner.render({...s,x:0,elapsed:.45});
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,first);
  h.owner.render({...s,x:.01,elapsed:.46,doorSides:{[id]:-1}});
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,first+1);h.owner.dispose();
});

test('a completed crossing retains Source ahead through the finite handoff instead of flashing ordinary Ellery',()=>{
  const l=layout(),id='practice-west-3';
  const before=state({x:-.01,z:8,sourceDoors:[id],doorSides:{[id]:1}});
  const crossed={...before,x:.01,status:'completed',doorSides:{[id]:-1},exitReceipt:{id:'run:false-return',doorId:id,delivered:false}};
  const a=sourceFalseReturnPlan(l,before),b=sourceFalseReturnPlan(l,crossed);
  assert.deepEqual(b.wedges[0].normal,a.wedges[0].normal);assert.deepEqual(b.mask,a.mask);
  assert.ok(sourceFalseReturnRenderFrame(l,crossed,{planView:b}).hiddenProps.includes('corridor-chair'));
});

test('an outward Source door replaces lower outdoor sky beyond its sill without selecting a different indoor storey',()=>{
  const l=layout(),id='practice-west-3';
  for(let i=0;i<l.plan.w*l.plan.h;i++){
    const x=((i%l.plan.w)+l.plan.originX+.5)*CELL;
    if(x<0){l.plan.rgba[i*4]=encode(0);l.plan.rgba[i*4+2]=F.SKY;l.plan.rgba[i*4+3]=ZONE.street;}
  }
  const v=sourceFalseReturnPlan(l,state({x:2,z:8,sourceDoors:[id]}));assert.ok(v.changed>0);
  assert.ok(v.wedges.some(w=>w.id===id));
  for(let i=0;i<v.mask.length;i++)if(v.mask[i]){assert.equal(v.plan.rgba[i*4],encode(4.8));assert.equal(v.plan.rgba[i*4+3],ZONE.sourceSpace);}
});

test('the actual complete Ellery practice doorway reveals the opposite side from both authored room and corridor approaches',()=>{
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  const l=buildSourceFalseReturnLayout({floorplan:FP,props:PROPS.renderInstances({inscriptions:false}),propSources:PROPS.allProps()});
  const door=l.doors.find(d=>d.id==='practice-west-3');assert.ok(door);
  for(const side of[-1,1]){
    const s={...state(),x:door.x+door.normal.x*side*.8,z:door.z+door.normal.z*side*.8,feet:door.feet,
      opened:l.doors.filter(d=>d.counted).slice(0,4).map(d=>d.id),sourceDoors:[door.id],doorSides:{[door.id]:side}};
    const provided=l.planFor(s),view={...l,...provided},original=provided.plan.rgba.slice(),v=sourceFalseReturnPlan(view,s);
    const wedge=v.wedges.find(d=>d.id===door.id);assert.ok(wedge&&v.changed>0);
    assert.ok(wedge.normal.x*door.normal.x+wedge.normal.z*door.normal.z===-side);
    const at=(Math.floor(s.z/CELL)-v.plan.originY)*v.plan.w+Math.floor(s.x/CELL)-v.plan.originX;
    assert.equal(v.mask[at],0);assert.deepEqual(provided.plan.rgba,original,'the production slice is never written');
    const frame=sourceFalseReturnRenderFrame(view,s,{planView:v}),joinery=prop(frame,door.id,'frame');
    assert.ok(joinery&&prop(frame,door.id));assert.ok(Math.abs(joinery.x-door.x)<1e-5&&Math.abs(joinery.z-door.z)<1e-5&&Math.abs(joinery.y-door.feet)<1e-5);
  }
});

test('the held torch remains live through the normal frame path and cannot mutate its host device',async()=>{
  let held={on:true,look:{power:.58,color:[.9,.94,1],reach:11}},reads=0;
  const h=fixture({getTorch(){reads++;return held;}});await h.owner.initialize();h.owner.render(state());
  let frame=h.calls.findLast(c=>c.name==='r3dFrame').args[0];assert.equal(frame.light,1);assert.equal(frame.torchLook.power,.58);assert.equal(reads,1);
  assert.notEqual(frame.torchLook,held.look);assert.notEqual(frame.torchLook.color,held.look.color);
  frame.torchLook.power=.1;frame.torchLook.color[0]=0;assert.equal(held.look.power,.58);assert.equal(held.look.color[0],.9);
  held={on:false,look:{power:.42}};h.owner.render(state({elapsed:1}));frame=h.calls.findLast(c=>c.name==='r3dFrame').args[0];
  assert.equal(frame.light,0);assert.equal(frame.torchLook.power,.42);assert.equal(reads,2);assert.equal(h.owner.diagnostics().frame.torch.on,false);
  held={on:true,look:{power:.21}};h.owner.render(state({elapsed:2}));assert.equal(h.calls.findLast(c=>c.name==='r3dFrame').args[0].light,1);
  assert.deepEqual(h.calls.findLast(c=>c.name==='r3dSetLightingContext').args[0],{...h.l.lightingContext,captureExposure:SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE},'the held torch does not alter ordinary room ambient or the explicit borrowed-view exposure');h.owner.dispose();
});

test('an unpowered false return replaces prior Source IV lighting and exposes the real ambient without inventing a light rig',async()=>{
  const ordinary={ambientColor:[.66,.51,.35],ambientIntensity:.027,whitePointScale:.26413043478260867,
    roofSkyRecovery:0,bounce:{color:[.66,.51,.35],intensity:.081}};
  const h=fixture({configure(l){l.lights=[];l.lightingContext=ordinary;}});
  let held={ambientColor:[.62,.72,.80],ambientIntensity:.11,captureExposure:1,whitePointScale:1,screen:'stochastic'};
  const original=h.owner;
  // Apply each production setter request to the actual pure lighting-state
  // API, starting with the preceding Source owner's cold capture context.
  R3.r3dSetLightingContext(held);
  await original.initialize();original.render(state());
  for(const call of h.calls.filter(c=>c.name==='r3dSetLightingContext'))R3.r3dSetLightingContext(call.args[0]);
  held=R3.r3dLightingDebug();
  assert.ok(Math.abs(held.ambientIntensity-ordinary.ambientIntensity)<1e-8);
  assert.ok(held.ambientColor.every((v,i)=>Math.abs(v-ordinary.ambientColor[i])<1e-7));
  assert.equal(held.captureExposure,SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE);
  assert.equal(held.whitePointScale,ordinary.whitePointScale);assert.equal(held.roofSkyRecovery,0);
  assert.deepEqual(h.calls.findLast(c=>c.name==='r3dSetLocalLights').args[0],[]);
  const scene=h.calls.findLast(c=>c.name==='r3dSetSourceScene').args[0];
  assert.equal(scene.look.blueprint,false);assert.equal(scene.look.roomMemoryActive,false);
  assert.deepEqual(original.diagnostics().frame.lighting,{...ordinary,captureExposure:SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE});
  assert.deepEqual(ordinary,{ambientColor:[.66,.51,.35],ambientIntensity:.027,whitePointScale:.26413043478260867,
    roofSkyRecovery:0,bounce:{color:[.66,.51,.35],intensity:.081}});
  original.dispose();R3.r3dSetLightingContext({});
});

test('borrowed-view exposure stays explicit in a cached room and preserves a brighter authored room exposure',async()=>{
  const h=fixture({configure(l){l.planFor=s=>({plan:{...l.plan,key:'same-slice'},props:l.props,doors:l.doors,lights:l.lights,
    lightingContext:{...l.lightingContext,...(s.x>3?{captureExposure:4.5}: {})}});}});
  await h.owner.initialize();h.owner.render(state());
  assert.equal(h.owner.diagnostics().frame.lighting.captureExposure,SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE);
  h.owner.render(state({x:5}));assert.equal(h.owner.diagnostics().frame.lighting.captureExposure,4.5);
  h.owner.render(state());assert.equal(h.owner.diagnostics().frame.lighting.captureExposure,SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE);
  assert.equal(h.calls.filter(c=>c.name==='r3dSetPlan').length,1);h.owner.dispose();
});
