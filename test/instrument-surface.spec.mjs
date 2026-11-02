import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {drawAchievementResinKey,ACHIEVEMENT_RESIN_TONES} from '../src/render/achievement-resin.js';
import {achievementPresentationCategory} from '../src/data/achievement-presentation.js';

// Execute the production modules' real synchronous functions with recording
// Canvas/import boundaries. No second implementation of the scope logic and
// no DOM, glyph-atlas allocation, audio or native graphics dependency.
function moduleUnderTest(path,bindings,extra=''){
  let source=readFileSync(new URL(path,import.meta.url),'utf8');
  const imports=[];
  source=source.replace(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"];\s*/g,(_,list)=>{
    imports.push(...list.split(',').map(value=>value.trim()).filter(Boolean).map(value=>value.split(/\s+as\s+/).at(-1)));
    return'';
  });
  const names=[...source.matchAll(/export\s+(?:function|const|let)\s+(\w+)/g)].map(match=>match[1]);
  source=source.replace(/\bexport\s+(?=(?:function|const|let)\b)/g,'');
  return new Function(...imports,`${source}\nreturn {${names.join(',')}${extra}};`)(...imports.map(name=>bindings[name]));
}

function recordingContext(theme){
  const commands=[],stack=[];
  const state={globalAlpha:1,globalCompositeOperation:'source-over',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,clips:[]};
  let path=[];
  const copy=()=>({...state,clips:state.clips.map(value=>value.map(part=>[...part]))});
  const record=(kind,args=[])=>commands.push({kind,args,state:copy(),path:path.map(part=>[...part]),theme:theme()});
  const methods={
    save(){stack.push(copy());},
    restore(){assert.ok(stack.length,'balanced canvas restore');for(const key of Object.keys(state))delete state[key];Object.assign(state,stack.pop());},
    beginPath(){path=[];},
    rect(...args){path.push(['rect',...args]);},
    moveTo(...args){path.push(['moveTo',...args]);},
    lineTo(...args){path.push(['lineTo',...args]);},
    closePath(){path.push(['closePath']);},
    clip(){state.clips.push(path.map(part=>[...part]));},
    mark(label,...args){record(label,args);},
    createLinearGradient(...args){return{args,stops:[],addColorStop(...stop){this.stops.push(stop);}};},
    createRadialGradient(...args){return{args,stops:[],addColorStop(...stop){this.stops.push(stop);}};},
  };
  const ctx=new Proxy(state,{
    get(target,key){if(key in methods)return methods[key];if(key in target)return target[key];return(...args)=>record(key,args);},
    set(target,key,value){target[key]=value;return true;},
  });
  return{ctx,state,commands,stack};
}

function harness({dpr=1,absent=false}={}){
  let currentTheme='amber';
  const themes={amber:{counter:'#ffd070'},green:{counter:'#cff6ff'}};
  const setActiveSurface=value=>{currentTheme=themes[value]?value:'amber';};
  const probe=recordingContext(()=>currentTheme);
  const palette={
    THEMES:themes,UI_COLOR:{frame:'#808080'},activeSurface:()=>currentTheme,setActiveSurface,
    activeTheme:()=>themes[currentTheme],uiBrightness:()=>1,uiFlickerAlpha:()=>1,
    themeRoleColor:()=>themes[currentTheme].counter,themeRoleDim:()=>null,uiRoleColor:()=>themes[currentTheme].counter,
  };
  const ui=moduleUnderTest('../src/render/ui.js',{
    ...palette,CELL_W:8.45,CELL_H:20,UI_FONT_PX:14,MONO_STACK:'monospace',
    atlasDpr:()=>dpr,atlasConfigure(){},fitText:(value,max)=>max==null?String(value):String(value).slice(0,max),
  },',setTestContext(value){ctx=value;cols=120;rows=40;}');
  ui.setTestContext(absent?null:probe.ctx);
  const mark=name=>(ctx,options)=>ctx.mark(name,options);
  const presentation=moduleUnderTest('../src/render/presentation.js',{
    ...palette,...ui,
    drawInstrumentPlate:mark('plate'),drawInstrumentWell:mark('well'),drawInstrumentGlass:mark('glass'),drawVfdGrid:mark('grid'),
    drawPrintedText:(x,y,text,options)=>ui.uiDrawHardware(({ctx})=>ctx.mark('print',text,options)),
    drawCapLegend:(ctx,text)=>ctx.mark('legend',text),
    drawHardwareCap:(ctx,x,y,w,h,options)=>ctx.mark('cap',options),
    hardwareCapGeometry:(w,h)=>({content:{x:1,y:1,w:w-2,h:h-2},distance:1}),
    hardwareMotionReduced:()=>false,
    drawPromptParts:(x,y,parts)=>ui.uiDrawHardware(({ctx})=>ctx.mark('prompt',parts)),
    fitText:value=>String(value),
    monitorSnapshot:()=>({}),
  });
  const achievementDeck=moduleUnderTest('../src/render/achievement-deck.js',{
    ...ui,drawInstrumentPlate:mark('plate'),drawInstrumentWell:mark('well'),drawInstrumentGlass:mark('glass'),
    drawHardwarePrint:(ctx,text,x,y,options)=>ctx.mark('print',text,options),
    drawAchievementResinKey:(ctx,x,y,w,h,options)=>{ctx.mark('cap',options);return{content:{x:x+3,y:y+3,w:w-6,h:h-6}};},ACHIEVEMENT_RESIN_TONES,achievementPresentationCategory,
    hardwareMotionReduced:()=>true,drawElectronicText:(ctx,text)=>ctx.mark('vfd',text),measureElectronicText:text=>String(text).length*10,
    drawAchievementIconToCanvas:(ctx,id,options)=>ctx.mark('emblem',id,options),
  });
  return{...probe,ui,presentation,palette,achievementDeck};
}

