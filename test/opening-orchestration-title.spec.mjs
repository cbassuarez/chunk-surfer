import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {renderArrivalTitleOption,arrivalTitleOptionFrame,ARRIVAL_TITLE_SUBTITLE} from '../src/render/arrival-title-options.js';
import {UI_COLOR} from '../src/render/palette.js';

const source=readFileSync(new URL('../src/game/coldopen.js',import.meta.url),'utf8');
const start=source.indexOf('export function makeWorldTitleScene(');
assert.ok(start>=0);
const production=source.slice(start).replace(/^export /gm,'');
const COPY=['CHUNK SURFER',ARRIVAL_TITLE_SUBTITLE.toUpperCase(),'01   /   4417-C'];
const STATIC_COPY=['CHUNK SURFER','ELLERY CONSERVATOIRE OF MUSIC','5 ROOMS / 1 CLEAN MINUTE EACH'];
function fixture({cols=80,rows=30,camera=true,reducedMotion=false,arrival=true}={}){
  const size={cols,rows},draw=[],events=[],pose={yaw:.73,pitch:-.16};let clip=null;
  const host={
    uiSize:()=>size,uiFill:(x,y,w,h,color)=>draw.push({kind:'fill',x,y,w,h,color}),
    uiText:(x,y,text,role,alpha=1)=>draw.push({kind:'text',x,y,text,role,alpha,scale:1}),
    drawVfdText:(x,y,text,options={})=>draw.push({kind:text===COPY[0]?'title':'text',x,y,text,...options,clip:clip?{...clip}:null}),
    uiWithClip(rect,paint){const previous=clip;clip=rect;try{return paint();}finally{clip=previous;}},
    renderArrivalTitleOption,hardwareMotionReduced:()=>reducedMotion,
    withMachinePanel:()=>assert.fail('world-title must not render another instrument housing'),
    UI_COLOR:{glass:'#000000',paper:'#D8CFB8',primary:'#F2A81E'},
    scenes:{pop:()=>events.push('pop')},
  };
  vm.createContext(host);vm.runInContext(production,host);
  const scene=(arrival?host.makeArrivalTitleScene:host.makeWorldTitleScene)({
    camera:camera?{pose:()=>pose,turn:f=>events.push({turn:f}),restore:p=>events.push({restored:p})}:null,
    audio:{fadeSoundtrack:options=>events.push({fade:options}),stopTyping:()=>events.push('stop-typing')},
    cue:id=>events.push({cue:id}),onDone:()=>events.push('done'),
  });
  scene.enter();
  return{scene,size,draw,events,pose,render:()=>{draw.length=0;scene.render();return draw;}};
}

test('Ellery entry alone uses bounded VFD title/subtitle fields with hierarchy and complete responsive copy',()=>{
  for(const[cols,rows]of[[20,8],[32,10],[54,12],[80,30],[160,45]]){
    const h=fixture({cols,rows});h.scene.update(9.9);
    const drawn=h.render(),ink=drawn.filter(p=>p.kind!=='fill'),title=ink.filter(p=>p.kind==='title');
    assert.equal(title.length,1);assert.equal(title[0].text,COPY[0]);
    assert.ok(title[0].scale>1,'the name dominates the ordinary caption scale');
    assert.equal(title[0].color,UI_COLOR.primary);
    assert.equal(ink.filter(p=>p.kind==='text').map(p=>p.text).join(' '),COPY.slice(1).join(' '),'wrapping preserves every word in order');
    for(const p of ink){
      if(p.clip)assert.ok(p.clip.x>=0&&p.clip.x+p.clip.w<=cols+.001,`${cols}x${rows}: the addressed text window stays on screen`);
      else assert.ok(p.x>=0&&p.x+p.text.length*p.scale<=cols+.001,`${cols}x${rows}: fixed title/metadata fit without cropping`);
      assert.ok(p.y>=0&&p.y+p.scale*.80<=rows+.001,`${cols}x${rows}: ${p.text} extends outside the vertical field`);
      assert.ok(p.alpha>=0&&p.alpha<=1);
    }
    assert.ok(ink.every(p=>p.text!=='PROGRAM'),'no instrument-source legend survives');
    assert.equal(drawn.filter(p=>p.kind==='fill').length,1,'only the full black title field is painted');
  }
});

