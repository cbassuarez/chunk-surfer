import assert from 'node:assert/strict';
import {makeVanWorkbenchScene} from '../../src/game/van-workbench.js';
import {freshFieldKit} from '../../src/game/field-kit.js';
import {workbenchCatalog} from '../../src/data/workbench-catalog.js';
import {witnessEditionStatus} from '../../src/progression/unlocks.js';
export const size={cols:150,rows:38};
export function fixture(overrides={},hooks={}){
  let state={bagTaken:true,mapTaken:true,difficultyConfirmed:true,difficultyLabel:'CONTRACT',packedGroups:['headphones','microphone','recorder','flashlight'],fieldKit:freshFieldKit(),cosmeticMeta:{endingsSeen:[]},...overrides};
  state.witness=witnessEditionStatus(state.cosmeticMeta);
  const calls=[],life={};
  const targets=()=>Object.fromEntries(workbenchCatalog(state).map((item,i)=>[item.key,{x:3+(i%9)*15,y:3+Math.floor(i/9)*6,w:9,h:3,...item,kind:item.kind,modelId:item.modelId}]).concat([['difficulty',{x:3,y:23,w:9,h:3,kind:'difficulty',label:'SHIFT ORDER'}]]));
  const stage={targets,draw(){},snapshot(){return{rendererCount:0};},resume(){life.resume=(life.resume||0)+1;},suspend(){life.suspend=(life.suspend||0)+1;},dispose(){life.dispose=(life.dispose||0)+1;}};
  const invoke=(kind,args,commit)=>{calls.push({kind,args});commit?.();const value=hooks[kind]?.(...args);if(value===false||value?.ok===false)state.saveError=true;return value??{ok:true};};
  const scene=makeVanWorkbenchScene({getState:()=>state,stageFactory:()=>stage,
    onKitChange:(kit,detail)=>invoke('kit',[kit,detail],()=>{state={...state,fieldKit:kit};}),
    onSpannerChoice:take=>invoke('spanner',[take],()=>{state.spannerTaken=take;}),
    onContinue:()=>invoke('continue',[]),onChooseDifficulty:()=>invoke('shift',[]),onReadNotes:()=>invoke('notes',[]),
    onInspect:id=>invoke('inspect',[id]),onInspectWitness:context=>invoke('witness',[context]),
    onRetrySave:()=>invoke('retry',[],()=>{state.saveError=false;}),onClose:()=>invoke('close',[]),
  });scene.enter();scene.render(size);
  const point=(id,type='pointerdown')=>{const hit=scene.debugState().hitRegions.find(r=>r.id===id);assert.ok(hit,`target ${id}`);scene.pointer({type,pointerId:7,button:0,cellX:hit.x+hit.w/2,cellY:hit.y+hit.h/2});scene.render(size);};
  return{scene,calls,point,life,state:()=>state,set:patch=>{state={...state,...patch};},count:kind=>calls.filter(c=>c.kind===kind).length};
}