const shell={label:'MONITOR',wordmark:'AUDIOCORP',meter:false,footer:'RETURN',theme:'green'};
const tag=(ui,name)=>ui.uiDraw(({ctx})=>ctx.mark(name));
const hardware=(ui,name)=>ui.uiDrawHardware(({ctx})=>ctx.mark(name));

test('hardware is queued until the cover paints and the aperture clip unwinds',()=>{
  const h=harness(),rect={x:3,y:4,w:20,h:8};
  const value=h.ui.uiWithHardwareLayer(()=>h.ui.uiWithClip(rect,()=>{
    tag(h.ui,'electronic');hardware(h.ui,'key');hardware(h.ui,'ink');return 42;
  }),()=>tag(h.ui,'cover'));
  assert.equal(value,42);assert.deepEqual(h.commands.map(command=>command.kind),['electronic','cover','key','ink']);
  assert.equal(h.commands[0].state.clips.length,1);
  assert.deepEqual(h.commands[0].state.clips[0],[['rect',3*8.45,4*20,20*8.45,8*20]]);
  assert.ok(h.commands.slice(1).every(command=>command.state.clips.length===0));assert.equal(h.stack.length,0);
});

test('MASTER INDEX header controls remain above its real cover and outside its body clip',()=>{
 const h=harness(),frame={x:2,y:2,w:100,h:30};
 h.achievementDeck.withAchievementDeck(frame,{label:'MASTER INDEX',completion:{completed:1,total:38}},body=>{
  h.achievementDeck.drawAchievementDeckControl({x:4,y:4.95,w:25,h:1.55},'ACHIEVEMENTS 38',{selected:true});
  h.achievementDeck.drawAchievementVfd('SELECTED REQUIREMENT',body.x,body.y+3);
 });
 const caps=h.commands.filter(command=>command.kind==='cap'),vfd=h.commands.find(command=>command.kind==='vfd'&&command.args[0]==='SELECTED REQUIREMENT');
 assert.equal(caps.length,1);assert.equal(caps[0].state.clips.length,0,'the physical tab is outside the display aperture');
 assert.equal(vfd.state.clips.length,1,'emitted copy stays inside its well');
 assert.ok(h.commands.indexOf(caps[0])>h.commands.findLastIndex(command=>command.kind==='glass'),'cover then mechanical controls');
 assert.equal(h.stack.length,0);
});

