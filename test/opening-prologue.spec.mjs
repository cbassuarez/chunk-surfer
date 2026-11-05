import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OPENING_PROLOGUE,createOpeningPrologueStage} from '../src/data/opening-prologue.js';
import {OPENING_OMEN,openingHorizonFrame,openingOmenGeometry,openingOmenProps} from '../src/render/opening-omen.js';
import {SOURCE_REST_HORIZON,sourceRestHorizonFrame} from '../src/game/source-rest-horizon.js';
import {sourceContinuationBlackSunGeometryLibrary} from '../src/render/source-continuation-black-sun.js';
import {createConversation} from '../src/game/conversation.js';

const nodes=OPENING_PROLOGUE.nodes,ids=Object.keys(nodes),next=node=>[...(node.goto?[node.goto]:[]),...(node.choices||[]).map(row=>row.goto)];
const words=Object.values(nodes).flatMap(node=>[...node.lines,...(node.revisitLines||[])]);

test('the tree holds: every branch resolves, every node is reachable, every road reaches the card',()=>{
  const seen=new Set([OPENING_PROLOGUE.entry]),queue=[OPENING_PROLOGUE.entry];
  while(queue.length){for(const id of next(nodes[queue.shift()])){assert.ok(nodes[id],'dangling branch to '+id);if(!seen.has(id)){seen.add(id);queue.push(id);}}}
  assert.deepEqual(ids.filter(id=>!seen.has(id)),[],'unreachable nodes');
  const ends=new Map([['card',true]]);let changed=true;
  while(changed){changed=false;for(const id of ids)if(!ends.has(id)&&next(nodes[id]).some(row=>ends.has(row))){ends.set(id,true);changed=true;}}
  assert.deepEqual(ids.filter(id=>!ends.has(id)),[],'a dead end');
  assert.deepEqual(next(nodes.card),[]);assert.deepEqual([...nodes.card.card],['21:38','DEMOLITION 06:00','8 HOURS REMAIN']);
});

test('it is a tree: real questions, several answers, and silence where silence is an answer',()=>{
  const questions=ids.filter(id=>nodes[id].choices);
  assert.ok(questions.length>=8,'a talk, not a film');
  for(const id of questions)assert.ok(nodes[id].choices.length>=2,id+' is a real choice');
  assert.ok(questions.filter(id=>nodes[id].choices.some(row=>row.text.startsWith('(say nothing)'))).length>=3);
  // Different answers go different ways, and come back together.
  for(const id of['there','look','last-one','notice','tower'])assert.ok(new Set(nodes[id].choices.map(row=>row.goto)).size>=2,id);
});

const question=(convo,id)=>{
  for(let step=0;step<300;step++){
    const view=convo.view();
    if(view.pending?.kind==='branch'){
      assert.equal(view.nodeId,id);return view;
    }
    assert.equal(view.finished,false,'the question must be reachable before the film ends');
    convo.update(20);convo.key({key:'Enter'});
  }
  assert.fail('conversation did not reach '+id);
};
const answer=(convo,to)=>{
  const view=convo.view(),index=view.pending?.options.findIndex(row=>row.goto===to);
  assert.ok(index>=0,'no visible answer to '+to);convo.selectChoice(index,{sound:false});convo.key({key:'Enter'});
};

