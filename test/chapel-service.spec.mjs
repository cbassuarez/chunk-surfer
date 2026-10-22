// Independent integration contracts for the existing chapel's service.
// These checks prove placement, protections and temporal behavior, not that a
// source sounds human, weary, liturgical or frightening to a player.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { ZONE } from '../src/data/floorplan/legend.js';
import { CHAPEL_CONGREGATION } from '../src/data/chapel-dressing.js';
import { CHAPEL_DRESSING_BOUNDS } from '../src/data/generated/chapel-dressing-geometry.js';
import { chapelDressingWorldPlacements } from '../src/game/chapel-dressing.js';
import { CHAPEL_SERVICE, CHAPEL_SERVICE_ANCHORS, CHAPEL_SERVICE_PHRASES, CHAPEL_SERVICE_BEDS, chapelServiceEvents } from '../src/data/chapel-service-score.js';
import { chapelServiceWorldSources, chapelServiceFrame } from '../src/game/chapel-service.js';

const manifest=JSON.parse(fs.readFileSync(new URL('../public/audio/chapel-service/manifest.json',import.meta.url)));
const clips=new Map(manifest.clips.map(clip=>[clip.id,clip]));
FP.compile(conservatory.levels,conservatory);
const sources=chapelServiceWorldSources(FP);
const visible=chapelDressingWorldPlacements(FP,CHAPEL_DRESSING_BOUNDS);
const origin=FP.logicalToPhysical(185,165);
const listener={x:origin.x*.5,y:origin.y+1.62,z:origin.z*.5,group:origin.renderGroup,ground:origin.y,zone:FP.zoneAt(185,165)};
const frame=options=>chapelServiceFrame({eligible:true,listener,sources,...options});

test('every service mouth is anchored to an actual Mass body on the shipped chapel plan',()=>{
  assert.equal(sources.length,4);
  assert.equal(new Set(sources.map(source=>source.presenceId)).size,4);
  for(const source of sources){
    const anchor=CHAPEL_SERVICE_ANCHORS.find(anchor=>anchor.id===source.id);
    const body=visible.find(body=>body.id===source.presenceId);
    const authored=CHAPEL_CONGREGATION.find(body=>body.id===source.presenceId);
    assert.ok(body&&authored,`${source.id} has no actual visible body`);
    assert.equal(source.x,body.x,`${source.id} is not shifted to a neighbouring half-metre cell centre`);
    assert.equal(source.z,body.z,`${source.id} shares its body's exact physical depth`);
    assert.ok(Math.abs(source.y-body.y-anchor.mouthHeight*body.scale)<1e-7,`${source.id} mouth follows floor and body scale`);
    assert.equal(source.group,'upper');
    assert.equal(source.ground,body.y);
    assert.ok(source.radius>0&&source.radius<=40);
    assert.ok([ZONE.chapel,ZONE.chapelOuter].includes(FP.zoneAt(source.rx,source.ry)));
    if(source.id==='officiant')assert.equal(authored.role,'celebrant');
    else assert.equal(authored.role,'congregant');
  }
  assert.deepEqual(chapelServiceWorldSources({isLoaded:()=>false}),[]);
  assert.deepEqual(chapelServiceWorldSources({...FP,logicalToPhysical:()=>({renderGroup:'tower'})}),[],
    'a re-embedded station on a different floor must fail closed');
});

