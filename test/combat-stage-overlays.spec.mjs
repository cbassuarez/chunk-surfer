import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {combatStageOverlayLayout,fitBattleStageThoughts} from '../src/render/combat-stage-overlays.js';

const thoughts=[
  {tone:'stance',text:'it is setting something up.'},
  {tone:'read',text:'a second voice. perhaps.'},
  {tone:'read',text:'or a break in the sound.'},
  {tone:'plan',text:'get it on tape.'},
  {tone:'warn',text:'apparition 02 moves.'},
  {tone:'warn',text:'there is a second blow.'},
  {tone:'plan',text:'i can afford something big.'},
  {tone:'warn',text:'it is set to turn my swing.'},
];

test('a three-row stage preserves a read, an actionable plan and its immediate warning',()=>{
  const before=JSON.stringify(thoughts),rows=fitBattleStageThoughts(thoughts,3);
  assert.deepEqual(rows,[thoughts[1],thoughts[3],thoughts[7]]);
  assert.equal(JSON.stringify(thoughts),before);
  assert.equal(rows[0],thoughts[1],'the original review source survives presentation fitting');
  assert.equal(rows[2].text,'it is set to turn my swing.');
  assert.deepEqual(fitBattleStageThoughts(thoughts,2),[thoughts[1],thoughts[7]]);
  assert.deepEqual(fitBattleStageThoughts(thoughts,1),[thoughts[7]]);
  assert.deepEqual(fitBattleStageThoughts(thoughts,0),[]);
  assert.deepEqual(fitBattleStageThoughts(thoughts,20),thoughts);
});

test('stage text and a named posture fit even in fractional and dense layouts',()=>{
  for(const h of [.65,1.8,2.2,4.8,5.5,7,8,18]){
    const stage={x:4,y:5,w:76,h},view=combatStageOverlayLayout({stage,panel:stage});
    if(view.rows)assert.ok(view.top+view.rows<=stage.y+stage.h);
    if(view.stance.visible){
      assert.ok(view.stance.y>=stage.y&&view.stance.y+view.stance.h<=stage.y+stage.h);
      assert.ok(view.stance.x>=stage.x&&view.stance.x+view.stance.w<=stage.x+stage.w);
    }
    if(!view.stance.named)assert.ok(h>=7.1,'the full triangle plus its label has seven rows');
  }
  assert.equal(combatStageOverlayLayout({stage:{h:4.8,w:76},group:true,phase:'resolve'}).stance.visible,false);
});

function productionOverlay({w=96,h=4.8,phase='tool',guidance='full',resolution=null,returnLabel='RETURN 0/3'}={}){
  const source=readFileSync(new URL('../src/game/combat.js',import.meta.url),'utf8');
  const start=source.indexOf('      const showOverlays =');
  const end=source.indexOf('      // ── floating damage numbers',start);
  assert.ok(start>=0&&end>start);
  const calls=[],reviews=[],state={apparitions:{},difficulty:{guidance},enemyGuard:{mode:'parry'},
    stance:{id:'setting'},snr:'noise'};
  const context={desktopIsland:false,phase,reaction:null,panel:{x:0,y:1,w,h:30},
    layout:{stage:{x:0,y:3,w,h}},stageY:3,stageH:h,compact:true,state,intentState:state,
    returnX:w-returnLabel.length,clockWidth:Math.max(6,Math.min(18,Math.floor(w*.22))),
    combatStageOverlayLayout,fitBattleStageThoughts,resolution,
    battle:{id:'hall',enemy:'THE THREE'},intent:{kind:'overload',id:'regard'},
    strike:{verb:'REGARDS',label:'THE REGARD',instrument:'THE VOICE'},readMissed:true,
    readFidelity:()=>1,thoughtTrace:()=>({lines:thoughts}),rivalCombatIntent:()=>null,
    counterMovesForIntent:()=>[],selectEnemyIntents:()=>[{}],availableCombatActions:()=>[],apparitions:{},
    movement:()=>({id:'seated'}),battleThoughtReviewLine:(line,options)=>({...line,reviewSource:line.text,options}),
    textOf:line=>line.text,registerBattleReviewRow:(...args)=>reviews.push(args),regionRects:{},
    drawVfdText:(x,y,text,options)=>calls.push({x,y,text,h:options.scale}),
    uiText:(x,y,text)=>calls.push({x,y,text,h:1}),
    strikeVerdict:()=>({text:'THE HIT LANDED',role:'ui-danger'}),
    moves:()=>[],selectedMove:0,drawStanceTriangle:()=>assert.fail('short stages use the named posture')};
  runInNewContext(source.slice(start,end),context);
  return{calls,reviews,regions:context.regionRects,stage:context.layout.stage};
}

test('the actual Hall overlay keeps reviewable thoughts apart from its posture and deck',()=>{
  const result=productionOverlay();
  assert.equal(result.reviews.length,3);
  assert.deepEqual(result.reviews.map(([line])=>line.tone),['read','plan','warn']);
  assert.equal(result.reviews[2][0].reviewSource,"it's set to turn my swing.");
  const stance=result.calls.find(call=>call.text.includes('SETTING'));
  assert.ok(stance);assert.ok(stance.x>50);assert.equal(stance.y,3.1);
  const thought=result.calls.filter(call=>call.x===1);
  for(let index=1;index<thought.length;index++)assert.ok(thought[index].y>=thought[index-1].y+1);
  assert.ok(result.regions.intent.y+result.regions.intent.h<=result.stage.y+result.stage.h);
  assert.equal(result.reviews[0][0].reviewSource,thoughts[1].text);
});

test('the named Hall posture fits between the clock and both return indicators',()=>{
  for(const w of [36,56,96])for(const returnLabel of ['RETURN 0/3','RETURN / IN FLIGHT']){
    const result=productionOverlay({w,h:2.45,returnLabel});
    const stance=result.calls.find(call=>call.text.endsWith('SETTING'));
    assert.ok(stance);
    assert.ok(stance.x>Math.max(6,Math.min(18,Math.floor(w*.22))));
    assert.ok(stance.x+stance.text.length<w-returnLabel.length);
    assert.equal(result.regions.stance.x,stance.x);
    assert.equal(result.regions.stance.w,stance.text.length);
  }
});

test('actual resolution, tempo and dense prose never draw below their stage',()=>{
  const resolution={side:'enemy',after:{last:{received:15,snrFrom:'signal',snrTo:'noise'}}};
  for(const h of [.65,2.2,4.8,5.5])for(const phase of ['tool','resolve']){
    const result=productionOverlay({h,phase,resolution:phase==='resolve'?resolution:null});
    for(const call of result.calls)assert.ok(call.y+call.h<=result.stage.y+h+.0001,
      `${phase}/${h}: ${call.text} extends into the command deck`);
    if(h<1.1)assert.equal(result.calls.length,0);
  }
  const severe=productionOverlay({guidance:'none'});
  assert.equal(severe.reviews.length,0);
  assert.ok(severe.calls.some(call=>call.text.includes('SETTING')),'posture remains visible without prose guidance');
});