test('the interval remembers exact spent questions, keeps silence playable and always leaves the job available',()=>{
  const before=JSON.stringify(OPENING_PROLOGUE),convo=createConversation({nodes,startAt:'look',sceneId:'opening-interval-test',voiceEnabled:false});
  convo.start();let board=question(convo,'look');
  assert.equal(board.pending.options.length,5);
  const routes=[['interval-eyes','interval-first'],['interval-wheel','interval-release'],['interval-avert','interval-wait'],['interval-silent',null]];
  for(const[entry,reply]of routes){
    answer(convo,entry);
    if(reply){question(convo,entry);answer(convo,reply);}
    board=question(convo,'look');
    assert.ok(!board.pending.options.some(row=>row.goto===entry),'only the exact asked question is spent');
    assert.ok(board.pending.options.some(row=>row.goto==='job'),'the interval can always be left');
    assert.equal(convo.view().line.sourceId,'opening-prologue:look:return:1','the hub speaks its authored return, not its first greeting');
  }
  assert.deepEqual(board.pending.options.map(row=>row.goto),['job']);
  answer(convo,'job');assert.equal(question(convo,'job').pending.options.length,3);
  convo.stop();
  const fresh=createConversation({nodes,startAt:'look',sceneId:'opening-interval-next-run',voiceEnabled:false});
  fresh.start();assert.equal(question(fresh,'look').pending.options.length,5);fresh.stop();
  assert.equal(JSON.stringify(OPENING_PROLOGUE),before,'asked state never mutates or persists in the authored opening');
});

test('every new encounter answer rejoins the question board without a locked or empty picker',()=>{
  for(const[entry,replies]of[['interval-eyes',['interval-first','interval-meet']],['interval-wheel',['interval-hold','interval-release']],['interval-avert',['interval-wait','interval-return']],['interval-silent',[null]]]){
    for(const reply of replies){
      const convo=createConversation({nodes,startAt:'look',sceneId:'opening-branch-'+(reply||entry),voiceEnabled:false});
      convo.start();question(convo,'look');answer(convo,entry);
      if(reply){question(convo,entry);answer(convo,reply);}
      const board=question(convo,'look');assert.ok(board.pending.options.length>=1);assert.ok(board.pending.options.some(row=>row.goto==='job'));convo.stop();
    }
  }
});

test('optional interval and road questions cannot bypass the filed evidence or create a second exit',()=>{
  for(const required of['job-sheet','last-one','ellery','school-told','boy-told','notice','tower','margin','fate','off','wipers']){
    const seen=new Set(),queue=[OPENING_PROLOGUE.entry];
    while(queue.length){const id=queue.shift();if(id===required||seen.has(id))continue;seen.add(id);queue.push(...next(nodes[id]));}
    assert.equal(seen.has('card'),false,'the '+required+' evidence cannot be bypassed');
  }
  assert.deepEqual(ids.filter(id=>next(nodes[id]).length===0),['card']);
  for(const node of Object.values(nodes)){
    assert.equal(node.set,undefined);assert.equal(node.clear,undefined);
    for(const choice of node.choices||[]){assert.equal(choice.set,undefined);assert.equal(choice.clear,undefined);assert.equal(choice.exit,undefined);}
  }
  let done=0;const convo=createConversation({nodes,startAt:'wipers',voiceEnabled:false,onDone:()=>done++});convo.start();
  for(let i=0;i<30;i++){convo.update(20);convo.key({key:'Enter'});}
  assert.equal(done,1);assert.equal(convo.view().finished,true);convo.stop();
});

test('it is a mix of narration and speech, in prose',()=>{
  const by=who=>words.filter(row=>row.who===who&&row.text);
  assert.ok(by('direction').length>=15,'narration');assert.ok(by('unknown').length>=30,'the voice');assert.ok(by('me').length>=15,'you');
  // Not verse: no run of lines from the voice ends on a rhyme, and they vary in length.
  const voice=by('unknown').map(row=>row.text),lengths=voice.map(text=>text.length);
  assert.ok(Math.max(...lengths)>110&&Math.min(...lengths)<20,'prose has uneven breath');
  const tail=text=>text.toLowerCase().replace(/[^a-z ]/g,'').trim().split(' ').pop().slice(-3);
  let couplets=0;for(let k=1;k<voice.length;k++)if(tail(voice[k])===tail(voice[k-1]))couplets++;
  assert.ok(couplets<=2,'it has started rhyming');
  for(const row of words)assert.ok(row.text.length<=190,row.text);
});

