import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBagScene } from '../src/game/bag.js';
import { initialMapNav, reduceMapNav, selectedMapSpace, moveMapConsoleFocus, MAP_VIEW_DEFAULTS } from '../src/game/map-navigation.js';
import { resolveMapAction } from '../src/game/map-actions.js';
import { pointInMapPolygon, mapArchitecturalHeight, createMapAxonometricProjection } from '../src/game/map-axonometric.js';
import { MAP_LAB_CASES, mapLabJob, mapLabModel } from '../src/game/map-fixtures.js';
import { uiInit, uiSetScale, uiCellMetrics } from '../src/render/ui.js';
import * as controller from '../src/game/controller.js';
import { normalizeControllerSettings, setControllerSettings, controllerBindings, setControllerBinding } from '../src/game/bindings.js';

function viewport(width=1280,height=760,scale=1){
  const previous=new Map(['document','window','getComputedStyle'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    globalThis.document={createElement:()=>({style:{},getContext:()=>null})};
    globalThis.window={devicePixelRatio:1,addEventListener(){}};
    globalThis.getComputedStyle=()=>({position:'relative'});
    uiInit({clientWidth:width,clientHeight:height,appendChild(){}});uiSetScale(scale);
  }finally{for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
const state=bag=>bag.debugState();
const key=(bag,key,code=key)=>bag.key({key,code});
const hit=(bag,id)=>{const found=state(bag).hitRegions.find(region=>region.id===id);assert.ok(found,`rendered ${id}`);return found;};
const point=r=>({x:r.x+r.w/2,y:r.y+r.h/2});
const pointer=(bag,type,p)=>bag.pointer({type,pointerId:3,button:0,cellX:p.x,cellY:p.y});
const click=(bag,id)=>{pointer(bag,'pointerdown',point(hit(bag,id)));pointer(bag,'pointerup',point(hit(bag,id)));bag.render();};
function fixture({fiveFloors=false}={}){
  viewport();let mark=null,sets=0,clears=0,saved=null,closed=0;
  const context=MAP_LAB_CASES[0],job=mapLabJob(context);
  const getMap=()=>{
    const model=mapLabModel(context);
    if(fiveFloors)model.floors.push({id:'academic',label:'THIRD FLOOR',shortLabel:'3F',order:2.5},
      {id:'tower',label:'TOWER',shortLabel:'TWR',order:3});
    model.playerWaypoint=mark;
    model.architecture={version:1,units:{horizontalMetresPerUnit:1},bounds:{minX:0,minY:0,maxX:44,maxY:26},
      levels:model.floors.map((floor,i)=>({id:floor.id,floorId:floor.id,height:(i-1)*4,bounds:{minX:0,minY:0,maxX:44,maxY:26},
        surfaces:model.spaces.filter(s=>s.floorId===floor.id&&s.roomId).map(s=>({x:s.position.x-3,y:s.position.y-2,w:6,h:4,mapSpaceId:s.id})),boundaries:[]}))};
    return model;
  };
  const bag=makeBagScene({embeddedHost:true,job,getMap,memory:{sectionId:'map'},focus:{sectionId:'map',roomId:'main_b3'},
    setMapTarget:space=>{if(mark?.spaceId!==space.id){sets++;mark={spaceId:space.id,roomId:space.roomId};}return true;},
    clearMapTarget:()=>{if(mark){clears++;mark=null;}return true;},onRemember:value=>{saved=structuredClone(value);},onClose:()=>{closed++;}});
  bag.enter();bag.render();return{bag,getMap,job,mark:()=>mark,sets:()=>sets,clears:()=>clears,saved:()=>saved,closed:()=>closed};
}

test('MAP transformations are bounded, quarter-turn based and spatial arrows follow the projected screen',()=>{
  const model={floors:[{id:'g',order:0}],spaces:[
    {id:'a',floorId:'g',position:{x:0,y:0}},{id:'b',floorId:'g',position:{x:10,y:0}},{id:'c',floorId:'g',position:{x:0,y:10}}]};
  let nav=initialMapNav({model});assert.equal(nav.viewMode,'stack');
  nav.roomFile={spaceId:'a',page:0};
  nav=reduceMapNav(nav,{type:'ROTATE',delta:-1},model);assert.equal(nav.rotation,3);
  nav=reduceMapNav(nav,{type:'ZOOM',factor:100},model);assert.equal(nav.zoom,2.5);
  nav=reduceMapNav(nav,{type:'PAN',dx:Infinity,dy:500},model);assert.equal(nav.panX,0);assert.equal(nav.panY,200);
  nav=reduceMapNav(nav,{type:'MOVE_SPATIAL',vector:{x:1,y:0},projectedPoints:{a:{x:0,y:0},b:{x:0,y:-5},c:{x:5,y:0}}},model);
  assert.equal(selectedMapSpace(nav,model).id,'c','screen-right wins over world-east');
  assert.equal(nav.roomFile,null,'changing rooms closes the previous file and restores spatial controls');
  nav=reduceMapNav(nav,{type:'RESET_VIEW'},model);for(const[k,v]of Object.entries(MAP_VIEW_DEFAULTS))assert.equal(nav[k],v);
  assert.equal(selectedMapSpace(nav,model).id,'c','reset framing does not reset the room');
});

test('reopening retains room selection but discards obsolete saved framing transforms',()=>{
  viewport();const model=mapLabModel(MAP_LAB_CASES[0]);
  const bag=makeBagScene({embeddedHost:true,map:model,job:mapLabJob(MAP_LAB_CASES[0]),memory:{sectionId:'map',
    map:{floorId:'g',selectedByFloor:{g:'space:the_tub'},viewMode:'floor',rotation:2,zoom:2.5,panX:150,panY:-40,focusedControlId:'bag:map:rotate-right'}}});
  try{bag.enter();for(const[k,v]of Object.entries(MAP_VIEW_DEFAULTS))assert.equal(state(bag).mapNav[k],v);assert.equal(state(bag).mapNav.floorId,'g');assert.equal(state(bag).mapNav.focusedControlId,null);}
  finally{bag.exit();}
});

test('SET never toggles, CLEAR never creates, and story guidance is not a personal target',()=>{
  const room={id:'space:main_b3',roomId:'main_b3',waypoint:true},calls=[];
  assert.equal(resolveMapAction(room,'set-target',{playerWaypoint:null,markSpace:s=>{calls.push(s.id);return true;}}),true);
  assert.deepEqual(calls,['space:main_b3']);
  assert.equal(resolveMapAction(room,'set-target',{playerWaypoint:{spaceId:room.id},markSpace:()=>{throw Error('toggle');}}),true);
  assert.equal(resolveMapAction(room,'clear-target',{playerWaypoint:null,markSpace:()=>{throw Error('creates');}}),true);
  assert.equal(resolveMapAction(room,'set-target',{setTarget:()=>false}),false);
});

test('actual room polygons select only; separate SET and CLEAR controls own real waypoint mutations',()=>{
  const f=fixture(),{bag}=f;
  try{
    const selected=state(bag).mapSelected,rendered=state(bag).mapPresentation;
    const room=rendered.hits.find(h=>h.id===`bag:space:${selected.id}`);assert.ok(room?.polygons?.length);
    const p=room.point;assert.ok(room.polygons.some(poly=>pointInMapPolygon(p,poly)));
    pointer(bag,'pointermove',p);pointer(bag,'pointerdown',p);pointer(bag,'pointerdown',p);
    assert.equal(f.sets(),0);assert.equal(f.mark(),null);
    // A projected diamond's bounding corner is background, not room area.
    const corner={x:room.x+.01,y:room.y+.01};assert.equal(room.polygons.some(poly=>pointInMapPolygon(corner,poly)),false);
    pointer(bag,'pointerdown',corner);assert.ok(state(bag).mapDrag);pointer(bag,'pointerup',corner);
    click(bag,'bag:map:set-target');assert.equal(f.sets(),1);assert.equal(f.mark().roomId,'main_b3');
    key(bag,'Enter');key(bag,'Enter');assert.equal(f.sets(),1,'repeated confirm never clears');
    click(bag,'bag:map:clear-target');assert.equal(f.clears(),1);assert.equal(f.mark(),null);
    key(bag,'Delete');assert.equal(f.sets(),1,'clearing an empty target cannot mark selected room');
  }finally{bag.exit();}
});

test('background drag and viewport-only wheel transform the plan; lost capture clears the gesture',()=>{
  const{bag}=fixture();try{
    const rect=state(bag).mapPresentation.layout.mapViewport,p={x:rect.x+.1,y:rect.y+.1};let prevented=0;
    pointer(bag,'pointerdown',p);assert.ok(state(bag).mapDrag);
    pointer(bag,'pointermove',{x:p.x+2,y:p.y+1});assert.equal(state(bag).mapNav.panX,2);assert.equal(state(bag).mapNav.panY,1);
    pointer(bag,'lostpointercapture',p);assert.equal(state(bag).mapDrag,null);
    bag.pointer({type:'wheel',cellX:p.x,cellY:p.y,deltaY:-120,preventDefault(){prevented++;}});
    assert.equal(prevented,1);assert.ok(state(bag).mapNav.zoom>1);
    const zoom=state(bag).mapNav.zoom;
    assert.equal(bag.pointer({type:'wheel',cellX:-1,cellY:-1,deltaY:120,preventDefault(){prevented++;}}),false);
    assert.equal(state(bag).mapNav.zoom,zoom);assert.equal(prevented,1);
    pointer(bag,'pointerdown',p);bag.selectSection('kit');assert.equal(state(bag).mapDrag,null);
  }finally{bag.exit();}
});

test('hardware view controls, floor shortcuts and LOCATE share navigation state; transforms are not saved',()=>{
  const f=fixture(),{bag}=f;try{
    click(bag,'bag:map:view-floor');assert.equal(state(bag).mapNav.viewMode,'floor');
    click(bag,'bag:map:rotate-right');assert.equal(state(bag).mapNav.rotation,1);
    click(bag,'bag:map:zoom-in');assert.ok(state(bag).mapNav.zoom>1);
    key(bag,'PageDown');assert.equal(state(bag).mapNav.floorId,'g');
    key(bag,'[','BracketLeft');assert.equal(state(bag).mapNav.floorId,'b1');
    bag.key({controller:true,controllerAction:'mapFloorNext'});assert.equal(state(bag).mapNav.floorId,'g');
    bag.key({controller:true,controllerAction:'mapLocate'});bag.render();assert.equal(state(bag).mapNav.floorId,'b1');
    const debug=state(bag),vp=debug.mapPresentation.layout.mapViewport;
    // Exact-player policy is respected by the same projection used to paint.
    const player=debug.model.map.player;
    const metrics=uiCellMetrics(),projection=createMapAxonometricProjection({architecture:debug.model.map.architecture,
      nav:debug.mapNav,viewport:vp,floors:debug.model.map.floors,cellAspect:metrics.cellW/metrics.cellH});
    const plotted=projection.point({...player.position,floorId:player.floorId,height:mapArchitecturalHeight(debug.model.map.architecture,player)});
    assert.ok(Math.abs(plotted.x-(vp.x+vp.w/2))<1e-6);assert.ok(Math.abs(plotted.y-(vp.y+vp.h/2))<1e-6);
    for(const name of Object.keys(MAP_VIEW_DEFAULTS))assert.equal(Object.hasOwn(f.saved().map,name),false,`${name} stays transient`);
    assert.equal(f.saved().map.floorId,'b1');
    assert.ok(vp.w>0&&player.position);
  }finally{bag.exit();}
});

test('resizing a located map resets cell-space pan and cancels a held drag without changing zoom/rotation',()=>{
  const{bag}=fixture();try{
    click(bag,'bag:map:rotate-right');click(bag,'bag:map:zoom-in');key(bag,'c','KeyC');bag.render();
    assert.ok(state(bag).mapNav.panX||state(bag).mapNav.panY);
    const old=state(bag).mapNav,rect=state(bag).mapPresentation.layout.mapViewport;
    pointer(bag,'pointerdown',{x:rect.x+.1,y:rect.y+.1});
    viewport(960,600,1.5);bag.render();
    const next=state(bag);assert.equal(next.mapDrag,null);assert.equal(next.mapNav.panX,0);assert.equal(next.mapNav.panY,0);
    assert.equal(next.mapNav.rotation,old.rotation);assert.equal(next.mapNav.zoom,old.zoom);
    const set=hit(bag,'bag:map:set-target');assert.ok(set.w>0&&set.h>0);
    click(bag,'bag:map:set-target');
  }finally{bag.exit();viewport();}
});

test('MAP file shortcuts open room history, with attached sheets still available and no waypoint mutation',()=>{
  const f=fixture(),{bag}=f;try{
    bag.key({controller:true,controllerAction:'mapFile'});
    assert.ok(state(bag).mapNav.roomFile);assert.equal(f.sets(),0);
    bag.render();click(bag,'bag:map:file-document');
    assert.notEqual(state(bag).route.type,'root');assert.deepEqual(bag.modalActions,[]);
    for(let i=0;i<3&&state(bag).route.type!=='root';i++)key(bag,'Escape');
    assert.equal(state(bag).route.type,'root');
    key(bag,'Escape');key(bag,'r','KeyR');assert.ok(state(bag).mapNav.roomFile);assert.equal(f.sets(),0);
  }finally{bag.exit();}
});

test('MAP controller actions are local, distinct from the world, and LB/RB still switch sections',()=>{
  controller.controllerResetForTest();setControllerSettings({});
  const{bag}=fixture();
  const pad=buttons=>({id:'Xbox',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:18},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))});
  let current=pad([]);controller.setControllerNavigatorForTest({getGamepads:()=>[current]});
  const pressed=[];const tick=modalActions=>controller.gamepadTick({menuContext:true,modalActions,onPress:action=>pressed.push(action)});
  try{
    assert.deepEqual(bag.modalActions,['mapFloorPrev','mapFloorNext','mapLocate','mapFile','mapConsole']);
    for(const[index,action]of [[6,'mapFloorPrev'],[7,'mapFloorNext'],[3,'mapLocate'],[2,'mapFile'],[11,'mapConsole'],[4,'tabPrev'],[5,'tabNext']]){
      current=pad([]);tick(bag.modalActions);current=pad([index]);pressed.length=0;tick(bag.modalActions);assert.deepEqual(pressed,[action]);
    }
    bag.key({controller:true,controllerAction:'tabNext'});assert.equal(state(bag).nav.sectionId,'sheets');assert.deepEqual(bag.modalActions,[]);
    current=pad([]);tick([]);current=pad([6,7,3,2,11]);pressed.length=0;tick([]);assert.deepEqual(pressed,[],'ordinary menus do not inherit MAP controls');
  }finally{bag.exit();controller.controllerResetForTest();setControllerSettings({});}
});

