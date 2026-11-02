import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {NodeIO} from '@gltf-transform/core';
import sharp from 'sharp';
import {STUDENT_STRIKE_DOCUMENT_IDS as IDS,STUDENT_STRIKE_DOCUMENTS as DOCS,
  STUDENT_STRIKE_RECORD_PROPS as PROPS,STUDENT_STRIKE_RECORD_MESHES as MESHES,
  deriveStudentStrikeEvidence,studentStrikeEvidenceOpening} from '../src/data/student-strike-evidence.js';
import {PAGES} from '../src/data/conservatory-script.js';
import {pubQuestDialogue,reducePubQuest} from '../src/game/pub-quest.js';
import {vigilConversation,VIGIL_VOICES,VIGIL_LINKED_CHAPELS_FLAG} from '../src/data/exterior-vigil.js';
import {deriveStoryEvidence} from '../src/game/story-evidence.js';
import {reduceRunLedger} from '../src/progression/run-ledger.js';
import {freshLedger} from '../src/progression/schema.js';
import {EVENT_TYPES} from '../src/progression/events.js';
import {createConversation} from '../src/game/conversation.js';
import * as FP from '../src/world/floorplan.js';
import * as WORLD_PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ACADEMIC_FLOOR_POPULATION} from '../src/data/academic-floor-population.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {academicFloorActorPresent} from '../src/game/academic-floor-returns.js';

const read=(ledger,id)=>reduceRunLedger(ledger,{type:EVENT_TYPES.DOCUMENT_READ,payload:{id}});
const evidence=id=>deriveStudentStrikeEvidence(read(freshLedger(),id));
function assertPaths(tree){
  for(const[id,node]of Object.entries(tree)){
    if(node.goto)assert.ok(tree[node.goto],`${id} -> ${node.goto}`);
    for(const choice of node.choices||[]){
      if(choice.goto)assert.ok(tree[choice.goto],`${id} choice -> ${choice.goto}`);
      if(choice.spokenText){
        const target=tree[choice.goto];
        assert.equal(target.lines.find(line=>line.who==='me')?.text,choice.spokenText,`${id} full operator speech`);
        assert.notEqual(choice.text,choice.spokenText,`${id} retains separate choice text`);
      }
      assert.equal(choice.studentStrike,undefined);
      assert.equal(choice.set,undefined);assert.equal(choice.clear,undefined);
    }
  }
}

test('only received records or the completed account grant strike knowledge; global thresholds stay unchanged',()=>{
  const ledger=freshLedger(),before=structuredClone(ledger);
  assert.equal(deriveStudentStrikeEvidence(ledger).known,false);
  assert.equal(deriveStudentStrikeEvidence({...ledger,propsInspected:PROPS.map(p=>p.id)}).known,false);
  assert.equal(deriveStudentStrikeEvidence({...ledger,propsAuditioned:PROPS.map(p=>p.id)}).known,false);
  const ellery=read(ledger,IDS.ellery),tower=read(ledger,IDS.tower);
  assert.equal(evidence(IDS.ellery).concealment,true);
  assert.equal(evidence(IDS.ellery).strikeDemand,true);
  assert.equal(evidence(IDS.tower).concealment,false);
  assert.equal(evidence(IDS.tower).strikeDemand,false);
  assert.equal(evidence(IDS.tower).laterRecoveries,true);
  assert.deepEqual(deriveStoryEvidence(ellery),deriveStoryEvidence(ledger));
  assert.deepEqual(deriveStoryEvidence(tower),deriveStoryEvidence(ledger));
  assert.deepEqual(ledger,before);
  assert.equal(deriveStudentStrikeEvidence(ledger,{studentStrikeWatched:true}).account,true);
  assert.equal(deriveStudentStrikeEvidence(ledger,{documentsKnown:{[IDS.ellery]:{count:1}}}).elleryRecovery,true);
  assert.equal(deriveStudentStrikeEvidence(ledger,{documentsKnown:new Set([IDS.tower])}).towerRecovery,true);
  assert.equal(deriveStudentStrikeEvidence(ledger,{documentsKnown:{[IDS.ellery]:false}}).known,false);
});

