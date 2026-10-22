import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { ST_BRENDANS_PRESENCES as stations, ST_BRENDANS_PRESENCE_BUDGET as budget } from '../src/data/st-brendans-presences.js';
import { stBrendansPresenceWorldPlacements, stBrendansPresenceLightState, stBrendansPresenceRenderInstances } from '../src/game/st-brendans-presences.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const placed=stBrendansPresenceWorldPlacements(FP);
const options={group:'cathedral',zone:ZONE.church};

test('the actual church is populated on all three levels, with no unplaced phantom stations',()=>{
  assert.equal(stations.length,budget.figures);assert.equal(placed.length,stations.length);
  assert.equal(new Set(placed.map(p=>p.id)).size,stations.length);
  assert.deepEqual(['ground','loft','belfry'].map(level=>placed.filter(p=>p.level===level).length),[34,10,6]);
  for(const p of placed){
    assert.equal(p.zone,ZONE.church);assert.equal(p.blocks,false);assert.equal(p.interactive,false);assert.equal(p.noShadow,true);
    const source=stations.find(q=>q.id===p.id);
    assert.ok(Math.abs(p.x-source.x)<.001&&Math.abs(p.z-source.z)<.001,`${p.id} exact physical church metres`);
    assert.ok(Math.abs(p.y-({ground:0,loft:4.6,belfry:10.2}[p.level]))<1e-5,'feet use the compiled Float32 floor');
  }
  assert.deepEqual(stBrendansPresenceWorldPlacements({isLoaded:()=>false}),[]);
});

test('the crowd belongs to the building and remains visible across its open levels',()=>{
  const first=stBrendansPresenceRenderInstances(placed,{...options,listener:{x:16,y:11.82,z:72}});
  const turned=stBrendansPresenceRenderInstances(placed,{...options,listener:{x:16,y:11.82,z:72},yaw:Math.PI,timeSec:86400});
  assert.equal(first.length,50);assert.deepEqual(first,turned);
  assert.equal(stBrendansPresenceRenderInstances(placed,{group:'ground',zone:ZONE.church,listener:{x:16,y:1.62,z:64}}).length,50);
  assert.deepEqual(stBrendansPresenceRenderInstances(placed,{group:'ground',zone:ZONE.dock}),[]);
  assert.deepEqual(stBrendansPresenceRenderInstances(placed,{group:'upper',zone:ZONE.chapel}),[]);
});

test('actual 3D light reach preserves lit, residual and barely perceptible family states',()=>{
  const p=placed[0];
  assert.equal(stBrendansPresenceLightState(p),'unlit');
  assert.equal(stBrendansPresenceLightState(p,{torchOn:true}),'emergency-off');
  const light={x:p.x,y:p.y+1,z:p.z,radius:4,intensity:.8,kind:'fitting'};
  assert.equal(stBrendansPresenceLightState(p,{lights:[light]}),'emergency-on');
  assert.equal(stBrendansPresenceLightState(p,{lights:[{...light,y:14}]}),'unlit','the tower lamp does not reveal ground bodies through a floor');
  const modes=[{variant:12},{torchOn:true,variant:11},{lights:[light],variant:10}];
  for(const mode of modes){
    const instance=stBrendansPresenceRenderInstances([p],{...options,...mode})[0];
    assert.equal(instance.apparitionVariant,mode.variant);
    for(const key of ['mesh','x','y','z','yaw','scale'])assert.equal(instance[key],p[key]);
  }
});

test('recording/playback actor guards, effects-off and established ending compositions are protected',()=>{
  for(const guard of [{suppressActors:true},{effectsMode:'off'},{ending:true}]){
    assert.deepEqual(stBrendansPresenceRenderInstances(placed,{...options,...guard}),[]);
  }
  assert.equal(stBrendansPresenceRenderInstances(placed,{...options,effectsMode:'reduced'}).length,50);
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const integration=main.slice(main.indexOf("if(storyMode&&planName==='conservatory'&&!usingSpecialSpace()&&FP.zoneAt(logicalX,logicalY)===ZONE.church)"),main.indexOf('doorDynamicCombined.length=count;'));
  assert.match(integration,/suppressActors:suppressActors\|\|REC\.isRecording\(\)\|\|PB\.isPlaying\(\)/);
  assert.match(integration,/ending:!!activeEndingCutscene/);
});

test('no apparition consumes an encounter, saves state, makes noise or changes passage collision',()=>{
  const module=fs.readFileSync(new URL('../src/game/st-brendans-presences.js',import.meta.url),'utf8');
  for(const name of ['saveCommit','flagSet','scareBudget','playSound','dialogue','Math.random','viewYaw'])assert.equal(module.includes(name),false,name);
  FP.setAllDoorsOpen(true);
  // The existing font occupies 59.2m; preserve the established clear nave
  // spine from60m onward, rather than asserting the font was walkable.
  for(let y=185;y<200;y++){
    const a=FP.toRuntimePoint({x:128,y},{center:false});
    assert.equal(PROPS.propCanOccupy(a.x,a.y),true,`west nave carry spine ${y}`);
  }
  FP.setAllDoorsOpen(false);
  assert.equal(budget.additionalLights,0);assert.equal(budget.additionalShadowMaps,0);
});
