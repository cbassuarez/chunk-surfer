import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bagGuideFrame, bagGuideCalloutLayout, drawBagGuideCallouts } from '../src/render/bag-tour.js';
import { bagLayout, bagPanelBounds } from '../src/render/bag-layout.js';
import { bagTabRegions } from '../src/render/bag-tabs.js';
import { patchBayLayout } from '../src/render/bag-skills.js';
import { machinePanelBody } from '../src/render/presentation.js';
import { mapLayoutFromBag, mapConsoleControls } from '../src/render/map-layout.js';
import { UI_CELL_W, UI_CELL_H } from '../src/render/atlas.js';
import { buildBagModel } from '../src/game/bag-model.js';
import { learnCombatTechnique, normalizeCombatBuild } from '../src/game/combat-progression.js';
import { TECHNIQUE } from '../src/game/combat-state.js';
import { setActiveInputDevice, inputPromptLabel } from '../src/game/bindings.js';

const copyBox=({x,y,w,h})=>({x,y,w,h});
const viewport=({cols,rows})=>({x:0,y:0,w:cols,h:rows});
const inside=(rect,bounds)=>{
  assert.ok([rect.x,rect.y,rect.w,rect.h].every(Number.isFinite),JSON.stringify(rect));
  assert.ok(rect.w>0&&rect.h>0,JSON.stringify(rect));
  assert.ok(rect.x>=bounds.x-1e-8&&rect.y>=bounds.y-1e-8,JSON.stringify({rect,bounds}));
  assert.ok(rect.x+rect.w<=bounds.x+bounds.w+1e-8&&rect.y+rect.h<=bounds.y+bounds.h+1e-8,JSON.stringify({rect,bounds}));
};
const contains=(rect,point)=>point.x>=rect.x-1e-8&&point.x<=rect.x+rect.w+1e-8&&point.y>=rect.y-1e-8&&point.y<=rect.y+rect.h+1e-8;
const outside=(a,b)=>a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y;
const skills=(ready=false)=>({kind:'skills',section:'skills',sectionId:'skills',continueLabel:'CONTINUE TO MAP',continueEnabled:ready,allowClose:false});
const guides=[
  {kind:'section',section:'skills',sectionId:'skills',allowClose:false},skills(false),skills(true),
  {kind:'section',section:'map',sectionId:'map',allowClose:false},
  {kind:'action',section:'map',sectionId:'map',action:'mark',entry:'room:main_b3',allowClose:false},
  {kind:'close',section:'map',sectionId:'map',allowClose:true},
];

function fixture({width=1280,height=760,scale=1,guide=skills(false),installed=false,zero=false}={}){
  const size={cols:Math.floor(width/(UI_CELL_W*scale)),rows:Math.floor(height/(UI_CELL_H*scale))};
  const sectionId=guide?.sectionId||guide?.section||'skills',mapHardware=sectionId==='map';
  const original=bagPanelBounds({...size,sectionId}),frame=bagGuideFrame({size,outer:original,guide}),outer=frame.outer;
  const body=mapHardware?{x:outer.x+3,y:outer.y+2.6,w:outer.w-6,h:outer.h-3.6}
    :machinePanelBody(outer.x,outer.y,outer.w,outer.h);
  const layout=bagLayout({body,sectionId:mapHardware?'map':null});
  let build=normalizeCombatBuild(null,[],null,{tutorialComplete:true,combatAssistance:zero?'severe':'guided'});
  if(installed)build=learnCombatTechnique(build,TECHNIQUE.AFTERIMAGE,{hasRig:true}).build;
  const model=buildBagModel({build,hasRig:true}),tree=model.sections.find(section=>section.id==='skills').tree;
  const region=layout.mode==='wide'
    ?{x:layout.list.x,y:layout.list.y,w:layout.detail.x+layout.detail.w-layout.list.x,h:layout.list.h}
    :{x:layout.list.x,y:layout.detail.y,w:layout.list.w,h:layout.list.y+layout.list.h-layout.detail.y};
  const patchLayout=patchBayLayout({region,branches:tree.branches,maxTier:tree.maxTier});
  const mapLayout=mapLayoutFromBag(layout);
  const mapModel={floors:['b1','g','u1','academic','tower'].map((id,index)=>({id,shortLabel:['B1','G','U1','3F','TWR'][index]})),
    spaces:[{id:'space:main_b3',roomId:'main_b3',floorId:'b1',waypointable:true}],playerWaypoint:null};
  const mapControls=mapConsoleControls(mapLayout,mapModel,{floorId:'b1',viewMode:'stack',selectedByFloor:{b1:'space:main_b3'}});
  const regions=[
    ...bagTabRegions(model,layout),
    ...patchLayout.sockets.map(socket=>({id:`bag:patch:${socket.id}`,...socket.hit})),
    {id:'bag:patch:return',...patchLayout.returnZone},
    ...mapControls,
    {id:'bag:space:space:main_b3',kind:'map-space',x:mapLayout.mapViewport.x+1,y:mapLayout.mapViewport.y+1,w:3,h:1},
    {id:'bag:close',x:outer.x+outer.w-18,y:outer.y,w:18,h:2},
    {id:'bag:sheet:file:work-order',kind:'bag-sheet',x:layout.list.x,y:layout.list.y+2,w:layout.list.w,h:1},
  ];
  return{size,outer,layout,guide,regions,patchLayout,frame,mapLayout,selectedSkillId:`skill:${TECHNIQUE.AFTERIMAGE}`};
}