test('each retained record is a persistent hosted page at its recovery site, without Odette or consent gates',()=>{
  for(const doc of DOCS){
    assert.equal(PAGES.find(p=>p.id===doc.id),doc);
    const prop=PROPS.find(p=>p.id===doc.hosted);assert.ok(prop);assert.ok(MESHES[prop.mesh]);
    assert.deepEqual(doc.at,{x:prop.x,y:prop.y});assert.equal(prop.blocks,false);
    assert.equal(prop.if,undefined);assert.equal(prop.action,undefined);
    assert.ok(doc.printLines.join(' ').includes('RECOVERY'));
    assert.ok(doc.printLines.length>=20);assert.equal(doc.room,undefined);
  }
  assert.equal(PROPS[0].floorOverride,10);assert.deepEqual(PROPS[0].renderGroups,['academic']);
  assert.equal(PROPS[1].floorOverride,8.6);assert.deepEqual(PROPS[1].renderGroups,['tower']);
  assert.match(DOCS[0].body.filter(x=>typeof x==='string').join(' '),/external register is to retain MISSING/);
  assert.match(JSON.stringify(DOCS[1]),/CAUSE OF DEATH: NOT ENTERED/);
});

test('actual hosted-page host reads both recovery records without advancing the unrelated recordist arc',()=>{
  const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const production=name=>{
    const start=main.indexOf(`function ${name}(`);assert.ok(start>=0,name);
    const end=main.indexOf('\nfunction ',start+1);return main.slice(start,end<0?main.length:end);
  };
  const declaration=name=>{
    const start=main.indexOf(`const ${name}=`);assert.ok(start>=0,name);
    return main.slice(start,main.indexOf('\n',start));
  };
  let ledger=freshLedger(),himBeats=0;
  const read=new Set(),documents=[],commits=[],noises=[];
  const host={PAGES,STUDENT_STRIKE_IDS:IDS,EVENT_TYPES,px:12,py:245,
    OBJ:{objState:()=>({read:[...read]}),markPageRead:id=>read.add(id),saveObjState:()=>({read:[...read]})},
    getMeta:()=>({knowledge:{documents:{}}}),DOC:{readDocument:doc=>documents.push(doc)},
    emitProgress:(type,payload)=>{ledger=reduceRunLedger(ledger,{type,payload});},
    saveCommit:value=>commits.push(value),fireCue:()=>{},
    REC:{emitNoise:(...args)=>noises.push(args)},himBeat:()=>himBeats++,
  };
  vm.createContext(host);
  vm.runInContext([declaration('STUDENT_STRIKE_DOCUMENT_IDS'),declaration('HOSTED_PAGES'),
    production('progressionDocumentId'),production('readDocumentTracked'),production('takeHostedPage')].join('\n'),host);
  const ordinary=PAGES.find(doc=>doc.hosted&&!DOCS.some(strike=>strike.id===doc.id));assert.ok(ordinary);
  assert.equal(host.takeHostedPage(ordinary.hosted),true);assert.equal(himBeats,1);
  for(const doc of DOCS){
    assert.equal(host.takeHostedPage(doc.hosted),true);
    assert.ok(read.has(doc.id));assert.ok(ledger.documentsRead.includes(doc.id));
    assert.equal(documents.at(-1).id,doc.id);assert.equal(himBeats,1);
  }
  const receiptCount=ledger.documentsRead.length,commitCount=commits.length,noiseCount=noises.length;
  for(const doc of[ordinary,...DOCS])assert.equal(host.takeHostedPage(doc.hosted),true);
  assert.equal(himBeats,1,'ordinary and strike rereads do not spend another narration beat');
  assert.equal(ledger.documentsRead.length,receiptCount,'the actual production ledger deduplicates document knowledge');
  assert.equal(commits.length,commitCount);assert.equal(noises.length,noiseCount);
  assert.equal(host.takeHostedPage('not-a-hosted-page'),false);
  assert.deepEqual(new Set(ledger.documentsRead),new Set([ordinary.id,...DOCS.map(doc=>doc.id)]));
});

