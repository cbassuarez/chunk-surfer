import { createEncounterSequence, ENCOUNTER_PHASES } from './sequence.js';
import { drawWorld } from './world.js';
import { uiInit } from '../../render/ui.js';
import { drawHardwareCap, setHardwareReducedMotion } from '../../render/hardware-material.js';
import { drawPatchSocket, drawPatchCable, PATCH_COLORS } from '../../render/patchbay-material.js';
import { BATTLE_GEAR, normalizeCombatLoadout, assignCombatGearSlot } from '../../game/combat-loadout.js';
import { normalizeCombatBuild, TECHNIQUE_DEFS, techniqueAvailability, pullCombatTechnique } from '../../game/combat-progression.js';
import { skillPatchSource, connectSkillPatch } from '../../game/skill-patchbay.js';
import { createCombatState, availableCombatTools, combatMovesForTool, currentCombatIntent, reduceCombat, advanceEnemy } from '../../game/combat-state.js';
import { authoredCombatProfile } from '../../data/combat-definitions.js';

const $ = id => document.getElementById(id);
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const ICONS = {
  light: '<path d="M11 21h29v18H11zM40 21l17-10v38L40 39M15 26h21M15 30h21M15 34h21M59 15l11-5M60 29h13M59 43l11 5"/><path d="M24 18h8v3"/>',
  recorder: '<rect x="7" y="9" width="59" height="42" rx="2"/><rect x="13" y="15" width="47" height="23"/><circle cx="25" cy="27" r="7"/><circle cx="49" cy="27" r="7"/><path d="M25 34h24M20 43h6m6 0h6m6 0h6m6 0h5"/>',
  interface: '<rect x="12" y="15" width="51" height="29" rx="2"/><circle cx="24" cy="28" r="5"/><circle cx="50" cy="28" r="5"/><path d="M24 33v13c0 13 26 13 26-7v-6M33 20h8m-8 5h8"/>',
  'tuning-fork': '<path d="M25 8v21c0 12 22 12 22 0V8M30 8v21c0 5 12 5 12 0V8M36 38v17M33 55h6"/>',
  radio: '<rect x="19" y="14" width="39" height="39" rx="2"/><path d="M27 14L22 2M25 20h27v8H25zM25 35h27m-27 4h27m-27 4h27m-27 4h27"/><circle cx="51" cy="10" r="2"/>',
  coffee: '<path d="M18 20h32l-3 31H21zM50 24h8c10 0 8 19-10 19M17 17h34M23 11c8-7-4-7 3-13M38 12c8-7-4-7 3-13"/>',
  badge: '<rect x="19" y="15" width="37" height="39" rx="2"/><path d="M30 15V6h14v9M25 43h25m-25 5h20"/><circle cx="38" cy="29" r="7"/>',
  self: '<path d="M22 52V29c0-5 6-5 6 0v8-21c0-5 6-5 6 0v18-23c0-5 6-5 6 0v23-18c0-5 6-5 6 0v23l5-7c4-5 9-2 7 3L48 53z"/>',
};
const icon = id => `<svg viewBox="0 0 76 60" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id] || ICONS.self}</svg>`;
const GEAR = {
  light: { category:'TORCH / BATTERY POWERED', detail:'Break concealment. Leave exposed residue for your next playback.', moves:['EXPOSE', 'WHITEOUT'], short:'BREAK CONCEALMENT', stamp:'3 CELL' },
  recorder: { category:'RECORDER / TAPE TRANSPORT', detail:'Capture a broadcast, then play the recorded take back at the adversary.', moves:['MONITOR', 'PLAYBACK'], short:'CAPTURE / RETURN', stamp:'A-1000' },
  interface: { category:'BENT RIG / SIGNAL ROUTING', detail:'Invert a loop with a loaded take. Rig skills need this unit connected.', moves:['INVERT'], short:'REVERSE A LOOP', stamp:'MODIFIED' },
  'tuning-fork': { category:'TUNING FORK / PASSIVE TOOL', detail:'Read the next two enemy intents. Tuning costs no battery.', moves:['TUNE'], short:'READ TWO INTENTS', stamp:'440 Hz' },
  radio: { category:'RADIO / VOICE DECOY', detail:'Throw a voice to interrupt a broadcast and set a guard. Once per encounter.', moves:['THROW VOICE'], short:'DISTRACT / GUARD', stamp:'FM / AM' },
  coffee: { category:'COFFEE / SINGLE USE', detail:'Recover composure. One cup, one use. Occupies a quick-access slot.', moves:['SIP'], short:'RESTORE COMPOSURE', stamp:'250 mL' },
  badge: { category:'FILM BADGE / PERSONAL EFFECT', detail:'Your festival pass. It takes up a slot and offers no combat action.', moves:['NO COMBAT ACTION'], short:'PERSONAL EFFECT', stamp:'ADMIT 01' },
};
const TOOL_TO_GEAR = Object.fromEntries(Object.entries(BATTLE_GEAR).map(([id, d]) => [d.toolId, id]));
const BRANCHES = [['torch','TORCH'],['recorder','RECORDER'],['rig','BENT RIG'],['nerve','NERVE'],['fork','FORK'],['radio','RADIO']];
const definition = { id:'natatorium', enemy:'THE FOURTH RETURN', baseComposure:40, ...authoredCombatProfile('natatorium') };
let sequence, phase = '', page = 'equipment', selectedSlot = 0, selectedSkill = 'torch.afterimage';
let loadout, build, combat = null, selectedTool = 'recorder', reviewHold = false, reduced = false;
let resolveAge = 0, resolving = false, lastMove = null, history = [], totalTime = 0;
let soundEnabled = true, audio = null, master = null, hum = null;
const activeSources = new Set();

