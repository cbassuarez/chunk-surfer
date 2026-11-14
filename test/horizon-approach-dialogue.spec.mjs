import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {HORIZON_APPROACH as C,spaceAtMap} from '../src/data/horizon-approach.js';
import {horizonApproachTruth,horizonApproachPetalLine,horizonApproachReturnLines,horizonApproachOfferLines,horizonApproachProposition} from '../src/data/horizon-approach-dialogue.js';
import {freshHorizonApproach,restoreHorizonApproach,stepHorizonApproach,createHorizonApproachScene,HORIZON_APPROACH_EVENT as E,HORIZON_TOWER_BEARING} from '../src/game/horizon-approach-scene.js';

test('every occupant gives a truth in the right voice and Lyle remembers which box',()=>{
  for(const id of C.occupants){
    const lines=horizonApproachTruth(id);
    assert.ok(lines.length>0);
    for(const line of lines){
      assert.ok(line.text);
      if(['daisy','ant'].includes(id)){assert.equal(line.who,'you');assert.equal(line.voice,false);assert.equal(line.say,false);}
      else assert.equal(line.who,id);
    }
  }
  assert.match(horizonApproachTruth('sarah').map(l=>l.text).join(' '),/boundary was mine.*never said you could/);
  assert.match(horizonApproachTruth('lyle',{lyleBox:'broken'})[0].text,/seventh bar/);
  assert.match(horizonApproachTruth('lyle',{lyleBox:'whole'})[0].text,/cab/);
  assert.equal(horizonApproachTruth('ant')[0].text,'It gets across.');
  assert.notDeepEqual(horizonApproachTruth('sarah'),horizonApproachTruth('sarah',{reducedDread:true}));
  assert.equal(horizonApproachPetalLine(0),null);assert.equal(horizonApproachPetalLine(21).text,'loves me');
});
test('the question tree states the cost but never substitutes a route button for walking',()=>{
  for(const id of C.occupants){
    const tree=horizonApproachProposition(id,{lyleBox:'broken'});
    for(const key of ['identity','history','route','consequence','decision'])assert.ok(tree[key]);
    const cost=tree.consequence.lines.map(l=>l.text).join(' ');
    assert.match(cost,/It's easier as long as you don't lose\./);assert.match(cost,/And if I lose\?/);assert.match(cost,/no choice but to continue/);assert.match(cost,/third is final/);
    assert.equal(tree.decision.choices,undefined);
    for(const node of Object.values(tree))for(const choice of node.choices||[])assert.equal(choice.sourceFinaleChoice,undefined);
    for(const defeats of [1,2]){
      const again=horizonApproachProposition(id,{defeats});
      assert.equal(again.start.goto,'decision');assert.equal(again.decision.choices,undefined);assert.match(again.decision.lines[0].text,/chapel way is closed/);
      assert.notDeepEqual(horizonApproachReturnLines(id,{defeats:1}),horizonApproachReturnLines(id,{defeats:2}));
    }
  }
});
test('the optional tree is not needed to hear the complete route and cost',()=>{
  for(const id of C.occupants){
    const lines=horizonApproachOfferLines(id),text=lines.map(l=>l.text).join(' ');
    assert.match(text,/towards the tower/);assert.match(text,/other way leads to the chapel/);
    assert.match(text,/It's easier as long as you don't lose\./);assert.match(text,/And if I lose\?/);
    assert.match(text,/no choice but to continue/);assert.match(text,/chapel way will be closed/);assert.match(text,/third is final/);
    for(const line of lines){assert.notEqual(line.who,'unknown');if(['daisy','ant'].includes(id)){assert.equal(line.who,'you');assert.equal(line.voice,false);}}
    assert.match(horizonApproachOfferLines(id,{defeats:2}).map(l=>l.text).join(' '),/only way.*One attempt remains/);
  }
});
test('a cathedral return opens the same occupant without another truth or another petal task',()=>{
  for(const occupant of C.occupants){
    const state=freshHorizonApproach({occupant,condition:false,defeats:1}),next=stepHorizonApproach(state,{dt:.05});
    assert.equal(state.returning,true);assert.equal(state.condition,true);
    assert.deepEqual(next.events.map(e=>e.type),[E.RETURNED,E.OPENED]);assert.equal(next.state.offerOpen,true);
    assert.equal(next.events[0].defeats,1);
    if(occupant==='daisy')assert.equal(state.petalsPlucked,21);
  }
});
function depart(state,phi){
  const V=C.variants[state.variant];let next={...state,arrived:true,offerOpen:true,frame:spaceAtMap(V.sign,V.radius,1,phi),yaw:Math.PI-phi};const events=[];
  for(let i=0;i<150;i++){const r=stepHorizonApproach(next,{dt:1/30,forward:1});next=r.state;events.push(...r.events);}
  return{state:next,events};
}
test('returning leaves only the tower route and still never decides from waiting',()=>{
  const V=C.variants.closed,road=Math.round(HORIZON_TOWER_BEARING/(Math.PI*2/V.roads))*(Math.PI*2/V.roads),base=freshHorizonApproach({occupant:'lyle',defeats:2});
  const other=depart(base,road+Math.PI*4/V.roads);
  assert.equal(other.state.decided,null);assert.equal(other.events.some(e=>e.type===E.DECLINED),false);
  const tower=depart(base,road);assert.equal(tower.state.decided,'accepted');assert.equal(tower.events.filter(e=>e.type===E.ACCEPTED).length,1);
  const outside={...base,arrived:true,offerOpen:true,frame:spaceAtMap(V.sign,V.radius,10,road)};
  assert.equal(stepHorizonApproach(outside,{dt:.1}).state.decided,null);
  assert.equal(stepHorizonApproach(outside,{dt:0,forward:1}).state.decided,null);
});
test('a route cannot commit before its evidence finishes, and he cannot walk out on it; look stays free',async()=>{
  let enabled=false;const scene=createHorizonApproachScene({occupant:'lyle',condition:true,renderer:{initialize:()=>true,render:()=>true},decisionsEnabled:()=>enabled});
  await scene.initialize();const V=C.variants.closed,road=Math.round(HORIZON_TOWER_BEARING/(Math.PI*2/V.roads))*(Math.PI*2/V.roads);
  scene.place({arrived:true,offerOpen:true});scene.placeAt(1,road,{yaw:Math.PI-road});
  scene.walk(3);
  assert.equal(scene.view().state.decided,null);assert.ok(scene.view().distance>1,'he can walk about at the object');
  assert.ok(scene.view().distance<=C.station.reach+1e-6,`but not past it while it speaks: ${scene.view().distance}`);
  assert.equal(scene.lookBy(.1,.05),true);
  scene.placeAt(6.9,road,{yaw:Math.PI-road});const before=scene.serialize();
  enabled=true;scene.update(.1);assert.equal(scene.view().state.decided,null,'enabling decisions is not a choice');
  scene.setLook({yaw:Math.PI-road,pitch:0});scene.walk(.1);assert.equal(scene.view().state.decided,'accepted');assert.notDeepEqual(scene.serialize().frame,before.frame);
});
test('a snapshot resumes progress without duplicate arrival or invalid geometry',()=>{
  const V=C.variants.closed,state={...freshHorizonApproach({occupant:'daisy'}),frame:spaceAtMap(V.sign,V.radius,2.5,0),arrived:true,petalsPlucked:12,elapsed:42};
  const resumed=restoreHorizonApproach(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(resumed,JSON.parse(JSON.stringify(state)));assert.notEqual(resumed.frame,state.frame);
  assert.deepEqual(stepHorizonApproach(resumed,{dt:.05}).events,[]);
  const bad={...state,frame:[NaN]};assert.deepEqual(restoreHorizonApproach(bad,{occupant:'lyle'}),freshHorizonApproach({occupant:'lyle'}));
  const again=restoreHorizonApproach({...state,returning:true,defeats:2,decided:'declined'});assert.equal(again.decided,null);assert.equal(again.petalsPlucked,21);
  const freshReturn=restoreHorizonApproach({...state,decided:'accepted'},{occupant:'daisy',defeats:1});
  assert.equal(freshReturn.returning,true);assert.equal(freshReturn.arrived,false);assert.equal(freshReturn.decided,null);
});
test('scene uses the ordinary overlay and nearby inspection without bypassing pause',async()=>{
  let rendered=0,painted=0,inspected=0;const scene=createHorizonApproachScene({occupant:'sarah',condition:false,renderer:{initialize:()=>true,render:()=>{rendered++;}},onInspect:s=>{assert.equal(s.occupant,'sarah');inspected++;return true;},paintOverlay:()=>painted++});
  await scene.initialize();scene.placeAt(2.5);scene.update(.05);
  assert.equal(scene.interact(),true);assert.equal(inspected,1);scene.render();assert.equal(rendered,1);assert.equal(painted,1);
  scene.pause();assert.equal(scene.interact(),false);assert.equal(inspected,1);
  scene.resume();assert.equal(scene.interact(),true);assert.equal(inspected,2);
});
test('new Horizon modules respect the copy rule',()=>{
  for(const file of ['src/game/horizon-approach-record.js','src/data/horizon-approach-dialogue.js']){
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/ho\x6cd|he\x6cd/i);
  }
});