test('it covers the job, the school and you, in the words on file',()=>{
  const all=words.map(row=>row.text).join('\n'),has=text=>assert.ok(all.includes(text),text);
  for(const text of['One clean minute of each, with nothing in it. No handling noise, no clothing, no breath.','If you can hear yourself on the take, the take is not the room, and we will not accept it.','The account remains open.','Demolition begins 06:00 Thursday.'])has(text);
  for(const text of['MISSING','We will not play over what happened.','NO REPLY FILED','Cause of death: not entered on this copy.','Refusal to rehearse is not a medical finding.'])has(text);
  // Every ending's way in is there, and asking about each is optional.
  for(const id of['f-home','f-seal','f-help','f-door','f-carry','f-bench']){assert.ok(nodes.fate.choices.some(row=>row.goto===id&&row.hideWhenAsked),id);assert.equal(nodes[id].goto,'fate');assert.equal(nodes[id].fate,true);}
  for(const id of['f-none','f-enough']){assert.ok(nodes.fate.choices.some(row=>row.goto===id&&!row.hideWhenAsked),id+' is always open');assert.equal(nodes[id].goto,'off');}
});

test('the doctrine: nameless, unattributed, no cause confirmed, nothing the game withholds',()=>{
  for(const row of words){
    assert.ok(['direction','unknown','me'].includes(row.who),row.who);
    assert.equal(row.signalRole,row.who==='me'?'human':'unattributed');
    assert.equal(row.voice,false);assert.equal(row.say,false);assert.match(row.sourceId,/^opening-prologue:/);
  }
  const all=words.map(row=>row.text).join('\n');
  assert.ok(!/\bHUSH\b/.test(all),'it never names itself');
  assert.ok(!/Sarah|Lyle|Alan/.test(all),'names are for the player to bring');
  assert.ok(!/CHUNK SURFER|the Surfer/i.test(all),'the game does not name him for hours');
  assert.ok(!/six on thursday, down|down it comes/i.test(all));
  assert.ok(words.some(row=>row.text==='There you are.'),'the bench opens the same way');
});

test('the picture: the void first, the school while the school is spoken of, then the void again',()=>{
  const k=OPENING_PROLOGUE.keys;
  for(const id of['dark','woken','inner','middle','whole'])assert.ok(k[id].eye[1]>55,id+' is above everything');
  for(const id of['ellery','school','boy','notice','roll'])assert.ok(k[id].eye[1]<3,id+' is at eye level');
  for(const id of['fate3','fate4','fate5','fate6','last','gone'])assert.ok(k[id].eye[1]>55,id);
  assert.equal(nodes.ellery.stage,'ellery');assert.equal(k.ellery.rain,1);assert.equal(k.dark.rain,0);
  assert.ok(k.ellery.seconds>=20,'it goes to look: it does not drop');
  for(const id of ids)if(nodes[id].stage&&nodes[id].stage!=='fate')assert.ok(k[nodes[id].stage],id);
  assert.equal(k.last.shut,24);assert.equal(k.gone.veil,1);assert.equal(k.gone.music,0);
});

test('the picture never holds up the talk, and carries on from wherever it had got to',()=>{
  const stage=createOpeningPrologueStage(),base=stage.view().radius;
  assert.equal(stage.id(),'dark');assert.equal(stage.to('nonsense'),false);
  stage.to('ellery');stage.advance(13);
  const middle=stage.view();assert.ok(middle.eye[1]<55&&middle.eye[1]>10,'part way down');assert.equal(base,1);
  stage.to('fate6');stage.advance(.001);
  assert.ok(Math.abs(stage.view().eye[1]-middle.eye[1])<1,'no jump when it changes its mind');
  stage.snap();assert.ok(Math.abs(stage.view().radius-OPENING_PROLOGUE.keys.fate6.radius)<1e-6);
});