test('cast resin has five distinct semantic pigments; only actual actuation changes its depth',()=>{
 assert.equal(new Set(Object.values(ACHIEVEMENT_RESIN_TONES).map(tone=>tone.pigment)).size,5);
 assert.deepEqual(Object.values(ACHIEVEMENT_RESIN_TONES).map(tone=>tone.name),['ivory','amber','mint','blue','violet']);
 const h=harness(),r={category:'method',dpr:2};
 const off=drawAchievementResinKey(h.ctx,20,30,180,70,{...r,light:.18}),selected=drawAchievementResinKey(h.ctx,20,30,180,70,{...r,light:.92});
 assert.equal(off.travel,0);assert.equal(selected.travel,0);assert.equal(off.face.y,selected.face.y);assert.ok(selected.light>off.light);
 const down=drawAchievementResinKey(h.ctx,20,30,180,70,{...r,light:.92,pressed:true}),released=drawAchievementResinKey(h.ctx,20,30,180,70,{...r,light:.92});
 assert.ok(down.travel>0);assert.ok(down.content.y>selected.content.y);assert.equal(released.travel,0);assert.equal(released.content.y,selected.content.y);
 assert.equal(h.stack.length,0);
});

test('actual resin legends keep opaque ink across lighting states and unearned focus stays dimmer than earned',()=>{
 const h=harness(),r={x:4,y:5,w:18,h:2};
 for(const category of Object.keys(ACHIEVEMENT_RESIN_TONES)){
  for(const selected of[false,true])h.achievementDeck.drawAchievementDeckControl(r,'CATEGORY',{category,selected});
  const labels=h.commands.filter(c=>c.kind==='print'&&c.args[0]==='CATEGORY').slice(-2);
  assert.deepEqual(labels.map(c=>c.args[1].color),[ACHIEVEMENT_RESIN_TONES[category].ink,ACHIEVEMENT_RESIN_TONES[category].ink]);
  for(const state of[{unlocked:false,selected:false},{unlocked:false,selected:true},{unlocked:true,selected:false},{unlocked:true,selected:true}])h.achievementDeck.drawAchievementAnnunciator(h.ctx,'ACH_WORK_ORDER',{x:10,y:20,w:64,h:64,category,...state});
  const emblems=h.commands.filter(c=>c.kind==='emblem').slice(-4),lamps=h.commands.filter(c=>c.kind==='cap').slice(-4);
  assert.ok(emblems.every(c=>c.args[1].color===ACHIEVEMENT_RESIN_TONES[category].ink&&c.args[1].alpha===1));
  assert.ok(lamps[1].args[0].light>lamps[0].args[0].light);assert.ok(lamps[1].args[0].light<lamps[2].args[0].light);
  assert.ok(lamps.every(c=>c.args[0].pressed===false));
 }
});

test('nested hardware rises above both covers but retains the caller’s non-aperture clip',()=>{
  const h=harness();
  h.ui.uiWithClip({x:0,y:0,w:100,h:30},()=>h.ui.uiWithHardwareLayer(()=>h.ui.uiWithClip({x:2,y:2,w:80,h:25},()=>{
    tag(h.ui,'outer-content');hardware(h.ui,'outer-key');
    h.ui.uiWithHardwareLayer(()=>h.ui.uiWithClip({x:4,y:4,w:30,h:12},()=>{
      tag(h.ui,'inner-content');hardware(h.ui,'inner-key');
    }),()=>tag(h.ui,'inner-cover'));
  }),()=>tag(h.ui,'outer-cover')));
  assert.deepEqual(h.commands.map(command=>command.kind),['outer-content','inner-content','inner-cover','outer-cover','outer-key','inner-key']);
  assert.deepEqual(h.commands.map(command=>command.state.clips.length),[2,3,2,1,1,1]);
  assert.equal(h.state.clips.length,0);assert.equal(h.stack.length,0);
});

test('queued hardware captures its own alpha scope and every nested scope restores it',()=>{
  const h=harness();
  h.ui.uiWithAlpha(.5,()=>h.ui.uiWithHardwareLayer(()=>{
    tag(h.ui,'outer-content');
    h.ui.uiWithAlpha(.4,()=>hardware(h.ui,'inner-key'));
    hardware(h.ui,'outer-key');
  },()=>tag(h.ui,'cover')));
  tag(h.ui,'after');
  assert.deepEqual(h.commands.map(command=>[command.kind,command.state.globalAlpha]),[
    ['outer-content',.5],['cover',.5],['inner-key',.2],['outer-key',.5],['after',1],
  ]);
});

