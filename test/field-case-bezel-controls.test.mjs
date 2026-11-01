// node --experimental-vm-modules test/field-case-bezel-controls.test.mjs
// CONVERSATION_SOURCE_ROOT optionally selects a review prototype's src tree.
// Run the real bag scene, layout, controls, hit registry and VFD row renderer.
// Only platform services and Canvas paint sinks are replaced; no dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const sourceRoot=process.env.CONVERSATION_SOURCE_ROOT
  ?path.resolve(process.env.CONVERSATION_SOURCE_ROOT):fileURLToPath(new URL('../src/',import.meta.url));
const noop=()=>{};
const sizes=[{cols:151,rows:40,scale:1},{cols:75,rows:20,scale:1.5}];
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const rectEqual=(a,b)=>{for(const k of['x','y','w','h'])close(a[k],b[k]);};
const equipment=['field-case','light','recorder','radio','microphone','headphones'].map(id=>({id,present:true}));
const job={done:0,total:5,rooms:[],unfiled:[{id:'work-order',title:'Work Order 4417-C',body:['Five room tones.']}]};

async function fixture(size=sizes[0]){
  const trace={panels:[],caps:[],text:[],printed:[],clip:null};
  let save={flags:{},settings:{instantText:true,fx:false,shake:'off'}};
  const context=vm.createContext({console,URL,URLSearchParams,structuredClone,
    window:{devicePixelRatio:1,addEventListener:noop,removeEventListener:noop},
    performance:{now:()=>10000},matchMedia:()=>({matches:true}),setTimeout:()=>0,clearTimeout:noop,
    __record(kind,value){trace[kind].push(value);},
  });
  const file=name=>path.join(sourceRoot,name),actual=new Map(),synthetic=new Map();
  const mocks=new Map(Object.entries({
    'game/save.js':{getSave:()=>save,saveCommit:value=>{save={...save,...value};},getMeta:()=>({}),metaCommit:noop},
    'audio/sam-voice.js':{isVoiced:()=>false,createSamDialogVoice:()=>({warm:noop,stop:noop,start:()=>null})},
    'audio/story-audio.js':{TYPE_GAIN:0,TYPE_LEVEL:{thought:1,direction:1},menuMove:noop,menuConfirm:noop,menuBack:noop,startMenuHiss:noop,stopMenuHiss:noop},
    'audio/ui-cues.js':{UI_CUE:{MOVE:'tick',PRESS:'press',RELEASE:'release',CONFIRM:'toggle',BACK:'back',DENIED:'refuse',ON:'latch',OFF:'unlatch',PAGE:'page'},uiCue:noop,cancelUiCueScope:noop},
    'game/story-art.js':{resolveStoryArt:()=>null,loadStoryArtImage:()=>null},
  }).map(([name,exports])=>[file(name),exports]));
  const append={
    'render/presentation.js':`
      const __panel=drawMachinePanel;drawMachinePanel=function(x,y,w,h,options={}){globalThis.__record('panels',{x,y,w,h,options});return __panel(...arguments);};
      const __cap=drawLampButton;drawLampButton=function(x,y,w,h,options={}){globalThis.__record('caps',{x,y,w,h,...options});return __cap(...arguments);};`,
    'render/keycap.js':`
      const __print=drawPrintedText;drawPrintedText=function(x,y,text,options={}){globalThis.__record('printed',{x,y,text:String(text),...options});return __print(...arguments);};`,
  };
  async function getModule(filename,{real=false}={}){
    if(!real&&mocks.has(filename)){
      if(!synthetic.has(filename)){
        const values=mocks.get(filename);
        synthetic.set(filename,new vm.SyntheticModule(Object.keys(values),function(){
          for(const[k,v]of Object.entries(values))this.setExport(k,v);
        },{context,identifier:filename}));
      }
      return synthetic.get(filename);
    }
    if(!actual.has(filename))actual.set(filename,(async()=>new vm.SourceTextModule(
      await readFile(filename,'utf8')+(append[path.relative(sourceRoot,filename)]||''),
      {context,identifier:filename,initializeImportMeta(meta){meta.env={};}}
    ))());
    return actual.get(filename);
  }
  async function load(name){
    const module=await getModule(file(name),{real:true});
    if(module.status==='unlinked')await module.link((specifier,owner)=>getModule(path.resolve(path.dirname(owner.identifier),specifier)));
    if(module.status==='linked')await module.evaluate();
    return module.namespace;
  }
  const ui=await load('render/ui.js'),metrics={cellW:8.45*size.scale,cellH:20*size.scale,aspect:8.45/20};
  const text=(x,y,value,cls,alpha,max)=>trace.text.push({x,y,text:String(value),cls,alpha,max,clip:trace.clip});
  mocks.set(file('render/ui.js'),{...ui,
    uiSize:()=>({cols:size.cols,rows:size.rows}),uiCellMetrics:()=>metrics,uiCurrentScale:()=>size.scale,
    uiCanvasSize:()=>({width:size.cols*metrics.cellW,height:size.rows*metrics.cellH}),
    uiDraw:noop,uiDrawHardware:noop,uiFill:noop,uiLine:noop,uiStrokeRect:noop,uiScrim:noop,uiGlyph:noop,uiInk:noop,
    uiText:text,uiItalicText:text,
    uiWithHardwareLayer(draw,cover){const result=draw();cover?.();return result;},
    uiWithClip(rect,draw){const before=trace.clip;trace.clip={...rect};try{return draw();}finally{trace.clip=before;}},
    uiWithAlpha(alpha,draw){return draw();},
  });
  const {makeBagScene}=await load('game/bag.js'),scenes=await load('game/scenes.js');
  const tabs=await load('render/bag-tabs.js'),layouts=await load('render/bag-layout.js');
  const presentation=await load('render/presentation.js'),bindings=await load('game/bindings.js');
  bindings.setActiveInputDevice('keyboard');
  function make(section='kit',options={}){
    const events=[],scene=makeBagScene({equipment,job,memory:null,focus:{sectionId:section},
      onGuideEvent:event=>events.push(event),...options});
    scenes.push(scene);scene.update(.4);return{scene,events};
  }
  function render(scene){
    for(const key of['panels','caps','text','printed'])trace[key]=[];
    scene.render();return scene.debugState();
  }
  return{trace,metrics,tabs,layouts,presentation,make,render};
}

