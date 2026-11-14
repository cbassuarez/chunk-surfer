import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lastMinutesArcTarget,stepLastMinutesArc,lastMinutesFrame,lastMinutesPerception,lastMinutesFrontLoss,LAST_MINUTES_IDENTITY} from '../src/game/last-minutes.js';
import {freshHypoxia,stepHypoxia,hypoxiaFrame,hypoxiaPerception} from '../src/game/hypoxia.js';
import {MEMORY_FIELD_VISIT as V,memoryFieldForTake} from '../src/data/memory-field.js';
import {freshMemoryField,stepMemoryField,tryMemoryField,memoryFieldTimes} from '../src/game/memory-field-scene.js';
import {createInterruptionDirector,freshDeadDoor,pressDeadDoor,SEEP_PASTORAL,TAKEOVER_MEDIA,TAKEOVER_CLINICAL,TAKEOVER_COMFORT,INTERRUPTION} from '../src/game/interruption-director.js';
import {ELLERY_FLORA_PROPS,ELLERY_FLORA_PLANTS,ROAD_FLORA,ROAD_FLORA_PLANTS} from '../src/data/ellery-flora.js';
import {neuralFrame,neuralSeconds,NEURAL_TRANSITION,NEURAL_KINDS} from '../src/game/neural-transition.js';
import {meaningLineFor,meaningFamilyFor,meaningRung,MEANING_SIGNS,MEANING_PROPS} from '../src/data/meaning-lines.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';

const run=(state,visit,seconds,options={})=>{for(let t=0;t<seconds&&!state.left;t+=.1)state=stepMemoryField(state,visit,{dt:.1,...options}).state;return state;};

