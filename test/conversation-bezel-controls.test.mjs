// node --experimental-vm-modules test/conversation-bezel-controls.test.mjs
// CONVERSATION_SOURCE_ROOT may point to a review prototype's src directory.
// Actual scene, panel, material geometry, wrapping and hit-test modules run;
// platform/drawing sinks are recorded without requiring a browser or GPU.
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

async function fixture(size=sizes[0]){
  const state={...size,panels:[],buttons:[],text:[],vfd:[],printed:[],removed:[],clip:null};
  const context=vm.createContext({console,performance:{now:()=>1000}});
  const actual=new Map(),synthetic=new Map(),mocks=new Map();
  const file=name=>path.join(sourceRoot,name);
  const mock=(name,exports)=>mocks.set(file(name),exports);
  const theme={phosphor:'#e2bf72',glass:'#07120d',frame:'#4c5a43'};let surface='amber';
  mock('render/palette.js',{THEMES:{amber:theme,green:theme},UI_COLOR:theme,
    activeTheme:()=>theme,activeSurface:()=>surface,setActiveSurface:value=>{surface=value;},
    uiBrightness:()=>1,uiFlickerAlpha:()=>1,uiRoleColor:()=>theme.phosphor,
    uiRoleDim:()=>.1,themeRoleColor:()=>theme.phosphor,themeRoleDim:()=>.1});
  mock('render/atlas.js',{UI_CELL_W:8.45,UI_CELL_H:20,atlasConfigure:noop,atlasDpr:()=>2,getTile:noop});
  mock('render/electronic-text.js',{drawElectronicText:noop});
  mock('render/vfd-font.js',{drawVfdDots:noop,drawVfdGlyph:noop,vfdGlowBleed:()=>0});
  mock('render/keycap.js',{drawCapLegend:noop,drawPrintedText(x,y,text,options={}){
    state.printed.push({x,y,text:String(text),...options,clip:state.clip});
  }});
  mock('render/prompt-glyphs.js',{drawPromptParts:noop});
  mock('game/control-mechanics.js',{sampleControl:()=>({travel:0,lampHeat:0})});
  mock('game/scenes.js',{remove:scene=>state.removed.push(scene),pop:noop});
  mock('game/bindings.js',{inputPrompt:action=>`[${action==='bag'?'B':'ENTER'}]`,promptLine:()=>''});
  mock('audio/story-audio.js',{menuMove:noop,menuConfirm:noop,menuBack:noop,startMenuHiss:noop,stopMenuHiss:noop});
  mock('progression/schema.js',{
    DEFAULT_RULE_VALUES:{presencePressure:'standard',recordingForgiveness:'standard',combatAssistance:'standard',
      navigationSignal:'directional',escapeTimer:'standard',torchDrain:'standard',involuntaryBreath:'standard'},
    ENDING_IDS:['sacrifice','helped','inversion','drugged','surfaced','contact-won','contact-lost','tower-won','tower-lost'],
  });
  async function load(filename,{real=false}={}){
    if(!real&&mocks.has(filename)){
      if(!synthetic.has(filename)){
        const exports=mocks.get(filename);
        synthetic.set(filename,new vm.SyntheticModule(Object.keys(exports),function(){
          for(const[name,value]of Object.entries(exports))this.setExport(name,value);
        },{context,identifier:filename}));
      }
      return synthetic.get(filename);
    }
    if(actual.has(filename))return actual.get(filename);
    const module=new vm.SourceTextModule(await readFile(filename,'utf8'),{context,identifier:filename});
    actual.set(filename,module);
    return module;
  }
  async function evaluate(name){
    const module=await load(file(name),{real:true});
    if(module.status==='unlinked')await module.link((specifier,owner)=>load(path.resolve(path.dirname(owner.identifier),specifier)));
    if(module.status!=='evaluated')await module.evaluate();
    return module.namespace;
  }
  const ui=await evaluate('render/ui.js');
  const metrics={cellW:8.45*size.scale,cellH:20*size.scale,aspect:8.45/20};
  mock('render/ui.js',{...ui,uiSize:()=>({cols:state.cols,rows:state.rows}),uiCellMetrics:()=>metrics,
    uiDraw:noop,uiDrawHardware:noop,uiScrim:noop,uiLine:noop,
    uiText(x,y,text){state.text.push({x,y,text:String(text),clip:state.clip});},
    uiWithHardwareLayer(draw,cover){const result=draw();cover?.();return result;},
    uiWithClip(rect,draw){const before=state.clip;state.clip={...rect};try{return draw();}finally{state.clip=before;}},
  });
  const presentation=await evaluate('render/presentation.js');
  mock('render/presentation.js',{...presentation,
    withMachinePanel(x,y,w,h,options,draw){
      const panel={x,y,w,h,options};state.panels.push(panel);
      return presentation.withMachinePanel(x,y,w,h,options,body=>{panel.body={...body};return draw(body);});
    },
    drawLampButton(x,y,w,h,options){state.buttons.push({x,y,w,h,...options});return presentation.drawLampButton(x,y,w,h,options);},
    drawVfdText(x,y,text,options){state.vfd.push({x,y,text:String(text),...options,clip:state.clip});return presentation.drawVfdText(x,y,text,options);},
  });
  const handoff=await evaluate('game/setup-handoff-scene.js');
  const difficulty=await evaluate('game/difficulty-select.js');
  const material=await evaluate('render/instrument-material.js');
  const rules=await evaluate('progression/difficulty-defs.js');
  function render(scene){for(const key of['panels','buttons','text','vfd','printed'])state[key]=[];scene.render();return state;}
  return {state,metrics,presentation,handoff,difficulty,material,rules,render};
}

