import { battlePreparationStyle } from './battle-preparation-style.js';
import {itemPortraitMarkup as icon,preloadItemPortraits} from './item-portraits.js';
import { drawHardwareCap } from './hardware-material.js';
import { drawPatchSocket, drawPatchCable, PATCH_COLORS } from './patchbay-material.js';
import { sampleControl } from '../game/control-mechanics.js';
import { BATTLE_GEAR } from '../game/combat-loadout.js';
import { TECHNIQUE_DEFS, techniqueAvailability } from '../game/combat-progression.js';
import { skillPatchSource } from '../game/skill-patchbay.js';
import { BATTLE_EQUIPMENT_COPY } from '../game/battle-preparation-model.js';
import { uiCurrentScale } from './ui.js';
import { drawElectronicText } from './electronic-text.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BRANCHES=[['torch','TORCH'],['recorder','RECORDER'],['rig','BENT RIG'],['nerve','NERVE'],['fork','FORK'],['radio','RADIO']];
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
    const dpr=window.devicePixelRatio||1,w=rack.clientWidth,h=Math.max(rack.clientHeight,columns.offsetHeight);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const bounds=rack.getBoundingClientRect();const point=el=>{const r=el.getBoundingClientRect();return{x:r.left-bounds.left+r.width/2-1,y:r.top-bounds.top+r.height/2-1+rack.scrollTop};};
    const outputs=new Map(),inputs=new Map();
    for(const [branch] of BRANCHES){const p=point(shadow.querySelector(`[data-source="supply:${branch}"]`));outputs.set(`supply:${branch}`,p);drawPatchSocket(ctx,p.x,p.y,4.7,{color:PATCH_COLORS[branch]});}
    for(const skill of TECHNIQUE_DEFS){
      const p=point(shadow.querySelector(`[data-skill="${skill.id}"] .skill-input`)),out={x:p.x+24,y:p.y};
      inputs.set(skill.id,p);outputs.set(`output:skill:${skill.id}`,out);
      drawPatchSocket(ctx,p.x,p.y,4.3,{color:PATCH_COLORS[skill.branch],connected:current.build.techniques.includes(skill.id),selected:current.selectedSkill===skill.id});
      if(TECHNIQUE_DEFS.some(t=>t.requires===skill.id))drawPatchSocket(ctx,out.x,out.y,3.5,{color:PATCH_COLORS[skill.branch]});
    }
    for(const id of current.build.techniques){const from=outputs.get(skillPatchSource(id).id),to=inputs.get(id),skill=TECHNIQUE_DEFS.find(t=>t.id===id);if(from&&to)drawPatchCable(ctx,from,to,{color:PATCH_COLORS[skill.branch],radius:3,sag:9});}
  }
  function render(snapshot,{battery=0,message='',keys=''}={}){
    current=snapshot;
    const scroll=shadow.querySelector('.rack')?.scrollTop||0,pageScroll=shadow.querySelector('.page')?.scrollTop||0;
    const {loadout,build,available,selectedSlot,selectedSkill,page,hasRig}=snapshot;
    const id=loadout.top[selectedSlot],gear=BATTLE_GEAR[id],copy=BATTLE_EQUIPMENT_COPY[id];
    const skill=TECHNIQUE_DEFS.find(t=>t.id===selectedSkill),status=techniqueAvailability(build,selectedSkill,{hasRig});
    const reserve=available.filter(id=>!loadout.top.includes(id));
    const incoming=snapshot.replacing?BATTLE_GEAR[snapshot.replacing]:null;
    // THE CASE FLIPS TO THE QUESTION.
    //
    // Picking an item now fills the first empty slot on its own, so the case is
    // just the case — until there is no empty slot, and then the one thing that
    // could not be decided for the player is the only thing the panel shows.
    // Asked BY NAME: giving up the RADIO is the decision being made, where
    // "slot 3" is a different question they would have to translate first.
    const casePanel=incoming
      ? `<div class="reserve replacing"><div class="heading">SLOTS FULL<small>What does ${esc(incoming.label)} take the place of?</small></div><div class="items">${loadout.top.map(id=>`<button class="item"${branchStyle(id)} data-command="replace:${id}" aria-label="Put ${esc(incoming.label)} in place of ${esc(BATTLE_GEAR[id].label)}">${icon(id)}<span>${esc(BATTLE_GEAR[id].label)}</span></button>`).join('')}</div><button class="put-away" data-command="cancel-replace">KEEP WHAT I HAVE</button></div>`
      : `<div class="reserve"><div class="heading">IN THE CASE</div><div class="items">${reserve.map(id=>`<button class="item"${branchStyle(id)} data-command="equip:${id}" aria-label="Take out ${esc(BATTLE_GEAR[id].label)}">${icon(id)}<span>${esc(BATTLE_GEAR[id].label)}</span></button>`).join('')||'<div class="empty">No other equipment.</div>'}</div></div>`;
    const equipment=`<div class="heading">QUICK SLOTS<small>Select to inspect</small></div><div class="slots">${Array.from({length:4},(_,i)=>{
      const id=loadout.top[i],gear=BATTLE_GEAR[id],copy=BATTLE_EQUIPMENT_COPY[id];return `<button class="slot"${branchStyle(id)} data-command="slot:${i}" aria-pressed="${selectedSlot===i}" ${i>loadout.top.length?'disabled':''} aria-label="Slot ${i+1}: ${esc(gear?.label||'empty')}"><span class="number">0${i+1}</span>${gear?`<i class="lamp"></i>${icon(id)}`:''}<strong>${esc(gear?.label||'EMPTY')}</strong><small>${esc(copy?.move||'')}</small></button>`;
    }).join('')}</div><div class="equipment-bottom">${casePanel}<div class="inspector"><h3>${esc(gear?.label||'EMPTY SLOT')}</h3><p>${esc(copy?.detail||'Choose an item from the case.')}</p>${id?'<button class="put-away" data-command="inspect">INSPECT</button> <button class="put-away" data-command="store">PUT BACK IN CASE</button>':''}</div></div>`;
    const skills=`<div class="heading">SKILLS<small>${build.techniques.length} patched · Scroll for more</small></div><div class="rack"><div class="columns">${BRANCHES.map(([branch,label])=>`<div class="column" style="--branch:${PATCH_COLORS[branch]}"><div class="branch">${label}</div><i class="supply" data-source="supply:${branch}"></i>${TECHNIQUE_DEFS.filter(t=>t.branch===branch).map(t=>{const a=techniqueAvailability(build,t.id,{hasRig});return `<button class="skill" data-skill="${t.id}" data-command="skill:${t.id}" data-selected="${selectedSkill===t.id}" data-patched="${a.patched}" data-available="${a.enabled}" aria-pressed="${selectedSkill===t.id}" aria-label="${esc(t.label)}, ${a.patched?'patched':a.enabled?'available':esc(a.reason)}">${esc(t.label)}<i class="skill-input"></i><em>${a.patched?'PATCHED':t.special?'SPECIAL':''}</em></button>`;}).join('')}</div>`).join('')}</div><canvas class="cables" aria-hidden="true"></canvas></div><div class="skill-inspector"><div><h3>${esc(skill.label)}</h3><p>${esc(skill.detail.replace(/^SPECIAL — /,''))}</p>${!status.enabled&&!status.patched?`<div class="status">${esc(status.reason)}</div>`:''}</div>${cap('patch',status.patched?'PULL LEAD':'PATCH LEAD',status.patched?'amber':'green',!status.patched&&!status.enabled?'disabled':'')}</div>`;
    shadow.innerHTML=`<style>${battlePreparationStyle}</style><section class="case" role="dialog" aria-modal="true" aria-label="Prepare for battle"><i class="screw tl"></i><i class="screw tr"></i><i class="screw bl"></i><i class="screw br"></i><header><div class="brand">AUDIOCORP<span>FIELD CASE</span></div><span class="paused">TURNS PAUSED</span></header><div class="topline"><div class="tabs" role="tablist" aria-label="Preparation">${cap('tab:equipment','EQUIPMENT','amber',`role="tab" aria-selected="${page==='equipment'}"`)}${cap('tab:skills','SKILLS','green',`role="tab" aria-selected="${page==='skills'}"`)}</div><div class="readout" role="status" aria-live="polite"><span><span data-readout-text>BATTERY</span><b data-readout-text>${Math.round(Math.max(0,battery)*100)}%</b></span><span><span data-readout-text>SPARE LEADS</span><b data-readout-text>${build.unspent}</b></span></div></div><div class="page ${page}" role="tabpanel" aria-label="${page==='equipment'?'Equipment':'Skills'}">${page==='equipment'?equipment:skills}</div><footer><div class="footer-copy"><div class="hint">${page!=='equipment'?'Select a skill to patch or pull its lead.':incoming?`Choose which tool ${esc(incoming.label)} replaces.`:'Choose an item — it fills the first empty slot.'}</div>${message?`<div class="status" role="status">${esc(message)}</div>`:''}<span class="keys">${esc(keys)}</span></div>${cap('ready','READY','white')}</footer></section>`;
    // Keep the primary action's shared cap class and its own sizing class.
    shadow.querySelector('[data-command="ready"]').classList.add('ready');
    if(shadow.querySelector('.rack'))shadow.querySelector('.rack').scrollTop=scroll;
    shadow.querySelector('.page').scrollTop=pageScroll;
    focusButton(enabled().some(b=>b.dataset.command===focus)?focus:'ready',false);cables();paint();
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