test('content exceptions still paint the cover/hardware and restore clip and alpha',()=>{
  const h=harness(),error=new Error('content failed');
  assert.throws(()=>h.ui.uiWithAlpha(.25,()=>h.ui.uiWithHardwareLayer(()=>h.ui.uiWithClip({x:2,y:2,w:10,h:10},()=>{
    hardware(h.ui,'key');throw error;
  }),()=>tag(h.ui,'cover'))),value=>value===error);
  tag(h.ui,'after');hardware(h.ui,'immediate');
  assert.deepEqual(h.commands.map(command=>command.kind),['cover','key','after','immediate']);
  assert.deepEqual(h.commands.map(command=>command.state.globalAlpha),[.25,.25,1,1]);
  assert.ok(h.commands.every(command=>command.state.clips.length===0));assert.equal(h.stack.length,0);
});

test('a failed cover cannot strand the deferred hardware queue or corrupt later scopes',()=>{
  const h=harness(),error=new Error('cover failed');
  assert.throws(()=>h.ui.uiWithHardwareLayer(()=>hardware(h.ui,'key'),()=>{throw error;}),value=>value===error);
  hardware(h.ui,'next-key');
  assert.deepEqual(h.commands.map(command=>command.kind),['key','next-key']);assert.equal(h.stack.length,0);
});

test('withMachinePanel paints the shell before clipped content, then glass and all physical legends',()=>{
  const h=harness(),{withMachinePanel,machinePanelBody,machinePanelAperture,drawLampButton}=h.presentation;
  const result=withMachinePanel(2,3,64,19,shell,body=>{
    tag(h.ui,'real-counter');
    drawLampButton(body.x,body.y,6,1.6,{legend:'RECORD',color:'red',lit:true});
    return 'early return from recorder mode';
  });
  assert.deepEqual(result,machinePanelBody(2,3,64,19,{footer:'CONTROLS'}));
  const kinds=h.commands.map(command=>command.kind),cover=kinds.indexOf('glass');
  assert.deepEqual(kinds.slice(0,3),['plate','well','real-counter']);
  assert.ok(cover>2&&kinds.indexOf('cap')>cover&&kinds.indexOf('print')>cover&&kinds.indexOf('legend')>cover);
  const content=h.commands.find(command=>command.kind==='real-counter'),aperture=machinePanelAperture(2,3,64,19);
  assert.deepEqual(content.state.clips[0],[['rect',aperture.x*8.45,aperture.y*20,aperture.w*8.45,aperture.h*20]]);
  assert.ok(h.commands.filter(command=>['glass','cap','print','legend'].includes(command.kind)).every(command=>command.state.clips.length===0));
  assert.equal(h.palette.activeSurface(),'amber','the caller’s surface theme is restored');
});

test('a navigator-style smaller aperture moves its well, clip and cover together while hardware stays outside',()=>{
  const h=harness(),{withMachinePanel,machinePanelAperture}=h.presentation;
  const standard=machinePanelAperture(2,3,30,19);
  const aperture={...standard,h:standard.h-2.65};
  withMachinePanel(2,3,30,19,{...shell,footer:'',apertureBounds:aperture},()=>tag(h.ui,'map'));
  hardware(h.ui,'lcd');
  const well=h.commands.find(command=>command.kind==='well');
  const glass=h.commands.find(command=>command.kind==='glass');
  for(const command of[well,glass]){
    assert.equal(command.args[0].x,aperture.x*8.45);
    assert.equal(command.args[0].y,aperture.y*20);
    assert.equal(command.args[0].w,aperture.w*8.45);
    assert.equal(command.args[0].h,aperture.h*20);
  }
  const map=h.commands.find(command=>command.kind==='map'),lcd=h.commands.find(command=>command.kind==='lcd');
  assert.deepEqual(map.state.clips[0],[['rect',aperture.x*8.45,aperture.y*20,aperture.w*8.45,aperture.h*20]]);
  assert.equal(lcd.state.clips.length,0,'the separate LCD cannot inherit the VFD aperture clip');
  assert.ok(h.commands.indexOf(lcd)>h.commands.indexOf(glass),'the reflective LCD remains above the finished VFD cover');
  assert.equal(h.stack.length,0);
});

test('nested panels restore theme before continuing the parent and all keys remain above the outer cover',()=>{
  const h=harness();
  h.presentation.withMachinePanel(0,0,80,30,{...shell,theme:'green'},()=>{
    tag(h.ui,'green-before');
    h.presentation.withMachinePanel(4,4,35,12,{...shell,theme:'amber'},()=>{
      tag(h.ui,'amber-child');hardware(h.ui,'child-key');
    });
    tag(h.ui,'green-after');
  });
  assert.equal(h.commands.find(command=>command.kind==='green-before').theme,'green');
  assert.equal(h.commands.find(command=>command.kind==='amber-child').theme,'amber');
  assert.equal(h.commands.find(command=>command.kind==='green-after').theme,'green');
  const lastCover=h.commands.findLastIndex(command=>command.kind==='glass');
  assert.ok(h.commands.findIndex(command=>command.kind==='child-key')>lastCover);
  assert.equal(h.palette.activeSurface(),'amber');assert.equal(h.state.clips.length,0);
});

