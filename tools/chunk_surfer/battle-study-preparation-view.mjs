import { createBattlePreparationModel } from '../../src/game/battle-preparation-model.js';
import { createBattlePreparationView, paintBattlePreparationReadout } from '../../src/render/battle-preparation-view.js';
import { BATTLE_GEAR } from '../../src/game/combat-loadout.js';
import { itemPortraitMarkup } from '../../src/render/item-portraits.js';
import { PREPARATION_FIXTURE, preparationFacts, preparationToolCopy } from './battle-study-preparation-facts.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const restrainedStyle=`
.case{width:min(760px,calc(100% - 48px));min-width:0;max-height:calc(100% - 64px);bottom:32px;background:linear-gradient(115deg,#343c31,#293024 53%,#333b2d)}
.topline{padding:12px 0;gap:16px}.tabs{width:235px;flex-shrink:0}.tabs button{font-size:10px;height:36px}.readout{gap:19px;flex:1;justify-content:space-between}.readout b{font-size:14px}.page.equipment{height:auto;min-height:0;flex-shrink:1;overflow:auto}.page.skills{height:260px;min-height:150px}.slot{height:104px}.slot .item-portrait{height:62px;top:4px}.slot strong{font-size:11px}.slot small{font-size:7px}.equipment-bottom{margin-top:15px;grid-template-columns:1fr 1fr}.equipment-bottom[data-inspect-only=true]{grid-template-columns:1fr}.equipment-bottom[data-inspect-only=true] .reserve{display:none}.equipment-bottom[hidden]{display:none}.inspector p{font-size:12px;line-height:1.55}.inspector .study-verbs{display:flex;gap:8px}.study-start{font:10px/1.5 "Hardware Sans",Arial,sans-serif;color:#c3c8b3;margin:1px 0 15px;padding:9px 0;border-bottom:1px solid #68724966}.study-start b{font-weight:600;color:#dddbbd}.heading small{font-size:9px}.ready{width:145px;height:42px;font-size:15px}.sheet{margin-top:12px}.keys{line-height:1.5}.study-receipt{font:12px/1.6 "Hardware Sans",Arial,sans-serif;padding:10px 0}.study-receipt strong{color:#ded4aa}.study-material{font:10px/1.5 "Hardware Sans",Arial,sans-serif;color:#a6b099}.study-inspection{display:flex;align-items:center;gap:20px;background:#111a0f;border:1px solid #64704c;padding:14px;margin-top:10px}.study-inspection .item-portrait{width:150px;height:130px;object-fit:contain}.study-inspection p{line-height:1.6;font-size:12px}.study-inspection button{border:1px solid #87946b;background:#202b1a;padding:7px 12px}
@container(max-width:950px){.case{width:calc(100% - 36px);left:18px;max-height:calc(100% - 50px);bottom:25px}.page.equipment{height:auto}.page.skills{height:230px}.slot{height:104px}.slot strong{font-size:11px}.slot .item-portrait{height:62px}.slot small{font-size:7px}.inspector p{font-size:11px}.topline{gap:9px}.tabs{width:220px}.readout{gap:10px}.equipment-bottom{grid-template-columns:1fr 1fr}.study-start{font-size:10px}}
@container(max-width:650px){.case{width:calc(100% - 24px);left:12px;bottom:16px;max-height:calc(100% - 32px)}.topline{flex-wrap:wrap}.tabs{width:100%;order:2}.readout{width:100%;order:1}.readout b{font-size:13px}.readout{font-size:8px}.slot{height:91px}.slot strong{font-size:8px}.slot .item-portrait{height:53px}.slot small{font-size:6px}.equipment-bottom{grid-template-columns:1fr}.reserve{border:0}.heading small{font-size:8px}.study-start{font-size:9px}.inspector p{font-size:11px}.study-inspection{gap:10px}.study-inspection .item-portrait{width:90px}}
@container(max-height:480px){.case{top:12px;bottom:12px;max-height:none}.topline{padding:6px 0}.study-start{margin-bottom:8px;padding:4px 0}.page.equipment,.page.skills{height:auto;flex:1;min-height:0}.slot{height:82px}.slot .item-portrait{height:44px}}
`;

// The renderer, cap material, electronic ROM, portraits, slot model and patchbay
// are the production modules. Only hierarchy and copy are changed in this
// adapter. It never writes a save or starts a fight.
export function mountPreparationStudy({host=document.getElementById('map'),mode='after',fixture=PREPARATION_FIXTURE,onInspect=null,native=false}={}) {
  if(!host)throw new Error('Preparation study needs a visible host');
  const original=host.querySelector('#battle-preparation');
  const priorDisplay=original?.style.display;
  if(original)original.style.display='none';
  let model,view,editOpen=false,inspectOpen=false,inspection=null,message='',ready=false,failSave=false,disposed=false;
  const events=[],started=performance.now();
  const log=(type,extra={})=>events.push({t:Math.round(performance.now()-started),type,...extra});
  const snapshot=()=>({mode,fixture:'declared equal-state comparison; no saved run modified',preparation:model.snapshot(),facts:preparationFacts(model.snapshot(),fixture),ready,editOpen,inspectOpen,message});
  const newModel=()=>createBattlePreparationModel({loadout:fixture.loadout,equipment:fixture.equipment,build:fixture.build,hasRig:fixture.hasRig});
  function render(){
    if(disposed)return;
    const s=model.snapshot(),facts=preparationFacts(s,fixture);
    view.render(s,{battery:fixture.battery,sheets:{carried:0,composure:facts.composure,ceiling:facts.ceiling},message,keys:'ARROWS / TAB SELECT · ENTER CONFIRM · ESC BACK'});
    const shadow=view.root.shadowRoot;
    if(mode==='after'){
      const style=document.createElement('style');style.textContent=restrainedStyle;shadow.appendChild(style);
      shadow.querySelector('.paused').textContent='NOTHING RUNS UNTIL READY';
      const readout=shadow.querySelector('.readout');
      readout.innerHTML=`<span><span data-readout-text>COMPOSURE</span><b data-readout-text>${facts.composure}/${facts.ceiling}</b></span><span><span data-readout-text>BATTERY</span><b data-readout-text>${Math.round(facts.battery*100)}%</b></span><span><span data-readout-text>CHARGE AT START</span><b data-readout-text>${facts.charge}/${facts.maxCharge}</b></span>`;
      const equipmentTab=shadow.querySelector('[data-command="tab:equipment"] span');
      equipmentTab.textContent=editOpen?'CLOSE KIT':'CHANGE KIT';
      shadow.querySelector('[data-command="tab:skills"] span').textContent='PATCHBAY';
      const page=shadow.querySelector('.page');
      const start=document.createElement('div');start.className='study-start';
      start.innerHTML=`<b>${facts.take?`COMBAT TAKE: ${esc(facts.take.label)}`:'NO COMBAT TAKE LOADED'}</b> · ${facts.take?'Available when the fight begins.':'MONITOR can capture one during the fight.'} Your collected recordings stay in the case.`;
      page.before(start);
      if(s.page==='equipment'){
        const heading=page.querySelector('.heading');heading.firstChild.textContent=`WITHIN REACH · ${s.loadout.top.length}/4`;
        heading.querySelector('small').textContent='Other tools stay in the case';
        const bottom=page.querySelector('.equipment-bottom');
        bottom.hidden=!editOpen&&!inspectOpen&&!s.replacing;
        bottom.dataset.inspectOnly=String(!editOpen&&!s.replacing);
        if(!s.replacing){
          const reserve=bottom.querySelector('.reserve .heading');reserve.textContent='STORED · AVAILABLE TO SWAP';
        }
        const id=s.loadout.top[s.selectedSlot],inspector=bottom.querySelector('.inspector');
        if(id){
          inspector.querySelector('p').textContent=preparationToolCopy(id,facts);
          if(!editOpen)inspector.querySelector('[data-command="store"]').hidden=true;
        }
        for(const slot of page.querySelectorAll('.slot')){
          const id=s.loadout.top[Number(slot.dataset.command.split(':')[1])];
          if(id==='plant-spanner')slot.querySelector('small').textContent='SWING / ON THE STEEL';
          if(id==='coffee')slot.querySelector('small').textContent='STEADY HANDS';
        }
      }
      shadow.querySelector('.hint').textContent=s.replacing?'Nothing is replaced until you choose a tool.':editOpen?'Changes stay in this draft until READY.':'Keep this kit, or open CHANGE KIT. Nothing is spent by waiting.';
      paintBattlePreparationReadout(readout);
    }
    if(inspection){
      const panel=document.createElement('div');panel.className='study-inspection';
      panel.innerHTML=`${itemPortraitMarkup(inspection,{large:true})}<div><b>${esc(BATTLE_GEAR[inspection].label)}</b><p>${esc(preparationToolCopy(inspection,facts))}</p><p class="study-material">Production dithered item portrait. The production orbit inspector is a separate native check.</p><button data-study-close-inspection>BACK TO KIT</button></div>`;
      shadow.querySelector('.page').replaceChildren(panel);
      panel.querySelector('button').onclick=()=>{inspection=null;log('inspection-close');render();};
    }
    if(ready){
      const page=shadow.querySelector('.page');page.innerHTML=`<div class="study-receipt"><strong>READY — STUDY RECEIPT</strong><br>${facts.carried.map(id=>esc(BATTLE_GEAR[id].label)).join(' · ')}<br>${facts.composure}/${facts.ceiling} composure · ${Math.round(facts.battery*100)}% battery · ${facts.charge}/${facts.maxCharge} opening charge.<p>No fight was started and no production save was written.</p></div>`;
      shadow.querySelector('[data-command="ready"]').disabled=true;
    }
    view.paint();
  }
  function command(value){
    if(disposed||ready)return;
    log('command',{command:value,before:model.snapshot().loadout.top});message='';
    if(value==='ready'){
      if(!model.commit(()=>!failSave)){message='Could not save equipment. Try READY again.';log('save-refused');render();return;}
      ready=true;log('ready',{receipt:snapshot()});render();return;
    }
    if(value.startsWith('tab:')){
      const tab=value.slice(4);
      if(mode==='after'&&tab==='equipment'){editOpen=model.snapshot().page!=='equipment'||!editOpen;inspectOpen=false;}
      model.tab(tab);
    }else if(value.startsWith('slot:')){model.slot(value.slice(5));inspectOpen=true;}
    else if(value.startsWith('equip:'))model.equip(value.slice(6));
    else if(value.startsWith('replace:'))model.replace(value.slice(8));
    else if(value==='cancel-replace')model.cancelReplace();
    else if(value==='store')model.store();
    else if(value.startsWith('skill:'))model.skill(value.slice(6));
    else if(value==='patch')model.patch();
    else if(value==='inspect'){
      const id=model.snapshot().loadout.top[model.snapshot().selectedSlot];
      if(onInspect)onInspect(id);else inspection=id;
      log('inspection-open',{id});
    }
    render();
  }
  model=newModel();
  view=createBattlePreparationView({host,onActivate:command});
  view.root.id='battle-preparation-study';
  // The production scene router consumes window-level pointer events before
  // they reach shadow DOM. A native comparison borrows that same router for
  // its own visible controls, then restores it when the adapter is disposed.
  const scene=native?globalThis.__scenes?.top?.():null;
  const previousPointer=scene?.pointer;
  const studyPointer=event=>{
    if(event.originalEvent?.composedPath?.().includes(view.root)){
      if(event.type==='pointerdown'&&(event.button??0)===0){
        const value=view.hit(event.clientX,event.clientY);
        if(value){view.focusButton(value,false);command(value);}
      }
      return true;
    }
    return previousPointer?.call(scene,event)??false;
  };
  if(scene)scene.pointer=studyPointer;
  view.root.shadowRoot.addEventListener('pointerdown',e=>{
    const button=e.target.closest?.('[data-command]');if(!button||button.disabled)return;
    e.preventDefault();e.stopImmediatePropagation();view.focusButton(button.dataset.command,false);command(button.dataset.command);
  },true);
  const key=e=>{
    if(disposed||e.repeat||(!native&&!view.root.contains(e.target)))return false;
    const k=e.key.toLowerCase();
    if(!['escape','enter',' ','tab','arrowup','arrowdown','arrowleft','arrowright','q','e'].includes(k))return false;
    e.preventDefault();e.stopImmediatePropagation();
    if(k==='escape'){
      if(inspection)inspection=null;
      else if(model.snapshot().replacing)model.cancelReplace();
      else{model.tab('equipment');editOpen=false;inspectOpen=false;}
      log('back');render();
    }else if(k==='enter'||k===' ')command(view.focus()||'ready');
    else if(k==='tab')view.moveFocus(e.shiftKey?'prev':'next');
    else if(k==='q'||k==='e')command(`tab:${model.snapshot().page==='equipment'?'skills':'equipment'}`);
    else view.moveFocus(k.slice(5));
    return true;
  };
  window.addEventListener('keydown',key,true);
  render();log('open',{mode,starting:snapshot()});
  const api={snapshot,events,command,handleKey:key,
    reset(){model=newModel();editOpen=false;inspectOpen=false;inspection=null;ready=false;message='';render();log('reset');},
    setMode(value){mode=value==='before'?'before':'after';render();log('mode',{mode});},
    simulateSaveFailure(value=true){failSave=!!value;log('save-fixture',{failSave});},
    dispose(){disposed=true;window.removeEventListener('keydown',key,true);if(scene?.pointer===studyPointer)scene.pointer=previousPointer;view.dispose();if(original)original.style.display=priorDisplay;log('close');},
  };
  return api;
}

export function mountNativePreparationComparison(mode='after') {
  const battle=globalThis.__scenes?.top()?.battleView?.();
  if(battle?.phase!=='prepare')throw new Error('Open the real preparation screen before mounting this isolated comparison');
  const prep=battle.preparation,state=battle.state;
  const fixture={...PREPARATION_FIXTURE,id:state.definition.id||'natatorium',
    definition:state.definition,difficulty:state.difficulty,
    loadout:prep.loadout,equipment:prep.available,build:prep.build,hasRig:prep.hasRig,
    seed:state.seed,battery:state.battery,composure:state.composure,injuries:state.injuries,torchDrainScale:state.torchDrainScale};
  const study=mountPreparationStudy({mode,fixture,native:true});
  globalThis.__battlePreparationStudy=study;
  return study.snapshot();
}