test('the default world frontispiece retains its original static paper title and ordinary captions',()=>{
  for(const[cols,rows]of[[20,8],[54,12],[80,30],[160,45]]){
    const h=fixture({cols,rows,camera:false,arrival:false});h.scene.update(4.5);
    const first=h.render().filter(p=>p.kind!=='fill').map(p=>({...p}));
    h.scene.update(2);const later=h.render().filter(p=>p.kind!=='fill');
    assert.equal(first[0].text,COPY[0]);assert.equal(first[0].color,'#D8CFB8');
    assert.ok(first.every(p=>!p.clip),'the static frontispiece does not inherit the entry display window');
    assert.equal(first.slice(1).map(p=>p.text).join(' '),STATIC_COPY.slice(1).join(' '));
    assert.ok(first.slice(1).every(p=>p.role==='ui-secondary'&&p.scale===1));
    assert.deepEqual(later.map(({x,y,text})=>({x,y,text})),first.map(({x,y,text})=>({x,y,text})),
      'no part of the original title drifts while its authored fade proceeds');
  }
});

test('actual entry, crash aftermath and title callbacks preserve their order and durable completion',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),
    from=main.indexOf('function beginGetInCrashAftermath('),to=main.indexOf('\nfunction noteArrivalCrossing(',from);
  assert.ok(from>=0&&to>from);
  for(const overtureDone of[false,true]){
    const flags=new Set(['prologueDone','unrelated.flag',...(overtureDone?['opening.overture.completed']:[])]),stack=[],saved=[],events=[];
    const host={storyMode:true,setupComplete:()=>false,flagTest:key=>flags.has(key),flagClear:key=>flags.delete(key),
      flagApply:(add,clear=[])=>{add.forEach(key=>flags.add(key));clear.forEach(key=>flags.delete(key));},
      saveCommit:value=>saved.push(value),getSave:()=>({flags:Object.fromEntries([...flags].map(key=>[key,true]))}),
      SPEECH:{clearSpeech:()=>{}},STORY:{openingThresholdTagState:()=>({active:false}),commitOpeningOvertureToTag:()=>events.push('tag')},
      paused:false,document:{hidden:false},gameplayInputLifecycleActive:()=>true,
      actx:{},sfxGain:{},master:{},openPauseMenu:()=>{},uiPhysicalSize:()=>({cols:80,rows:30}),uiFill:()=>{},
      scenes:{has:id=>stack.some(scene=>scene.id===id),push:scene=>{stack.push(scene);return scene;},remove:scene=>{const i=stack.indexOf(scene);if(i>=0)stack.splice(i,1);}},
      makeOpeningCrashAftermathScene:options=>({id:'opening-crash-aftermath',...options}),
      makeArrivalTitleScene:options=>({id:'world-title',options}),
      beginGetInDriveTeaser:()=>events.push('drive'),TUT:{startTutorial:()=>events.push('tutorial')},
    };
    vm.createContext(host);vm.runInContext(main.slice(from,to),host);
    assert.equal(host.beginGetInArrivalTitle(),true);assert.equal(stack[0].id,'get-in-score-tag');
    assert.ok(flags.has('opening.title.pending')&&flags.has('opening.driveTeaser.pending'));
    assert.equal(flags.has('title.shown'),false,'entry cannot claim to have displayed a later title');
    assert.equal(host.beginGetInArrivalTitle(),false,'pending threshold prevents duplicate entry');
    for(let i=0;i<12;i++)stack[0]?.update?.(.1);
    assert.deepEqual(events,['tag','drive']);assert.equal(stack.length,0,'the drive is next, with no earlier title');
    assert.equal(host.beginGetInCrashAftermath(),true);const aftermath=stack.at(-1);
    assert.equal(aftermath.id,'opening-crash-aftermath');assert.equal(host.beginGetInCrashAftermath(),false);
    aftermath.onDone();const title=stack.at(-1);assert.equal(title.id,'world-title');
    assert.equal(title.options.duration,12);assert.equal(title.options.manageSoundtrack,false,'the door cadence has already ended; the title cannot restart its music');
    assert.equal(title.options.camera,undefined,'the postcrash card cannot turn the restored camera back towards the door');
    assert.equal(flags.has('title.shown'),false);title.options.onDone();
    assert.equal(flags.has('title.shown'),true);assert.equal(flags.has('opening.title.pending'),false);
    assert.equal(flags.has('unrelated.flag'),true);assert.equal(events.at(-1),'tutorial');
  }
});

test('the full game name remains intact while the overflowing location gets one finite addressed pass',()=>{
  const h=fixture({camera:false,cols:32,rows:10});h.scene.update(4.5);const held=h.render().map(row=>({...row}));
  h.scene.update(3);const moving=h.render();
  const firstTitle=held.find(p=>p.kind==='title'),laterTitle=moving.find(p=>p.kind==='title');
  assert.equal(firstTitle.x,laterTitle.x);assert.equal(firstTitle.text,'CHUNK SURFER');
  assert.ok(firstTitle.x>=0&&firstTitle.x+firstTitle.text.length*firstTitle.scale<=32+.001,
    'no frame can turn the title into UNK SURFER');
  assert.ok(moving.find(p=>p.text===COPY[1]).x<held.find(p=>p.text===COPY[1]).x,'the long location owns the bounded motion');
  for(const[cols,rows]of[[20,8],[54,12],[80,30]]){
    const reduced=fixture({cols,rows,camera:false,reducedMotion:true});reduced.scene.update(8);
    const ink=reduced.render().filter(p=>p.kind!=='fill');
    assert.equal(ink.filter(p=>p.kind==='text').map(p=>p.text).join(' '),COPY.slice(1).join(' '));
    for(const row of ink)assert.ok(row.x>=0&&row.x+row.text.length*row.scale<=cols+.001,'static accessible fields show complete words');
  }
});

