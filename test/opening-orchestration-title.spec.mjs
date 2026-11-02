import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {vfdMarqueeFrame} from '../src/render/vfd-marquee.js';

const source=readFileSync(new URL('../src/game/coldopen.js',import.meta.url),'utf8');
const start=source.indexOf('export function makeWorldTitleScene(');
assert.ok(start>=0);
const production=source.slice(start).replace(/^export /gm,'');
const COPY=['CHUNK SURFER','ELLERY CONSERVATOIRE OF MUSIC','5 ROOMS / 1 CLEAN MINUTE EACH'];
function fixture({cols=80,rows=30,camera=true,reducedMotion=false,arrival=true}={}){
  const size={cols,rows},draw=[],events=[],pose={yaw:.73,pitch:-.16};let clip=null;
  const host={
    uiSize:()=>size,uiFill:(x,y,w,h,color)=>draw.push({kind:'fill',x,y,w,h,color}),
    uiText:(x,y,text,role,alpha=1)=>draw.push({kind:'text',x,y,text,role,alpha,scale:1}),
    drawVfdText:(x,y,text,options={})=>draw.push({kind:text===COPY[0]?'title':'text',x,y,text,...options,clip:clip?{...clip}:null}),
    uiWithClip(rect,paint){const previous=clip;clip=rect;try{return paint();}finally{clip=previous;}},
    vfdMarqueeFrame,hardwareMotionReduced:()=>reducedMotion,
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
    assert.equal(title[0].color,'#F2A81E');
    assert.equal(ink.filter(p=>p.kind==='text').map(p=>p.text).join(' '),COPY.slice(1).join(' '),'wrapping preserves every word in order');
    for(const p of ink){
      assert.ok(p.clip&&p.clip.x>=0&&p.clip.x+p.clip.w<=cols+.001,`${cols}x${rows}: the addressed text window stays on screen`);
      assert.ok(p.y>=0&&p.y+(p.kind==='title'?p.scale*.60:1)<=rows+.001,`${cols}x${rows}: ${p.text} extends outside the vertical field`);
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
    assert.equal(first.slice(1).map(p=>p.text).join(' '),COPY.slice(1).join(' '));
    assert.ok(first.slice(1).every(p=>p.role==='ui-secondary'&&p.scale===1));
    assert.deepEqual(later.map(({x,y,text})=>({x,y,text})),first.map(({x,y,text})=>({x,y,text})),
      'no part of the original title drifts while its authored fade proceeds');
  }
});

test('the real Ellery-entry handoff selects its marquee for a full title interval even after the cinematic overture',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),
    from=main.indexOf('function beginGetInArrivalTitle('),to=main.indexOf('\nfunction noteArrivalCrossing(',from);
  assert.ok(from>=0&&to>from);
  for(const overtureDone of[false,true]){
    const flags=new Set(['prologueDone',...(overtureDone?['opening.overture.completed']:[])]),titles=[],saved=[],pose={yaw:1.2,pitch:-.1};
    const host={storyMode:true,setupComplete:()=>false,flagTest:key=>flags.has(key),flagClear:key=>flags.delete(key),
      flagApply:add=>add.forEach(key=>flags.add(key)),saveCommit:value=>saved.push(value),getSave:()=>({flags:Object.fromEntries([...flags].map(key=>[key,true]))}),
      SPEECH:{clearSpeech:()=>{}},R3:{r3dLookAngles:()=>pose,r3dLook:()=>{}},STORY:{},fireCue:()=>{},
      scenes:{push:scene=>titles.push(scene)},makeArrivalTitleScene:options=>({kind:'actual-entry-card',options}),
      makeWorldTitleScene:()=>assert.fail('the Ellery threshold must not select the cinematic/static frontispiece'),
      restoreOpeningEntryPose:()=>{},beginGetInDriveTeaser:()=>{},
    };
    vm.createContext(host);vm.runInContext(main.slice(from,to),host);
    assert.equal(host.beginGetInArrivalTitle(),true);assert.equal(titles.length,1);
    assert.equal(titles[0].options.duration,12,'a completed overture cannot silently suppress the entry display');
    assert.equal(titles[0].options.camera.pose(),pose);assert.equal(saved.length,1);
    assert.ok(flags.has('title.shown')&&flags.has('opening.driveTeaser.pending'));
    assert.equal(host.beginGetInArrivalTitle(),false,'the existing one-time entry flag still owns repetition');
    assert.equal(titles.length,1);
  }
});

test('overflow travels once in its fixed display after a readable hold, while reduced motion preserves every word',()=>{
  const h=fixture({camera:false});h.scene.update(2.7);const held=h.render().find(p=>p.kind==='title');
  h.scene.update(1.8);const moving=h.render().find(p=>p.kind==='title');
  assert.ok(moving.x<held.x);assert.deepEqual(moving.clip,held.clip);
  h.scene.update(3.5);const ending=h.render().find(p=>p.kind==='title');h.scene.update(1);const still=h.render().find(p=>p.kind==='title');
  assert.equal(still.x,ending.x,'the finite title does not keep cycling like a ticker');
  for(const[cols,rows]of[[20,8],[54,12],[80,30]]){
    const reduced=fixture({cols,rows,camera:false,reducedMotion:true});reduced.scene.update(8);
    const ink=reduced.render().filter(p=>p.kind!=='fill');
    assert.equal(ink.filter(p=>p.kind==='text').map(p=>p.text).join(' '),COPY.slice(1).join(' '));
    for(const row of ink)assert.ok(row.x>=row.clip.x-.001&&row.x+row.text.length*row.scale<=row.clip.x+row.clip.w+.001,'static accessible fields show complete words');
  }
});

test('title, place and finite work reveal separately and fade out together without a new hold',()=>{
  const h=fixture({camera:false});h.scene.update(1);
  let ink=h.render().filter(p=>p.kind!=='fill');
  assert.ok(ink.find(p=>p.kind==='title').alpha>0);
  assert.equal(ink.find(p=>p.text===COPY[1]).alpha,0);
  assert.equal(ink.find(p=>p.text===COPY[2]).alpha,0);
  h.scene.update(2);ink=h.render().filter(p=>p.kind!=='fill');
  assert.ok(ink.find(p=>p.text===COPY[1]).alpha>0);
  assert.equal(ink.find(p=>p.text===COPY[2]).alpha,0);
  h.scene.update(2);const settled=h.render().filter(p=>p.kind!=='fill');
  h.scene.update(6.5);const leaving=h.render().filter(p=>p.kind!=='fill');
  assert.equal(h.events.includes('done'),false);
  for(let i=0;i<leaving.length;i++)assert.ok(leaving[i].alpha<settled[i].alpha,'all three levels leave in the existing final fade');
  h.scene.update(.5);assert.equal(h.events.filter(e=>e==='done').length,1);
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