test('reduced motion takes a move as a cut, and does not drift',()=>{
  const stage=createOpeningPrologueStage({reducedMotion:true});
  const near=(a,b)=>a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<1e-9,`${a} against ${b}`));
  stage.to('ellery');stage.advance(.1);
  near(stage.view().eye,OPENING_PROLOGUE.keys.ellery.eye);
  stage.advance(50);near(stage.view().eye,OPENING_PROLOGUE.keys.ellery.eye);
});

test('the added poses make the chosen gaze and silence physical, with finite interruption-safe motion',()=>{
  const keys=OPENING_PROLOGUE.keys,optional=['interval','counted','unseen','near','grip','held','released','averted','margin'];
  for(const reducedMotion of[false,true]){
    const stage=createOpeningPrologueStage({reducedMotion});
    for(const id of optional){
      assert.equal(stage.to(id),true);
      for(const dt of[0,.001,.1,1,2]){
        stage.advance(dt);const view=stage.view();
        for(const value of Object.values(view))for(const scalar of Array.isArray(value)?value:[value])assert.ok(Number.isFinite(scalar),id+' remains finite');
        assert.ok(Math.hypot(...view.target.map((v,k)=>v-view.eye[k]))>.1,'camera never reaches a singular aim');
      }
      stage.snap();
      if(reducedMotion)stage.view().eye.forEach((value,k)=>assert.ok(Math.abs(value-keys[id].eye[k])<1e-9));
    }
  }
  const distance=key=>Math.hypot(...key.eye.map((v,k)=>v-key.hole[k]));
  assert.ok(distance(keys.near)<distance(keys.interval)/2,'holding its gaze makes a real approach');
  assert.ok(keys.averted.target.map((v,k)=>v-keys.averted.eye[k]).reduce((sum,v,k)=>sum+v*(keys.averted.hole[k]-keys.averted.eye[k]),0)<0,'looking away actually turns away from the hole');
  const eyes=id=>openingHorizonFrame({centre:keys[id].hole,radius:keys[id].radius,clock:30,open:keys[id].open,shut:keys[id].shut}).eyeAges,
    dark=SOURCE_REST_HORIZON.eyeDarkSeconds;
  assert.equal(Array.from(eyes('counted')).filter(age=>age>=dark).length,1);
  assert.ok(Array.from(eyes('unseen')).every(age=>age<dark),'the voice remains while every visible eye is shut');
  assert.equal(Array.from(eyes('interval')).filter(age=>age>=dark).length,24,'returning reopens the same eyes rather than advancing the history roll');
  const sourceIds=words.map(row=>row.sourceId);assert.equal(new Set(sourceIds).size,sourceIds.length);
});

test('it is the same hole: the real frame, moved and turned rigidly',()=>{
  const centre=[80,70,-16],frame=openingHorizonFrame({centre,radius:2,clock:30});
  assert.deepEqual(frame.centre,centre);assert.equal(frame.radius,2);assert.equal(frame.active,true);assert.equal(frame.finish,'silicon');
  assert.equal(frame.capture,SOURCE_REST_HORIZON.capture);assert.equal(frame.dragging,SOURCE_REST_HORIZON.dragging);assert.equal(frame.lensRadius,SOURCE_REST_HORIZON.lensRadius);
  assert.equal(frame.rings.length,SOURCE_REST_HORIZON.rings.length);
  frame.rings.forEach((ring,k)=>{assert.equal(ring.inner,SOURCE_REST_HORIZON.rings[k].inner);assert.equal(ring.outer,SOURCE_REST_HORIZON.rings[k].outer);assert.ok(Math.abs(Math.hypot(...ring.normal)-1)<1e-6);});
  assert.equal(frame.eyeAges.length,SOURCE_REST_HORIZON.rings.length*SOURCE_REST_HORIZON.eyes);
  const fallen=openingHorizonFrame({centre,radius:2,clock:30,falls:[1,0,0]});
  assert.equal(fallen.rings[0].alive,0);assert.equal(fallen.rings[0].inner,SOURCE_REST_HORIZON.collapsedInner);assert.equal(fallen.rings[1].alive,1);
});