function click(scene,r,button=0){
  const pointer={button,pointerId:1,cellX:r.x+r.w/2,cellY:r.y+r.h/2};
  scene.pointer({...pointer,type:'pointerdown'});scene.pointer({...pointer,type:'pointerup'});
}
function tabCaps(f){return f.trace.caps.filter(c=>c.controlId?.startsWith('bag:tab:'));}
function assertTargets(f,state){
  const caps=tabCaps(f);assert.equal(caps.length,5);
  for(const cap of caps){
    const hit=state.hitRegions.find(h=>h.id===cap.controlId);assert.ok(hit,cap.controlId);rectEqual(cap,hit);
  }
  return caps;
}

test('ordinary case selectors occupy metal while readouts retain their VFD positions',async()=>{
  for(const size of sizes){
    const f=await fixture(size);
    for(const section of['kit','skills','sheets']){
      const{scene}=f.make(section),state=f.render(scene),caps=assertTargets(f,state);
      const panel=f.trace.panels[0],aperture=panel.options.apertureBounds;
      assert.ok(aperture,'ordinary sections need an aperture below their fixed selectors');
      const body=f.presentation.machinePanelBody(panel.x,panel.y,panel.w,panel.h);
      const before=f.tabs.bagTabRegions(state.model,f.layouts.bagLayout({body}));
      for(let i=0;i<caps.length;i++){
        const cap=caps[i],original=before[i];
        for(const k of['x','w','h'])close(cap[k],original[k]);
        assert.ok(cap.y<original.y,'selector moves up onto the bezel');
        assert.ok(cap.y+cap.h+7/f.metrics.cellH<aperture.y,'cap must clear the real 7px well lip');
        const count=f.trace.text.find(row=>Math.abs(row.y-original.readout.y)<1e-7&&row.x>=original.readout.x&&row.x<original.readout.x+original.readout.w);
        assert.ok(count,`missing count for ${cap.controlId}`);
        assert.ok(count.clip,'count belongs to the electronic aperture');
        close(count.clip.y,aperture.y);
        assert.ok(count.y>=aperture.y&&count.y+1<=aperture.y+aperture.h,'count remains fully inside the aperture');
      }
    }
  }
});