test('actual prop targeting ranks each visible sheet from a supported two-metre observer, including surviving chamber guests',()=>{
  FP.compile(conservatory.levels,conservatory);WORLD_PROPS.propsInit(FP);
  const floorReturns={visits:3,returns:2,populationStage:2};
  for(const person of[...ACADEMIC_FLOOR_POPULATION,...ACADEMIC_SOCIETY_ACTORS]){
    if(person.interactive===false||!academicFloorActorPresent(person.id,floorReturns))continue;
    WORLD_PROPS.setLooseProp(person.id,{mesh:person.mesh,label:person.roleLabel||person.id,
      rx:person.x*FP.toRuntimeDistance(1),ry:person.y*FP.toRuntimeDistance(1),
      inspectAt:{x:person.x,y:person.y},floorOverride:person.floor,h:person.height,w:.55,d:.4,
      action:'academic-floor-population-talk',interactive:true,blocks:false});
  }
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
  const rendered=WORLD_PROPS.renderInstances({inscriptions:false});
  const cases=[
    {id:'student-strike-ellery-record',group:'academic',floor:10,observer:{x:60.2,z:5.1},render:{x:62.2,y:10.012,z:5.1}},
    {id:'student-strike-tower-record',group:'tower',floor:8.6,observer:{x:94.5,z:59},render:{x:96.5,y:8.9816,z:59}},
  ];
  for(const c of cases){
    const sheet=rendered.find(p=>p.id===c.id),prop=WORLD_PROPS.propById(c.id);assert.ok(sheet&&prop);
    for(const axis of['x','y','z'])near(sheet[axis],c.render[axis]);
    assert.deepEqual(prop.inspectAt,{x:prop.x,y:prop.y});near(prop.interactionHeight,.003);
    const observer=FP.logicalAtPhysical(c.observer.x/.5-.5,c.observer.z/.5-.5,{group:c.group,floor:c.floor});
    assert.ok(observer);assert.equal(FP.isSolid(observer.x,observer.y),false);
    assert.equal(WORLD_PROPS.propCanOccupy(observer.x,observer.y),true);
    const at=FP.logicalToPhysical(observer.x,observer.y),body={x:(at.x+.5)*.5,z:(at.z+.5)*.5};
    const distance=Math.hypot(sheet.x-body.x,sheet.z-body.z);near(distance,2);
    const yaw=Math.atan2(sheet.x-body.x,-(sheet.z-body.z));
    const pitch=Math.atan2(sheet.y+.003-FP.floorAt(observer.x,observer.y)-1.58,distance);
    const selected=WORLD_PROPS.pickProp(observer.x,observer.y,0,3.2,{yaw,pitch});
    assert.equal(selected?.id,c.id,'a guest or other prop must not steal the directly aimed physical sheet');
  }
});

test('Iona and preservation responses attribute what was learned and never appear from visibility alone',()=>{
  assert.equal(pubQuestDialogue({}).strike,undefined);
  for(const id of['vigil-ruth-mallory','vigil-denise-okafor']){
    assert.equal(vigilConversation(id).tree['student-strike'],undefined);
  }
  for(const context of[evidence(IDS.ellery),evidence(IDS.tower),deriveStudentStrikeEvidence({}, {studentStrikeWatched:true})]){
    const pub=pubQuestDialogue({}, {studentStrikeEvidence:context});
    assert.equal(pub.strike.lines[0].text,studentStrikeEvidenceOpening(context));assertPaths(pub);
    if(context.elleryRecovery)assert.match(pub.strike.lines[0].text,/I read the retained copy/);
    if(context.towerRecovery)assert.match(pub.strike.lines[0].text,/I read a transfer receipt/);
    if(context.account)assert.match(pub.strike.lines[0].text,/Odette says/);
    assert.equal(pub['strike-questions'].choices.some(c=>c.id==='pub-iona.strike-refusal'),context.strikeDemand);
    for(const id of['vigil-ruth-mallory','vigil-denise-okafor'])for(const phase of['first','immediate-revisit','returned']){
      const conversation=vigilConversation(id,{phase,studentStrikeEvidence:context});
      assertPaths(conversation.tree);
      assert.ok(conversation.tree[conversation.startAt].choices.some(c=>c.goto==='student-strike'));
      assert.deepEqual(VIGIL_VOICES[id].tree['student-strike'],undefined);
    }
  }
});