test('panel exceptions restore caller theme and do not strand hardware or clipping',()=>{
  const h=harness(),error=new Error('recorder mode failed');
  assert.throws(()=>h.presentation.withMachinePanel(0,0,60,20,shell,()=>{
    hardware(h.ui,'regrip');h.palette.setActiveSurface('amber');throw error;
  }),value=>value===error);
  assert.ok(h.commands.some(command=>command.kind==='glass'));
  assert.ok(h.commands.some(command=>command.kind==='regrip'&&command.state.clips.length===0));
  assert.equal(h.palette.activeSurface(),'amber');assert.equal(h.stack.length,0);
  tag(h.ui,'next-frame');assert.equal(h.commands.at(-1).state.globalAlpha,1);
});

test('absent Canvas still computes layout without invoking raw painters or leaking scopes',()=>{
  const h=harness({absent:true});let contents=0,painted=0;
  assert.equal(h.ui.uiWithClip({x:0,y:0,w:1,h:1},()=>9),9);
  h.ui.uiWithHardwareLayer(()=>h.ui.uiDrawHardware(()=>painted++),()=>h.ui.uiDraw(()=>painted++));
  const result=h.presentation.withMachinePanel(0,0,60,20,shell,()=>{contents++;});
  assert.equal(contents,1);assert.equal(painted,0);assert.equal(result.w,54);assert.equal(h.palette.activeSurface(),'amber');
  assert.deepEqual(h.commands,[]);
});

test('formed counter plates keep inactive phosphor passive and only large counters expose a mesh',()=>{
  const h=harness();
  h.presentation.drawVfdCounter(2,3,'1',{scale:.7,theme:'green'});
  const passive=h.commands.filter(command=>command.kind==='fill'&&command.state.fillStyle==='#4a5a46');
  assert.equal(passive.length,5);assert.ok(passive.every(command=>command.state.globalAlpha===.19&&command.state.shadowBlur===0));
  assert.ok(!h.commands.some(command=>command.kind==='grid'));
  assert.ok(h.commands.filter(command=>command.kind==='fill').every(command=>command.path.filter(part=>part[0]==='lineTo').length===5),'segments retain their six-sided formed electrode geometry');
  h.commands.length=0;h.presentation.drawVfdCounter(2,3,' ',{scale:1.4});
  assert.equal(h.commands.filter(command=>command.kind==='fill').length,7);
  assert.ok(h.commands.filter(command=>command.kind==='fill').every(command=>command.state.fillStyle==='#4a5a46'&&command.state.shadowBlur===0),'a completely inactive digit has no emissive copy');
  const grid=h.commands.find(command=>command.kind==='grid');assert.ok(grid);assert.equal(grid.args[0].w,1.15*1.4*8.45);
  assert.equal(grid.args[0].h,28);assert.equal(h.stack.length,0);
});

test('counter punctuation and electrode geometry use the same device-pixel scale on Retina',()=>{
  const a=harness({dpr:1}),b=harness({dpr:2});
  a.presentation.drawVfdCounter(3,4,'1:.',{scale:.7});b.presentation.drawVfdCounter(3,4,'1:.',{scale:.7});
  const dots=h=>h.commands.filter(command=>command.kind==='fillRect').map(command=>command.args);
  const normal=dots(a),high=dots(b);assert.equal(normal.length,3);
  for(let i=0;i<normal.length;i++)for(let k=0;k<4;k++)assert.ok(Math.abs(high[i][k]/2-normal[i][k])<1e-9,`punctuation ${i} coordinate ${k}`);
  const electrode=h=>h.commands.find(command=>command.kind==='fill'&&command.state.fillStyle==='#4a5a46').path;
  for(let i=0;i<electrode(a).length;i++)for(let k=1;k<electrode(a)[i].length;k++)assert.ok(Math.abs(electrode(b)[i][k]/2-electrode(a)[i][k])<1e-9);
});