function reset({ preview = null } = {}) {
  stopSounds();
  sequence = createEncounterSequence({ dialogue: $('dialogue-option').checked });
  loadout = normalizeCombatLoadout({ top:['light','recorder','interface','tuning-fork'] });
  build = normalizeCombatBuild({ tutorialGrant:{schema:1,combatAssistance:'guided'}, rewardedEncounters:['recording-2','pre-recording-4'], techniques:['torch.afterimage','recorder.punch-in'] });
  combat = null; phase = ''; selectedSlot = 0; selectedSkill = 'torch.afterimage'; selectedTool = 'recorder';
  resolving = false; resolveAge = 0; lastMove = null; totalTime = 0; history = [];
  reviewHold = preview === 'versus'; document.body.classList.toggle('review-hold', reviewHold);
  if (preview) sequence.preview(preview === 'skills' ? 'equipment' : preview);
  page = preview === 'skills' ? 'skills' : 'equipment';
  renderEquipment(); renderSkills(); selectPage(page, false);
  if (preview === 'fight') startCombat();
  updatePhase();
}

function startCombat() {
  const ids = loadout.top.map(id => BATTLE_GEAR[id].toolId);
  combat = createCombatState(definition, { battery:.84, seed:440, techniques:build.techniques,
    tools:Object.fromEntries([...Object.values(BATTLE_GEAR).map(gear => [gear.toolId, ids.includes(gear.toolId)]), ['order', ids]]) });
  const options = availableCombatTools(combat);
  if (!options.some(tool => tool.id === selectedTool)) selectedTool = options[0].id;
}