test('new MAP defaults migrate around existing UI remaps and swap conflicts only within the UI group',()=>{
  const migrated=normalizeControllerSettings({bindings:{confirm:{kind:'button',id:'leftTrigger'}}});
  assert.equal(migrated.bindings.confirm.id,'leftTrigger');assert.notEqual(migrated.bindings.mapFloorPrev.id,'leftTrigger');
  const actions=['confirm','back','menu','tabPrev','tabNext','mapFloorPrev','mapFloorNext','mapLocate','mapFile','mapConsole'];
  assert.equal(new Set(actions.map(a=>migrated.bindings[a].id)).size,actions.length);
  setControllerSettings({});
  const world=controllerBindings().hide;
  setControllerBinding('mapLocate','leftTrigger');
  assert.equal(controllerBindings().mapLocate.id,'leftTrigger');assert.equal(controllerBindings().mapFloorPrev.id,'north');
  assert.deepEqual(controllerBindings().hide,world,'world HIDE may share MAP previous-floor trigger');setControllerSettings({});
});

const consoleDirections=[['ArrowUp',{x:0,y:-1}],['ArrowDown',{x:0,y:1}],['ArrowLeft',{x:-1,y:0}],['ArrowRight',{x:1,y:0}]];
function consolePaths(bag){
  const controls=state(bag).mapPresentation.hits.filter(h=>h.kind==='map-control'),metrics=uiCellMetrics();
  const paths=new Map([[state(bag).mapNav.focusedControlId,[]]]),queue=[...paths.keys()];
  while(queue.length){const from=queue.shift();for(const[key,vector]of consoleDirections){
    const to=moveMapConsoleFocus(from,vector,controls,{cellAspect:metrics.cellW/metrics.cellH});
    if(!paths.has(to)){paths.set(to,[...paths.get(from),key]);queue.push(to);}
  }}return{controls,paths};
}
function consoleFocus(bag,id){
  const{paths}=consolePaths(bag);assert.ok(paths.has(id),`${id} is reachable from console focus`);
  for(const arrow of paths.get(id))key(bag,arrow);
  assert.equal(state(bag).mapNav.focusedControlId,id);bag.render();
}