test('eyes: unopened and shut are dark, and each goes in the order roll is called',()=>{
  const dark=SOURCE_REST_HORIZON.eyeDarkSeconds,ages=args=>openingHorizonFrame({centre:[0,50,0],radius:1,clock:5,...args}).eyeAges;
  assert.deepEqual(Array.from(ages({open:0})).every(age=>age<dark&&age>SOURCE_REST_HORIZON.eyeFlashSeconds),true,'all unopened, no flash');
  assert.deepEqual(Array.from(ages({open:24})).every(age=>age>=dark),true,'all open');
  const one=ages({open:24,shut:.1});assert.ok(one[0]<SOURCE_REST_HORIZON.eyeFlashSeconds,'the first goes with a flash');assert.ok(one[16]>=dark);
  const roll=ages({open:24,shut:17});for(let eye=8;eye<24;eye++)assert.ok(roll[eye]<dark);for(let eye=1;eye<8;eye++)assert.ok(roll[eye]>=dark,'seven are left');
  assert.equal(new Set(OPENING_OMEN.shutOrder).size,24);
});

test('it is the same moon: the geometry and paint of the Catch',()=>{
  const real=sourceContinuationBlackSunGeometryLibrary(),mine=Object.fromEntries(openingOmenGeometry().map(row=>[row.name,row]));
  assert.equal(mine.omen_moon.p,real['catch-blood-moon'].p);assert.equal(mine.omen_moon.emissive,real['catch-blood-moon'].emissive);
  assert.equal(mine.omen_moon_stream.i,real['catch-blood-moon-stream'].i);
  assert.equal(mine.omen_dome.metallic,1,'black in diffuse and specular');
  const props=stage=>openingOmenProps({eye:[0,60,0],centre:[0,70,-10],radius:1,...stage}).map(row=>row.mesh);
  assert.deepEqual(props({moon:0}),['omen_dome']);
  assert.deepEqual(props({moon:1}),['omen_dome','omen_moon']);
  assert.deepEqual(props({moon:1,stream:.5}),['omen_dome','omen_moon','omen_moon_stream']);
});

test('wiring: first run only, never in the loop, and no lens in the ordinary night',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),r3d=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8'),scene=readFileSync(new URL('../src/game/opening-prologue-scene.js',import.meta.url),'utf8');
  const gate=main.slice(main.indexOf('beginOpeningVehicleArrival=(options={})=>{'),main.indexOf('// Nothing before the get-in door may know'));
  for(const condition of['owed&&','!options.god','!sixLoopActive()',"!params().has('noprologue')",'!getSave().openingArrival?.drive','openingVehiclePending('])assert.ok(gate.includes(condition),condition);
  assert.ok(main.includes('R3.r3dSetSourceRestHorizon?.(horizon)'));
  assert.ok(scene.includes('makeColdOpenScene('),'the game\'s own conversation and picker');
  assert.equal((r3d.match(/runSourceRestHorizonPass\(\);/g)||[]).length,2,'Source, and the one world call that does nothing unless a frame is set');
  assert.ok(/function runSourceRestHorizonPass\(\)\{\s*sourceRestHorizonStatus\.drawn=false;\s*if\(!sourceRestHorizon\|\|/.test(r3d));
  // Spectral print stays Source's, but for a horizon that names its stock, and the real one does not.
  assert.ok(r3d.includes("if(!blueprintRecording&&sourceRestHorizon?.finish)gl.uniform1f(pixelMeshU('uSourceFinish')"));
  assert.equal(sourceRestHorizonFrame({time:30,unwrappedTime:30,progress:0}).finish,undefined);
});