function updatePhase() {
  const state = sequence.snapshot();
  if (state.phase === phase) return;
  phase = state.phase; history.push(phase); document.body.dataset.phase = phase;
  $('module').hidden = phase !== 'equipment'; $('dialogue').hidden = phase !== 'dialogue'; $('result').hidden = phase !== 'result';
  const index = ENCOUNTER_PHASES.findIndex(p => p.id === phase);
  $('sequence-position').textContent = `${String(index+1).padStart(2,'0')} / ${phase.toUpperCase()}`;
  $('sequence-track').innerHTML = ENCOUNTER_PHASES.map((_,i) => `<i class="${i<=index?'done':''}"></i>`).join('');
  document.querySelectorAll('[data-preview]').forEach(el => el.classList.toggle('current', el.dataset.preview === (reviewHold ? 'versus' : phase === 'equipment' ? page : phase === 'fight' ? 'fight' : 'exploration')));
  if (phase === 'called') { stopSounds(); cue('cut'); }
  if (phase === 'intrusion') cue('impact');
  if (phase === 'reveal') cue('wipe');
  if (phase === 'equipment') {
    cue('latch'); renderEquipment(); renderSkills();
    $('ready').disabled = false; $('ready').focus({preventScroll:true});
  }
  if (phase === 'dialogue') $('dialogue-next').focus({preventScroll:true});
  if (phase === 'arming') { startCombat(); cue('latch'); }
  if (phase === 'fight') { if (!combat) startCombat(); cue('turn'); }
  if (phase === 'result') {
    $('result-title').textContent = combat?.result === 'win' ? 'SIGNAL CLEARED' : 'COMPOSURE LOST';
    $('result-detail').textContent = combat?.result === 'win' ? 'The room is quiet. Your equipment choices and patched skills carried through the encounter.' : 'The encounter has ended. Replay to try another equipment and skill combination.';
    $('result-replay').focus({preventScroll:true});
  }
  renderBattle(); paintAllCaps();
}

function confirm(event = {}) {
  if (event.repeat || reviewHold) return;
  const before = sequence.snapshot().phase;
  if (before === 'exploration') ensureAudio();
  sequence.confirm({repeat:event.repeat}); updatePhase();
}

function selectPage(next, focus = true) {
  page = next;
  for (const id of ['equipment','skills']) {
    $(id+'-page').hidden = page !== id; $(id+'-tab').setAttribute('aria-selected',String(page===id));
    $(id+'-tab').tabIndex = page === id ? 0 : -1;
  }
  if (phase === 'equipment') document.querySelectorAll('[data-preview]').forEach(el => el.classList.toggle('current',el.dataset.preview===page));
  $('module-hint').textContent = page === 'equipment' ? 'Select a slot, then an item from the case.' : 'Patch skills with spare leads. Pulling a lead returns it.';
  if (focus) $(page+'-tab').focus({preventScroll:true});
  requestAnimationFrame(() => { paintAllCaps(); paintPatchbay(); });
}

function describeGear(id) {
  const info = GEAR[id], gear = BATTLE_GEAR[id];
  if (!info || !gear) return;
  $('tool-category').textContent = info.category; $('tool-title').textContent = gear.label;
  $('tool-description').textContent = info.detail;
  const at = loadout.top.indexOf(id); $('tool-state').textContent = at >= 0 ? `SLOT 0${at+1}` : 'IN THE CASE';
  $('tool-moves').innerHTML = info.moves.filter(move => move !== 'WHITEOUT' || build.techniques.includes('torch.whiteout')).map(move => `<span>${move}</span>`).join('');
}

