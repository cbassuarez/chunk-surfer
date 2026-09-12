//
//  bag-view.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Field-case presentation. One scrolling list, one persistent detail pane — and
// sections that own their whole content area instead (SKILLS, see `drawContent`).

import { uiFill, uiLine, uiStrokeRect, uiText, uiWrap } from './ui.js';
import { UI_COLOR } from './palette.js';
import { drawBagIcon } from './bag-icons.js';
import {drawItemPortrait} from './item-portraits.js';
import {itemPortrait} from '../data/item-portraits.js';
import { bagEntry, bagSection } from '../game/bag-model.js';
import { drawMapView, drawMapOffline } from './map-view.js';
import { activeInputPromptDevice, inputPrompt, inputPromptLabel } from '../game/bindings.js';
import { fitText } from './fit-text.js';
import { drawLampButton } from './presentation.js';
import { drawPrintedText } from './keycap.js';
import { bagTabRegions, bagTabButtonState } from './bag-tabs.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function toneClass(tone, selected = false) {
  if (tone === 'complete') return 'ui-green';
  if (tone === 'danger') return 'ui-danger';
  if (tone === 'metadata') return 'ui-blue';
  if (tone === 'active') return 'ui-amber';
  return selected ? 'ui-primary' : 'ui-secondary';
}

const clip = (text, width) => fitText(text, Math.max(1, Math.floor(width || 1)));

function rightText(x, y, width, text, cls = 'ui-secondary', alpha = 1) {
  const s = clip(text, width);
  uiText(x + Math.max(0, width - s.length), y, s, cls, alpha);
}

