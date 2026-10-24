import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcademicInframusic} from '../src/audio/academic-inframusic.js';
import {ACADEMIC_GALLERY_PA,academicGalleryPALevel} from '../src/data/academic-gallery-pa.js';
import {academicGalleryPAInstances} from '../src/render/academic-gallery-pa.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const props=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function productionFunction(name){
  const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}\n',start)+2;
  assert.ok(start>=0&&end>start,`production ${name} exists`);
  return main.slice(start,end);
}
const adapter=['academicInframusicLevel','setAcademicInframusicLevel','tickAcademicInframusic','useAcademicGalleryPA'].map(productionFunction).join('\n');
const listenerSource=[
  "window.addEventListener('blur',()=>academicInframusic.pause('blur'));",
  "document.addEventListener('visibilitychange',()=>{if(document.hidden)academicInframusic.pause('hidden');});",
].map(line=>{assert.ok(main.includes(line),'real lifecycle listener exists');return line;}).join('\n');
const proxyStart=main.indexOf('function syncStoryObjectProps(){');
const proxyEnd=main.indexOf('  for(const person of ACADEMIC_SOCIETY_ACTORS)',proxyStart);
assert.ok(proxyStart>=0&&proxyEnd>proxyStart,'actual story-object PA staging exists');
const proxySource=main.slice(proxyStart,proxyEnd)+'\n}';
const drawStart=main.indexOf("  if(group==='academic'){\n    updateAcademicGhostAudio();\n    if(storyMode");
const drawEnd=main.indexOf('    for(const body of academicSocietyCharacterInstances(',drawStart);
assert.ok(drawStart>=0&&drawEnd>drawStart,'actual academic PA draw branch exists');
// Execute the exact production branches; unrelated actor staging is outside this fixture.
const drawSource='function drawAcademicPA(){\n'+main.slice(drawStart,drawEnd)+'\n}\n}';
const route=main.match(/    if\(hit\.action==='academic-gallery-pa'&&useAcademicGalleryPA\(\)\)return;/)?.[0];
assert.ok(route,'actual E route exists');
const routeSource='function routeAcademicPA(hit){'+route+'return false;}';

function fixture(initialFlags={}){
  const sources=[],writes=[],dialogues=[],events=[],updates=[],proxies=[],listeners={window:{},document:{}};
  const flags={...initialFlags},env={domFocused:true,nativeFocused:true,special:false,plan:true,loaded:true,
    third:true,speech:false,blocks:false,held:false,crowd:false,presence:false,fetches:0,worldYaw:.82,
    point:{x:163,y:10,z:10,renderGroup:'academic',spaceId:'academic',flightId:null}};
  const parameter=()=>({value:0,setTargetAtTime(value){this.value=value;},setValueAtTime(value){this.value=value;},cancelScheduledValues(){}});
  const node=()=>({connect(){return this;},disconnect(){this.disconnected=true;}});
  const audio={state:'running',currentTime:0,decodeAudioData:async()=>({duration:399.91}),
    createGain:()=>({...node(),gain:parameter()}),
    createBiquadFilter:()=>({...node(),frequency:parameter(),Q:parameter()}),
    createStereoPanner:()=>({...node(),pan:parameter()}),
    createBufferSource(){const n={...node(),start(_when,offset){this.offset=offset;this.started=true;},stop(){this.stopped=true;}};sources.push(n);return n;}};
  const c={storyMode:true,inRogue:true,planName:'conservatory',sourceRepriseWorldLease:null,px:58,py:487,CELL:.5,
    actx:audio,musicGain:node(),dialogGain:node(),master:node(),paused:false,activeBattleId:null,
    group:'academic',ZONE:{academic:8},timeSec:1,doorDynamicCombined:[],count:0,
    ACADEMIC_GALLERY_PA,academicGalleryPALevel,academicGalleryPAInstances,
    flagTest:key=>!!flags[key],flagApply:(set=[],clear=[])=>{for(const key of set)flags[key]=true;for(const key of clear)flags[key]=false;},
    getSave:()=>({flags}),saveCommit:patch=>writes.push(plain(patch)),pushEvent:line=>events.push(line),
    usingPlan:()=>env.plan,usingSpecialSpace:()=>env.special,mapHeading:()=>.3,R3:{r3dWorldYaw:()=>env.worldYaw},
    FP:{isLoaded:()=>env.loaded,toAuthoredCoord:n=>n*.5,toRuntimeDistance:n=>n*2,
      logicalToPhysical:(x,y)=>x===c.px&&y===c.py?{...env.point}:{x:x+100,y:10,z:y-480}},
    academicAdversaryClaimsQuiet:()=>env.held,academicCrowdDreadClaimsQuiet:()=>env.crowd,
    PRES:{isActive:()=>env.presence},SPEECH:{isSpeaking:()=>env.speech},scenes:{blocksInput:()=>env.blocks},
    pointerMode:{status:()=>({nativeBackend:{focused:env.nativeFocused}})},
    window:{addEventListener:(name,fn)=>listeners.window[name]=fn},
    document:{hidden:false,hasFocus:()=>env.domFocused,addEventListener:(name,fn)=>listeners.document[name]=fn},
    inAcademicSociety:()=>env.third,ensureCtx(){env.ensureCount=(env.ensureCount||0)+1;},
    academicGhostDispatch:{cancel(){env.cancelGhost=(env.cancelGhost||0)+1;}},
    academicPopulationDispatch:{cancel(){env.cancelPopulation=(env.cancelPopulation||0)+1;}},
    academicBouncerSocialDispatch:{cancel(){env.cancelGuard=(env.cancelGuard||0)+1;}},
    converse:(id,nodes,options)=>{const dialogue={id,nodes,options};dialogues.push(dialogue);return dialogue;},
    syncDoorDynamicProps(){env.syncs=(env.syncs||0)+1;},updateAcademicGhostAudio(){},
    syncAcademicBouncerClueProps(){},PROPS:{
      setPlacedProp:(id,p)=>proxies.push({id,...plain(p),stagedWith:'setPlacedProp'}),
      setLooseProp:(id,p)=>proxies.push({id,...plain(p),stagedWith:'setLooseProp'}),
    },
  };
  const music=createAcademicInframusic({getAudio:()=>c.actx&&c.musicGain?{ctx:c.actx,destination:c.musicGain}:null,
    fetchImpl:async()=>{env.fetches++;return{ok:true,arrayBuffer:async()=>new ArrayBuffer(4)};}});
  c.academicInframusic={...music,update(input){updates.push(plain(input));return music.update(input);}};
  vm.createContext(c);vm.runInContext(adapter+'\n'+listenerSource+'\n'+proxySource+'\n'+drawSource+'\n'+routeSource,c);
  return{c,env,music,audio,sources,writes,flags,dialogues,events,updates,proxies,listeners};
}