function renderEquipment() {
  $('equipment-slots').innerHTML = loadout.top.map((id,i) => `<button class="equipment-slot" data-slot="${i}" aria-label="Slot ${i+1}: ${BATTLE_GEAR[id].label}" aria-pressed="${selectedSlot===i}"><span class="slot-top"><b>0${i+1}</b><span>CONNECTED <i></i></span></span>${icon(id)}<span class="slot-stamp">${GEAR[id].stamp}</span><span class="slot-name">${BATTLE_GEAR[id].label}</span><span class="slot-move">${GEAR[id].short}</span></button>`).join('');
  $('reserve-tools').innerHTML = Object.keys(BATTLE_GEAR).filter(id => !loadout.top.includes(id)).map(id => `<button class="reserve-tool" data-gear="${id}" aria-label="Fit ${BATTLE_GEAR[id].label} in slot ${selectedSlot+1}">${icon(id)}<span>${BATTLE_GEAR[id].label}</span></button>`).join('');
  describeGear(loadout.top[selectedSlot]);
}
$('equipment-slots').addEventListener('click', event => {
  const button = event.target.closest('[data-slot]'); if (!button || phase !== 'equipment') return;
  selectedSlot = Number(button.dataset.slot); renderEquipment(); cue('click');
  $('equipment-slots').querySelector(`[data-slot="${selectedSlot}"]`).focus({preventScroll:true});
  $('module-status').textContent = `SLOT 0${selectedSlot+1} SELECTED`;
  $('module-hint').textContent = 'Select an item from the case to replace this tool.';
});
$('reserve-tools').addEventListener('click', event => {
  const button = event.target.closest('[data-gear]'); if (!button || phase !== 'equipment') return;
  const result = assignCombatGearSlot(loadout,button.dataset.gear,selectedSlot);
  if (result.changed) {
    loadout = result.loadout; renderEquipment(); renderSkills(); renderBattle(); cue('latch');
    $('module-status').textContent = `${BATTLE_GEAR[button.dataset.gear].label} / SLOT 0${selectedSlot+1}`;
    $('module-hint').textContent = 'Equipment fitted. The previous tool is back in the case.';
    $('equipment-slots').querySelector(`[data-slot="${selectedSlot}"]`).focus({preventScroll:true});
  }
});
$('reserve-tools').addEventListener('pointerover', e => { const target=e.target.closest('[data-gear]'); if(target) describeGear(target.dataset.gear); });
$('reserve-tools').addEventListener('focusin', e => { const target=e.target.closest('[data-gear]'); if(target) describeGear(target.dataset.gear); });
$('reserve-tools').addEventListener('pointerleave', () => describeGear(loadout.top[selectedSlot]));

function skillStatus(id) { return techniqueAvailability(build,id,{hasRig:loadout.top.includes('interface')}); }
function renderSkills() {
  const scroll = $('patchbay').scrollTop;
  $('leads-count').textContent = `${build.unspent} SPARE`;
  $('patched-count').textContent = `${build.techniques.length} PATCHED / SCROLL FOR HIGHER TIERS`;
  $('skill-columns').innerHTML = BRANCHES.map(([branch,label]) => `<div class="skill-column" data-branch="${branch}" style="--branch:${PATCH_COLORS[branch]}"><div class="branch-label">${label}</div><i class="branch-supply" data-source="supply:${branch}"></i>${TECHNIQUE_DEFS.filter(s => s.branch === branch).map(skill => {
    const status = skillStatus(skill.id);
    return `<button class="skill-socket" data-skill="${skill.id}" data-selected="${selectedSkill===skill.id}" data-patched="${status.patched}" data-available="${status.enabled}" aria-label="${esc(skill.label)}, ${status.patched?'patched':status.enabled?'available':status.reason}" aria-pressed="${selectedSkill===skill.id}">${esc(skill.label)}<i class="skill-input"></i><em>${status.patched?'PATCHED':skill.special?'SPECIAL':skill.requires?'SERIES':'DIRECT'}</em></button>`;
  }).join('')}</div>`).join('');
  $('patchbay').scrollTop = scroll; describeSkill(); requestAnimationFrame(paintPatchbay);
}
function describeSkill() {
  const skill = TECHNIQUE_DEFS.find(s => s.id === selectedSkill), status = skillStatus(selectedSkill);
  $('skill-category').textContent = `${BRANCHES.find(([b]) => b === skill.branch)[1]} / ${skill.special?'SPECIAL':'PASSIVE'}`;
  $('skill-title').textContent = skill.label; $('skill-detail').textContent = skill.detail.replace(/^SPECIAL — /,'');
  $('patch-action').disabled = !status.patched && !status.enabled;
  $('patch-action').querySelector('span').textContent = status.patched ? 'PULL LEAD' : status.enabled ? 'PATCH LEAD' : status.reason;
  $('patch-action').dataset.color = status.patched ? 'amber' : 'green';
  paintAllCaps();
}
$('skill-columns').addEventListener('click', e => {
  const target = e.target.closest('[data-skill]'); if (!target || phase !== 'equipment') return;
  selectedSkill = target.dataset.skill; renderSkills();
  const replacement = $('skill-columns').querySelector(`[data-skill="${selectedSkill}"]`);
  replacement?.focus({preventScroll:true}); cue('click');
});
$('patch-action').addEventListener('click', () => {
  if (phase !== 'equipment') return;
  const status = skillStatus(selectedSkill);
  const result = status.patched ? pullCombatTechnique(build,selectedSkill) : connectSkillPatch(build,skillPatchSource(selectedSkill),selectedSkill,{hasRig:loadout.top.includes('interface')});
  if (!result.changed) return;
  build = result.build; renderSkills(); describeGear(loadout.top[selectedSlot]); cue('latch');
  $('module-status').textContent = status.patched ? `${result.returned} LEAD${result.returned===1?'':'S'} RETURNED` : 'SKILL PATCHED';
  $('module-hint').textContent = status.patched && result.pulled.length>1 ? 'Dependent skills were disconnected with their supply.' : 'Skills take effect when you press READY.';
});