function easeOutCubic(t) {
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function acquire(now, startedAt, duration = 0.14) {
  return easeOutCubic((now - startedAt) / duration);
}

export function bagListCapacity(layout, sectionId) {
  const usable = Math.max(1, layout.list.h - 2);
  if (sectionId === 'kit') return Math.max(1, Math.floor(usable / 2));
  if (sectionId === 'sheets' || sectionId === 'files') return Math.max(1, Math.floor(usable / 2));
  return Math.max(1, usable);
}

function drawTabs(model, nav, layout, pulse, breadcrumb = '', guide = null) {
  const tabs = model.sections || [];
  const active = nav.sectionId;
  for (const tab of bagTabRegions(model, layout)) {
    const state=bagTabButtonState(tab, active);
    if(guide?.kind==='section')state.focused=tab.sectionId===guide.sectionId;
    drawLampButton(tab.x, tab.y, tab.w, tab.h, state);
    if(layout.tabs.compact)continue;
    // Dynamic counts belong to the readout beneath the fixed printed legend,
    // never to the plastic. A long SKILLS delta cannot stretch its switch.
    const count = clip(tab.countLabel, tab.readout.w);
    if(active!=='map')uiText(tab.readout.x + Math.max(0, (tab.readout.w - count.length) / 2), tab.readout.y,
      count, tab.sectionId === active ? 'ui-primary' : 'ui-secondary', tab.sectionId === active ? .9 : .62);
  }

  if(layout.tabs.compact)return;
  const help = activeInputPromptDevice()==='keyboard' ? 'TAB / SHIFT+TAB SECTION' : layout.tabs.w >= 64
    ? `${inputPrompt('tabNext')} / ${inputPrompt('tabPrev')} SECTION`
    : `${inputPrompt('tabNext')} SECTION`;
  const crumb=breadcrumb||`FIELD CASE / ${tabs.find((tab)=>tab.id===active)?.label||'SECTION'}`;
  const crumbW=Math.max(8,layout.tabs.w-help.length-2);
  if(active==='map'){
    drawPrintedText(layout.tabs.x,layout.tabs.y+2.7,clip(crumb,crumbW),{w:crumbW,h:.8,ink:'#333830',finish:'etched',darkPanel:false});
    drawPrintedText(layout.tabs.x+layout.tabs.w-help.length,layout.tabs.y+2.7,help,{w:help.length,h:.8,ink:'#333830',finish:'etched',darkPanel:false});
  }else{
    uiText(layout.tabs.x,layout.tabs.y+3.7,clip(crumb,crumbW),'ui-label',.62);
    rightText(layout.tabs.x,layout.tabs.y+3.7,layout.tabs.w,help,'ui-label',.58);
  }
}

function sectionHeader(sectionId) {
  if (sectionId === 'kit') return 'CASE INDEX';
  if (sectionId === 'map') return 'FACILITY MAP';
  if (sectionId === 'skills') return 'RECORDER MODIFICATIONS';
  return 'SHEET INDEX';
}

function drawKitList(entries, selectedId, rect, scroll, capacity, pulse) {
  let y = rect.y + 1;
  const visible = entries.slice(scroll, scroll + capacity);

  for (const entry of visible) {
    const on = entry.id === selectedId;
    const cursor = on ? '▸' : ' ';
    const status = entry.status?.label || '';
    const statusW = Math.min(12, status.length);
    const titleW = Math.max(8, rect.w - statusW - 5);

    uiText(rect.x, y, cursor, on ? 'ui-amber' : 'ui-secondary', on ? .72 + pulse * .28 : .68);
    uiText(rect.x + 2, y, clip(entry.title, titleW), on ? 'ui-amber' : entry.present ? 'ui-primary' : 'ui-secondary', on ? 1 : .78);
    rightText(rect.x, y, rect.w, status, toneClass(entry.status?.tone, on), on ? 1 : .72);
    uiText(rect.x + 3, y + 1, clip(entry.present ? entry.subtitle : 'EMPTY CUTOUT', rect.w - 4), 'ui-secondary', on ? .62 : .40);
    y += 2;
  }
}

function drawManifestList(entries, selectedId, rect, scroll, capacity, pulse) {
  let y = rect.y + 1;
  const visible = entries.slice(scroll, scroll + capacity);

  for (const entry of visible) {
    const on = entry.id === selectedId;
    const glyph = on ? '▸' : entry.status?.glyph || '◇';
    const seq = String(entry.sequence).padStart(2, '0');
    const right = entry.recorded ? entry.timestamp : entry.status?.label || '';
    const rightW = Math.min(10, right.length);
    const titleW = Math.max(7, rect.w - rightW - 8);

    uiText(rect.x, y, glyph, on ? 'ui-amber' : toneClass(entry.status?.tone), on ? .72 + pulse * .28 : .78);
    uiText(rect.x + 2, y, seq, 'ui-label', .72);
    uiText(rect.x + 5, y, clip(entry.title, titleW), on ? 'ui-amber' : toneClass(entry.status?.tone), on ? 1 : .82);
    rightText(rect.x, y, rect.w, right, toneClass(entry.status?.tone, on), on ? 1 : .78);
    y++;
  }
}

function drawFilesList(entries, selectedId, rect, scroll, capacity, pulse) {
  let y = rect.y + 1;
  const visible = entries.slice(scroll, scroll + capacity);

  for (let i = 0; i < visible.length; i++) {
    const entry = visible[i];
    const prev = i > 0 ? visible[i - 1] : (scroll > 0 ? entries[scroll - 1] : null);
    const showFolder = !prev || prev.folder !== entry.folder;
    const on = entry.id === selectedId;

    uiText(rect.x, y, showFolder ? clip(entry.folder, rect.w - 4) : '·', 'ui-label', showFolder ? .62 : .28);
    if (showFolder) {
      const count = entries.filter((file) => file.folder === entry.folder).length;
      rightText(rect.x, y, rect.w, String(count).padStart(2, '0'), 'ui-blue', .58);
    }
    y++;

    const badge = entry.badges?.[0] || entry.status?.label || '';
    const badgeW = Math.min(9, badge.length);
    const titleW = Math.max(8, rect.w - badgeW - 5);
    uiText(rect.x, y, on ? '▸' : ' ', on ? 'ui-amber' : 'ui-secondary', on ? .72 + pulse * .28 : .60);
    uiText(rect.x + 2, y, clip(entry.title, titleW), on ? 'ui-amber' : 'ui-primary', on ? 1 : .78);
    rightText(rect.x, y, rect.w, badge, entry.badges?.length ? 'ui-amber' : 'ui-secondary', on ? .95 : .58);
    y++;
  }
}


function kitRegion(layout) {
  if (layout.mode === 'wide') {
    return {
      x: layout.list.x,
      y: layout.list.y,
      w: (layout.detail.x + layout.detail.w) - layout.list.x,
      h: layout.list.h,
    };
  }
  return {
    x: layout.detail.x,
    y: layout.detail.y,
    w: layout.detail.w,
    h: (layout.list.y + layout.list.h) - layout.detail.y,
  };
}

function kitReadySlots(model, entries) {
  const capacity = Math.max(1, Math.floor(model?.loadout?.capacity || 4));
  const slots = Array.from({ length: capacity }, () => null);
  for (const entry of entries || []) {
    if (entry?.compartment !== 'top') continue;
    const at = Number.isFinite(entry.topIndex) ? entry.topIndex : -1;
    if (at >= 0 && at < slots.length) slots[at] = entry;
  }
  return slots;
}

function kitStorageEntries(entries) {
  // The item list is the inventory ledger, not a second source of truth. Quick-slot
  // items remain visible here as ASSIGNED ABOVE so players never wonder where
  // something went when they prepare it.
  return (entries || []).filter(Boolean);
}

function drawMicroBox(rect, { selected = false, dim = false, danger = false, active = false } = {}) {
  const fill = selected
    ? 'rgba(216,138,59,0.15)'
    : active ? 'rgba(216,138,59,0.09)'
      : danger ? 'rgba(80,28,18,0.18)'
        : dim ? 'rgba(255,255,255,0.018)'
          : 'rgba(255,255,255,0.032)';
  uiFill(rect.x, rect.y, rect.w, rect.h, fill);
  uiStrokeRect(rect.x, rect.y, rect.w, rect.h, selected ? UI_COLOR.amber : danger ? UI_COLOR.danger : UI_COLOR.frame, selected ? .78 : .34, selected ? 1.4 : 1);
}

function drawKitRuleStrip(region, model) {
  if (region.h < 17 || region.w < 54) return 0;
  const leftW = Math.max(20, Math.floor((region.w - 4) / 2));
  const rightW = Math.max(20, region.w - leftW - 4);
  const y = region.y;

  drawMicroBox({ x: region.x, y, w: leftW, h: 2.4 }, { active: true });
  uiText(region.x + 1, y, 'QUICK SLOTS', 'ui-amber', .90);
  uiText(region.x + 1, y + 1, clip('AVAILABLE IN A FIGHT', leftW - 2), 'ui-blue', .72);

  uiText(region.x + leftW + 1, y + 1, '↑', 'ui-blue', .72);

  drawMicroBox({ x: region.x + leftW + 4, y, w: rightW, h: 2.4 }, {});
  uiText(region.x + leftW + 5, y, 'ALL ITEMS', 'ui-label', .72);
  uiText(region.x + leftW + 5, y + 1, clip('CHOOSE SET TO ADD ONE', rightW - 2), 'ui-secondary', .58);
  return 3;
}

function drawReadySlot(slot, rect, index, selected) {
  const entry = slot || null;
  if (rect.h < 1 || rect.w < 2) return;
  drawMicroBox(rect, { selected, dim: !entry, active: !!entry });
  if (rect.h < 3) {
    uiText(rect.x + .6, rect.y + (rect.h - 1) / 2,
      clip(`[${index + 1}] ${entry?.title || 'EMPTY'}`, rect.w - 1.2),
      selected ? 'ui-amber' : entry ? 'ui-primary' : 'ui-secondary', entry ? .88 : .48);
    return;
  }
  uiText(rect.x + 1, rect.y, `[${index + 1}]`, entry ? 'ui-blue' : 'ui-secondary', entry ? .84 : .44);
  if (!entry) {
    uiText(rect.x + 1, rect.y + 1, clip('EMPTY', rect.w - 2), 'ui-secondary', .42);
    if (rect.h >= 3) uiText(rect.x + 1, rect.y + 2, clip('CHOOSE SET TO FILL', rect.w - 2), 'ui-label', .40);
    return;
  }
  if(rect.h>=4&&itemPortrait(entry)){
    drawItemPortrait(entry,rect.x+1,rect.y+.35,{w:rect.w-2,h:rect.h-1.7,empty:entry.present===false});
    uiText(rect.x+1,rect.y+rect.h-1.15,clip(entry.title,rect.w-2),selected?'ui-amber':'ui-primary',.9);
    return;
  }
  const titleY = rect.h >= 6 ? rect.y + 2 : rect.y + 1;
  uiText(rect.x + 1, titleY, clip(entry.title, rect.w - 2), selected ? 'ui-amber' : 'ui-primary', selected ? 1 : .82);
  uiText(rect.x + 1, titleY + 1, clip('USE IN A FIGHT', rect.w - 2), 'ui-amber', selected ? .90 : .66);
}

function drawReadyNow(model, entries, selectedId, rect) {
  if (rect.h < 1) return;
  const slots = kitReadySlots(model, entries);
  const cap = slots.length;
  const gap = rect.w >= 60 ? 1 : .5;
  const slotW = Math.max(0, (rect.w - gap * Math.max(0, cap - 1)) / cap);
  const headerH = rect.h >= 3 ? 1.35 : 0;
  if (headerH) {
    uiText(rect.x, rect.y, 'QUICK SLOTS', 'ui-amber', .90);
    rightText(rect.x, rect.y, rect.w, `1-${cap}`, 'ui-blue', .56);
  }
  if (headerH >= 3) uiText(rect.x, rect.y + 1, clip('Items here are available when a fight starts.', rect.w), 'ui-secondary', .58);

  for (let i = 0; i < cap; i++) {
    const slotX = rect.x + i * (slotW + gap);
    const w = i === cap - 1 ? Math.max(0, rect.x + rect.w - slotX) : slotW;
    const entry = slots[i];
    drawReadySlot(entry, { x: slotX, y: rect.y + headerH, w, h: Math.max(0, rect.h - headerH) }, i, !!entry && entry.id === selectedId);
  }
}

function storageBadge(entry) {
  if (!entry) return { text: 'EMPTY', cls: 'ui-secondary' };
  if (entry.source?.deployed) return { text: 'DEPLOYED', cls: 'ui-blue' };
  if (entry.present === false) return { text: 'MISSING', cls: 'ui-danger' };
  if (entry.compartment === 'top') return { text: `QUICK SLOT ${entry.topIndex + 1}`, cls: 'ui-amber' };
  if (entry.battleCapable) return { text: 'CAN BE SET', cls: 'ui-blue' };
  return { text: 'IN BAG', cls: 'ui-secondary' };
}

function drawStorageSlot(entry, rect, selected) {
  const badge = storageBadge(entry);
  drawMicroBox(rect, { selected, dim: entry?.present === false, active: entry?.battleCapable && entry.compartment !== 'top' });
  uiText(rect.x + 1, rect.y, clip(entry?.title || 'EMPTY', rect.w - 2), selected ? 'ui-amber' : entry?.present === false ? 'ui-secondary' : 'ui-primary', selected ? 1 : .72);
  if (rect.h > 3) uiText(rect.x + 1, rect.y + 1, clip(entry?.subtitle || '', rect.w - 2), 'ui-label', selected ? .62 : .46);
  uiText(rect.x + 1, rect.y + rect.h - 1, clip(badge.text, rect.w - 2), badge.cls, selected ? .92 : .64);
}

function kitStorageColumns(width) {
  if (width >= 46) return 3;
  if (width >= 28) return 2;
  return 1;
}

function drawBagStorage(entries, selectedId, rect) {
  const storage = kitStorageEntries(entries);
  const cols = kitStorageColumns(rect.w);
  const gap = 1;
  const headerH = 3;
  const cellW = Math.max(8, Math.floor((rect.w - gap * Math.max(0, cols - 1)) / cols));
  const cellH = rect.h >= 15 ? 4 : 3;
  const rows = Math.max(1, Math.floor((rect.h - headerH) / cellH));
  const max = Math.max(1, rows * cols);

  uiText(rect.x, rect.y, 'ALL ITEMS', 'ui-label', .76);
  rightText(rect.x, rect.y, rect.w, `${Math.min(storage.length, max)}/${storage.length}`, 'ui-blue', .52);
  uiText(rect.x, rect.y + 1, clip('Choose an item, then choose an action.', rect.w), 'ui-secondary', .52);

  if (!storage.length) {
    uiText(rect.x + Math.max(0, Math.floor((rect.w - 10) / 2)), rect.y + 4, 'BAG EMPTY', 'ui-secondary', .46);
    return;
  }

  const selectedAt = Math.max(0, storage.findIndex((entry) => entry.id === selectedId));
  const start = selectedAt >= max ? Math.max(0, selectedAt - max + 1) : 0;
  const visible = storage.slice(start, start + max);
  visible.forEach((entry, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = rect.x + col * (cellW + gap);
    const y = rect.y + headerH + row * cellH;
    const w = col === cols - 1 ? Math.max(8, rect.x + rect.w - x) : cellW;
    const selected = entry.id === selectedId && entry.compartment !== 'top';
    drawStorageSlot(entry, { x, y, w, h: Math.max(3, cellH - .35) }, selected);
  });

  if (start > 0) uiText(rect.x, rect.y + 2, '▲ MORE', 'ui-secondary', .38);
  if (start + max < storage.length) rightText(rect.x, rect.y + rect.h - 1, rect.w, '▼ MORE ITEMS', 'ui-secondary', .44);
}

function kitVerdict(entry) {
  if (!entry) {
    return { tone: 'empty', cls: 'ui-secondary', title: 'NOTHING HERE', copy: 'Pick an item and choose SET to put it in a quick slot.' };
  }
  if (entry.present === false) {
    return entry.source?.deployed
      ? { tone: 'deployed', cls: 'ui-blue', title: 'DEPLOYED', copy: 'Its quick slot is kept. The item is where you left it.' }
      : { tone: 'missing', cls: 'ui-danger', title: 'NOT CARRIED', copy: 'Its quick slot is kept until the item is recovered.' };
  }
  if (entry.compartment === 'top') {
    return { tone: 'ready', cls: 'ui-amber', title: 'AVAILABLE IN A FIGHT', copy: 'This item is in a quick slot.' };
  }
  if (entry.battleCapable) {
    return { tone: 'assignable', cls: 'ui-blue', title: 'CAN GO IN A QUICK SLOT', copy: 'Choose SET, then choose a numbered slot.' };
  }
  return { tone: 'carry', cls: 'ui-secondary', title: 'USED IN THE BUILDING', copy: 'This item is not used during a fight.' };
}

function drawKitDetail(entry, rect, nav, motion, now) {
  const p = acquire(now, motion.selectionChangedAt);
  drawMicroBox(rect, { selected: false, active: true });

  if (nav.mode === 'confirm') {
    drawConfirm(nav, { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 }, entry, p);
    return;
  }

  const verdict = kitVerdict(entry);
  const iconW = Math.min(12, Math.max(7, Math.floor(rect.w * .28)));
  const iconH = Math.min(7, Math.max(4, Math.floor(rect.h * .32)));
  drawBagIcon(entry?.icon || 'unknown', rect.x + 1, rect.y + 2, {
    w: iconW,
    h: iconH,
    active: true,
    state: entry?.status?.tone || verdict.tone,
    alpha: entry ? .35 + p * .55 : .20,
    empty: entry?.present === false,
  });

  const tx = rect.x + iconW + 3;
  const tw = Math.max(10, rect.x + rect.w - tx - 1);
  uiText(tx, rect.y + 1, 'SELECTED ITEM', 'ui-label', .58);
  uiText(tx, rect.y + 2, clip(entry?.title || 'EMPTY QUICK SLOT', tw), 'ui-amber', .62 + p * .38);
  uiText(tx, rect.y + 3, clip(entry?.subtitle || 'NO ITEM ASSIGNED', tw), 'ui-secondary', .58);

  const verdictY = rect.y + Math.max(5, iconH + 3);
  uiStrokeRect(rect.x + 1, verdictY, rect.w - 2, 3, verdict.cls === 'ui-amber' ? UI_COLOR.amber : verdict.cls === 'ui-blue' ? UI_COLOR.blue : UI_COLOR.frame, .30, 1);
  uiText(rect.x + 2, verdictY + 1, clip(verdict.title, rect.w - 4), verdict.cls, .86);
  uiText(rect.x + 2, verdictY + 2, clip(verdict.copy, rect.w - 4), 'ui-secondary', .62);

  let cy = verdictY + 4;
  const description = entry?.description || '';
  if (description && cy < rect.y + rect.h - 4) {
    cy += drawDescription(description, rect.x + 1, cy, rect.w - 2, Math.max(1, rect.y + rect.h - cy - 4), 'ui-secondary');
  }

  const actionY = rect.y + rect.h - 2;
  const detailAction = bagKitDetailAction(entry);
  uiText(rect.x + 1, actionY, clip(detailAction, rect.w - 2), entry?.battleCapable ? 'ui-amber' : 'ui-label', .72);
}

export function bagKitDetailAction(entry) {
  if (!entry) return 'NO ITEM SELECTED';
  const actions = [];
  if (entry.actions?.secondary?.id === 'move-storage') actions.push('[R] CLEAR QUICK SLOT');
  else if (entry.actions?.secondary?.id === 'move-top') actions.push('[T] PUT IN QUICK SLOT');
  if (entry.actions?.primary) actions.push(`[${inputPromptLabel('confirm')}] ${entry.actions.primary.label}`);
  if (actions.length) return actions.join('   ');
  if (entry.actionReason) return entry.actionReason;
  if (entry.present === false) return 'NOT CARRIED';
  return 'NO ACTION AVAILABLE FROM THE BAG';
}

export function bagInventoryGeometry(model, nav, layout) {
  const region=kitRegion(layout);
  // Screen selectors have first claim on the case. A shallow inventory folds
  // its quick-slot summary down, not its content through the lower faceplate.
  const readyH=region.h>=21?7:region.h>=16?5:region.h>=11?3.2:region.h>=8?1.5:0;
  const gap=readyH?Math.min(.7,region.h*.04):0;
  const contentY=region.y+readyH+gap;
  const contentH=Math.max(0,region.y+region.h-contentY);
  if(region.w>=52&&contentH>=4){
    const listW=clamp(Math.floor(region.w*.42),20,38);
    return{region,ready:{x:region.x,y:region.y,w:region.w,h:readyH},
      list:{x:region.x,y:contentY,w:listW,h:contentH},
      detail:{x:region.x+listW+2,y:contentY,w:region.w-listW-2,h:contentH}};
  }
  const splitGap=Math.min(.6,contentH*.06);
  const listH=Math.max(0,(contentH-splitGap)*.48);
  return{region,ready:{x:region.x,y:region.y,w:region.w,h:readyH},
    list:{x:region.x,y:contentY,w:region.w,h:listH},
    detail:{x:region.x,y:contentY+listH+splitGap,w:region.w,h:Math.max(0,contentH-listH-splitGap)}};
}

export function bagInventoryListLayout(rect) {
  const compact=rect.h<5;
  const rowH=compact?1:2;
  return {compact,rowH,startY:rect.y+1,capacity:Math.max(0,Math.floor((rect.h-1)/rowH))};
}

export function bagInventoryActionLayout(rect, entry, nav = {}) {
  const portrait=itemPortrait(entry)&&rect.w>=40&&rect.h>=7
    ?{x:rect.x+.5,y:rect.y+1.55,w:Math.floor(rect.w*.41),h:Math.max(0,rect.h-2)}:null;
  const textRect=portrait?{...rect,x:portrait.x+portrait.w+.5,w:rect.w-portrait.w-1}:rect;
  const actions=entry?.actionList||[];
  const descriptionRows=Math.min(3,Math.max(0,Math.floor(rect.h)-7));
  const titleY=rect.h>=1?rect.y+Math.min(.3,rect.h-1):null;
  const descriptionY=rect.y+1.55;
  const hintY=rect.h>=2.8?descriptionY+descriptionRows+.2:null;
  const startY=hintY===null?rect.y+rect.h:hintY+1.15;
  const capacity=Math.max(0,Math.floor(rect.y+rect.h-startY));
  const index=Math.max(0,Number(nav.actionIndex)||0);
  const offset=nav.actionFocus&&capacity?Math.max(0,Math.min(index-capacity+1,actions.length-capacity)):0;
  return {titleY,descriptionY,descriptionRows,hintY,startY,capacity,offset,portrait,textRect,
    rows:actions.slice(offset,offset+capacity).map((action,row)=>({action,index:offset+row,x:textRect.x+1,y:startY+row,w:Math.max(0,textRect.w-2),h:1}))};
}

function drawInventoryList(entries,selectedId,rect,scroll,pulse){
  if(rect.h<1)return;
  uiText(rect.x,rect.y,'ALL ITEMS','ui-label',.72);
  rightText(rect.x,rect.y,rect.w,rect.w>=32?`${entries.length} CARRIED / TRACKED`:`${entries.length} ITEMS`,'ui-blue',.52);
  const list=bagInventoryListLayout(rect);
  entries.slice(scroll,scroll+list.capacity).forEach((entry,index)=>{
    const y=list.startY+index*list.rowH,on=entry.id===selectedId;
    uiFill(rect.x,y,rect.w,list.rowH-.15,on?'rgba(216,138,59,.13)':'rgba(255,255,255,.018)');
    uiText(rect.x,y,on?'▸':' ',on?'ui-amber':'ui-secondary',on ? .9 : .5);
    uiText(rect.x+2,y,clip(entry.title,Math.max(8,rect.w-14)),on?'ui-amber':entry.present?'ui-primary':'ui-secondary',on?1:.75);
    const slot=entry.compartment==='top'?`SET ${entry.topIndex+1}`:entry.source?.deployed?'DEPLOYED':'BAG';
    rightText(rect.x,y,rect.w,slot,entry.compartment==='top'?'ui-amber':entry.source?.deployed?'ui-blue':'ui-label',on ? .9 : .55);
    if(!list.compact)uiText(rect.x+2,y+1,clip(entry.subtitle,rect.w-3),'ui-secondary',on ? .64 : .42);
  });
}

function drawInventoryActions(entry,rect,nav,motion,now){
  if(rect.h<1||rect.w<4)return;
  drawMicroBox(rect,{active:true});
  if(!entry){uiText(rect.x+1,rect.y,'NO ITEM SELECTED','ui-secondary',.6);return;}
  const focused=!!nav.actionFocus,index=Math.max(0,Number(nav.actionIndex)||0);
  const actionLayout=bagInventoryActionLayout(rect,entry,nav);
  const textRect=actionLayout.textRect;
  if(actionLayout.portrait){const p=actionLayout.portrait;drawItemPortrait(entry,p.x,p.y,{w:p.w,h:p.h,large:true,empty:entry.present===false});}
  if(actionLayout.titleY!==null)uiText(rect.x+1,actionLayout.titleY,clip(entry.title,rect.w-2),'ui-amber',.95);
  drawDescription(entry.description||'',textRect.x+1,actionLayout.descriptionY,textRect.w-2,actionLayout.descriptionRows,'ui-secondary');
  const actions=entry.actionList||[];
  // SAY WHAT THE STAGE IS, IN WORDS.
  //
  // This is a two-stage control — pick an item, then step into its actions — and
  // it read as a passive list because the header said "FOCUS", which is a word
  // about the UI rather than about what you are doing. Each stage now names its
  // own keys, and the first available action carries a dim caret even before you
  // step in, so the list looks like the menu it is.
  if(actionLayout.hintY!==null)uiText(textRect.x+1,actionLayout.hintY,
    clip(focused?'[↑↓] CHOOSE · [ENTER] USE':'[ENTER] ACTIONS',textRect.w-2),
    'ui-label',focused ? .82 : .62);
  const firstEnabled=actions.findIndex((action)=>action.enabled);
  actionLayout.rows.forEach(({action,index:i,x,y,w})=>{
    const on=focused&&i===index;
    const hint=!focused&&i===firstEnabled;
    uiText(x,y,on||hint?'▸':' ',on?'ui-amber':'ui-secondary',on?1:hint?.42:.45);
    const verb=action.verb==='special'?action.label:`${action.verb.toUpperCase()}${action.label!==action.verb.toUpperCase()?` · ${action.label}`:''}`;
    const reason=!action.enabled?` — ${action.reason}`:action.exitPolicy==='close'?' — CLOSES BAG':'';
    uiText(x+2,y,clip(`${verb}${reason}`,w-2),!action.enabled?'ui-secondary':on?'ui-amber':'ui-primary',!action.enabled ? .42 : on ? 1 : .72);
  });
  void motion;void now;
}

function drawKitLoadoutView(model, nav, layout, motion, now) {
  const section=bagSection(model,'kit')||{entries:[]};
  const selected=bagEntry(model,'kit',nav.selected?.kit);
  const geo=bagInventoryGeometry(model,nav,layout);
  // The ready tray is a summary only. Every item appears exactly once in the
  // catalog below, with its numbered assignment shown beside it.
  drawReadyNow(model,section.entries,selected?.id||null,geo.ready);
  const cap=bagInventoryListLayout(geo.list).capacity;
  const at=Math.max(0,section.entries.findIndex((entry)=>entry.id===selected?.id));
  const scroll=Math.max(0,Math.min(Number(nav.scroll?.kit)||0,Math.max(0,section.entries.length-cap)));
  const visibleScroll=at<scroll?at:at>=scroll+cap?at-cap+1:scroll;
  drawInventoryList(section.entries,selected?.id||null,geo.list,visibleScroll,acquire(now,motion.selectionChangedAt));
  drawInventoryActions(selected,geo.detail,nav,motion,now);
}

function drawList(model, nav, layout, motion, now) {
  const section = bagSection(model, nav.sectionId) || { entries: [] };
  const selectedId = nav.selected?.[section.id];
  const capacity = bagListCapacity(layout, section.id);
  const scroll = nav.scroll?.[section.id] || 0;
  const pulse = acquire(now, motion.selectionChangedAt);

  uiText(layout.list.x, layout.list.y, sectionHeader(section.id), 'ui-label', .74);
  rightText(layout.list.x, layout.list.y, layout.list.w, `${Math.min(section.entries.length, scroll + capacity)}/${section.entries.length}`, 'ui-blue', .56);

  if (!section.entries.length) {
    const empty = 'NO ENTRIES';
    uiText(layout.list.x + Math.max(0, Math.floor((layout.list.w - empty.length) / 2)), layout.list.y + 3, empty, 'ui-secondary', .52);
    return;
  }

  if (scroll > 0) rightText(layout.list.x, layout.list.y + 1, layout.list.w, '▲ MORE', 'ui-secondary', .48);

  if (section.id === 'kit') drawKitList(section.entries, selectedId, layout.list, scroll, capacity, pulse);
  else if (section.id === 'map') drawManifestList(section.entries, selectedId, layout.list, scroll, capacity, pulse);
  else drawFilesList(section.entries, selectedId, layout.list, scroll, capacity, pulse);

  if (scroll + capacity < section.entries.length) {
    rightText(layout.list.x, layout.list.y + layout.list.h - 1, layout.list.w, '▼ MORE', 'ui-secondary', .48);
  }
}

function drawProgress(model, x, y, width) {
  const rooms = bagSection(model, 'map')?.entries || [];
  if (!rooms.length || width < 18) return;

  const parts = rooms.map((room) => {
    const short = room.title
      .split(/\s+/)
      .map((word) => word[0] || '')
      .join('')
      .slice(0, 3);
    return `${short} ${room.recorded ? '▮' : '▯'}`;
  });

  const text = clip(parts.join('  '), width);
  uiText(x, y, text, 'ui-blue', .68);
}

function drawFacts(entry, x, y, width, maxRows) {
  let cy = y;
  const facts = Array.isArray(entry?.facts) ? entry.facts : [];
  const labelW = Math.min(12, Math.max(7, ...facts.map(([label]) => String(label).length)));

  for (const [label, value] of facts) {
    if (cy >= y + maxRows) break;
    uiText(x, cy, clip(label, labelW), 'ui-label', .64);
    uiText(x + labelW + 2, cy, clip(value, Math.max(1, width - labelW - 2)), toneClass(entry.status?.tone), .78);
    cy++;
  }

  return cy;
}

function drawDescription(text, x, y, width, maxRows, cls = 'ui-secondary') {
  const lines = uiWrap(text, Math.max(8, width));
  for (let i = 0; i < Math.min(maxRows, lines.length); i++) {
    const more = i === maxRows - 1 && lines.length > maxRows;
    uiText(x, y + i, clip(more ? `${lines[i]}…` : lines[i], width), cls, .72);
  }
  return Math.min(maxRows, lines.length);
}

function drawConfirm(nav, rect, entry, pulse) {
  const confirm = nav.pendingAction?.confirm || {};
  const title = confirm.title || `CONFIRM ${entry?.title || 'ACTION'}?`;
  const body = confirm.body || 'THIS ACTION CANNOT BE UNDONE.';

  drawBagIcon(entry?.icon || 'unknown', rect.x + 1, rect.y + 1, {
    w: Math.min(14, Math.max(8, rect.w * .30)),
    h: Math.min(7, rect.h - 2),
    active: true,
    state: 'danger',
    alpha: .72 + pulse * .28,
  });

  const tx = rect.x + Math.min(17, Math.floor(rect.w * .34));
  uiText(tx, rect.y + 1, clip(title, rect.x + rect.w - tx), 'ui-danger', .82 + pulse * .18);
  const lines = uiWrap(body, Math.max(10, rect.x + rect.w - tx));
  lines.slice(0, 4).forEach((line, i) => uiText(tx, rect.y + 3 + i, line, 'ui-secondary', .72));
}

function drawDetail(model, nav, layout, motion, now) {
  const entry = bagEntry(model, nav.sectionId, nav.selected?.[nav.sectionId]);
  const rect = layout.detail;
  const p = acquire(now, motion.selectionChangedAt);
  const dx = layout.mode === 'wide' ? (1 - p) * .9 : 0;

  if (!entry) {
    uiText(rect.x, rect.y, 'NO ENTRY SELECTED', 'ui-secondary', .58);
    return;
  }

  if (nav.mode === 'confirm') {
    drawConfirm(nav, rect, entry, p);
    return;
  }

  const iconW = layout.mode === 'wide' ? Math.min(15, Math.max(10, Math.floor(rect.w * .30))) : 8;
  const iconH = layout.mode === 'wide' ? Math.min(8, Math.max(5, rect.h - 2)) : Math.min(5, rect.h - 1);
  drawBagIcon(entry.icon, rect.x + dx, rect.y + 1, {
    w: iconW,
    h: iconH,
    active: true,
    state: entry.status?.tone,
    alpha: .32 + p * .68,
    empty: entry.present === false,
  });

  const tx = rect.x + iconW + 2;
  const tw = Math.max(8, rect.x + rect.w - tx);
  uiText(tx, rect.y, clip(entry.title, tw), 'ui-amber', .50 + p * .50);
  uiText(tx, rect.y + 1, clip(entry.subtitle, tw), 'ui-label', .66);

  const status = entry.status?.label || '';
  uiText(tx, rect.y + 3, 'STATUS', 'ui-label', .62);
  uiText(tx + 9, rect.y + 3, clip(status, Math.max(1, tw - 9)), toneClass(entry.status?.tone), .88);

  if (layout.mode === 'compact') {
    drawDescription(entry.description || entry.preview || '', tx, rect.y + 4, tw, Math.max(1, rect.h - 4));
    return;
  }

  let cy = rect.y + iconH + 2;
  if (entry.kind === 'room') {
    drawProgress(model, rect.x, cy, rect.w);
    cy += 2;
  }

  cy = drawFacts(entry, rect.x, cy, rect.w, Math.max(1, rect.y + rect.h - cy - 4));
  cy++;

  if (entry.kind === 'room' && entry.attached && cy < rect.y + rect.h - 3) {
    uiText(rect.x, cy++, 'ATTACHED FILE', 'ui-label', .68);
    uiText(rect.x, cy++, clip(entry.attached.title || entry.attached.id, rect.w), 'ui-blue', .78);
  }

  const description = entry.description || entry.preview || '';
  if (description && cy < rect.y + rect.h) {
    cy++;
    drawDescription(description, rect.x, cy, rect.w, Math.max(1, rect.y + rect.h - cy));
  }
}

export function bagActionRail(entry, mode) {
  if (mode === 'confirm') {
    return [[inputPromptLabel('confirm'), 'CONFIRM'], [inputPromptLabel('back'), 'CANCEL'], [inputPromptLabel('bag'), 'CLOSE']];
  }

  if(entry?.kind==='gear')return [[inputPromptLabel('confirm'),'ACTIONS'],[inputPromptLabel('bag'),'CLOSE BAG']];
  if(entry?.kind==='file')return [[inputPromptLabel('confirm'),'INSPECT SHEET'],[inputPromptLabel('bag'),'CLOSE BAG']];
  const out = [];
  if (entry?.actions?.primary) out.push([inputPromptLabel('confirm'), entry.actions.primary.label]);

  if (entry?.kind === 'gear' && entry?.actions?.secondary) {
    if (entry.actions.secondary.id === 'move-top') out.push(['T', 'PUT IN QUICK SLOT']);
    else if (entry.actions.secondary.id === 'move-storage') out.push(['R', 'CLEAR QUICK SLOT']);
    else out.push([inputPromptLabel('mark'), entry.actions.secondary.label]);
  } else if (entry?.actions?.secondary) {
    out.push([inputPromptLabel('mark'), entry.actions.secondary.label]);
  }

  out.push([inputPromptLabel('bag'), 'CLOSE']);
  return out;
}

function actionRailText(actions, width) {
  const full = actions.map(([key, label]) => `[${key}] ${label}`).join('   ');
  if (full.length <= width) return full;
  return actions.map(([key, label]) => `[${key}] ${label}`).join(' · ');
}

export function bagTaskText({ hint, model, entry }) {
  if (hint) return String(hint).toUpperCase();
  if (model.progress.total > 0 && model.progress.done >= model.progress.total) {
    return `TASK: RETURN WITH ${model.progress.total} ACCEPTED TAKES.`;
  }
  if (entry?.kind === 'room' && entry.marked) return `WAYPOINT: ${entry.title}`;
  return `TASK: RECORD FIVE CLEAN MINUTES · ${model.progress.done}/${model.progress.total} COMPLETE`;
}

// How tall a callout needs to be for this guide at this width. The caller asks
// the layout for the band before drawing, so the case's own content is laid out
// around a callout that is always fully readable — never clipped, never scrolled.
export function bagGuideRows(guide, width) {
  if (!guide) return 0;
  const side=guide.kind==='skills'&&guide.continueLabel?Math.min(22,width*.4)+2:0;
  const w = Math.max(12, Math.floor(width-side) - 4);
  return 2 + uiWrap(String(guide.why || ''), w).length;
}

export function bagGuideContinueRegion(guide,region){
  if(!region||region.h<2||guide?.kind!=='skills'||!guide.continueLabel)return null;
  const w=Math.min(22,region.w*.4),h=1.8;
  return{x:region.x+region.w-w,y:region.y+(region.h-h)/2,w,h};
}

function guideSelectKey(guide){
  if(activeInputPromptDevice()==='controller')return inputPromptLabel('tabNext');
  const section=guide.sectionId||guide.section;
  return{kit:'1',map:'2',sheets:'3',files:'3',skills:'4'}[section]||'TAB';
}

function guideContinueKey(){return activeInputPromptDevice()==='controller'?inputPromptLabel('tabNext'):'C';}
function guidePatchKey(){return activeInputPromptDevice()==='controller'?inputPromptLabel('confirm'):'ENTER';}

export function bagGuideActions(guide){
  const controller=activeInputPromptDevice()==='controller';
  const actions=guide.kind==='section'?[[guideSelectKey(guide),String(guide.title||'OPEN SECTION').toUpperCase()]]
    :guide.kind==='skills'?[[inputPromptLabel('select'),'INPUT'],[guidePatchKey(),controller?'PATCH / PULL':'PATCH'],...(!controller?[['SPACE','PULL']]:[]),...(guide.continueLabel?[[guideContinueKey(),guide.continueLabel]]:[])]
      :guide.kind==='close'?[[inputPromptLabel('bag'),'CLOSE & FOLLOW TARGET']]
        :[[inputPromptLabel(guide.action||'confirm'),String(guide.title||'CONTINUE').toUpperCase()]];
  if(guide.allowClose!==false&&guide.kind!=='close')actions.push([inputPromptLabel('bag'),'CLOSE']);
  return actions;
}

// The guided callout. A locked surface has to say three things at once, loudly:
// that it IS locked, which control opens it, and — the part a footer hint could
// never carry — why the man wants it done. `nudge` is how long ago the player
// pressed something the lock refused, so the band can flash rather than queue up
// a line of monitor text nobody asked for.
export function drawBagGuide({ guide, region, nudge = 1 }) {
  if (!guide || !region || region.h <= 0) return;
  const refused = nudge < 0.5;
  const pulse = refused ? 0.5 + 0.5 * Math.cos(nudge * Math.PI * 6) : 0;
  uiFill(region.x - 1, region.y - .3, region.w + 2, region.h + .6, refused ? 'rgba(60,34,4,0.55)' : 'rgba(28,20,6,0.42)');
  uiStrokeRect(region.x - 1, region.y - .3, region.w + 2, region.h + .6, UI_COLOR.amber, .35 + pulse * .5, 1);

  const continuation=bagGuideContinueRegion(guide,region);
  const copyW=continuation?Math.max(12,continuation.x-region.x-2):region.w;
  const key = guide.kind==='section'?guideSelectKey(guide):guide.kind==='skills'?guidePatchKey():guide.kind==='close'?inputPromptLabel('bag'):inputPromptLabel(guide.action || 'confirm');
  const head = `▶ GUIDED · [${key}] ${String(guide.title || '').toUpperCase()}`;
  uiText(region.x, region.y, clip(head, copyW), 'ui-amber', 1);
  uiWrap(String(guide.why || ''), Math.max(12, copyW - 2))
    .slice(0, Math.max(0, region.h - 2))
    .forEach((line, i) => uiText(region.x + 2, region.y + 1 + i, clip(line, copyW - 2), 'ui-primary', .88));
  const foot = refused
    ? guide.refusal || (guide.allowClose===false?'FINISH THIS STEP BEFORE LEAVING THE CASE.':'THE CASE IS HELD ON THIS ONE THING. THE REST OF THE NIGHT IS YOURS.')
    : guide.footer || (guide.kind==='skills'?`CHOOSE AN INPUT · ${guidePatchKey()} PATCHES · ${guideContinueKey()} CONTINUES`
      :guide.kind==='section'?'PRESS THE HIGHLIGHTED SCREEN SELECTOR'
        :guide.kind==='close'?'CLOSE THE CASE. THE WAYPOINT WILL LEAD YOU THERE.'
          :guide.allowClose===false?'SET THE TARGET, THEN CLOSE AND FOLLOW IT.':`EVERYTHING ELSE IS HELD UNTIL THIS IS DONE · [${inputPromptLabel('bag')}] CLOSE THE CASE`);
  uiText(region.x + 2, region.y + region.h - 1, clip(foot, copyW - 2), refused ? 'ui-amber' : 'ui-secondary', refused ? .95 : .6);
  if(continuation)drawLampButton(continuation.x,continuation.y,continuation.w,continuation.h,{
    controlId:'bag:guide:continue',legend:guide.continueLabel,code:guideContinueKey(),color:'green',
    enabled:guide.continueEnabled!==false,lit:guide.continueEnabled!==false,latched:false,
  });
}

export function drawBagView({ model, nav, mapNav = null, layout, hint = '', guide = null, guideNudge = 1, motion, now, drawContent = null, overrideActions = null, breadcrumb = '' }) {
  const selected = bagEntry(model, nav.sectionId, nav.selected?.[nav.sectionId]);
  const sectionPulse = acquire(now, motion.sectionChangedAt);
  drawTabs(model,nav,layout,sectionPulse,breadcrumb,guide);

  let actions = null, mapPresentation = null;
  // A section may own its whole content area (the SKILLS tree does). It gets the
  // list+detail region and the surrounding chrome is untouched.
  if (drawContent) {
    const region = layout.mode === 'wide'
      ? { x: layout.list.x, y: layout.list.y, w: (layout.detail.x + layout.detail.w) - layout.list.x, h: layout.list.h }
      : { x: layout.list.x, y: layout.detail.y, w: layout.list.w, h: (layout.list.y + layout.list.h) - layout.detail.y };
    drawContent(region);
  } else if (nav.sectionId === 'map' && model.mapUnavailableReason) {
    mapPresentation=drawMapOffline({bagLayout:layout,reason:model.mapUnavailableReason,now});
    actions=mapPresentation.actions;
  } else if (nav.sectionId === 'map' && model.map && mapNav) {
    const rendered = drawMapView({ model: model.map, nav: mapNav, bagLayout: layout, now });
    mapPresentation = rendered;
    actions = rendered.actions;
  } else if (nav.sectionId === 'kit') {
    drawKitLoadoutView(model, nav, layout, motion, now);
  } else {
    if (layout.mode === 'wide') {
      uiLine(layout.dividerX, layout.list.y - 1, layout.dividerX, layout.list.y + layout.list.h, undefined, .36);
    } else {
      uiLine(layout.list.x, layout.list.y - 1, layout.list.x + layout.list.w, layout.list.y - 1, undefined, .30);
    }
    drawList(model, nav, layout, motion, now);
    drawDetail(model, nav, layout, motion, now);
  }

  uiLine(layout.taskRail.x, layout.taskRail.y - .35, layout.taskRail.x + layout.taskRail.w, layout.taskRail.y - .35, undefined, .24);
  const taskText=clip(guide?.title||bagTaskText({ hint, model, entry: selected }), layout.taskRail.w);
  if(nav.sectionId==='map'){
    // Live task state is electronic, never changing etched ink on the metal.
    uiFill(layout.taskRail.x,layout.taskRail.y-.45,layout.taskRail.w,1.1,'#0a130c');
    uiText(layout.taskRail.x+.7,layout.taskRail.y-.4,clip(taskText,layout.taskRail.w-1.4),'ui-secondary',.9);
  }
  else uiText(layout.taskRail.x, layout.taskRail.y-.4, taskText, guide||hint ? 'ui-amber' : 'ui-secondary', guide||hint ? .92 : .62);

  // Guided instruction belongs to the exterior tour rail. The instrument's
  // content and controls retain the whole interior; no bottom callout overlays it.

  // A locked case does not advertise the keys it is refusing.
  actions = overrideActions || (guide
    ? bagGuideActions(guide)
    : nav.mode === 'confirm' ? bagActionRail(selected, nav.mode) : (actions || bagActionRail(selected, nav.mode)));
  const actionText = clip(actionRailText(actions, layout.actionRail.w), layout.actionRail.w);
  drawPrintedText(layout.actionRail.x,layout.actionRail.y,actionText,{w:layout.actionRail.w,
    ink:nav.mode==='confirm'?'#612014':'#333830',finish:'etched',darkPanel:false});
  return mapPresentation;
}