test('actual main uses physical height and only the real main-stair flight for the rising approach',async()=>{
  const h=fixture();await h.music.preload();
  const cases=[
    {point:{renderGroup:'upper',y:4.8,spaceId:'main_stair',flightId:'second'},audible:false},
    {point:{renderGroup:'upper',y:5.2,spaceId:'main_stair',flightId:'third'},audible:true},
    {point:{renderGroup:'upper',y:8.8,spaceId:'main_stair',flightId:'third'},audible:true},
    {point:{renderGroup:'academic',y:10,spaceId:'academic',flightId:null},audible:true},
    {point:{renderGroup:'academic',y:4.8,spaceId:'academic',flightId:null},audible:false},
    {point:{renderGroup:'upper',y:8.8,spaceId:'tower_stair',flightId:'tower'},audible:false},
    {point:{renderGroup:'upper',y:8.8,spaceId:'main_stair',flightId:null},audible:false},
    {point:{renderGroup:'academicRoof',y:17,spaceId:'academicRoof',flightId:null},audible:false},
  ];
  const gains=[];
  for(const row of cases){h.env.point={x:163,z:10,...row.point};h.c.tickAcademicInframusic();
    assert.equal(h.music.state().active,row.audible,JSON.stringify(row.point));
    assert.equal(h.updates.at(-1).listener.floor,row.point.y);gains.push(h.music.state().gain);}
  assert.ok(gains[2]>gains[1]&&gains[3]>gains[2],'the same loop rises along actual stair height');
});

test('actual eligibility refuses Source leases, non-story/title states and unavailable plans without preloading',async()=>{
  for(const change of[h=>h.c.storyMode=false,h=>h.c.inRogue=false,h=>h.c.planName='source',
    h=>h.c.sourceRepriseWorldLease={},h=>h.env.special=true,h=>h.env.plan=false]){
    const h=fixture();change(h);h.c.tickAcademicInframusic();await Promise.resolve();
    assert.equal(h.env.fetches,0);assert.equal(h.updates.at(-1).eligible,false);assert.equal(h.sources.length,0);
  }
  const h=fixture();h.env.loaded=false;h.c.tickAcademicInframusic();assert.equal(h.music.state().active,false);
  assert.equal(h.updates.at(-1).listener.floor,undefined,'missing physical plan cannot manufacture a third-floor height');
});