test('F6 console focus reaches every rendered control at wide, compact and large-text sizes without moving room selection',()=>{
  for(const[width,height,scale]of [[1280,760,1],[960,600,1],[960,600,1.5]]){
    const f=fixture({fiveFloors:true}),{bag}=f;viewport(width,height,scale);bag.render();
    try{
      const selected=state(bag).mapSelected.id;key(bag,'F6');assert.ok(state(bag).mapNav.focusedControlId);assert.equal(bag.handlesEscape,true);
      const first=state(bag).mapNav.focusedControlId;
      bag.key({key:'F6',code:'F6',repeat:true});assert.equal(state(bag).mapNav.focusedControlId,first,'holding F6 does not toggle repeatedly');
      const{controls,paths}=consolePaths(bag);assert.equal(paths.size,controls.length,'all physical controls are arrow reachable');
      for(const control of controls)consoleFocus(bag,control.id);
      assert.equal(state(bag).mapSelected.id,selected,'console arrows never select a room');
      assert.equal(Object.hasOwn(f.saved().map,'focusedControlId'),false,'console focus is not saved');
      key(bag,'Escape');assert.equal(state(bag).mapNav.focusedControlId,null);assert.equal(f.closed(),0);assert.equal(bag.handlesEscape,false);
      key(bag,'F6');key(bag,'F6');assert.equal(state(bag).mapNav.focusedControlId,null);
    }finally{bag.exit();viewport();}
  }
});