function paintPatchbay() {
  if ($('skills-page').hidden || $('module').hidden) return;
  const rack = $('patchbay'), cvs = $('patch-cables'), columns = $('skill-columns');
  const w = rack.clientWidth, h = Math.max(rack.clientHeight,columns.offsetHeight), dpr = window.devicePixelRatio || 1;
  cvs.width = Math.round(w*dpr); cvs.height = Math.round(h*dpr); cvs.style.width = `${w}px`; cvs.style.height = `${h}px`;
  const ctx = cvs.getContext('2d'); ctx.scale(dpr,dpr);
  const bounds = rack.getBoundingClientRect();
  const point = el => { const r=el.getBoundingClientRect();return {x:r.left-bounds.left+r.width/2-1,y:r.top-bounds.top+r.height/2-1+rack.scrollTop}; };
  const inputs = new Map(), outputs = new Map();
  for (const [branch] of BRANCHES) {
    const p = point(rack.querySelector(`[data-source="supply:${branch}"]`)); outputs.set(`supply:${branch}`,p);
    drawPatchSocket(ctx,p.x,p.y,5,{color:PATCH_COLORS[branch],dpr:1});
  }
  for (const skill of TECHNIQUE_DEFS) {
    const button = rack.querySelector(`[data-skill="${skill.id}"]`); const p = point(button.querySelector('.skill-input'));
    const out = {x:p.x+25,y:p.y}; inputs.set(skill.id,p); outputs.set(`output:skill:${skill.id}`,out);
    drawPatchSocket(ctx,p.x,p.y,4.6,{color:PATCH_COLORS[skill.branch],connected:build.techniques.includes(skill.id),selected:selectedSkill===skill.id,dpr:1});
    if (TECHNIQUE_DEFS.some(s => s.requires===skill.id)) drawPatchSocket(ctx,out.x,out.y,3.7,{color:PATCH_COLORS[skill.branch],dpr:1});
  }
  for (const id of build.techniques) {
    const def=TECHNIQUE_DEFS.find(s=>s.id===id); const from=outputs.get(skillPatchSource(id).id), to=inputs.get(id);
    if(from&&to) drawPatchCable(ctx,from,to,{color:PATCH_COLORS[def.branch],radius:3,dpr:1,sag:10,side:1});
  }
}