test('actual physical source panning follows world yaw on curved stairs independently of the local map heading',async()=>{
  const h=fixture();await h.music.preload();
  h.env.point={x:160,y:8.8,z:12,renderGroup:'upper',spaceId:'main_stair',flightId:'third'};
  const pans=[];
  for(const yaw of[0,Math.PI/2]){
    h.env.worldYaw=yaw;h.c.tickAcademicInframusic();
    assert.equal(h.updates.at(-1).listener.yaw,yaw);assert.equal(h.c.mapHeading(),.3);
    assert.equal(h.updates.at(-1).listener.x,80);assert.equal(h.updates.at(-1).listener.z,6);
    pans.push(h.music.state().pan);
  }
  assert.ok(pans[0]>0&&pans[1]<0,'turning in physical space moves the fixed PA across the listener');
  delete h.c.R3.r3dWorldYaw;h.c.tickAcademicInframusic();
  assert.equal(h.updates.at(-1).listener.yaw,.3,'optional world-yaw API has the authored heading fallback');
});

test('actual room coordinates muffle teaching banks while ordinary corridor and gallery retain the track',async()=>{
  const h=fixture();await h.music.preload();const results=[];
  for(const [px,py]of[[58,487],[12,510],[40,510],[18,510]]){
    h.c.px=px;h.c.py=py;h.c.tickAcademicInframusic();results.push({muffle:h.updates.at(-1).roomMuffle,gain:h.music.state().gain});
  }
  assert.deepEqual(results.map(x=>x.muffle),[0,1,1,0]);assert.ok(results[1].gain<results[0].gain);
});

test('actual adapter ducks speech, both threats, battle and presence without granting flags',async()=>{
  const h=fixture();await h.music.preload();h.c.tickAcademicInframusic();const full=h.music.state().gain;
  h.env.speech=true;h.c.tickAcademicInframusic();const speech=h.music.state().gain;assert.ok(speech<full);
  h.env.speech=false;h.env.blocks=true;h.c.tickAcademicInframusic();assert.equal(h.music.state().gain,speech);
  h.env.blocks=false;
  for(const cause of['held','crowd','presence','battle']){
    if(cause==='battle')h.c.activeBattleId='external';else h.env[cause]=true;
    h.c.tickAcademicInframusic();assert.ok(h.music.state().gain<speech,cause);assert.equal(h.updates.at(-1).danger,true);
    if(cause==='battle')h.c.activeBattleId=null;else h.env[cause]=false;
  }
  assert.equal(h.writes.length,0);assert.deepEqual(h.flags,{});
});

test('actual tick stops for pause, DOM blur, native blur and hidden state, preserving offset on return',async()=>{
  for(const cause of['paused','dom','native','hidden']){
    const h=fixture();await h.music.preload();h.c.tickAcademicInframusic();h.audio.currentTime=6.25;
    if(cause==='paused')h.c.paused=true;if(cause==='dom')h.env.domFocused=false;
    if(cause==='native')h.env.nativeFocused=false;if(cause==='hidden')h.c.document.hidden=true;
    h.c.tickAcademicInframusic();assert.equal(h.music.state().voices,0,cause);assert.equal(h.sources[0].stopped,true);
    h.audio.currentTime=100;h.c.paused=false;h.env.domFocused=true;h.env.nativeFocused=true;h.c.document.hidden=false;
    h.c.tickAcademicInframusic();assert.equal(h.sources.at(-1).offset,6.25,cause+' does not catch up wall time');
  }
});

test('actual blur/visibility listeners silence immediately even when no world tick runs',async()=>{
  for(const event of['blur','visibilitychange']){
    const h=fixture();await h.music.preload();h.c.tickAcademicInframusic();h.audio.currentTime=3;
    if(event==='blur')h.listeners.window.blur();else{h.c.document.hidden=true;h.listeners.document.visibilitychange();}
    assert.equal(h.music.state().voices,0);assert.equal(h.sources[0].stopped,true);assert.equal(h.music.state().offsetSec,3);
  }
  assert.match(main,/else renderBoot\(\);[\s\S]*?tickProgressionNotices\(\);\s*tickAcademicInframusic\(\);\s*\/\/ Scenes/,
    'the authoritative audio tick remains outside the inRogue/world branch');
});

test('restoring a changed saved level while suspended never restarts a loop from stale eligible input',async()=>{
  for(const cause of['paused','native','outside']){
    const h=fixture();await h.music.preload();h.c.tickAcademicInframusic();h.listeners.window.blur();
    assert.equal(h.sources.length,1);h.flags['academic.inframusic.low']=true;
    if(cause==='paused')h.c.paused=true;if(cause==='native')h.env.nativeFocused=false;if(cause==='outside')h.c.inRogue=false;
    h.c.tickAcademicInframusic();assert.equal(h.sources.length,1,cause+' must not create a transient voice');
    assert.equal(h.music.state().active,false);assert.equal(h.music.state().level,'low');
  }
});

