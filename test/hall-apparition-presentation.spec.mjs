import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {hallApparitionLayout,hallApparitionPose,paintHallApparitions} from '../src/render/hall-apparitions.js';
import {createHallApparitions,hallApparitionView} from '../src/game/hall-apparitions.js';

const roster=()=>hallApparitionView(createHallApparitions());

function canvas(){
  const paths=[],calls=[];let path=[];
  const ctx={save:()=>calls.push('save'),restore:()=>calls.push('restore'),
    beginPath:()=>{path=[];paths.push(path);},moveTo:(...p)=>path.push(p),lineTo:(...p)=>path.push(p),
    bezierCurveTo:(...p)=>{calls.push('curve');path.push(p);},
    closePath(){},fill:()=>calls.push('fill'),stroke:()=>calls.push('stroke'),
    rect:(...p)=>calls.push(['clipRect',...p]),clip:()=>calls.push('clip'),ellipse:()=>calls.push('ellipse'),
    translate:(...p)=>calls.push(['translate',...p]),scale:(...p)=>calls.push(['scale',...p])};
  return{ctx,paths,calls};
}

test('the three seats retain stable disjoint places even after a listener is released',()=>{
  for(const w of [18,26,40,70]){
    const view=roster(),before=hallApparitionLayout(view.members,{x:3,w});
    view.members[1].defeated=true;
    const after=hallApparitionLayout(view.members,{x:3,w});
    assert.equal(before.length,3);
    for(let i=0;i<3;i++){
      assert.equal(after[i].id,before[i].id);assert.equal(after[i].x,before[i].x);
      assert.ok(after[i].x>=3&&after[i].x+after[i].w<=3+w+.0001);
      if(i)assert.ok(after[i].x>after[i-1].x+after[i-1].w);
    }
    assert.ok(before[0].heightScale<before[1].heightScale);
    assert.ok(before[2].depth>before[1].depth);
  }
});

test('seated bodies have a human head, neck, torso and bent legs instead of a glyph grid',()=>{
  for(const member of hallApparitionLayout(roster().members)){
    const pose=hallApparitionPose(member,{now:3});
    assert.ok(pose.head.y<pose.neck.y&&pose.neck.y<pose.hip.y);
    assert.ok(pose.hip.y<pose.kneeLeft.y&&pose.kneeLeft.y<pose.ankleLeft.y);
    assert.ok(pose.hip.y<pose.kneeRight.y&&pose.kneeRight.y<pose.ankleRight.y);
    assert.ok(pose.shoulderLeft.x<pose.shoulderRight.x);
    for(const joint of Object.values(pose).filter(value=>value&&typeof value==='object')){
      assert.ok(Number.isFinite(joint.x)&&Number.isFinite(joint.y));
      assert.ok(joint.x>=-.7&&joint.x<=.7&&joint.y>=0&&joint.y<=1);
    }
  }
  const view=readFileSync(new URL('../src/render/combat-view.js',import.meta.url),'utf8');
  assert.doesNotMatch(view,/HALL_APPARITION_SPRITES/);
  assert.match(view,/hallApparitionLayout, drawHallApparitions.*hall-apparitions/);
});

test('attention, guarding and the cue visibly change the existing bodies without inventing actors',()=>{
  const members=hallApparitionLayout(roster().members);
  const witness=hallApparitionPose(members[0],{watch:-1,reducedMotion:true});
  const watched=hallApparitionPose(members[0],{watch:1,reducedMotion:true});
  assert.notEqual(witness.headTurn,watched.headTurn);
  const cue=hallApparitionPose(members[2],{reducedMotion:true});
  const acting=hallApparitionPose({...members[2],acting:true},{reducedMotion:true});
  assert.ok(acting.wristRight.y<cue.wristRight.y);
  assert.ok(acting.wristRight.x>cue.wristRight.x);
  const guard=hallApparitionPose({...members[1],parryReady:true},{reducedMotion:true});
  assert.ok(guard.wristLeft.y<hallApparitionPose(members[1],{reducedMotion:true}).wristLeft.y);
  assert.equal(members.length,3);
});