test('the guided assembly reserves a readable exterior rail without taking case height or moving between steps',()=>{
  for(const [width,height] of [[1280,760],[960,600]])for(const scale of [1,1.25,1.5]){
    const baseline=fixture({width,height,scale}),base=baseline.frame;
    inside(base.outer,viewport(baseline.size));inside(base.rail,viewport(baseline.size));
    assert.ok(outside(base.outer,base.rail));assert.equal(base.side,'left');
    assert.ok(base.rail.w>=20,'even the high-scale small viewport gets an actual readable rail');
    assert.equal(base.outer.h,bagPanelBounds(baseline.size).h,'the tour does not steal vertical rack space');
    for(const guide of guides){
      const f=fixture({width,height,scale,guide});
      assert.deepEqual(f.frame,base,'selector, patch, readiness, map and close stages use one stable assembly');
      assert.equal(f.layout.guide,null,'the old internal guide band receives no layout space');
    }
  }
});

test('all tour cards and Continue remain outside the case and inside both viewports at every supported scale',()=>{
  for(const [width,height] of [[1280,760],[960,600]])for(const scale of [1,1.25,1.5])for(const guide of guides){
    for(const installed of guide.kind==='skills'&&guide.continueEnabled?[false,true]:[false]){
      const f=fixture({width,height,scale,guide,installed}),result=bagGuideCalloutLayout(f);
      assert.ok(result.callouts.length>0);
      for(const card of result.callouts){
        inside(card.rect,f.frame.rail);inside(card.rect,viewport(f.size));
        assert.ok(outside(card.rect,f.outer),'the instructional card cannot cover the instrument');
        assert.ok(card.titleRows.length>0&&card.bodyRows.length>0);
        assert.ok(card.bodyLeading>=.75,'body lines retain enough leading for the 14px glyphs in 20px cells');
        const finalBodyBottom=card.bodyY+(card.bodyRows.length-1)*card.bodyLeading+.7;
        assert.ok(finalBodyBottom<=(result.continueRegion?.y??card.rect.y+card.rect.h-1.2),'body copy cannot run into Continue or its footer');
        for(const line of [...card.titleRows,...card.bodyRows])assert.ok(line.length<=Math.floor(card.rect.w-3),'wrapped prose is not silently clipped');
      }
      if(result.continueRegion){
        assert.equal(guide.kind,'skills');inside(result.continueRegion,result.callouts[0].rect);
        assert.ok(outside(result.continueRegion,f.outer));assert.ok(result.continueRegion.h>=2,'Continue retains a practical pointer target');
      }else assert.notEqual(guide.kind,'skills');
    }
  }
});