test('strike topics leave pub help, Contact and existing vigil recognition untouched',()=>{
  const flags={unrelated:7,'contact.offered':true,[VIGIL_LINKED_CHAPELS_FLAG]:true};
  const tree=pubQuestDialogue(flags,{studentStrikeEvidence:evidence(IDS.ellery)});
  const topic=tree.start.choices.find(c=>c.id==='pub-iona.strike-topic');
  const result=reducePubQuest(flags,topic,{inPerson:true,actorId:'pub-bartender-iona'});
  assert.deepEqual(result.flags,flags);assert.deepEqual(result.effects,[]);
  const ordinary=vigilConversation('vigil-malcolm-vey',{phase:'returned'});
  const withHistory=vigilConversation('vigil-malcolm-vey',{phase:'returned',studentStrikeEvidence:evidence(IDS.ellery)});
  assert.deepEqual(withHistory,ordinary);
  const lines=JSON.stringify(tree);
  assert.match(lines,/I do not know/);assert.match(lines,/four hundred pounds stays one sum/);
  assert.doesNotMatch(lines,/demolition (?:will|would) (?:free|release)|hunger.*killed|death by starvation/i);
});

test('new Iona topic is a playable optional conversation with ordinary leave and no quest effect',()=>{
  const tree=pubQuestDialogue({}, {studentStrikeEvidence:evidence(IDS.ellery)});
  const spoken=[],choices=[];
  const machine=createConversation({sceneId:'student-strike-evidence-test',nodes:Object.fromEntries(
    Object.entries(tree).map(([id,n])=>[id,{...n,lines:n.lines.map(l=>({...l,voice:false}))}])),
    onLine:line=>spoken.push(line.text),onChoice:choice=>choices.push(choice),voiceEnabled:false});
  machine.start();
  function settle(){
    for(let count=0;count<100&&!machine.view().pending&&!machine.view().finished;count++){
      machine.update(10);machine.key({key:'Enter'});
    }
    return machine.view();
  }
  for(const id of['pub-iona.strike-topic','pub-iona.strike-preserve','pub-iona.strike-challenge','pub-iona.leave']){
    const state=settle();const options=state.pending?.options||[];
    const index=options.findIndex(c=>c.id===id);
    assert.ok(index>=0,`missing ${id}: ${JSON.stringify(state)}`);
    machine.selectChoice(index,{sound:false});machine.key({key:'Enter'});
  }
  settle();assert.equal(machine.view().finished,true);
  assert.ok(spoken.some(t=>t.includes('four hundred pounds stays one sum')));
  assert.ok(choices.every(c=>!c.pubQuestAction&&!c.studentStrike));
});

test('dedicated native sheets and reader pages contain two pinned physical prints, without replacing shared assets',async()=>{
  const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/student-strike-records.stats.json',import.meta.url)));
  assert.equal(stats.protectedAssetsUnchanged,true);
  const gltf=await new NodeIO().read(new URL('../public/assets/student-strike-records.glb',import.meta.url).pathname);
  assert.deepEqual(gltf.getRoot().listMeshes().map(m=>m.getName()).sort(),PROPS.map(p=>p.mesh).sort());
  for(const mesh of gltf.getRoot().listMeshes()){
    const primitive=mesh.listPrimitives()[0],material=primitive.getMaterial();
    assert.ok(material.getBaseColorTexture());assert.ok(material.getNormalTexture());assert.ok(material.getMetallicRoughnessTexture());
    assert.equal(material.getExtras().printedSurface.coverage,'baseColorAlpha');
    assert.equal(material.getAlphaMode(),'OPAQUE');assert.equal(primitive.getIndices().getCount(),6);
  }
  for(const record of stats.readerRecords){
    const image=await sharp(new URL('../public/'+record.pages[0].path,import.meta.url).pathname).stats();
    assert.ok(image.channels[0].stdev>10,'reader page cannot be blank');assert.equal(image.channels.length,3);
  }
});
