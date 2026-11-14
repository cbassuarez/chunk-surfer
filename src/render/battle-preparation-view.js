import { battlePreparationStyle } from './battle-preparation-style.js';
import {itemPortraitMarkup as icon,preloadItemPortraits} from './item-portraits.js';
import { drawHardwareCap } from './hardware-material.js';
import { drawPatchSocket, drawPatchSupply, drawPatchCable, patchSupplyAnchor, PATCH_COLORS } from './patchbay-material.js';
import { sampleControl } from '../game/control-mechanics.js';
import { BATTLE_GEAR, COMBAT_TOP_CAPACITY, combatBranchGear, isBattleGear } from '../game/combat-loadout.js';
import { carryItemDefinition, isCarryItem } from '../game/carry-items.js';
import { TECHNIQUE_DEFS, techniqueAvailability } from '../game/combat-progression.js';
import { TECHNIQUE } from '../game/combat-state.js';
import { skillPatchSource } from '../game/skill-patchbay.js';
import { uiCurrentScale } from './ui.js';
import { drawElectronicText } from './electronic-text.js';
import {battleOperatingCopy} from '../game/combat-operating-facts.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BRANCHES=[['torch','TORCH'],['recorder','RECORDER'],['rig','SERVICE INTERFACE'],['nerve','NERVE'],['fork','FORK'],['radio','RADIO']];
// AN ITEM WEARS THE COLOUR OF THE SKILL BRANCH IT FEEDS.
//
// The SKILLS tab colours every socket ring with PATCH_COLORS[branch], and a
// tool's branch IS its toolId — so the torch in quick slot one and the TORCH
// column are the same amber without either side naming the other. Derived here
// rather than authored a second time, because a second table is a second table
// to keep in step.
//
// COFFEE AND THE FILM BADGE COME BACK EMPTY, and that is the honest answer
// rather than a gap: they are the two items in the case with no branch behind
// them, nothing to patch and no column to point at. They keep the neutral edge,
// which is a fact about them and not a missing colour.
const gearBranchColor=(id)=>PATCH_COLORS[BATTLE_GEAR[id]?.toolId]||'';
const branchStyle=(id)=>{const c=gearBranchColor(id);return c?` style="--branch:${c}"`:'';};
const cap=(command,label,color='white',extra='')=>`<button class="hardware" data-command="${esc(command)}" data-color="${color}" ${extra}><span>${esc(label)}</span></button>`;

function preparationSkillToolStatus(skill,{available,loadout},facts,battery){
  if(skill.id===TECHNIQUE.HEADROOM)return '';
  const gear=combatBranchGear(skill.branch);
  if(!gear)return '';
  if(!available.includes(gear.id))return `${gear.label.toUpperCase()} NOT CARRIED`;
  if(!loadout.top.includes(gear.id))return `${gear.label.toUpperCase()} STOWED FOR BATTLE`;
  if(skill.id===TECHNIQUE.WHITEOUT){
    const remaining=facts?.battery??battery;
    const needed=facts?.costs?.whiteout?.battery;
    if(needed!=null && remaining+1e-9<needed)return 'TORCH BATTERY TOO LOW';
    if(needed==null && remaining<=0)return 'TORCH BATTERY EMPTY';
  }
  return '';
}

// Projection only: the saved/draft inventory remains the model's authority.
// A missing tool keeps its numbered place, but is never counted as in reach.
export function battlePreparationSlotPresentation(snapshot={}) {
  const top=Array.isArray(snapshot.loadout?.top)?snapshot.loadout.top:[],available=snapshot.available||[];
  const slots=Array.from({length:COMBAT_TOP_CAPACITY},(_,index)=>{
    const key=String(top[index]||'').trim().toLowerCase(),id=isCarryItem(key)?key:null;
    return {index,id,ready:!!id&&available.includes(id),reserved:!!id&&!available.includes(id),battleCapable:!!id&&isBattleGear(id)};
  });
  return {slots,assigned:slots.filter(slot=>slot.id).length,
    ready:slots.filter(slot=>slot.ready).length,reserved:slots.filter(slot=>slot.reserved).length,
    battleReady:slots.filter(slot=>slot.ready&&slot.battleCapable).length,retainedReady:slots.filter(slot=>slot.ready&&!slot.battleCapable).length};
}