test('the actual E route opens usable controls; reading or leaving changes no saved level',()=>{
  const h=fixture({'kept.progress':true});assert.equal(h.c.routeAcademicPA({action:'other'}),false);assert.equal(h.dialogues.length,0);
  h.c.routeAcademicPA({action:'academic-gallery-pa'});const d=h.dialogues.at(-1);
  assert.equal(d.id,'academic-gallery-amplifier');assert.equal(d.options.allowsLook,true);assert.equal(d.options.blocksWorld,true);
  assert.equal(d.options.escapable,true);assert.equal(h.writes.length,0);assert.deepEqual(h.flags,{'kept.progress':true});
  d.options.onCancel?.();d.options.onChoice(d.nodes.start.choices.find(c=>c.goto==='leave'));
  assert.equal(h.writes.length,0);assert.equal(h.music.state().level,'house');assert.deepEqual(h.flags,{'kept.progress':true});
  assert.equal(h.env.cancelGhost,1);assert.equal(h.env.cancelPopulation,1);assert.equal(h.env.cancelGuard,1);
  h.env.third=false;assert.equal(h.c.useAcademicGalleryPA(),false);h.env.third=true;h.env.blocks=true;
  assert.equal(h.c.useAcademicGalleryPA(),false);assert.equal(h.dialogues.length,1,'other floor/modal cannot open another controls scene');
});

test('each actual level choice persists mutually exclusive flags and matching four-instance indicators',()=>{
  const h=fixture({'kept.progress':true,'academic.inframusic.off':true,'academic.inframusic.low':true});
  assert.equal(h.c.academicInframusicLevel(),'off','old conflicting flags fail silent');
  for(const level of['house','low','off','house']){
    h.c.useAcademicGalleryPA();const d=h.dialogues.at(-1),choice=d.nodes.start.choices.find(c=>c.paLevel===level);
    assert.ok(choice);d.options.onChoice(choice);assert.equal(h.c.academicInframusicLevel(),level);
    assert.equal(h.music.state().level,level);assert.equal(h.flags['kept.progress'],true);
    assert.equal(!!h.flags['academic.inframusic.off'],level==='off');assert.equal(!!h.flags['academic.inframusic.low'],level==='low');
    assert.deepEqual(h.writes.at(-1).flags,h.flags);h.c.count=0;h.c.doorDynamicCombined=[];h.c.drawAcademicPA();
    assert.equal(h.c.count,4);const all=h.c.doorDynamicCombined;
    assert.equal(all.filter(p=>p.mesh==='academic_pa_speaker').length,2);assert.equal(all.filter(p=>p.mesh==='academic_pa_rack').length,1);
    assert.equal(all.filter(p=>p.academicGalleryPAIndicator).length,1);assert.equal(all.find(p=>p.academicGalleryPAIndicator).academicGalleryPAIndicator,level);
  }
});

test('actual main stages three non-drawing E proxies and the normal pack installs physical PA geometry',()=>{
  const h=fixture();h.c.syncStoryObjectProps();assert.equal(h.proxies.length,3);
  assert.equal(h.proxies.filter(p=>p.interactive).length,1);assert.equal(h.proxies.find(p=>p.interactive).id,ACADEMIC_GALLERY_PA.ampId);
  for(const p of h.proxies){assert.deepEqual(p.renderGroups,['academic-pa-proxy']);assert.equal(p.floorOverride,10);assert.equal(p.blocks,true);
    assert.equal(p.stagedWith,'setPlacedProp','the loose-object API overrides blocking and cell-centres this gear');
    const source=ACADEMIC_GALLERY_PA.placements.find(a=>a.id===p.id);assert.equal(p.x,source.x);assert.equal(p.y,source.y);
    assert.equal(p.rx,undefined);assert.equal(p.ry,undefined,'continuous authored coordinates must not be pre-quantized by main');}
  for(const group of['ground','upper','source']){h.c.group=group;h.c.count=0;h.c.doorDynamicCombined=[];h.c.drawAcademicPA();assert.equal(h.c.count,0);}
  assert.match(props,/import \{ installAcademicGalleryPAMeshes \} from '\.\/academic-gallery-pa\.js'/);
  const normalLoad=props.match(/export async function loadPropPack\(url\)\{[^\n]+\}/)?.[0];
  assert.ok(normalLoad);assert.match(normalLoad,/pack=await parsePropPack\(url\);[\s\S]*installAcademicGalleryPAMeshes\(gl,pack\)/,
    'PA geometry must be in the normal loaded prop catalog, not only its proxies');
});