test('the exact approved subtitle fits the normal display on its first hold, including its final Y',()=>{
  for(const[cols,rows]of[[80,30],[100,40],[160,45]])for(const time of[1,4.5,9]){
    const frame=arrivalTitleOptionFrame({direction:'disc',cols,rows,time});
    const subtitle=frame.lines.find(line=>line.text===ARRIVAL_TITLE_SUBTITLE.toUpperCase());
    assert.ok(subtitle);assert.ok(subtitle.x>=subtitle.clip.x+.4);
    assert.ok(subtitle.x+subtitle.text.length*subtitle.scale<=subtitle.clip.x+subtitle.clip.w-.4,
      'the complete word CONSERVATORY sits inside the addressed window, before any scroll');
  }
});

test('the approved Disc title uses the exact subtitle and restrained metadata rather than instructions',()=>{
  const h=fixture({camera:false});h.scene.update(1);
  let ink=h.render().filter(p=>p.kind!=='fill');
  assert.ok(ink.find(p=>p.kind==='title').alpha>0);
  assert.ok(ink.find(p=>p.text===COPY[1]).alpha<ink.find(p=>p.kind==='title').alpha);
  assert.ok(ink.find(p=>p.text===COPY[2]).alpha<ink.find(p=>p.text===COPY[1]).alpha);
  assert.equal(ink.some(p=>/5 ROOMS|CLEAN MINUTE|CONSERVATOIRE/.test(p.text)),false);
  h.scene.update(4);const settled=h.render().filter(p=>p.kind!=='fill');
  h.scene.update(6.5);const leaving=h.render().filter(p=>p.kind!=='fill');
  assert.equal(h.events.includes('done'),false);
  for(let i=0;i<leaving.length;i++)assert.ok(leaving[i].alpha<settled[i].alpha,'the approved display fades as one authored programme');
  h.scene.update(.5);assert.equal(h.events.filter(e=>e==='done').length,1);
});

test('production and the approved review use the identical authoritative Disc layout',()=>{
  for(const reducedMotion of[false,true])for(const[cols,rows]of[[20,8],[32,10],[54,12],[80,30],[160,45]]){
    const h=fixture({camera:false,cols,rows,reducedMotion});h.scene.update(6);
    const drawn=h.render().filter(row=>row.kind!=='fill'),expected=arrivalTitleOptionFrame({direction:'disc',cols,rows,time:6,reducedMotion});
    assert.deepEqual(drawn.map(({text,x,y,scale,alpha,color,clip})=>({text,x,y,scale,alpha,color,clip:clip||null})),
      expected.lines.map(({text,x,y,scale,alpha,color,clip})=>({text,x,y,scale,alpha,color,clip:clip||null})));
  }
});

test('physical look-back, opaque iris, unskippable duration and exact pose return keep their original owner',()=>{
  const h=fixture();assert.equal(h.scene.blocksInput,true);assert.equal(h.scene.blocksWorld,false);
  assert.equal(h.scene.key({key:'Enter'}),true);assert.equal(h.scene.key({key:'Escape'}),true);assert.equal(h.events.includes('done'),false);
  assert.equal(h.scene.worldPresentation,'visible');
  for(let i=0;i<39;i++)h.scene.update(1/60);
  assert.equal(h.render().length,0,'the doorway remains visible during the look-back');
  for(let i=0;i<39;i++)h.scene.update(1/60);
  assert.ok(h.events.filter(e=>e?.turn).reduce((sum,e)=>sum+e.turn,0)>.98);
  h.scene.update(1.601);assert.equal(h.scene.worldPresentation,'hidden');
  h.scene.update(11.9);assert.equal(h.events.includes('done'),false);h.scene.update(.1);h.scene.update(1);
  assert.equal(h.events.filter(e=>e==='done').length,1);assert.equal(h.events.filter(e=>e==='pop').length,1);
  assert.equal(h.events.find(e=>e?.restored).restored,h.pose,'the exact captured pose is returned');
  assert.equal(h.events.find(e=>e?.fade).fade.fade,12.5);h.scene.exit();assert.equal(h.events.at(-1),'stop-typing');
  assert.equal(h.events.some(e=>e?.cue),false,'the title cannot manufacture a door slam independently of the real leaves');
});
