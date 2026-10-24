import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL} from '../src/data/floorplan/legend.js';
import {createAcademicFloorReturns,academicFloorReturnRegion,academicFloorActorPresent,academicFloorProtectedActorIds} from '../src/game/academic-floor-returns.js';
import {createAcademicSociety} from '../src/game/academic-society.js';
import {createAcademicFloorPopulation} from '../src/game/academic-floor-population.js';
import {createAcademicBouncers} from '../src/game/academic-bouncers.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_FLOOR_POPULATION,ACADEMIC_FLOOR_POPULATION_BEATS} from '../src/data/academic-floor-population.js';
import {ACADEMIC_BOUNCER_ACTORS} from '../src/data/academic-bouncers.js';
import {ACADEMIC_ADVERSARY_SOCIAL_REPLIES} from '../src/data/academic-adversaries.js';
import {MAIN_STAIR_GEOMETRY} from '../src/data/main-stair-geometry.js';
import {academicSocietyCharacterInstances,academicFloorPopulationInstances} from '../src/render/academic-society-characters.js';
import {academicBouncerInstances} from '../src/render/academic-bouncers.js';
import {freshSave,getSave,saveCommit,withTransientGameState} from '../src/game/save.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function production(name){
  const start=main.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} exists`);
  const next=main.slice(start+1).search(/\n(?:export )?function /);
  return main.slice(start,next<0?main.length:start+1+next).trim();
}
const proxyStart=main.indexOf('  for(const person of ACADEMIC_SOCIETY_ACTORS){',main.indexOf('function syncStoryObjectProps(){'));
const proxyEnd=main.indexOf('  const rig=FP.toRuntimePoint(PLANT_RIG_CELL);',proxyStart);
assert.ok(proxyEnd>proxyStart);
const proxySource='function productionStaticProxies(){\n'+main.slice(proxyStart,proxyEnd)+'\n}';
const names=['inAcademicSociety','academicReturnProtection','academicActorPresent','academicActiveActorIds','academicLinesPresent',
  'tickAcademicFloorReturns','syncAcademicReturnProxies','academicFloorReturnsReview','academicSocietyListener',
  'academicSocietyActors','academicFloorPopulationActors','syncAcademicPopulationProxies','academicBouncerActors',
  'talkToAcademicPerson','talkToAcademicFloorGuest','academicAdversarySocialReply','saveAcademicGhostClub','dispatchAcademicGhostEvents'];
const source=names.map(production).join('\n')+'\n'+proxySource;
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});

async function adapter(run,{returns=0,admitted=true,legacy=false}={}){
  return withTransientGameState({save:{...freshSave(),academicSociety:legacy?{visits:8}:null,
    ...(legacy?{academicFloorReturns:null}:{academicFloorReturns:{visits:returns+1,returns,guardsDeparted:returns>=3,presence:'inside'}})}},async scope=>{
    PROPS.propsInit(FP);PROPS.loadPropState({});
    const c={FP,PROPS,CELL,getSave,saveCommit,ACADEMIC_SOCIETY_ACTORS,ACADEMIC_FLOOR_POPULATION,
      ACADEMIC_FLOOR_POPULATION_BEATS,ACADEMIC_BOUNCER_ACTORS,ACADEMIC_ADVERSARY_SOCIAL_REPLIES,
      academicFloorReturnRegion,academicFloorActorPresent,academicFloorProtectedActorIds,
      academicFloorReturns:createAcademicFloorReturns(getSave().academicFloorReturns),academicFloorReturnsSavedKey:'',
      academicSociety:createAcademicSociety(getSave().academicSociety),academicFloorPopulation:createAcademicFloorPopulation(),
      academicBouncers:createAcademicBouncers({admitted}),academicCrowdDread:{view:()=>({attention:0})},
      academicSocietyDialogueScene:null,academicSocietyDialogueLine:null,academicBouncerScene:null,academicBouncerSocialScene:null,
      academicBouncerDialogueLine:null,academicGhostDispatch:null,academicPopulationDispatch:null,academicBouncerSocialDispatch:null,
      academicAdversaryReactionDispatch:null,academicSocietyPresentation:{view:()=>({timeSec:0})},
      storyMode:true,inRogue:true,planName:'conservatory',px:50,py:496.2,paused:false,
      usingPlan:()=>true,usingSpecialSpace:()=>c.special,gameplayInputLifecycleActive:()=>c.focused,
      focused:true,special:false,document:{hidden:false},scenes:{blocksInput:()=>c.blocked,blocksWorld:()=>c.blocked},blocked:false,
      SPEECH:{speaking:()=>null,isSpeaking:()=>false,isVoicing:()=>false,sayAll:()=>({cancel(){}})},shakeMode:()=>'full',mapHeading:()=>0,
      R3:{r3dFacing:()=>0,r3dLookAngles:()=>({pitch:0})},doorDynamicCombined:[],syncs:0,syncDoorDynamicProps:()=>c.syncs++,
    };
    vm.createContext(c);vm.runInContext(source,c);
    const h={c,scope,
      enter(){const activeActorIds=c.academicActiveActorIds();c.academicSociety.tick(0,{onAcademicFloor:true,suspended:true,activeActorIds});c.academicFloorPopulation.tick(0,{onAcademicFloor:true,suspended:true,activeActorIds});c.productionStaticProxies();},
      render(){const out=[...academicSocietyCharacterInstances(c.academicSocietyActors()),
        ...academicFloorPopulationInstances(c.academicFloorPopulationActors()),...academicBouncerInstances(c.academicBouncerActors())];
        c.doorDynamicCombined=out;return out;},
      stage(n){c.academicFloorReturns.load({visits:n+1,returns:n,guardsDeparted:n>=3,presence:'inside'});this.enter();},
    };
    h.enter();return run(h);
  });
}

test('production render submissions, interaction proxies and direct E routes agree at every saved stage',async()=>adapter(h=>{
  const all=[...ACADEMIC_SOCIETY_ACTORS,...ACADEMIC_FLOOR_POPULATION,...ACADEMIC_BOUNCER_ACTORS];
  for(const[stage,count]of[[0,35],[1,26],[2,14],[3,1]]){
    h.stage(stage);const bodies=h.render().filter(body=>body.academicSocietyActor||body.academicPopulationActor||body.academicBouncerActor);
    assert.equal(bodies.length,count);assert.equal(new Set(bodies.map(body=>body.academicSocietyActor||body.academicPopulationActor||body.academicBouncerActor)).size,count);
    for(const actor of all){
      const present=h.c.academicActorPresent(actor.id),proxyId=actor.id.startsWith('academic-')?actor.id:`academic-person-${actor.id}`;
      if(actor.interactive||actor.name&&!actor.id.startsWith('academic-bouncer'))assert.equal(!!PROPS.propById(proxyId)?.interactive,present,`${stage}: ${proxyId}`);
      if(!present){assert.equal(h.c.talkToAcademicPerson(actor.id),false);assert.equal(h.c.talkToAcademicFloorGuest(actor.id),false);}
    }
    const review=h.c.academicFloorReturnsReview();assert.equal(review.namespace,'academic-floor-returns');assert.equal(review.presentActorIds.length,count);
    assert.equal(review.renderedActorIds.length,count);assert.equal(review.gameplayHudAdded,false);
  }
}));

test('the normal save boundary persists run-local return state and new saves start full',async()=>adapter(h=>{
  h.c.academicFloorReturns.load({visits:4,returns:3,presence:'outside',departureObserved:true,awaySeconds:3});
  h.c.saveAcademicGhostClub();assert.equal(getSave().academicFloorReturns.returns,3);
  const loaded=createAcademicFloorReturns(getSave().academicFloorReturns);loaded.tick(.1,{active:true,inside:true});
  assert.equal(loaded.save().returns,3);assert.equal(loaded.save().visits,5);
  assert.equal(freshSave().academicFloorReturns.returns,0);
}));

test('older society histories migrate as prior familiarity without instant desertion',async()=>adapter(h=>{
  assert.equal(getSave().academicFloorReturns.visits,1);assert.equal(getSave().academicFloorReturns.returns,0);
  assert.equal(h.c.academicActiveActorIds().size,35);
},{legacy:true}));

test('actual physical floor and focus, pause, modal and world ownership gate the host clock',async()=>adapter(h=>{
  // A real compiled first-floor practice room is away; an explicit fixture
  // resets its position baseline first, so the test does not pretend this warp
  // was a walked departure.
  h.c.px=53*2;h.c.py=54.2*2;
  const p=FP.logicalToPhysical(h.c.px,h.c.py);assert.equal(p.renderGroup,'upper');assert.ok(Math.abs(p.y-4.8)<1e-6);
  h.c.academicFloorReturns.load({visits:1,returns:0,presence:'inside'});
  for(const flag of['paused','blocked','special']){
    h.c[flag]=true;for(let n=0;n<100;n++)h.c.tickAcademicFloorReturns(.1);h.c[flag]=false;
    assert.equal(h.c.academicFloorReturns.save().returnArmed,false,flag);
  }
  h.c.focused=false;for(let n=0;n<100;n++)h.c.tickAcademicFloorReturns(.1);h.c.focused=true;
  for(let n=0;n<30;n++)h.c.tickAcademicFloorReturns(.1);
  assert.equal(h.c.academicFloorReturns.save().returnArmed,true);
  assert.equal(getSave().academicFloorReturns.returnArmed,true);
  assert.equal(getSave().px,h.c.px);assert.equal(getSave().py,h.c.py,'absence receipt saves its current body atomically');
  const reloaded=createAcademicFloorReturns(getSave().academicFloorReturns),savedBody=FP.logicalToPhysical(getSave().px,getSave().py);
  reloaded.tick(.1,{active:true,...academicFloorReturnRegion(savedBody),position:{x:savedBody.x*CELL,y:savedBody.y,z:savedBody.z*CELL}});
  assert.equal(reloaded.save().returns,0,'immediate reload resumes outside without manufacturing a return');
  assert.ok(h.scope.writes.filter(write=>write.patch?.academicFloorReturns).length<=5,'only boundary and whole active seconds are saved');
  // A developer jump back is rejected by the body-discontinuity guard.
  h.c.px=50;h.c.py=496.2;h.c.tickAcademicFloorReturns(.1);
  assert.equal(h.c.academicFloorReturns.save().returns,0);
}));

test('retired residents cannot issue aftermath speech while unresolved admission remains reachable',async()=>adapter(h=>{
  h.stage(3);
  for(const kind of['warning','clean','struck'])assert.equal(h.c.academicAdversarySocialReply(kind),false);
  assert.equal(h.c.academicActorPresent('academic-held'),true);
  h.c.academicBouncers.load({admitted:false});
  assert.ok(h.c.academicBouncerActors().every(actor=>actor.visible!==false));
  assert.equal(h.c.academicActiveActorIds().size,3,'only two admission attendants and dangerous late guest remain');
  h.c.academicBouncers.load({admitted:true});assert.ok(h.c.academicBouncerActors().every(actor=>actor.visible===false));
}));

test('the actual lower academic flight releases a voice loan before the next crowd departure',async()=>adapter(h=>{
  h.stage(2);const tree=h.c.academicSociety.beginDialogue('emile');
  h.c.academicSociety.endDialogue('emile',{completed:true,choices:[tree.nodes.need.choices.find(choice=>choice.societyAction==='lend')]});
  assert.equal(h.c.academicSociety.save().consent,'lent');const visits=h.c.academicSociety.save().visits;
  const flight=MAIN_STAIR_GEOMETRY.flights.find(flight=>flight.id==='half-to-academic');
  let at=null;
  for(let y=flight.logicalFrom.y+.2;y<flight.logicalTo.y-.2;y+=.1){
    const candidate=FP.toRuntimePoint({x:flight.logicalFrom.x+.8,y}),physical=FP.logicalToPhysical(candidate.x,candidate.y);
    if(physical.renderGroup==='academic'&&physical.y<9.1&&physical.y>7.4&&!FP.isSolid(candidate.x,candidate.y)){at={...candidate,physical};break;}
  }
  assert.ok(at,'the real last flight has a below-floor academic render slice');
  h.c.px=at.x;h.c.py=at.y;h.c.tickAcademicFloorReturns(.1);
  assert.equal(h.c.academicSociety.save().consent,'left');assert.equal(h.c.academicSociety.save().visits,visits);
  assert.equal(getSave().academicSociety.consent,'left');
  for(let n=0;n<30;n++)h.c.tickAcademicFloorReturns(.1);
  assert.equal(h.c.academicFloorReturns.save().populationStage,3);
  assert.deepEqual([...h.c.academicActiveActorIds()],['academic-hollow-late-guest']);
}));