test('only existing chapel and narthex hear the service; other rooms and separated floors do not',()=>{
  assert.equal(frame().active,true);
  assert.equal(frame().muted,false);
  assert.equal(frame({listener:{...listener,zone:ZONE.chapelOuter}}).active,true);
  for(const group of ['ground','basement','academic','academicRoof','tower','cathedral']){
    const off=frame({listener:{...listener,group}});
    assert.equal(off.active,false,group);assert.equal(off.muted,true,group);assert.deepEqual(off.voices,[],group);
  }
  for(const zone of [ZONE.practice,ZONE.stair,ZONE.street,ZONE.hall,ZONE.natatorium]){
    const off=frame({listener:{...listener,zone}});
    assert.equal(off.active,false,`zone ${zone}`);assert.deepEqual(off.voices,[]);
  }
  assert.equal(frame({eligible:false}).active,false);
  assert.equal(frame({listener:null}).active,false);
  const chancel=frame({listener:{...listener,ground:listener.ground+.3}});
  assert.ok(chancel.voices.every(voice=>voice.gain===1),'the real small chancel step is part of the service');
  const above=frame({listener:{...listener,ground:listener.ground+1.05}});
  assert.equal(above.active,false);assert.ok(above.voices.every(voice=>voice.gain===0),'same-group slab separation is exact silence');
});

test('monitor, recording, playback, scenes and finale protect their existing experience',()=>{
  for(const flag of ['recording','listening','playback','paused','blocked','battle','suppressActors']){
    const result=frame({[flag]:true});
    assert.equal(result.muted,true,flag);
    assert.equal(result.reason,'protected-or-blocked',flag);
  }
  assert.equal(frame({focused:false}).muted,true);
  const off=frame({effectsMode:'off'});
  assert.equal(off.active,false);assert.equal(off.muted,true);assert.deepEqual(off.voices,[]);
  const finale=frame({finale:true,recording:false,battle:false});
  assert.equal(finale.active,false);assert.equal(finale.muted,true);
  assert.equal(finale.reason,'finale','the fifth-room confrontation is not a normal REC take');
  assert.equal(frame({effectsMode:'reduced'}).muted,false,'reduce dread preserves a quiet service without new event spikes');
  assert.equal(frame({dialogue:true}).dialogue,true,'nonblocking dialogue has an explicit ducking contract');
  assert.equal(frame({dialogue:true,blocked:true}).muted,true,'blocking dialogue remains silent');
});

test('occlusion retains real fixed sources and cannot turn a closed door into amplified sound',()=>{
  const visited=[];
  const dry=frame({yaw:0,occlusion:source=>{visited.push(source.presenceId);return 0;}});
  const closed=frame({yaw:Math.PI,occlusion:()=>28});
  assert.equal(visited.length,4);
  for(let i=0;i<sources.length;i++){
    assert.equal(dry.voices[i].occlusionDb,0);assert.equal(closed.voices[i].occlusionDb,28);
    assert.equal(dry.voices[i].dx,closed.voices[i].dx);
    assert.equal(dry.voices[i].dz,closed.voices[i].dz,'head turning does not move a voice source');
    assert.equal(dry.voices[i].presenceId,sources[i].presenceId);
  }
  assert.ok(frame({occlusion:()=>-4}).voices.every(voice=>voice.occlusionDb===0));
  assert.ok(frame({occlusion:()=>400}).voices.every(voice=>voice.occlusionDb===60));
});

test('the actual source bank supports the complete Pater sequence before one congregation answer',()=>{
  const ordered=CHAPEL_SERVICE_PHRASES.filter(event=>clips.get(event.clip)?.role==='priest'||clips.get(event.clip)?.role==='response').sort((a,b)=>a.at-b.at);
  assert.deepEqual(ordered.slice(0,4).map(event=>event.clip),[
    'priest-pater-address','priest-pater-bread','priest-pater-deliverance','response-amen',
  ]);
  const pater=ordered.slice(0,3).map(event=>clips.get(event.clip));
  assert.equal(pater[0].source,pater[1].source);assert.equal(pater[1].source,pater[2].source);
  assert.equal(pater[0].cutAt.to,pater[1].cutAt.from);
  assert.equal(pater[1].cutAt.to,pater[2].cutAt.from,'clauses remain consecutive parts of the real prayer');
  for(let i=0;i<ordered.length-1;i++){
    assert.ok(ordered[i].at+clips.get(ordered[i].clip).duration<=ordered[i+1].at,
      `${ordered[i].id}: an answer or the next clause cuts across the actual recorded phrase`);
  }
  for(const event of [...CHAPEL_SERVICE_PHRASES,...CHAPEL_SERVICE_BEDS]){
    assert.ok(clips.has(event.clip),event.clip);
    assert.ok(CHAPEL_SERVICE_ANCHORS.some(anchor=>anchor.id===event.anchor),event.anchor);
  }
  assert.ok(ordered.at(-1).at+clips.get(ordered.at(-1).clip).duration<CHAPEL_SERVICE.cycleSeconds,
    'the service leaves silence after the last full response');
});