test('every leader terminates at the exact registered control, including both ends of an available patch',()=>{
  for(const guide of guides){
    const f=fixture({guide,installed:guide.kind==='skills'&&guide.continueEnabled}),result=bagGuideCalloutLayout(f);
    for(const target of result.targets){
      const hit=f.regions.find(region=>region.id===target.id);
      assert.ok(hit,`real hit target ${target.id}`);assert.deepEqual(target.rect,copyBox(hit));
      for(const card of result.callouts){
        const leader=card.leaders.find(item=>item.targetId===target.id);
        assert.ok(leader);assert.ok(contains(target.rect,leader.points.at(-1)));
        assert.ok(contains(card.rect,leader.points[0]));
      }
    }
  }
  const unpatched=bagGuideCalloutLayout(fixture());
  assert.deepEqual(unpatched.targets.map(target=>target.id),['bag:patch:supply:torch',`bag:patch:input:skill:${TECHNIQUE.AFTERIMAGE}`]);
  const installed=bagGuideCalloutLayout(fixture({guide:skills(true),installed:true}));
  assert.equal(installed.targets[0].id,`bag:patch:output:skill:${TECHNIQUE.AFTERIMAGE}`,'the explanation follows the new actual output');
  const zero=bagGuideCalloutLayout(fixture({guide:skills(true),zero:true}));
  assert.deepEqual(zero.targets.map(target=>target.id),['bag:patch:return']);
  assert.match(zero.callouts[0].body,/No spare leads/);
});

test('target relocation updates leaders from shared hit geometry instead of cached or approximate module coordinates',()=>{
  const f=fixture({guide:guides[0]}),target=f.regions.find(region=>region.id==='bag:tab:skills');
  target.x+=.8;target.y+=.25;target.w-=1;
  const result=bagGuideCalloutLayout(f),card=result.callouts[0];
  assert.deepEqual(card.targetRect,copyBox(target));
  assert.ok(contains(target,card.leaderPoints.at(-1)));
  assert.deepEqual(result.targets[0].rect,copyBox(target));
});

test('the B3 lesson points to the physical SET button and never crosses its printed legend',()=>{
  for(const [width,height] of [[1280,760],[960,600]])for(const scale of [1,1.25,1.5]){
    const f=fixture({width,height,scale,guide:guides[4]}),result=bagGuideCalloutLayout(f);
    const button=f.regions.find(region=>region.id==='bag:map:set-target');
    assert.equal(button.action,'set-target'); assert.equal(button.enabled,true);
    assert.deepEqual(result.targets.map(target=>target.id),['bag:map:set-target']);
    assert.ok(outside(button,f.mapLayout.detail),'the readout is not the clickable confirmation');
    const card=result.callouts[0],leader=card.leaders.find(item=>item.targetId===button.id),end=leader.points.at(-1);
    assert.ok(contains(button,end));
    assert.ok(Math.abs(end.x-button.x)<1e-8||Math.abs(end.x-button.x-button.w)<1e-8
      ||Math.abs(end.y-button.y)<1e-8||Math.abs(end.y-button.y-button.h)<1e-8,
    `${width}x${height} at ${scale}: a leader touches the cap boundary, not the text at its center`);
    assert.deepEqual(card.leaderPoints,leader.points,'primary and drawn leaders share the same safe endpoint');
    for(let i=1;i<leader.points.length;i++){
      const a=leader.points[i-1],b=leader.points[i];
      assert.ok(Math.abs(a.x-b.x)<1e-8||Math.abs(a.y-b.y)<1e-8,'leaders use inspectable orthogonal segments');
      const crosses=a.x===b.x
        ?a.x>button.x+1e-8&&a.x<button.x+button.w-1e-8&&Math.max(a.y,b.y)>button.y+1e-8&&Math.min(a.y,b.y)<button.y+button.h-1e-8
        :a.y>button.y+1e-8&&a.y<button.y+button.h-1e-8&&Math.max(a.x,b.x)>button.x+1e-8&&Math.min(a.x,b.x)<button.x+button.w-1e-8;
      assert.equal(crosses,false,'the line cannot strike through the SET legend');
    }
  }
  const button=bagGuideCalloutLayout(fixture({guide:guides[0]})).callouts[0];
  assert.deepEqual(button.leaderPoints.at(-1),{x:button.targetRect.x+button.targetRect.w/2,y:button.targetRect.y},'larger selector caps retain their top-edge endpoint');
  const socket=bagGuideCalloutLayout(fixture()).callouts[0];
  assert.deepEqual(socket.leaderPoints.at(-1),{x:socket.targetRect.x+socket.targetRect.w/2,y:socket.targetRect.y+socket.targetRect.h/2},'a small jack still receives a centered pointer');
});

