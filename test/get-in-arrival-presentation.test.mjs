import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the Scene Dock crossing owns the title but does not spend the missing-door interaction', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const start = main.indexOf('function beginGetInArrivalTitle');
  const end = main.indexOf('function noteArrivalThoughts', start);
  const body = main.slice(start, end);
  assert.match(body, /SPEECH\.clearSpeech\(\)/, 'yard chatter cannot leak across the cut');
  assert.match(body, /makeWorldTitleScene\(/, 'the physical crossing opens the world title');
  assert.match(body, /restore:\(pose\)=>restoreOpeningEntryPose\(pose\)/,
    'the title returns the head to the entered pose instead of forcing the door beat');
  assert.match(body, /onDone:\(\)=>TUT\.startTutorial\(\)/,
    'setup begins after the title without waiting for the optional door search');
  assert.doesNotMatch(body, /postDoorThought|beginDoorSearchBeat/,
    'crossing alone cannot trigger the missing-door tree');
  assert.doesNotMatch(body, /AFTER_TITLE/, 'the small beat list is no longer in the arrival chain');
});

test('one exterior interact opens the goods doors and performs the physical crossing', () => {
  const main = readFileSync('src/main.js', 'utf8');
  const start = main.indexOf('function tryGetInDoorEntry');
  const end = main.indexOf('// Where the door stood', start);
  const body = main.slice(start, end);
  assert.match(body,/FP\.interactDoor\(/,'the same interact edge opens the canonical leaves');
  assert.match(body,/getInDoorEntryPose\(/,'the door definition allocates the interior landing pose');
  assert.match(body,/worldView\(\)/,'the crossing moves the first-person camera through the aperture');
  assert.match(body,/noteDockTransitStep\(origin/,'the completed action enters the ordinary dock transit state');
  assert.match(body,/beginGetInArrivalTitle\(\)/,'the title begins only after the body is inside');
  assert.ok(main.indexOf('tryGetInDoorEntry(focus)')<main.indexOf('const doorHit=focus.doorWins?FP.interactDoor'),
    'the authored arrival consumes E before the generic open/close path');
  assert.match(main,/\? `ENTER \$\{SCENE_DOCK_LABEL\}`/,'the HUD advertises the complete Scene Dock action rather than OPEN DOOR');
});

test('the crossing plays the full cinematic title beat, in the world', () => {
  const source = readFileSync('src/game/coldopen.js', 'utf8');
  assert.doesNotMatch(source, /makeGetInArrivalScene/, 'the GET-IN threshold slate is not the title');
  assert.doesNotMatch(source, /THRESHOLD/, 'no threshold panel label survives');
  assert.match(source, /duration = 12\.0, turn = 1\.3, iris = 1\.6/, 'the long beat keeps its authored timing');
  assert.match(source, /'ELLERY CONSERVATOIRE OF MUSIC'/);
  assert.match(source, /'5 ROOMS \/ 1 CLEAN MINUTE EACH'/);
  assert.match(source, /camera\?\.restore\?\.\(entryPose\)/, 'the scene gives the head back where it found it');
});

test('interacting with the goods door from inside opens the full authored missing-door tree', () => {
  const authored=JSON.parse(readFileSync('content/narrative/conservatory.post_door.story.json','utf8'));
  const expected={self:{lines:13,choices:4},guard:{lines:13,choices:3},tape:{lines:14,choices:4}};
  for(const [id,counts] of Object.entries(expected)){
    const node=authored.nodes[id];
    assert.equal(node.lines.length,counts.lines,`${id} retains the earlier full line sequence`);
    assert.equal(node.choices.length,counts.choices,`${id} retains an actual choice board`);
    const copy=[...node.lines,...node.choices].map((entry)=>entry.text||'').join(' ');
    assert.match(copy,/torch/i,`${id} names the torch before setup`);
    assert.match(copy,/bag/i,`${id} names the bag before setup`);
  }
  const main=readFileSync('src/main.js','utf8');
  const start=main.indexOf('function tryTheGreyDoor');
  const end=main.indexOf('function postDoorThought',start);
  const body=main.slice(start,end);
  assert.match(body,/flagSet\('opening\.postDoor\.started'\)/,
    'the actual inside-door interaction durably owns the trigger');
  assert.match(body,/beginDoorSearchBeat\(\{restorePose\}\)/,
    'the interaction hands into the complete tree');
  assert.match(main,/opening\.postDoor\.complete/,'completion survives reload');
  assert.match(main,/postDoorThought\(finish,\{escapable:false,allowsLook:false\}\)/,
    'once deliberately started, the tree cannot be escaped or looked away from before the seal');
  assert.match(main,/if\(!flagTest\('opening\.postDoor\.started'\)\|\|openingPostDoorComplete\(\)\)return false/,
    'reload resumes only a tree the player actually triggered');
  assert.match(main,/resumeOpeningPostDoorFromSave\(\)/,'an interrupted opening resumes before setup');
});

test('the mandatory booth route is a concise handoff with optional depth left in its branches', () => {
  const authored=JSON.parse(readFileSync('content/narrative/conservatory.cold_open_dialogue.story.json','utf8'));
  const wordsOf=(lines)=>lines.reduce((sum,line)=>sum+String(line.text||'').trim().split(/\s+/).filter(Boolean).length,0);
  const spine=['start','descent','threshold'].map((id)=>authored.nodes[id].lines||[]);
  const ungated=spine.flat().filter((line)=>!line.when);
  const gated=spine.flat().filter((line)=>line.when);

  // THE NUMBER MOVED, AND HERE IS WHY.
  //
  // It was 140–220 against a `start` that was a flat topic board: four lines of
  // scene, then six buttons. `start` is now the greeting as well — the whole
  // establishing shot and the three-way answer that picks the trunk — so the
  // unavoidable part of the run is legitimately longer, and squeezing it was
  // what deleted the perch in the rain and the guard's twelve-pack of pens in
  // the first place.
  //
  // What the budget is actually for survives as the ratio: the guard's parting
  // speech at the register is mostly `when`-gated now, so the man who read the
  // paperwork, the man who asked after the last recordist and the man who asked
  // how the night runs are each sent in with different words. Per-trunk pacing
  // is enforced properly by the reveal-seconds budget below.
  const perNode={start:130,descent:60,threshold:150};
  for(const [index,id] of ['start','descent','threshold'].entries()){
    const count=wordsOf(spine[index].filter((line)=>!line.when));
    assert.ok(count<=perNode[id],`${id} carries ${count} unavoidable words (budget ${perNode[id]})`);
  }
  const words=wordsOf(ungated);
  assert.ok(words>=150&&words<=300,`mandatory booth route is 150–300 words (${words})`);
  assert.ok(gated.length>=8,'the register sends each trunk in with its own words');
  assert.ok(wordsOf(gated)>=100,'and there is real depth behind those gates');

  // The first press is a decision, never a button that says the only thing
  // there is to say. A `who:"me"` line ahead of the greeting would be offered
  // as a one-option picker (conversation.js, "YOU CHOOSE TO SPEAK").
  const board=authored.nodes.start.choices.findIndex((c)=>c.when&&c.when.startsWith('!cold.trunk'));
  assert.ok(board>=0,'the greeting is the first board');
  for(const line of authored.nodes.start.lines||[]){
    assert.notEqual(line.who,'me','nothing is said aloud before the trunk is chosen');
  }
});

// ── the greeting is the trunk ────────────────────────────────────────────────
//
// The first thing the recordist says decides which conversation he has, and it
// is the only thing that does. `prologueKnowledgeFrame` (src/main.js) reads one
// flag at the grey door; letting the topic board keep re-framing it meant the
// last thing you happened to click won, which is not a choice anybody made.
const TRUNKS=[
  {trunk:'cold.trunk.paper',frame:'prologue.knowledge.self',goto:'greet.order'},
  {trunk:'cold.trunk.last',frame:'prologue.knowledge.tape',goto:'greet.actually'},
  {trunk:'cold.trunk.night',frame:'prologue.knowledge.guard',goto:'greet.somebody'},
];
const NO_TRUNK='!cold.trunk.paper && !cold.trunk.last && !cold.trunk.night';

test('the booth greeting picks one of three trunks, and only the greeting can', () => {
  const authored=JSON.parse(readFileSync('content/narrative/conservatory.cold_open_dialogue.story.json','utf8'));
  for(const entry of ['start','replay-condensed']){
    const choices=authored.nodes[entry].choices||[];
    for(const {trunk,frame,goto} of TRUNKS){
      const greeting=choices.find((c)=>(c.mutations?.set||[]).includes(trunk));
      assert.ok(greeting,`${entry} offers the ${trunk} greeting`);
      assert.equal(greeting.goto,goto);
      assert.equal(greeting.when,NO_TRUNK,'a trunk is chosen once, before any of them is set');
      assert.ok((greeting.mutations.set||[]).includes(frame),`${trunk} carries its framing`);
      for(const other of TRUNKS.filter((t)=>t.trunk!==trunk)){
        assert.ok((greeting.mutations.clear||[]).includes(other.trunk),`${trunk} clears ${other.trunk}`);
        assert.ok((greeting.mutations.clear||[]).includes(other.frame),`${trunk} clears ${other.frame}`);
      }
    }
    // Every topic on the board belongs to a trunk, or it is a way out.
    for(const c of choices){
      if(c.when===NO_TRUNK) continue;
      assert.ok(c.when&&/cold\.trunk\./.test(c.when),`${entry}: "${c.text}" is gated to a trunk`);
    }
  }
  // Nothing downstream is allowed to re-frame the run.
  for(const [nodeId,node] of Object.entries(authored.nodes)){
    if(nodeId==='start'||nodeId==='replay-condensed') continue;
    for(const c of node.choices||[]){
      for(const flag of c.mutations?.set||[]){
        assert.ok(!flag.startsWith('prologue.knowledge.'),
          `${nodeId} must not re-frame the run (${flag}) — the greeting owns it`);
      }
    }
  }
});

// ── a pass through a trunk is about a minute ─────────────────────────────────
//
// Reveal is the clock, not word count: a voiced line runs at clean.length/13
// (sam-voice.js) and typed narration at CPS 38 (conversation.js), so the same
// sentence costs three times as much in the guard's mouth as in the recordist's
// head. That is why this budget is in seconds. Nothing advances by itself, so
// this is a floor on the run, not a prediction of it.
const VOICED=new Set(['me','guard','radio','recordist','surfer','client','sarah','unknown']);
const revealSeconds=(line)=>{
  const text=String(line.text||'');
  const voiced=line.voice!==false&&VOICED.has(line.who);
  return (voiced?text.length/13:text.length/38)+0.25;   // MIN_DWELL
};
const truthy=(expr,flags)=>String(expr).split('||').some((clause)=>clause.split('&&').every((atom)=>{
  const name=atom.trim();
  return name.startsWith('!')?!flags.has(name.slice(1).trim()):flags.has(name);
}));
const shown=(list,flags)=>(list||[]).filter((item)=>!item.when||truthy(item.when,flags));
const nodeSeconds=(nodes,id,flags)=>shown(nodes[id].lines,flags).reduce((sum,line)=>sum+revealSeconds(line),0);

test('every selected trunk can hear the complete fourth take', () => {
  const authored=JSON.parse(readFileSync('content/narrative/conservatory.cold_open_dialogue.story.json','utf8'));
  const nodes=authored.nodes;
  for(const entry of ['start','replay-condensed']){
    for(const {trunk} of TRUNKS){
      const flags=new Set([trunk]);
      const tapeChoice=shown(nodes[entry].choices,flags).find((choice)=>choice.goto==='tape');
      assert.ok(tapeChoice,`${entry} exposes the headphones in ${trunk}`);
      const slate=shown(nodes.tape.choices,flags).find((choice)=>choice.goto==='tape.slate');
      assert.ok(slate,`${trunk} can get past take three to the unslated file`);
      assert.ok(nodes['tape.slate'].choices.some((choice)=>choice.goto==='tape.run'),`${trunk} can play take four`);
      assert.ok(nodes['tape.run'].lines.length>=18,'the complete fourth-take recording survives');
      assert.deepEqual(nodes['tape.run'].choices.map((choice)=>choice.goto),['tape.run.again','tape.end','start']);
    }
  }
});

test('each trunk offers about a minute of its own before the keys change hands', () => {
  const authored=JSON.parse(readFileSync('content/narrative/conservatory.cold_open_dialogue.story.json','utf8'));
  const nodes=authored.nodes;
  const veins={'greet.order':'order.rooms','greet.actually':'guard.three','greet.somebody':'torch.say'};
  for(const {trunk,goto} of TRUNKS){
    const flags=new Set([trunk]);
    const vein=veins[goto];
    // A topic costs its own node plus one step down it — what a player spends
    // when they open a question and follow the obvious follow-up.
    const topicSeconds=(id)=>{
      const here=nodeSeconds(nodes,id,flags);
      const down=shown(nodes[id].choices,flags)
        .map((c)=>c.goto).filter((g)=>nodes[g]?.goto?.startsWith(id))
        .map((g)=>nodeSeconds(nodes,g,flags)).sort((a,b)=>a-b);
      return here+(down[0]||0);
    };
    const answer=Math.min(...shown(nodes[vein].choices,flags).map((c)=>nodeSeconds(nodes,c.goto,flags)));
    const board=shown(nodes.start.choices,flags)
      .filter((c)=>c.goto!=='descent'&&c.when!==NO_TRUNK)
      .map((c)=>topicSeconds(c.goto)).sort((a,b)=>a-b);
    assert.ok(board.length>=2,`${trunk} puts at least two topics on the glass`);
    const pass=nodeSeconds(nodes,goto,flags)+nodeSeconds(nodes,vein,flags)+answer+board[0]+board[1];
    assert.ok(pass<=60,`${trunk}: greeting, vein and two topics run ${pass.toFixed(0)}s (budget 60s)`);
  }
});