function previewCombat() {
  if (combat) return combat;
  const order=loadout.top.map(id=>BATTLE_GEAR[id].toolId);
  return createCombatState(definition,{battery:.84,techniques:build.techniques,tools:{...Object.fromEntries(Object.values(BATTLE_GEAR).map(g=>[g.toolId,order.includes(g.toolId)])),order}});
}
function renderBattle() {
  const state = previewCombat(), active = sequence.snapshot().canAct && !resolving;
  const tools = availableCombatTools(state);
  if (!tools.some(t=>t.id===selectedTool)) selectedTool=tools[0].id;
  $('composure-number').textContent = `${state.composure} / ${state.maxComposure}`;
  $('coherence-number').textContent = `${state.movementCoherence} / ${state.movementMaxCoherence}`;
  $('composure-bar').style.width = `${state.composure/state.maxComposure*100}%`;
  $('coherence-bar').style.width = `${state.movementCoherence/state.movementMaxCoherence*100}%`;
  $('cycle-label').textContent = `${['I','II','III'][state.movementIndex]} / III`;
  $('round-label').textContent = ['fight','result'].includes(phase) ? `CYCLE ${state.movementIndex+1} / 3` : 'PREPARATION';
  $('phase-label').textContent = phase === 'fight' ? resolving ? 'RESOLVING' : 'YOUR TURN' : phase === 'result' ? 'ENCOUNTER OVER' : 'TURNS PAUSED';
  const intent = currentCombatIntent(state);
  $('intent-name').textContent = (intent?.kind || 'CLEARED').toUpperCase();
  $('intent-detail').textContent = intent?.label?.toLowerCase().replace(/^./,s=>s.toUpperCase()) || 'The return has stopped.';
  $('turn-status').textContent = phase === 'fight' ? resolving ? 'ENEMY TURN' : 'YOUR TURN / CHOOSE A MOVE' : 'BATTLE CONTROLS / LOCKED';
  $('take-status').textContent = `TAKE — ${state.take ? 'LOADED' : 'EMPTY'}`;
  $('charge-status').textContent = `CHARGE ${state.charge} / ${state.maxCharge}`;
  $('tool-rail').innerHTML = tools.map((tool,i)=>`<button data-tool="${tool.id}" class="${selectedTool===tool.id?'selected':''}" aria-pressed="${selectedTool===tool.id}" ${!active?'disabled':''} aria-label="${tool.label}">${icon(TOOL_TO_GEAR[tool.id]||'self')}<span>${tool.id==='self'?'SELF':tool.id==='torch'?'TORCH':tool.id==='recorder'?'RECORDER':tool.id==='fork'?'FORK':tool.label}</span></button>`).join('');
  const moves = combatMovesForTool(state,selectedTool);
  $('move-buttons').innerHTML = moves.map((move,i)=>`<button class="hardware" data-color="${move.special?'red':selectedTool==='recorder'?'green':'amber'}" data-move="${move.id}" ${!active||!move.enabled?'disabled':''} title="${esc(move.enabled?move.description||move.label:move.reason)}"><span>${esc(move.label)}</span><small>${esc(!move.enabled?move.reason:move.charge?`${move.charge} CHARGE`:move.id==='monitor'?'CAPTURE BROADCAST':move.id==='playback'?'SPEND LOADED TAKE':move.id==='expose'?'BREAK CONCEALMENT':move.id==='hold'?'BRACE / PREVENT DAMAGE':'')}</small><kbd>${i+1}</kbd></button>`).join('');
  if (!combat) $('combat-notice').textContent = 'Prepare your equipment. No turns pass until you are ready.';
  else if (!resolving && !lastMove) $('combat-notice').textContent = 'Read the enemy intent. Choose a tool, then a move.';
  paintAllCaps();
}
$('tool-rail').addEventListener('click',e=>{const b=e.target.closest('[data-tool]');if(!b||!sequence.snapshot().canAct||resolving)return;selectedTool=b.dataset.tool;renderBattle();cue('click');$('tool-rail').querySelector(`[data-tool="${selectedTool}"]`)?.focus({preventScroll:true});});
$('move-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-move]');if(b)act(b.dataset.move);});
function act(id) {
  if (!sequence.snapshot().canAct || resolving || !combat || combat.result) return;
  const move = combatMovesForTool(combat,selectedTool).find(m=>m.id===id);
  if (!move?.enabled) return;
  combat = reduceCombat(combat,{type:id}); lastMove = move; resolving = true; resolveAge = 0;
  $('combat-notice').textContent = `${move.label} — ${combat.last?.notice || 'Move committed.'}`;
  cue('move'); renderBattle();
}
function advanceResolution(dt) {
  if (!resolving || !sequence.snapshot().canAct) return;
  resolveAge += dt;
  if (resolveAge >= .84 && combat.phase === 'enemy') {
    combat = advanceEnemy(combat); cue('enemy'); renderBattle();
    $('combat-notice').textContent = combat.last?.notice || `${lastMove.label} resolved. ${combat.last?.received||0} composure lost.`;
  }
  if (resolveAge >= 1.3) {
    resolving = false; renderBattle();
    if (combat.result) { sequence.finish();updatePhase(); }
  }
}