test('first entry joins an already-running phrase and re-entry never resets the service',()=>{
  const first=chapelServiceEvents(0,clips);
  const joined=first.find(event=>event.clip.role==='priest');
  assert.ok(joined,'an officiant is already partway through a phrase');
  assert.equal(joined.clip.id,'priest-pater-deliverance');
  assert.ok(joined.at<0&&joined.until>0);
  const offset=-joined.at;
  assert.ok(offset>1&&offset<joined.clip.duration,'the runtime has a meaningful in-progress sample offset');
  for(const t of [8,45,75,125.5,239.5]){
    const before=chapelServiceEvents(t,clips);
    frame({paused:true});frame({blocked:true});frame({listening:true});frame({eligible:false});frame();
    assert.deepEqual(chapelServiceEvents(t,clips),before,'visiting, pausing or protecting the machine cannot reset a pure audio epoch');
    assert.ok(before.every(event=>event.at+event.clip.duration>t&&event.at<=t+.075));
  }
  const one=chapelServiceEvents(9.2,clips).filter(event=>!event.bed);
  const next=chapelServiceEvents(9.2+CHAPEL_SERVICE.cycleSeconds,clips).filter(event=>!event.bed);
  assert.deepEqual(next.map(event=>event.id),one.map(event=>event.id));
  for(let i=0;i<one.length;i++)assert.ok(Math.abs(next[i].at-one[i].at-CHAPEL_SERVICE.cycleSeconds)<1e-7);
});

test('large time jumps return only current events, with no missed response backlog',()=>{
  chapelServiceEvents(.1,clips);
  for(const t of [100,1000,1e5,1e6]){
    const current=chapelServiceEvents(t,clips);
    assert.equal(new Set(current.map(event=>event.key)).size,current.length,'no duplicate event key');
    assert.ok(current.length<=CHAPEL_SERVICE.maxSources,'a long absence does not queue the whole service');
    for(const event of current){
      assert.ok(Number.isFinite(event.at)&&Number.isFinite(event.until));
      assert.ok(event.until>t,'expired events stay expired');
      assert.ok(event.at<=t+.075,'only a bounded audio lookahead is returned');
    }
  }
  for(const t of [-1,NaN,Infinity,-Infinity])assert.deepEqual(chapelServiceEvents(t,clips),[]);
});

test('the one recorded congregation response is never cloned into simultaneous fake performers',()=>{
  const answers=CHAPEL_SERVICE_PHRASES.filter(event=>clips.get(event.clip)?.role==='response');
  assert.equal(answers.length,3);
  for(let i=0;i<answers.length;i++){
    assert.equal(answers[i].clip,'response-amen');
    assert.equal(typeof answers[i].anchor,'string','each response has one physical anchor');
    assert.equal(answers[i].rate,undefined,'no fabricated pitch/time variant');
    if(i)assert.ok(answers[i].at>=answers[i-1].at+clips.get(answers[i-1].clip).duration);
  }
  let peak=0,peakAnswers=0;
  for(let t=0;t<CHAPEL_SERVICE.cycleSeconds*3;t+=.05){
    const active=chapelServiceEvents(t,clips).filter(event=>event.at<=t&&event.until>t);
    peak=Math.max(peak,active.length);
    peakAnswers=Math.max(peakAnswers,active.filter(event=>event.clip.role==='response').length);
  }
  assert.equal(peakAnswers,1,'the same field recording is never layered over itself');
  assert.ok(peak<=4&&peak<=CHAPEL_SERVICE.maxSources,`actual score peak ${peak} exceeds the quiet voice budget`);
});