// A reachable belonging has an honest place in the tray without borrowing a
// combat verb. The same statement is used by the rail and the detail panel.
export function battlePreparationItemCopy(id,facts=null) {
  const item=carryItemDefinition(id);
  if (!item || isBattleGear(id)) return battleOperatingCopy(id,facts);
  return {move:'NO BATTLE MOVE',detail:`${item.description} You can hold and inspect it. It adds no battle move.`};
}

// DOM values remain the accessible source of truth. Only their visible image
// is drawn by the LCD character ROM; this canvas never owns focus or input.
export function paintBattlePreparationReadout(readout, { window: win = globalThis.window } = {}) {
  if (!readout?.clientWidth || !readout.clientHeight || !win?.getComputedStyle) return false;
  let canvas = readout.querySelector('.readout-display');
  if (!canvas) {
    canvas = readout.ownerDocument.createElement('canvas');
    canvas.className = 'readout-display';
    canvas.setAttribute('aria-hidden', 'true');
    readout.appendChild(canvas);
  }
  const ctx = canvas.getContext?.('2d');
  if (!ctx) { delete readout.dataset.electronicPainted; return false; }
  const bounds = readout.getBoundingClientRect();
  // clientWidth is before CSS zoom, while bounds include the player's UI scale.
  const dpr = Math.max(1, win.devicePixelRatio || 1) * bounds.width / readout.offsetWidth;
  const width = Math.round(readout.clientWidth * dpr), height = Math.round(readout.clientHeight * dpr);
  const canvasBounds = canvas.getBoundingClientRect();
  const ratioX = width / canvasBounds.width, ratioY = height / canvasBounds.height;
  const rows = [...readout.querySelectorAll('[data-readout-text]')].map(node => {
    const rect = node.getBoundingClientRect(), style = win.getComputedStyle(node);
    return { text: node.textContent, x: (rect.left - canvasBounds.left) * ratioX,
      y: (rect.top - canvasBounds.top) * ratioY, width: rect.width * ratioX,
      fontSize: parseFloat(style.fontSize) * dpr, color: node.tagName === 'B' ? '#c1d39f' : '#8ba078' };
  });
  const key = JSON.stringify([width, height, rows]);
  if (canvas.dataset.paintKey === key) {
    readout.dataset.electronicPainted = 'true';
    return true;
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  for (const row of rows) drawElectronicText(ctx, row.text, row.x, row.y, {
    fontSize: row.fontSize, color: row.color, mode: 'lcd', baseline: 'top',
    maxWidth: row.width, dpr,
  });
  canvas.dataset.paintKey = key;
  readout.dataset.electronicPainted = 'true';
  return true;
}

export function createBattlePreparationView({ host = globalThis.document?.getElementById('map'), onActivate = () => {} } = {}) {
  if(!host||!globalThis.document)return null;
  preloadItemPortraits();
  const root=document.createElement('div');root.id='battle-preparation';root.dataset.noPointerLock='';
  const shadow=root.attachShadow({mode:'open'});host.appendChild(root);
  let current=null,focus='ready',disposed=false;
  function syncSize(){
    const scale=uiCurrentScale(),width=host.clientWidth/scale,height=host.clientHeight/scale;
    const changed=root.style.width!==`${width}px`||root.style.height!==`${height}px`||root.style.zoom!==String(scale);
    if(changed){root.style.zoom=String(scale);root.style.width=`${width}px`;root.style.height=`${height}px`;}
    return changed;
  }
  syncSize();
  const enabled=()=>[...shadow.querySelectorAll('[data-command]')].filter(b=>!b.disabled&&b.getClientRects().length);
  const focusButton=(command,scroll=true)=>{
    const button=shadow.querySelector(`[data-command="${CSS.escape(command)}"]`);if(!button||button.disabled)return;
    focus=command;button.focus({preventScroll:true});if(scroll)button.scrollIntoView({block:'nearest',inline:'nearest'});paint();
  };
  function paint(){
    if(disposed||root.hidden)return;
    const dpr=window.devicePixelRatio||1;
    for(const button of shadow.querySelectorAll('.hardware')){
      if(!button.clientWidth||!button.clientHeight)continue;
      let canvas=button.querySelector('canvas');if(!canvas){canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');button.prepend(canvas);}
      const w=Math.round(button.clientWidth*dpr),h=Math.round(button.clientHeight*dpr);
      if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
      const state=sampleControl(`battle-preparation:${button.dataset.command}`,{lit:false});
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);
      drawHardwareCap(ctx,0,0,w,h,{color:button.dataset.color,dpr,enabled:!button.disabled,focused:focus===button.dataset.command,travel:state.travel,lampHeat:0});
    }
    paintBattlePreparationReadout(shadow.querySelector('.readout'));
  }
  function cables(){
    if(!current||current.page!=='skills'||root.hidden)return;
    const rack=shadow.querySelector('.rack'),columns=shadow.querySelector('.columns'),canvas=shadow.querySelector('.cables');
    if(!rack?.clientWidth)return;
    const bounds=columns.getBoundingClientRect();
    const zoom=bounds.width/columns.offsetWidth||1;
    const dpr=(window.devicePixelRatio||1)*zoom;
    const w=rack.clientWidth,h=Math.max(rack.clientHeight,columns.offsetHeight);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';
    const ctx=canvas.getContext('2d');
    const point=(element)=>{
      const r=element.getBoundingClientRect();
      return {x:(r.left-bounds.left+r.width/2)*dpr/zoom,y:(r.top-bounds.top+r.height/2)*dpr/zoom};
    };
    const outputs=new Map(),inputs=new Map();
    const supplies=new Map();
    const installed=new Set(current.build.techniques);
    const selectedSource=skillPatchSource(current.selectedSkill);
    for(const [branch] of BRANCHES){
      const sourceId=`supply:${branch}`;
      const p=point(shadow.querySelector(`[data-source="${sourceId}"]`));
      outputs.set(sourceId,{...p,captive:true});
      supplies.set(sourceId,{...p,branch,count:0});
    }
    for(const skill of TECHNIQUE_DEFS){
      const row=shadow.querySelector(`[data-skill="${skill.id}"]`);
      const p=point(row.querySelector('.skill-input'));
      const color=PATCH_COLORS[skill.branch],connected=installed.has(skill.id);
      inputs.set(skill.id,p);
      drawPatchSocket(ctx,p.x,p.y,4.3*dpr,{color,dpr,connected,
        available:connected||row.dataset.available==='true',selected:current.selectedSkill===skill.id});
      if(connected){
        const outputId=`output:skill:${skill.id}`;
        const out={x:p.x+Math.min(row.clientWidth*.28,22)*dpr,y:p.y};
        outputs.set(outputId,out);
        drawPatchSocket(ctx,out.x,out.y,3.8*dpr,{color,dpr,selected:outputId===selectedSource?.id});
      }
    }
    for(const skill of TECHNIQUE_DEFS){
      if(!installed.has(skill.id))continue;
      const source=skillPatchSource(skill.id),from=outputs.get(source.id),to=inputs.get(skill.id);
      const supply=supplies.get(source.id);
      const feed=supply?patchSupplyAnchor(from,supply.count++,dpr):from;
      if(feed&&to)drawPatchCable(ctx,feed,to,{color:PATCH_COLORS[skill.branch],dpr,
        radius:3.5*dpr,sag:7*dpr,side:source.techniqueId?1:-1});
    }
    for(const [id,supply] of supplies)drawPatchSupply(ctx,supply.x,supply.y,4.7*dpr,{
      color:PATCH_COLORS[supply.branch],dpr,available:current.build.unspent>0,selected:id===selectedSource?.id,
    });
  }
  function render(snapshot,{title='',facts=null,battery=0,sheets=null,message='',keys=''}={}){
    current=snapshot;
    const scroll=shadow.querySelector('.rack')?.scrollTop||0,pageScroll=shadow.querySelector('.page')?.scrollTop||0;
    const {loadout,build,available,selectedSlot,selectedSkill,page,hasRig,editing=false,details=false}=snapshot;
    const slotPresentation=battlePreparationSlotPresentation(snapshot),selectedMissing=!!slotPresentation.slots[selectedSlot]?.reserved;
    const id=loadout.top[selectedSlot],gear=carryItemDefinition(id),copy=battlePreparationItemCopy(id,facts);
    const skill=TECHNIQUE_DEFS.find(t=>t.id===selectedSkill),status=techniqueAvailability(build,selectedSkill,{hasRig});
    const reserve=available.filter(id=>!loadout.top.includes(id));
    const incoming=snapshot.replacing?carryItemDefinition(snapshot.replacing):null;
    // THE CASE FLIPS TO THE QUESTION.
    //
    // Picking an item now fills the first empty slot on its own, so the case is
    // just the case — until there is no empty slot, and then the one thing that
    // could not be decided for the player is the only thing the panel shows.
    // Asked BY NAME: giving up the RADIO is the decision being made, where
    // "slot 3" is a different question they would have to translate first.
    const casePanel=incoming
      ? `<div class="reserve replacing"><div class="heading">SLOTS FULL<small>What does ${esc(incoming.label)} take the place of?</small></div><div class="items">${slotPresentation.slots.filter(slot=>slot.id).map(({id})=>`<button class="item"${branchStyle(id)} data-command="replace:${id}" aria-label="Put ${esc(incoming.label)} in place of ${esc(carryItemDefinition(id).label)}">${icon(id)}<span>${esc(carryItemDefinition(id).label)}</span></button>`).join('')}</div><button class="put-away" data-command="cancel-replace">KEEP WHAT I HAVE</button></div>`
      : `<div class="reserve"><div class="heading">IN THE CASE</div><div class="items">${reserve.map(id=>`<button class="item"${branchStyle(id)} data-command="equip:${id}" aria-label="Take out ${esc(carryItemDefinition(id).label)}">${icon(id)}<span>${esc(carryItemDefinition(id).label)}</span></button>`).join('')||'<div class="empty">No other carried objects.</div>'}</div></div>`;
    // SHEET MUSIC IS NOT A SLOT. It is the only thing in the case he uses on
    // himself, and he uses it here, before the turns start — so it sits apart
    // from the tools and never takes one of the four places. Shown only while
    // he carries one, like the bag.
    const sheetPanel=sheets?.carried
      ? `<div class="sheet" role="group" aria-label="Recovery before the fight"><div class="heading">SHEET MUSIC<small>${sheets.carried} carried · Read before the fight</small></div><div class="sheet-row"><p>${esc(sheets.top?`${sheets.top.composer} — ${sheets.top.title}.`:'The one on top.')} Restores composure. One use.</p><button class="put-away" data-command="read-sheet" ${sheets.reason?'disabled':''} aria-label="Read the sheet music${sheets.reason?`, ${esc(sheets.reason)}`:''}">${esc(sheets.reason||'READ IT')}</button></div></div>`
      : '';
    const equipment=`<div class="heading">WITHIN REACH · ${slotPresentation.ready}/${COMBAT_TOP_CAPACITY}<small>${slotPresentation.reserved?`${slotPresentation.reserved} RESERVED · NOT CARRIED`:slotPresentation.retainedReady?`${slotPresentation.battleReady} BATTLE TOOLS · ${slotPresentation.retainedReady} WITHOUT A BATTLE MOVE`:'Other tools stay in the case'}</small></div><div class="slots">${slotPresentation.slots.map(({index:i,id,ready,reserved})=>{
      const gear=carryItemDefinition(id),copy=battlePreparationItemCopy(id,facts);return `<button class="slot"${branchStyle(id)} data-command="slot:${i}" aria-pressed="${selectedSlot===i}" data-unavailable="${reserved}" aria-label="Slot ${i+1}: ${esc(gear?.label||'empty')}${reserved?', not carried':''}"><span class="number">0${i+1}</span>${gear?`${ready?'<i class="lamp"></i>':''}${icon(id)}`:''}<strong>${esc(gear?.label||'EMPTY')}</strong><small>${esc(reserved?'NOT CARRIED':copy?.move||'')}</small></button>`;
    }).join('')}</div><div class="equipment-bottom" ${!editing&&!details&&!incoming?'hidden':''} data-inspect-only="${!editing&&!incoming}">${casePanel}<div class="inspector"><h3>${esc(gear?.label||'EMPTY SLOT')}</h3><p>${esc(`${selectedMissing?'NOT CARRIED. Its slot is reserved until recovered. ':''}${copy.detail}`)}</p>${id?`<button class="put-away" data-command="inspect">INSPECT</button>${editing?` <button class="put-away" data-command="store">${selectedMissing?'CLEAR RESERVED SLOT':'PUT BACK IN CASE'}</button>`:''}`:''}</div></div>`;
    const skillBlocked=(technique,availability)=>{
      if(technique.requiresRig&&!hasRig)return 'SERVICE INTERFACE REQUIRED';
      if(availability.reason==='NO CONTINUITY'){
        const upstream=TECHNIQUE_DEFS.find(t=>t.id===technique.requires);
        return `NO FEED · PATCH ${upstream.label}`;
      }
      return availability.reason;
    };
    const toolStatus=preparationSkillToolStatus(skill,snapshot,facts,battery);
    const skillStatus=status.patched
      ? (status.pulls.length>1?`PULL RETURNS ${status.pulls.length} LEADS`:'PULL RETURNS 1 LEAD')
      : status.enabled?'USES 1 SPARE LEAD':skillBlocked(skill,status);
    const skillReadout=toolStatus&&!(skillStatus==='SERVICE INTERFACE REQUIRED'&&toolStatus==='SERVICE INTERFACE NOT CARRIED')
      ? `${toolStatus} · ${skillStatus}`:toolStatus||skillStatus;
    const skillRows=([branch,label])=>`<div class="column" style="--branch:${PATCH_COLORS[branch]}">
      <div class="branch">${label} / SEND</div><i class="supply" data-source="supply:${branch}"></i>
      ${TECHNIQUE_DEFS.filter(t=>t.branch===branch).map(t=>{
        const a=techniqueAvailability(build,t.id,{hasRig});
        const state=a.patched?'patched':a.enabled?'available':skillBlocked(t,a);
        return `<button class="skill" data-skill="${t.id}" data-command="skill:${t.id}" data-selected="${selectedSkill===t.id}" data-patched="${a.patched}" data-available="${a.enabled}" aria-pressed="${selectedSkill===t.id}" aria-label="${esc(t.label)}, ${esc(state)}">${esc(t.label)}<i class="skill-input"></i><em>${a.patched?'PATCHED':t.special?'SPECIAL':''}</em></button>`;
      }).join('')}</div>`;
    const skills=`<div class="heading">PATCHBAY<small>${build.techniques.length} patched · ${build.unspent} spare leads</small></div>
      <div class="rack"><div class="columns">${BRANCHES.map(skillRows).join('')}</div><canvas class="cables" aria-hidden="true"></canvas></div>
      <div class="skill-inspector"><div><h3>${esc(skill.label)}</h3><p>${esc(skill.detail.replace(/^SPECIAL — /,''))}</p><div class="status">${esc(skillReadout)}</div></div>
      ${cap('patch',status.patched?'PULL LEAD':'PATCH LEAD',status.patched?'amber':'green',!status.patched&&!status.enabled?'disabled':'')}</div>`;
    const composure=facts?`${Math.round(facts.composure)}/${Math.round(facts.ceiling)}`:sheets?`${Math.round(sheets.composure)}/${Math.round(sheets.ceiling)}`:'--';
    const charge=facts?`${facts.charge}/${facts.maxCharge}`:'--';
    const take=facts?(facts.take?`COMBAT TAKE · ${facts.take.label}`:'NO COMBAT TAKE LOADED'):'COMBAT TAKE CHECKED AT READY';
    shadow.innerHTML=`<style>${battlePreparationStyle}</style><div class="encounter-heading"><div class="title-rule"></div><div class="title-kicker">THE RECORDIST / PREPARE</div><h1 id="preparation-encounter-title">${esc(title||'THE RETURN')}</h1></div><section class="case" role="dialog" aria-modal="true" aria-label="Prepare for battle" aria-describedby="preparation-encounter-title"><i class="screw tl"></i><i class="screw tr"></i><i class="screw bl"></i><i class="screw br"></i><header><div class="brand">AUDIOCORP<span>FIELD CASE</span><span class="compact-opponent">${esc(title||'THE RETURN')}</span></div><span class="paused">NOTHING RUNS UNTIL READY</span></header><div class="topline"><div class="tabs" role="tablist" aria-label="Preparation">${cap('tab:equipment',editing?'CLOSE KIT':'CHANGE KIT','amber',`role="tab" aria-selected="${page==='equipment'}"`)}${cap('tab:skills','PATCHBAY','green',`role="tab" aria-selected="${page==='skills'}"`)}</div><div class="readout" role="status" aria-live="polite"><span><span data-readout-text>COMPOSURE</span><b data-readout-text>${composure}</b></span><span><span data-readout-text>BATTERY</span><b data-readout-text>${Math.round(Math.max(0,facts?.battery??battery)*100)}%</b></span><span><span data-readout-text>CHARGE AT START</span><b data-readout-text>${charge}</b></span></div></div><div class="take-status"><b>${esc(take)}</b><span>${facts?.take?'Available when the fight begins.':'MONITOR can capture one during the fight.'} Collected recordings stay in the case.</span></div><div class="page ${page}" role="tabpanel" aria-label="${page==='equipment'?'Equipment':'Skills'}">${page==='equipment'?equipment:skills}</div>${page==='equipment'?sheetPanel:''}<footer><div class="footer-copy"><div class="hint">${page!=='equipment'?'Select a skill to patch or pull its lead.':incoming?`Choose which object ${esc(incoming.label)} replaces.`:editing?'Changes stay in this draft until READY.':'Keep this kit, or open CHANGE KIT. Nothing is spent by waiting.'}</div>${message?`<div class="status" role="status">${esc(message)}</div>`:''}<span class="keys">${esc(keys)}</span></div>${cap('ready','READY','white')}</footer></section>`;
    // Keep the primary action's shared cap class and its own sizing class.
    shadow.querySelector('[data-command="ready"]').classList.add('ready');
    if(shadow.querySelector('.rack'))shadow.querySelector('.rack').scrollTop=scroll;
    shadow.querySelector('.page').scrollTop=pageScroll;
    const validFocus=enabled().some(b=>b.dataset.command===focus);
    const replacementFocus=incoming?enabled().find(b=>b.dataset.command.startsWith('replace:'))?.dataset.command:null;
    focusButton(validFocus?focus:replacementFocus||'ready',false);cables();paint();
  }
  const resize=new ResizeObserver(()=>{syncSize();paint();cables();});resize.observe(host);
  // Screen-reader activation has no pointer event. Ordinary pointers and keys
  // arrive through the game's scene router, so they have exactly one owner.
  shadow.addEventListener('click',e=>{if(e.detail===0){const b=e.target.closest('[data-command]');if(b&&!b.disabled)onActivate(b.dataset.command);}});
  return {
    render,paint,root,
    focus:()=>focus,
    focusButton,
    moveFocus(direction){
      const buttons=enabled(),at=buttons.findIndex(b=>b.dataset.command===focus);
      if(!buttons.length)return;
      if(direction==='next'||direction==='prev'){focusButton(buttons[(at+(direction==='next'?1:-1)+buttons.length)%buttons.length].dataset.command);return;}
      const from=buttons[Math.max(0,at)].getBoundingClientRect(),cx=from.x+from.width/2,cy=from.y+from.height/2;
      const ranked=buttons.filter((_,i)=>i!==at).map(b=>{const r=b.getBoundingClientRect(),dx=r.x+r.width/2-cx,dy=r.y+r.height/2-cy;const forward=direction==='left'?-dx:direction==='right'?dx:direction==='up'?-dy:dy;const cross=direction==='left'||direction==='right'?Math.abs(dy):Math.abs(dx);return{b,forward,cost:forward+cross*2.5};}).filter(v=>v.forward>3).sort((a,b)=>a.cost-b.cost);
      if(ranked[0])focusButton(ranked[0].b.dataset.command);
    },
    hit(x,y){const button=shadow.elementFromPoint(x,y)?.closest('[data-command]');return button&&!button.disabled?button.dataset.command:null;},
    visible(value){root.hidden=!value;if(syncSize()){paint();cables();}},
    dispose(){disposed=true;resize.disconnect();root.remove();},
  };
}