test('reduced motion freezes anatomy and release leaves the original chair vacant',()=>{
  const member=hallApparitionLayout(roster().members)[0];
  assert.deepEqual(hallApparitionPose(member,{now:0,reducedMotion:true}),
    hallApparitionPose(member,{now:99,reducedMotion:true}));
  assert.notDeepEqual(hallApparitionPose(member,{now:0}),hallApparitionPose(member,{now:99}));
  const empty=hallApparitionPose({...member,defeated:true},{now:99});
  assert.equal(empty.alive,false);assert.equal(empty.motion,0);
  const view=roster(),active=canvas(),released=canvas();
  paintHallApparitions(active.ctx,view,{w:600,h:180});
  view.members[0].defeated=true;paintHallApparitions(released.ctx,view,{w:600,h:180});
  assert.ok(active.calls.filter(x=>x==='curve').length>released.calls.filter(x=>x==='curve').length);
  assert.equal(released.calls.filter(x=>Array.isArray(x)&&x[0]==='translate').length,3);
});

test('production paint is bounded to its stage and cannot mutate the combat roster',()=>{
  const view=roster(),before=JSON.stringify(view),{ctx,calls}=canvas();
  paintHallApparitions(ctx,view,{x:12,y:8,w:420,h:180,now:4});
  assert.equal(JSON.stringify(view),before);
  assert.deepEqual(calls.find(value=>Array.isArray(value)&&value[0]==='clipRect'),['clipRect',12,8,420,180]);
  assert.ok(calls.includes('clip'));assert.equal(calls.at(-1),'restore');
  const source=readFileSync(new URL('../src/render/hall-apparitions.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/addEventListener|Math\.random|setInterval|requestAnimationFrame|createCombat|saveCommit/);
});

test('the production Hall scene keeps figures and attack notes inside its compact stage',()=>{
  const source=readFileSync(new URL('../src/game/combat.js',import.meta.url),'utf8');
  const start=source.indexOf('      const stageY = layout.stage.y;');
  const end=source.indexOf('      } else if (art?.procedural) {',start);
  assert.ok(start>=0&&end>start);
  const renderStage=source.slice(start,end)+'\n}';
  for(const h of [.65,1.5,2.2,4.8,18]){
    const stage={x:4,y:5,w:56,h};
    const state={apparitions:{},turn:1};
    let figures,notes,noteClip,activeClip;
    runInNewContext(renderStage,{
      layout:{stage},panel:stage,uiCellMetrics:()=>({cellW:8.45,cellH:20}),
      sourceDesktop:null,desktopIsland:false,cathedral:false,fireballRect:null,
      shakeMode:()=> 'reduced',encounterIntro:false,introElapsed:1.05,ease:t=>t,
      impactFx:null,phase:'resolve',state,drawEnemyVoidStage(){},battle:{combat:{id:'hall'}},
      visual:{progress:.5},flashMode:()=> 'reduced',environmentLighting:null,
      resolution:{side:'enemy',intent:{actorLabel:'APPARITION 02'},action:{kind:'overload'}},
      uiText(){},uiWithClip:(rect,draw)=>{activeClip=rect;draw();activeClip=null;},
      drawAttackNotes:box=>{notes=box;noteClip=activeClip;},now:3,
      snap:state,combatApparitions:()=>roster(),drawHallApparitions:(_,box)=>{figures=box;},
      transitioned:false,
    });
    assert.equal(noteClip,stage);
    for(const box of [figures,notes]){
      assert.ok(box.h>0&&box.y>=stage.y);
      assert.ok(box.y+box.h<=stage.y+stage.h+1e-7,`paint crosses below a ${h}-row stage`);
    }
  }
});