const observedCaps = new Set();
const capObserver = new ResizeObserver(entries=>{for(const {target} of entries)paintCap(target);});
function paintCap(button, travel = 0) {
  if (!button.isConnected || button.offsetWidth === 0) return;
  let canvas = button.querySelector('canvas');
  if (!canvas) { canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');button.prepend(canvas); }
  const dpr = window.devicePixelRatio || 1,w=button.clientWidth,h=button.clientHeight;
  canvas.width = Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  drawHardwareCap(canvas.getContext('2d'),0,0,canvas.width,canvas.height,{color:button.dataset.color||'amber',dpr,travel,enabled:!button.disabled,focused:document.activeElement===button,finish:'lens',lampHeat:0});
}
function paintAllCaps() {
  for (const button of observedCaps) if (!button.isConnected) { capObserver.unobserve(button); observedCaps.delete(button); }
  for (const button of document.querySelectorAll('.hardware')) {
    if (!observedCaps.has(button)) {observedCaps.add(button);capObserver.observe(button);}
    paintCap(button);
  }
}
document.addEventListener('pointerdown',e=>{const b=e.target.closest('.hardware');if(b&&!b.disabled)paintCap(b,1);});
document.addEventListener('pointerup',()=>paintAllCaps());
document.addEventListener('pointercancel',()=>paintAllCaps());
document.addEventListener('focusin',()=>paintAllCaps());

function ensureAudio() {
  if (!soundEnabled) return;
  audio ||= new (window.AudioContext || window.webkitAudioContext)();
  master ||= audio.createGain(); master.gain.value=.62; master.connect(audio.destination);
  audio.resume().catch(()=>{});
}
function stopSounds() { for(const source of activeSources)try{source.stop();}catch{} activeSources.clear();hum=null; }
function cue(kind) {
  if (!soundEnabled || !audio || audio.state !== 'running' || sequence?.snapshot().paused) return;
  const now=audio.currentTime;
  const tone=(hz,end,duration,gain,type='sine',delay=0)=>{
    const source=audio.createOscillator(),g=audio.createGain();source.type=type;source.frequency.setValueAtTime(hz,now+delay);source.frequency.exponentialRampToValueAtTime(Math.max(10,end),now+delay+duration);
    g.gain.setValueAtTime(0,now+delay);g.gain.linearRampToValueAtTime(gain,now+delay+.005);g.gain.exponentialRampToValueAtTime(.0001,now+delay+duration);
    source.connect(g).connect(master);source.start(now+delay);source.stop(now+delay+duration+.02);activeSources.add(source);source.onended=()=>{activeSources.delete(source);source.disconnect();g.disconnect();};
  };
  if(kind==='impact'){tone(115,33,.65,.10,'triangle');tone(167,51,.23,.035,'sawtooth');tone(49,45,.95,.055);}
  else if(kind==='wipe'){tone(80,190,.18,.017,'triangle');tone(140,46,.34,.018,'triangle',.35);}
  else if(kind==='cut'){tone(650,90,.075,.018,'triangle');}
  else if(kind==='latch'){tone(290,70,.06,.035,'triangle');tone(210,80,.08,.022,'triangle',.07);}
  else if(kind==='turn'){tone(320,315,.18,.014);}
  else if(kind==='move'){tone(110,240,.19,.025,'triangle');}
  else if(kind==='enemy'){tone(65,38,.30,.035,'triangle');}
  else tone(480,130,.033,.015,'triangle');
}
$('sound-option').textContent='SOUND ON';$('sound-option').setAttribute('aria-pressed','true');
$('sound-option').addEventListener('click',()=>{soundEnabled=!soundEnabled;$('sound-option').textContent=soundEnabled?'SOUND ON':'SOUND OFF';$('sound-option').setAttribute('aria-pressed',String(soundEnabled));if(soundEnabled){ensureAudio();cue('click');}else stopSounds();});
$('approach').addEventListener('click',confirm);$('dialogue-next').addEventListener('click',confirm);$('ready').addEventListener('click',confirm);
$('equipment-tab').addEventListener('click',()=>selectPage('equipment'));$('skills-tab').addEventListener('click',()=>selectPage('skills'));
for(const el of document.querySelectorAll('[data-preview]'))el.addEventListener('click',()=>reset({preview:el.dataset.preview==='exploration'?null:el.dataset.preview}));
for(const id of ['replay','result-replay'])$(id).addEventListener('click',()=>{reset();ensureAudio();confirm();});
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');$('motion-option').checked=motionQuery.matches;
function setMotion(){reduced=$('motion-option').checked;document.body.classList.toggle('reduced',reduced);setHardwareReducedMotion(reduced);}
$('motion-option').addEventListener('change',setMotion);setMotion();

document.addEventListener('keydown',event=>{
  if(event.repeat){if(event.target.closest('#game'))event.preventDefault();return;}
  if(event.key==='Escape' && phase!=='exploration') {const paused=!sequence.snapshot().paused;sequence.pause(paused);$('paused').hidden=!paused;stopSounds();event.preventDefault();return;}
  if(sequence.snapshot().paused)return;
  // Native focused controls keep their own Enter/Space semantics. A held key
  // from exploration never skips the scare, dialogue, or READY gate.
  if(event.key==='Enter' && !event.target.closest('button,input')){event.preventDefault();confirm(event);return;}
  if(event.target.closest('.review-bar'))return;
  if(phase==='equipment'){
    if(event.key==='1'||event.key==='2'){selectPage(event.key==='1'?'equipment':'skills');event.preventDefault();}
    if(event.target.closest('[role=tab]')&&['ArrowLeft','ArrowRight'].includes(event.key)){selectPage(page==='equipment'?'skills':'equipment');event.preventDefault();}
  }else if(phase==='fight'&&!resolving){
    if(/^[1-9]$/.test(event.key)){const moves=combatMovesForTool(combat,selectedTool);const move=moves[Number(event.key)-1];if(move)act(move.id);event.preventDefault();}
    if(event.key.toLowerCase()==='q'||event.key.toLowerCase()==='e'){
      const tools=availableCombatTools(combat),at=tools.findIndex(t=>t.id===selectedTool),direction=event.key.toLowerCase()==='q'?-1:1;
      selectedTool=tools[(at+direction+tools.length)%tools.length].id;renderBattle();event.preventDefault();
    }
  }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){sequence.pause(true);$('paused').hidden=false;stopSounds();}});
window.addEventListener('focus',()=>{if(!document.hidden&&sequence.snapshot().paused){sequence.pause(false);$('paused').hidden=true;}});
window.addEventListener('resize',()=>{paintAllCaps();requestAnimationFrame(paintPatchbay);});
uiInit($('world'));reset();
let last=performance.now();
function frame(now){
  const dt=Math.min(.08,Math.max(0,(now-last)/1000));last=now;
  if(!reviewHold)sequence.tick(dt);
  if(!sequence.snapshot().paused)totalTime+=dt;
  updatePhase();advanceResolution(dt);
  drawWorld({ ...sequence.snapshot(), now:totalTime, reduced, reviewHold, combat, selectedTool, resolving, resolveAge });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__encounterLab=Object.freeze({
  snapshot:()=>({sequence:sequence.snapshot(),history:[...history],page,loadout:structuredClone(loadout),build:structuredClone(build),combat:combat?structuredClone(combat):null,resolving,selectedTool,reduced,reviewHold}),
});
