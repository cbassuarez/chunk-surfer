import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/game/coldopen.js',import.meta.url),'utf8');
const start=source.indexOf('export function makeWorldTitleScene(');
assert.ok(start>=0);
const production=source.slice(start).replace(/^export /,'');
const COPY=['CHUNK SURFER','ELLERY CONSERVATOIRE OF MUSIC','5 ROOMS / 1 CLEAN MINUTE EACH'];
function fixture({cols=80,rows=30,camera=true}={}){
  const size={cols,rows},draw=[],events=[],pose={yaw:.73,pitch:-.16};
  const host={
    uiSize:()=>size,uiFill:(x,y,w,h,color)=>draw.push({kind:'fill',x,y,w,h,color}),
    uiText:(x,y,text,role,alpha=1)=>draw.push({kind:'text',x,y,text,role,alpha,scale:1}),
    drawVfdText:(x,y,text,options={})=>draw.push({kind:'title',x,y,text,...options}),
    withMachinePanel:()=>assert.fail('world-title must not render another instrument housing'),
    UI_COLOR:{glass:'#000000',paper:'#D8CFB8'},
    scenes:{pop:()=>events.push('pop')},
  };
  vm.createContext(host);vm.runInContext(production,host);
  const scene=host.makeWorldTitleScene({
    camera:camera?{pose:()=>pose,turn:f=>events.push({turn:f}),restore:p=>events.push({restored:p})}:null,
    audio:{fadeSoundtrack:options=>events.push({fade:options}),stopTyping:()=>events.push('stop-typing')},
    cue:id=>events.push({cue:id}),onDone:()=>events.push('done'),
  });
  scene.enter();
  return{scene,size,draw,events,pose,render:()=>{draw.length=0;scene.render();return draw;}};
}

test('the existing three title strings stand alone with hierarchy and complete responsive copy',()=>{
  for(const[cols,rows]of[[20,8],[32,10],[54,12],[80,30],[160,45]]){
    const h=fixture({cols,rows});h.scene.update(9.9);
    const drawn=h.render(),ink=drawn.filter(p=>p.kind!=='fill'),title=ink.filter(p=>p.kind==='title');
    assert.equal(title.length,1);assert.equal(title[0].text,COPY[0]);
    assert.ok(title[0].scale>1,'the name dominates the ordinary caption scale');
    assert.equal(title[0].color,'#D8CFB8');
    assert.equal(ink.filter(p=>p.kind==='text').map(p=>p.text).join(' '),COPY.slice(1).join(' '),'wrapping preserves every word in order');
    for(const p of ink){
      assert.ok(p.x>=0&&p.x+p.text.length*p.scale<=cols+.001,`${cols}x${rows}: ${p.text} extends outside the horizontal field`);
      assert.ok(p.y>=0&&p.y+(p.kind==='title'?p.scale*.60:1)<=rows+.001,`${cols}x${rows}: ${p.text} extends outside the vertical field`);
      assert.ok(p.alpha>=0&&p.alpha<=1);
    }
    assert.ok(ink.every(p=>p.text!=='PROGRAM'),'no instrument-source legend survives');
    assert.equal(drawn.filter(p=>p.kind==='fill').length,1,'only the full black title field is painted');
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