test('painted selector targets switch real sections; old display positions and secondary clicks do not',async()=>{
  for(const size of sizes){
    const f=await fixture(size),{scene}=f.make('kit');f.render(scene);
    for(const section of['skills','sheets','kit']){
      const previous=scene.debugState().nav.sectionId,cap=tabCaps(f).find(c=>c.controlId===`bag:tab:${section}`);
      const panel=f.trace.panels[0],oldBody=f.presentation.machinePanelBody(panel.x,panel.y,panel.w,panel.h);
      const old=f.tabs.bagTabRegions(scene.debugState().model,f.layouts.bagLayout({body:oldBody})).find(c=>c.sectionId===section);
      click(scene,cap,2);assert.equal(scene.debugState().nav.sectionId,previous);
      click(scene,old);assert.equal(scene.debugState().nav.sectionId,previous,'old cap centre is now display content');
      click(scene,cap);assert.equal(scene.debugState().nav.sectionId,section);f.render(scene);
    }
    scene.key({key:'Tab',code:'Tab'});scene.keyup({key:'Tab',code:'Tab'});
    assert.equal(scene.debugState().nav.sectionId,'map','existing keyboard section order is unchanged');
  }
});

test('reader selectors fit the metal strip and clicking them closes the reader into that section',async()=>{
  for(const size of sizes){
    const f=await fixture(size),{scene}=f.make('sheets');f.render(scene);
    scene.key({key:'Enter',code:'Enter'});scene.keyup({key:'Enter',code:'Enter'});
    const state=f.render(scene);assert.equal(state.route.type,'sheet-reader');
    const caps=assertTargets(f,state);
    for(const cap of caps){assert.ok(cap.y>0);assert.ok(cap.y+cap.h<f.tabs.BAG_TABS_HEIGHT);}
    assert.ok(f.trace.printed.some(row=>row.text.includes('FIELD CASE / SHEETS')),'reader identity is passive print on metal');
    assert.equal(f.trace.text.some(row=>row.text.includes('FIELD CASE / SHEETS')),false);
    click(scene,caps.find(c=>c.controlId==='bag:tab:skills'));
    assert.equal(scene.debugState().route.type,'root');assert.equal(scene.debugState().nav.sectionId,'skills');
  }
});

test('guide Continue is an electronic row inside its unchanged target and accepts pointer, C and controller',async()=>{
  for(const size of sizes){
    const f=await fixture(size),guide={section:'skills',kind:'skills',mode:'skills',continueLabel:'CONTINUE',continueEnabled:true,allowClose:false};
    const{scene,events}=f.make('skills',{guide}),state=f.render(scene);
    const region=state.guidePresentation.continueRegion,hit=state.hitRegions.find(h=>h.id==='bag:guide:continue');
    assert.ok(region);rectEqual(hit,region);
    assert.equal(f.trace.caps.some(c=>c.controlId==='bag:guide:continue'),false,'scripted Continue must not become a floating resin cap');
    const row=f.trace.text.find(r=>r.text.includes('CONTINUE'));assert.ok(row,'complete action text remains visible');
    assert.ok(row.x>=region.x&&row.y>=region.y&&row.y+1<=region.y+region.h);
    const count=()=>events.filter(e=>e.type==='continue').length;
    click(scene,region,2);assert.equal(count(),0);click(scene,region);assert.equal(count(),1);
    scene.key({key:'c',code:'KeyC'});scene.keyup({key:'c',code:'KeyC'});assert.equal(count(),2);
    scene.key({key:'c',code:'KeyC',repeat:true});assert.equal(count(),2);
    scene.key({controllerAction:'tabNext'});scene.keyup({controllerAction:'tabNext'});assert.equal(count(),3);
  }
});

test('disabled Continue remains legible and every existing activation route refuses it',async()=>{
  const f=await fixture(sizes[1]);
  const{scene,events}=f.make('skills',{guide:{section:'skills',kind:'skills',continueLabel:'CONTINUE',continueEnabled:false,allowClose:false}});
  const state=f.render(scene),region=state.guidePresentation.continueRegion;
  assert.ok(f.trace.text.some(r=>r.text.includes('CONTINUE')));
  click(scene,region);scene.key({key:'c',code:'KeyC'});scene.keyup({key:'c',code:'KeyC'});
  scene.key({controllerAction:'tabNext'});scene.keyup({controllerAction:'tabNext'});
  assert.equal(events.filter(e=>e.type==='continue').length,0);
});