function quietCanvas(){
  return new Proxy({canvas:{},globalAlpha:1,createLinearGradient:()=>({addColorStop:noop})},
    {get:(target,key)=>key in target?target[key]:noop});
}
function inGlass(row,height=1){
  assert.ok(row.clip,'display copy must paint inside the optical scope');
  assert.ok(row.y>=row.clip.y-1e-7);
  assert.ok(row.y+height<=row.clip.y+row.clip.h+1e-7,`copy crosses glass bottom: ${row.text}`);
}
function click(scene,r,y=r.y+r.h/2){scene.pointer({type:'pointerdown',button:0,cellX:r.x+r.w/2,cellY:y});}

test('opt-in top and bottom rails clear the native well rim and preserve edge insets',async()=>{
  for(const size of sizes){
    const f=await fixture(size),{cellW,cellH}=f.metrics,rect={x:2,y:1,w:70,h:18};
    for(const edge of['top','bottom'])for(const controlHeight of[1.25,2.5]){
      const rail=f.presentation.machinePanelBezelRail(rect.x,rect.y,rect.w,rect.h,{edge,controlHeight});
      const a=rail.apertureBounds,dpr=2;
      const native=f.material.drawInstrumentWell(quietCanvas(),{
        x:a.x*cellW*dpr,y:a.y*cellH*dpr,w:a.w*cellW*dpr,h:a.h*cellH*dpr,dpr});
      const lip=native.outset/dpr/cellH;
      if(edge==='bottom'){
        close(rail.controlY-a.y-a.h-lip,.6);
        close(rect.y+rect.h-rail.controlY-controlHeight,.9);
      }else{
        close(a.y-lip-rail.controlY-controlHeight,.6);
        close(rail.controlY-rect.y,2.6);
        close(a.y+a.h,rect.y+rect.h-2.35);
      }
      close(a.x,rect.x+1.4);close(a.w,rect.w-2.8);
    }
  }
});

test('aperture-only callers retain their virtual body; clamping is explicit',async()=>{
  const f=await fixture(),p=f.presentation,args=[2,3,70,18];
  const original=p.machinePanelBody(...args),rail=p.machinePanelBezelRail(...args,{controlHeight:2.5});
  const plain=p.drawMachinePanel(...args,{meter:false});
  const apertureOnly=p.drawMachinePanel(...args,{meter:false,apertureBounds:rail.apertureBounds});
  assert.deepEqual(plain,original);assert.deepEqual(apertureOnly,original);
  const fitted=p.drawMachinePanel(...args,{meter:false,apertureBounds:rail.apertureBounds,bodyWithinAperture:true});
  close(fitted.x,original.x);close(fitted.y,original.y);close(fitted.w,original.w);
  close(fitted.y+fitted.h,rail.apertureBounds.y+rail.apertureBounds.h);
  for(const footer of['','EXISTING CONSENT FOOTER']){
    const before=p.machinePanelBody(...args,{footer});
    assert.deepEqual(p.drawMachinePanel(...args,{meter:false,footer}),before);
  }
});