test('the arc only ever goes one way',()=>{
  assert.equal(lastMinutesArcTarget(),0);
  assert.equal(stepLastMinutesArc(.4,lastMinutesArcTarget({takes:1})),.4,'an un-counted take gives nothing back');
  assert.ok(lastMinutesArcTarget({sourceExited:true})>lastMinutesArcTarget({inSource:true}));
});
test('faculties and meaning are different curves, and no single level exists',()=>{
  const f=lastMinutesFrame({arc:.5});
  assert.equal(f.level,undefined);
  assert.equal(new Set([f.exposureFloor,f.deinhibition,f.meaning].map(v=>v.toFixed(4))).size,3);
  assert.ok(f.meaning>f.exposureFloor,'meaning runs ahead of what he loses');
});
test('fresh air stops getting him all the way back, and the default changes nothing',()=>{
  const air=stepHypoxia(freshHypoxia(1),1,{fresh:true,floor:.3});
  assert.equal(air.exposure,.3);
  assert.equal(stepHypoxia(freshHypoxia(1),1,{fresh:true}).exposure,0);
});
test('reduced dread opts out, and the look never goes all the way',()=>{
  const frame=lastMinutesFrame({arc:1}),base=hypoxiaPerception(hypoxiaFrame({exposure:.95,signature:{leads:'clarity'}}));
  assert.equal(lastMinutesPerception(base,frame,{reducedDread:true}),LAST_MINUTES_IDENTITY);
  const look=lastMinutesPerception(base,{...frame,surge:0},{regionLoss:1});
  assert.ok(look.chroma>=.3&&look.contrast>=.74);
});
test('a place gone wrong stays wrong',()=>{
  let last=0;for(let a=0;a<=1;a+=.05){const loss=lastMinutesFrontLoss(a,{x:60,y:0,z:0},[0,0]);assert.ok(loss>=last);last=loss;}
  assert.equal(last,1);
});
test('the take owes the visit, and the crash owes nothing to the third',()=>{
  assert.deepEqual([1,2,3,4,5].map(n=>memoryFieldForTake(n)),['first','second',null,'fourth',null]);
  assert.equal(memoryFieldForTake(3,{reduceDread:true}),'third');
});
test('the door does nothing while he keeps trying, and gives when he stops',()=>{
  const visit=V.third,times=memoryFieldTimes(visit);
  let state={...freshMemoryField(visit),x:visit.door.x,z:visit.door.z+1,yaw:0};
  for(let t=0;t<times.min+5;t+=1){state=run(state,visit,1);state=tryMemoryField(state,visit).state;}
  assert.equal(state.released,null,'trying holds it');
  assert.ok(state.tries>10);
  state=run(state,visit,times.quiet+.5);
  assert.notEqual(state.released,null,'stopping lets it go');
});
test('trying cannot hold it past the hard limit, and nobody can be left there',()=>{
  const visit=V.fourth;
  let state={...freshMemoryField(visit),x:visit.door.x,z:visit.door.z+1,yaw:0};
  for(let t=0;t<visit.maxSeconds+1;t+=1){state=run(state,visit,1);state=tryMemoryField(state,visit).state;}
  assert.notEqual(state.released,null);
  state=run(state,visit,20);
  assert.equal(state.left,true);
});
test('every visit ends by itself, and reduced dread is shorter',()=>{
  for(const visit of Object.values(V)){
    // A visit that opens on the ant runs the ant first (memory-field-ant.spec), then its own minutes.
    assert.equal(run(freshMemoryField(visit),visit,visit.maxSeconds+(visit.ant?.maxSeconds||0)+20).left,true,visit.id);
    assert.ok(memoryFieldTimes(visit,{reducedDread:true}).decayTo<=visit.decayTo);
  }
  assert.ok(memoryFieldTimes(V.third,{reducedDread:true}).max<V.third.maxSeconds);
});
test('a dead door lets go on a pause, on enough presses, or in time',()=>{
  const door=freshDeadDoor('a',0);
  assert.equal(pressDeadDoor(door,.3).gave,false);
  assert.equal(pressDeadDoor(door,2).gave,true);
  assert.equal(pressDeadDoor({...door,presses:4,lastPress:9.9},10).gave,true);
});
test('seeps respect what blocks them, and reduced dread never shows the carnage',()=>{
  const frame=lastMinutesFrame({arc:.9});
  assert.equal(createInterruptionDirector().seepFor('door',{at:1000,frame,blocked:true}),null);
  assert.equal(createInterruptionDirector().seepFor('nothing-he-does',{at:1000,frame}),null);
  const d=createInterruptionDirector({seed:3});let seen=0;
  for(let at=0;at<20000;at+=40){const s=d.seepFor('door',{at,frame,reducedDread:true});if(s){seen++;assert.ok(SEEP_PASTORAL.includes(s.id));}}
  assert.ok(seen>3);
});
test('owed bands begin outside the protected opening and still observe the exposure ceiling',()=>{
  const d=createInterruptionDirector({seed:11}),arcs=[];let at=0;
  for(let arc=0;arc<=1;arc+=.01){
    const frame=lastMinutesFrame({arc});
    for(let k=0;k<4;k++){at+=1200;if(d.seepFor('door',{at,frame}))arcs.push(arc);}
  }
  assert.ok(arcs[0]>=INTERRUPTION.earliest&&arcs[0]<.07,'the first band starts after the opening exclusion');
  for(let band=0;band<14;band++)assert.ok(arcs.some(a=>Math.floor(a/.07)===band),`band ${band}`);
  const first=createInterruptionDirector({seed:11});
  assert.equal(first.seepFor('door',{at:0,frame:lastMinutesFrame({arc:0})}),null,'an unserved band cannot bypass earliest');
  assert.ok(first.seepFor('door',{at:0,frame:lastMinutesFrame({arc:INTERRUPTION.earliest})}));
  assert.equal(first.seepFor('door',{at:5,frame:lastMinutesFrame({arc:INTERRUPTION.earliest})}),null,'and they do not come in a run');
  const rushed=createInterruptionDirector({seed:11});let count=0;
  for(let i=0;i<8;i++)if(rushed.seepFor('door',{at:i*45,frame:{arc:.02+i*.07,deinhibition:0}}))count++;
  assert.equal(count,INTERRUPTION.hourly.from,'changing bands does not bypass the hourly ceiling');
});
test('the window takes over rarely, the verbs fail lightly, and the cab comes in by degrees',()=>{
  const d=createInterruptionDirector({seed:2}),frame=lastMinutesFrame({arc:.9}),media=[];
  for(let at=0;at<40000;at+=30){const m=d.takeoverFor({at,frame});if(m)media.push(m);}
  assert.deepEqual(media,TAKEOVER_MEDIA.slice(),'each once, in order, and no more');
  assert.equal(createInterruptionDirector().takeoverFor({at:9999,frame,blocked:true}),null);
  const early=createInterruptionDirector({seed:2});let kinds=new Set();
  for(let at=0;at<30000;at+=20){const b=early.bleedFor({at,frame:lastMinutesFrame({arc:.12})});if(b)kinds.add(b.kind);}
  assert.ok(!kinds.has('knock')&&!kinds.has('water'),'the water and the hand come later');
  assert.equal(createInterruptionDirector().bleedFor({at:0,frame:lastMinutesFrame({arc:0})}),null);
});
test('verb-latched takeovers answer the verb with the body failing or the light',()=>{
  const frame=lastMinutesFrame({arc:.9});
  for(const [verb,pool] of [['take-arm',TAKEOVER_CLINICAL],['torch',TAKEOVER_COMFORT]]){
    const d=createInterruptionDirector({seed:2});const media=[];
    for(let at=0;at<40000;at+=30){const m=d.takeoverFor({at,frame,verb});if(m)media.push(m);}
    assert.ok(media.length>0,`${verb} can take over`);
    assert.ok(media.every(m=>pool.includes(m)),`${verb} only draws from its own pool`);
  }
});
test('flora: placed by hand, outside only, modest, and daisies are not the only thing growing',()=>{
  const all=[...ELLERY_FLORA_PLANTS,...ROAD_FLORA_PLANTS].flat().filter(row=>!/-flower-/.test(row.id)),daisies=all.filter(row=>/daisy/.test(row.mesh));
  assert.ok(new Set(all.map(row=>row.mesh)).size>=5,'more than one plant');
  assert.ok(daisies.length/all.length<=.3,`${daisies.length} of ${all.length} are daisies`);
  assert.ok(ELLERY_FLORA_PLANTS.length<=12&&ROAD_FLORA_PLANTS.length<=18,'not excessive');
  assert.equal(new Set([...ELLERY_FLORA_PROPS,...ROAD_FLORA].map(row=>row.id)).size,ELLERY_FLORA_PROPS.length+ROAD_FLORA.length);
  // Only the flowers are lit. A leaf never is.
  for(const row of[...ELLERY_FLORA_PROPS,...ROAD_FLORA])assert.equal(!!row.emissive,/-flower-/.test(row.id),row.id);
  // Every one is outside by Ellery: the yard's own logical island, never the building's.
  for(const row of ELLERY_FLORA_PROPS){assert.ok(row.x>=50&&row.x<=80&&row.y>=200&&row.y<=252,row.id);assert.equal(row.interactive,false);assert.equal(row.blocks,false);}
  // On the road, on the verge, inside the rail, and never across the carriageway.
  for(const row of ROAD_FLORA){assert.ok(Math.abs(row.lateral)>=3.25&&Math.abs(row.lateral)<=4.6,row.id);assert.ok(row.d<-32&&row.d>-600,row.id);}
  // Not evenly spaced, and not generated.
  const gaps=ROAD_FLORA.map(row=>row.d).sort((p,q)=>p-q).slice(1).map((d,k,list)=>d-(k?list[k-1]:ROAD_FLORA.map(r=>r.d).sort((p,q)=>p-q)[0]));
  assert.ok(new Set(gaps).size>6,'an uneven verge');
  for(const path of['../src/data/ellery-flora.js','../src/game/source-drive/road-cast.js'])assert.doesNotMatch(readFileSync(new URL(path,import.meta.url),'utf8'),/Math\.random|hash\(/,path);
});
test('no daisy has anywhere else to be',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main,/theDaisy|the-daisies/);
  for(const path of['../src/game/source-space-runtime.js','../src/data/source-door-fields.js','../src/data/conservatory-script.js'])assert.doesNotMatch(readFileSync(new URL(path,import.meta.url),'utf8'),/daisy|daisies|vegetation_dandelions|vegetation_clover/i,path);
});
test('a meaning line only lands on a prop someone read: true of the real props, and never these',()=>{
  // Every family has real props to land on, and every one of them says something first.
  const readable=CONSERVATORY_PROPS.filter(row=>row.inspect?.first);
  for(const family of Object.keys(MEANING_PROPS))assert.ok(readable.some(row=>meaningFamilyFor(row.id)===family),family);
  for(const[id,family]of[['box-office-seating-plan','paper'],['plant-header-card','paper'],['chapel-organ-pipes','instrument'],['store-rail-a','coat']])assert.equal(meaningFamilyFor(id),family,id);
  // Each of these was caught by a name once. A sign, a cabinet, a clock's hammer, a torch with no battery, Source.
  for(const id of['tower-sign-organ-exit','chapel-stair-sign-nave','chapel-stair-sign-chancel','practice-metronome-ensemble','acq-chapel-score-cabinet-west','tower-tenor-clock-hammer','acq-maintenance-searchlight-dock','flashlight-flood','lamp-0','bench','final-page','source-sheet-interactive','b2-chairs'])assert.equal(meaningFamilyFor(id),null,id);
  // The lines come after the prop's own words: a dark lantern doesn't get told it's been on all night.
  const lantern=meaningLineFor('acq-chapel-lantern-nave',.5).text;assert.doesNotMatch(lantern,/on all night/);
  assert.match(readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),/meaning=usingSpecialSpace\(\)\?null:meaningLineFor\(/,'and never in Source');
});
test('continuous world treatment stays outside Source and retired random interruptions have no main entry',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/function runFaculty\(\)\{return storyMode&&!usingSpecialSpace\(\)/);
  for(const name of ['maybeMemorySeep','swallowDeadVerb','tickCabBleed'])assert.doesNotMatch(main,new RegExp('function '+name+'\\('));
  const runtime=readFileSync(new URL('../src/game/source-space-runtime.js',import.meta.url),'utf8');
  assert.doesNotMatch(runtime,/mf_hero|the_bag_|the-daisies|memory-field/,'Source keeps its own environment rather than a random field owner');
});
test('the transition: the film fogs, it goes white, focus comes back last, and the sun stays on his eye',()=>{
  const at=(kind,t,o)=>neuralFrame(kind,t,o);
  assert.ok(at('enter',.3).leak>.3&&at('enter',.3).white===0,'the leaks come first');
  assert.ok(at('enter',.6).waveRadius>0&&at('enter',.6).white<.5,'then the front');
  assert.equal(at('enter',NEURAL_TRANSITION.enterSeconds).white,1,'then nothing but white');
  assert.equal(at('enter',NEURAL_TRANSITION.enterSeconds).peak,true);
  assert.equal(at('emerge',0).white,1,'and it picks up from exactly there');
  assert.ok(at('emerge',.8).lens>.3&&at('emerge',.8).white<.1,'the exposure comes down before the focus comes back');
  assert.ok(at('emerge',1.5).after>.3,'the after-image outlasts the rest');
  assert.equal(at('emerge',NEURAL_TRANSITION.emergeSeconds).done,true);
  assert.equal(at('nonsense',0).done,true);
});
test('reduced-flash transition parameters cap white and remove stepped shimmer',()=>{
  for(const kind of NEURAL_KINDS){
    let top=0;
    for(let t=0;t<8;t+=.01){const f=neuralFrame(kind,t,{reducedFlash:true});top=Math.max(top,f.white);assert.equal(f.shimmer,0,kind);}
    assert.ok(top<=NEURAL_TRANSITION.flashWhiteCap,`${kind} reached ${top}`);
  }
  // A whole seep, in sequence: whole-screen brightness may rise at most twice in a second.
  const samples=[];let clock=0;
  for(const[kind,seconds]of[['seep-in',neuralSeconds('seep-in')],['seep-flash',neuralSeconds('seep-flash')],['seep-out',neuralSeconds('seep-out')]])
    for(let t=0;t<seconds;t+=.01,clock+=.01)samples.push([clock,neuralFrame(kind,t).white]);
  let rises=0,above=false;
  for(const[,white]of samples){if(white>.6&&!above){rises+=1;above=true;}else if(white<.2)above=false;}
  assert.ok(rises<=2,`${rises} flashes`);
});
test('reduced motion: no flare moving',()=>{
  for(const kind of NEURAL_KINDS)for(let t=0;t<4;t+=.05)assert.equal(neuralFrame(kind,t,{reducedMotion:true}).waveRadius,0);
  assert.equal(neuralFrame('enter',NEURAL_TRANSITION.enterSeconds,{reducedMotion:true}).white,1,'the light still comes');
});
test('the screen is a strict identity when nothing is happening',()=>{
  const r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
  assert.match(r3d,/if\(leakAmount>\.001\|\|blinding>\.001\|\|uLeakWave\.z>\.001\|\|lensGoing>\.001\|\|afterSun>\.001\)/);
  assert.match(r3d,/const seen=perceptionArmed\?perception:PERCEPTION_IDENTITY;perceptionArmed=false;/,'nobody inherits failing eyes from a scene that forgot');
});
test('the rising lines land on the right thing, once',()=>{
  assert.equal(meaningLineFor('some-unrelated-thing',1),null);
  const first=meaningLineFor('pool-drain-3',1);
  assert.ok(first);
  assert.notEqual(meaningLineFor('pool-drain-3',1,key=>key===first.key)?.key,first.key);
  assert.equal(meaningLineFor('pool-drain-3',.1),null);
  assert.equal(MEANING_SIGNS.bag[meaningRung(MEANING_SIGNS.bag,0)].text,'Carrier bag.');
});
test('no line says what the thing is or isn\'t',()=>{
  const words=readFileSync(new URL('../src/data/meaning-lines.js',import.meta.url),'utf8').split('\n').filter(l=>!l.startsWith('//')).join('\n');
  assert.doesNotMatch(words,/only a bag|just a bag|it was a|spirit|ghost|you are dead|you\'re dead|drown/i);
});
test('the tape stays the witness',()=>{
  for(const path of['../src/game/playback.js','../src/game/recordist.js'])
    assert.doesNotMatch(readFileSync(new URL(path,import.meta.url),'utf8'),/last-?minutes|memory-?field|interruption-director/i);
});