test('console Enter/A activates the focused hardware control; Back returns to rooms and B still closes',()=>{
  const f=fixture(),{bag}=f;try{
    bag.key({controller:true,controllerAction:'mapConsole'});assert.ok(state(bag).mapNav.focusedControlId);
    consoleFocus(bag,'bag:map:view-floor');key(bag,'Enter');bag.render();assert.equal(state(bag).mapNav.viewMode,'floor');
    consoleFocus(bag,'bag:map:rotate-right');bag.key({controller:true,controllerAction:'confirm'});bag.render();assert.equal(state(bag).mapNav.rotation,1);
    consoleFocus(bag,'bag:map:zoom-in');key(bag,'Enter');bag.render();assert.ok(state(bag).mapNav.zoom>1);
    consoleFocus(bag,'bag:map:reset-view');key(bag,'Enter');bag.render();assert.equal(state(bag).mapNav.zoom,1);assert.equal(state(bag).mapNav.rotation,0);
    assert.equal(state(bag).mapNav.focusedControlId,'bag:map:reset-view','FIT keeps console focus');
    consoleFocus(bag,'bag:map:clear-target');key(bag,'Enter');assert.equal(f.clears(),0,'disabled empty CLEAR stays inert');
    consoleFocus(bag,'bag:map:set-target');key(bag,'Enter');bag.render();assert.equal(f.sets(),1);
    key(bag,'Enter');assert.equal(f.sets(),1,'disabled SET remains inert');
    consoleFocus(bag,'bag:map:clear-target');key(bag,'Enter');bag.render();assert.equal(f.clears(),1);
    bag.key({controller:true,controllerAction:'back'});assert.equal(f.closed(),0);assert.equal(state(bag).mapNav.focusedControlId,null);
    key(bag,'F6');bag.key({controller:true,controllerAction:'tabNext'});assert.equal(state(bag).nav.sectionId,'sheets');assert.equal(state(bag).mapNav.focusedControlId,null);
    bag.selectSection('map');bag.render();key(bag,'F6');key(bag,'b','KeyB');assert.equal(f.closed(),1);assert.equal(state(bag).mapNav.focusedControlId,null);
  }finally{bag.exit();}
});