test('handoff retains cap width and lateral position while clicking the new bezel rect',async()=>{
  for(const size of sizes)for(const mode of['recording','skills']){
    const f=await fixture(size);let opened=0;
    const scene=f.handoff.makeSetupHandoffScene({mode,cables:3,onOpen:()=>opened++});
    f.render(scene);
    const panel=f.state.panels[0],button=f.state.buttons[0],original=f.presentation.machinePanelBody(panel.x,panel.y,panel.w,panel.h);
    assert.equal(f.state.buttons.length,1);close(button.x,original.x);
    close(button.w,Math.min(30,original.w));close(button.h,2.5);
    close(button.y,panel.y+panel.h-.9-button.h);
    for(const row of f.state.text)inGlass(row);
    click(scene,button,original.y+4.5+.05);assert.equal(opened,0,'old VFD cap position must not activate');
    click(scene,button);assert.equal(opened,1);
    click(scene,button);assert.equal(opened,1,'handoff remains single-use');
  }
});

test('difficulty controls and hit targets agree through idle, pending, and failed save',async()=>{
  for(const size of sizes){
    const f=await fixture(size);let resolve,calls=0;
    const scene=f.difficulty.makeDifficultySelectScene({preparation:true,onConfirm:()=>{calls++;return new Promise(done=>{resolve=done;});}});
    const check=()=>{
      f.render(scene);const panel=f.state.panels[0],body=panel.body;
      const back=f.state.buttons.find(b=>b.legend==='BACK'),confirm=f.state.buttons.find(b=>b!==back);
      const regions=scene.view().hitRegions;
      for(const[button,id]of[[back,'difficulty:back'],[confirm,'difficulty:confirm']]){
        const target=regions.find(r=>r.id===id);
        for(const key of['x','y','w','h'])close(target[key],button[key]);
        close(button.y,panel.y+panel.h-.9-1.25);close(button.h,1.25);
      }
      close(back.x,body.x);close(back.w,Math.min(18,body.w*.27));
      close(confirm.w,Math.min(30,body.w*.48));close(confirm.x,body.x+body.w-confirm.w);
      for(const row of f.state.vfd)inGlass(row,row.scale*.6);
      assert.ok(f.state.vfd.length>0,'save status must be VFD content');
      return {panel,confirm};
    };
    let {panel,confirm}=check();
    click(scene,confirm,panel.y+panel.h-4.75+.6);assert.equal(calls,0,'old VFD button position must not confirm');
    click(scene,confirm);assert.equal(calls,1);({confirm}=check());
    assert.equal(confirm.enabled,false);click(scene,confirm);assert.equal(calls,1);
    resolve(false);await scene.whenSettled();({confirm}=check());
    assert.equal(confirm.legend,'RETRY CONFIRMATION');assert.equal(confirm.enabled,true);
  }
});

test('all seven custom rules and their pointer rows remain above the VFD status',async()=>{
  for(const size of sizes){
    const f=await fixture(size);
    const scene=f.difficulty.makeDifficultySelectScene({preparation:true,initialPreset:'custom',meta:{challengeCompletions:{deadAir:true}}});
    scene.key({key:'Enter'});f.render(scene);
    const statusTop=Math.min(...f.state.vfd.map(row=>row.y));
    const labels=new Set(Object.values(f.rules.RULE_LABELS));
    const rows=f.state.printed.filter(row=>labels.has(row.text.replace(/^› /,'')));
    assert.equal(rows.length,7);
    for(let i=0;i<rows.length;i++){
      inGlass(rows[i],rows[i].h);assert.ok(rows[i].y+rows[i].h<statusTop);
      if(i)assert.ok(rows[i].y>rows[i-1].y+rows[i-1].h);
    }
    const targets=scene.view().hitRegions.filter(r=>r.kind==='difficulty-rule');
    assert.equal(targets.length,7);
    for(const target of targets)assert.ok(target.y+target.h<statusTop);
  }
});