test('a lifted lead keeps its source channel highlighted even while a different skill is selected',()=>{
  const f=fixture(),source=f.patchLayout.sources.find(socket=>socket.branch==='recorder');
  const result=bagGuideCalloutLayout({...f,patchDrag:{from:source,to:{x:source.x+10,y:source.y+3}}});
  assert.equal(result.targets[0].id,`bag:patch:${source.id}`);
  const input=f.patchLayout.inputs.find(socket=>`bag:patch:${socket.id}`===result.targets[1]?.id);
  assert.equal(input?.branch,'recorder');
});

test('legacy work-order teaching uses the actual sheet row and normal browsing has no rail or guide targets',()=>{
  const guide={section:'files',entry:'file:work-order',action:'confirm',title:'READ THE WORK ORDER',why:'Read the work order before you roll sound.'};
  const f=fixture({guide}),result=bagGuideCalloutLayout(f);
  assert.equal(result.targets[0].id,'bag:sheet:file:work-order');
  assert.equal(result.continueRegion,null);
  for(const [width,height] of [[1280,760],[960,600]]){
    const ordinary=fixture({width,height,guide:null});
    assert.deepEqual(ordinary.frame,{outer:bagPanelBounds(ordinary.size),rail:null,side:null});
    assert.deepEqual(bagGuideCalloutLayout(ordinary),{continueRegion:null,callouts:[],targets:[]});
    assert.deepEqual(drawBagGuideCallouts(ordinary),{continueRegion:null,callouts:[],targets:[]});
  }
});

test('controller-only tours never advertise an Enter key for the map confirmation',()=>{
  setActiveInputDevice('controller',{controllerFamily:'xbox',viable:true});
  try{
    const result=bagGuideCalloutLayout(fixture({guide:guides[4]}));
    assert.equal(result.callouts[0].key,inputPromptLabel('confirm'));
  }finally{setActiveInputDevice('keyboard');}
});

test('live Bag registers module hits before the external guide and never resurrects an internal bottom band',()=>{
  const source=readFileSync(new URL('../src/game/bag.js',import.meta.url),'utf8');
  assert.match(source,/const frame = bagGuideFrame\(\{size,outer:bagPanelBounds\(\{\.\.\.size,sectionId:nav\.sectionId\}\),guide:guided\}\)/);
  assert.match(source,/body:mapHardware\?\{x:outer\.x\+3,y:outer\.y\+2\.6,w:outer\.w-6,h:outer\.h-3\.6\}:body/,
    'the map uses the approved larger exposed console body, not the inherited glass aperture');
  assert.match(source,/sectionId:mapHardware\?'map':null/,'the map body receives its own tab and content geometry');
  assert.doesNotMatch(source,/guideRows:\s*bagGuideRows/);
  const render=source.slice(source.indexOf('const frame = bagGuideFrame'));
  const registration=render.indexOf('registerRootHits(layout);'),guideDraw=render.indexOf('guidePresentation = drawBagGuideCallouts(');
  assert.ok(registration>=0&&guideDraw>registration,'registered pointer geometry exists before guide leaders resolve');
  assert.match(source,/regions:hits\.view\(\),patchLayout/);
  assert.match(source,/kind:'bag-guide-continue',\.\.\.continuation/,'the exterior button is its actual pointer hit target');
});
