import * as scenes from './scenes.js';
import { uiCenter, uiLine, uiScrim, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawLocationIndicator, withMachinePanel, drawVfdText, drawLampButton } from '../render/presentation.js';
import { drawPrintedText } from '../render/keycap.js';
import { createHitRegions } from '../render/hit-regions.js';
import { UI_COLOR } from '../render/palette.js';
import {
  cycleRuleValue,
  normalizeRuleValues,
  visiblePresets,
} from '../progression/difficulty.js';
import { RULE_HELP, RULE_LABELS, VALUE_LABELS } from '../progression/difficulty-defs.js';
import { deriveUnlocks } from '../progression/unlocks.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';

// Every preset but Dead Air is open from the first run; Dead Air asks for one
// finished night of any kind. Said on the row itself rather than in a manual.
const LOCKED_SUBTITLE = 'COMPLETE ANY ENDING TO UNLOCK';

const RULE_ORDER = Object.freeze([
  'presencePressure',
  'recordingForgiveness',
  'combatAssistance',
  'navigationSignal',
  'escapeTimer',
  'torchDrain',
  'involuntaryBreath',
]);

const CUSTOM_PRESET = Object.freeze({
  id: 'custom',
  name: 'CUSTOM',
  subtitle: 'CUSTOM RULES',
  rank: 4,
  intended: false,
  description: 'Adjust individual difficulty settings. Story progress and most achievements are unchanged, but custom settings cannot earn the Dead Air achievement.',
});

export function makeDifficultySelectScene({
  meta,
  initialPreset = 'contract',
  initialCustomValues = null,
  preparation = false,
  onConfirm = () => {},
  onCancel = () => {},
} = {}) {
  const customUnlocked = deriveUnlocks(meta).customShift;
  const presets = [
    ...visiblePresets(meta),
    ...(customUnlocked ? [{ ...CUSTOM_PRESET, values: normalizeRuleValues(initialCustomValues || {}) }] : []),
  ];
  const requested = presets.findIndex((preset) => preset.id === initialPreset);
  const contract = presets.findIndex((preset) => preset.id === 'contract');
  let sel = requested >= 0 ? requested : Math.max(0, contract);
  let mode = 'select'; // select | custom
  let ruleSel = 0;
  let customValues = normalizeRuleValues(initialCustomValues || {});
  let t = 0;
  let pending = false, error = '', active = true, generation = 0, settled = Promise.resolve();
  const hits = createHitRegions();

  const selectedPreset = () => presets[sel] || presets[0];

  function selectPreset(index, { sound = true } = {}) {
    if (preparation && (pending || error)) return false;
    if (index < 0 || index >= presets.length || index === sel) return false;
    sel = index;
    if (sound) AUDIO.menuMove();
    return true;
  }

  function selectRule(index, { sound = true } = {}) {
    if (preparation && (pending || error)) return false;
    if (index < 0 || index >= RULE_ORDER.length || index === ruleSel) return false;
    ruleSel = index;
    if (sound) AUDIO.menuMove();
    return true;
  }

  function cycleCustomRule(index, delta) {
    if (preparation && (pending || error)) return false;
    selectRule(index, { sound: false });
    const key = RULE_ORDER[index];
    customValues = {
      ...customValues,
      [key]: cycleRuleValue(key, customValues[key], delta),
    };
    AUDIO.menuMove();
  }

  function confirmPreset() {
    if (preparation && (pending || !active)) return false;
    const preset = selectedPreset();
    if (!preset) return;
    if (preset.locked) {
      AUDIO.menuMove();
      return;
    }
    if (preset.id === 'custom' && mode === 'select') {
      mode = 'custom';
      ruleSel = 0;
      AUDIO.menuConfirm();
      return;
    }
    const selection = {
      preset: preset.id,
      values: preset.id === 'custom' ? { ...customValues } : { ...preset.values },
      custom: preset.id === 'custom',
    };
    AUDIO.menuConfirm();
    if (!preparation) {
      scenes.pop();
      onConfirm(selection);
      return;
    }
    pending = true; error = '';
    const token = ++generation;
    const finish = result => {
      if (!active || generation !== token) return false;
      pending = false;
      if (result !== true && result?.ok !== true) {
        error = 'Shift could not be saved. Retry confirmation, or Back to preparation.';
        return false;
      }
      scenes.remove(scene);
      return true;
    };
    try { settled = Promise.resolve(onConfirm(selection)).then(finish, () => finish(false)); }
    catch { settled = Promise.resolve(finish(false)); }
    return true;
  }

  function cancelPreparation() {
    if (pending || !active) return false;
    if (mode === 'custom' && !error) { mode = 'select'; AUDIO.menuBack(); return true; }
    AUDIO.menuBack(); scenes.remove(scene); onCancel(); return true;
  }

  function renderPreparation() {
    const { cols, rows } = uiSize(), compact = rows < 28 || cols < 100;
    const w = Math.max(30, Math.min(106, cols - 3)), h = Math.max(13, Math.min(36, rows - 2));
    const x = (cols - w) / 2, y = (rows - h) / 2;
    const ink = '#c5d3bd', muted = '#97b29c', amber = '#ecd29a';
    const text = (tx,ty,value,width,{height=.55,color=ink}={}) => drawPrintedText(tx,ty,String(value),{w:width,h:height,ink:color});
    uiScrim(.4);
    withMachinePanel(x,y,w,h,{wordmark:'AUDIOCORP',label:mode==='custom'?'CUSTOM SHIFT':'CHOOSE SHIFT',source:'VAN',footer:'',meter:false},body=>{
      // The optical aperture ends above machinePanelBody's nominal footer.
      // Keep both actuators and their save status inside that visible opening.
      const buttonY = y + h - 2.35 - 2.4;
      const listW = Math.max(12, Math.floor(body.w * .32)), detailX = body.x + listW + 2, detailW = body.x + body.w - detailX;
      const rowY = body.y + (compact ? .7 : 1.3), rowStep = Math.min(compact ? 1.3 : 2.6, Math.max(.8,(buttonY-rowY-1)/presets.length));
      uiLine(body.x+listW+.6,body.y+.1,body.x+listW+.6,buttonY-.45,UI_COLOR.frame,.65);
      presets.forEach((preset,index)=>{
        const on = index === sel, ry = rowY + index * rowStep;
        text(body.x,ry,`${on?'› ':''}${preset.name}${preset.locked?' ◇':''}`,listW,{height:compact?.58:.75,color:preset.locked?muted:on?amber:ink});
        if(!compact)text(body.x+.7,ry+1,preset.locked?'COMPLETE AN ENDING':preset.subtitle,listW-.7,{height:.43,color:muted});
        hits.add({id:`difficulty:${preset.id}`,kind:'difficulty-preset',x:body.x,y:ry-.15,w:listW,h:rowStep-.1,selected:on,disabled:pending||!!error,label:preset.name,
          onHover:()=>{if(mode==='select')selectPreset(index);},
          onClick:()=>{if(mode==='custom'&&index!==sel)mode='select';selectPreset(index);}});
      });
      const preset=selectedPreset(),values=preset.id==='custom'?customValues:preset.values;
      text(detailX,body.y,preset.name,detailW,{height:compact?.68:1,color:amber});
      const explanation=mode==='custom'?RULE_HELP[RULE_ORDER[ruleSel]]:preset.locked?'Complete an ending to unlock this shift.':preset.intended?'Recommended for a first visit.':preset.description;
      const summaryLines=uiWrap(explanation,Math.floor(detailW*1.45)).slice(0,compact?2:3);
      summaryLines.forEach((value,index)=>text(detailX,body.y+(compact?1.05:1.6)+index*(compact?.65:.85),value,detailW,{height:compact?.45:.6,color:muted}));
      const rulesY=body.y+(compact?2.65:4.5), ruleStep=Math.max(.65,Math.min(compact?.8:1.65,(buttonY-rulesY-.6)/RULE_ORDER.length));
      RULE_ORDER.forEach((key,index)=>{
        const ry=rulesY+index*ruleStep,selected=mode==='custom'&&index===ruleSel,value=VALUE_LABELS[values[key]]||String(values[key]).toUpperCase();
        text(detailX,ry,`${selected?'› ':''}${RULE_LABELS[key]}`,detailW*.61,{height:compact?.42:.58,color:selected?amber:muted});
        text(detailX+detailW*.63,ry,selected?`‹ ${value} ›`:value,detailW*.37,{height:compact?.42:.58,color:ink});
        if(mode==='custom')hits.add({id:`difficulty-rule:${key}`,kind:'difficulty-rule',x:detailX,y:ry-.1,w:detailW,h:ruleStep,disabled:pending||!!error,selected,label:RULE_LABELS[key],
          onHover:()=>selectRule(index),onClick:(_,event)=>cycleCustomRule(index,Number(event.cellX)<detailX+detailW*.63?-1:1)});
      });
      const back={x:body.x,y:buttonY,w:Math.min(18,body.w*.27),h:1.25};
      const confirm={x:body.x+body.w-Math.min(30,body.w*.48),y:buttonY,w:Math.min(30,body.w*.48),h:1.25};
      const label=pending?'SAVING SHIFT…':error?'RETRY CONFIRMATION':preset.id==='custom'&&mode==='select'?'EDIT CUSTOM SHIFT':'CONFIRM SHIFT';
      drawLampButton(back.x,back.y,back.w,back.h,{legend:mode==='custom'&&!error?'BACK TO SHIFTS':'BACK',enabled:!pending,color:'white'});
      drawLampButton(confirm.x,confirm.y,confirm.w,confirm.h,{legend:label,enabled:!pending&&!preset.locked,color:error?'red':'amber',lit:!pending&&!preset.locked});
      hits.add({id:'difficulty:back',kind:'back',...back,label:'BACK',disabled:pending,onClick:cancelPreparation});
      hits.add({id:'difficulty:confirm',kind:'confirm',...confirm,label,disabled:pending||!!preset.locked,onClick:confirmPreset});
      const message=error||(pending?'Saving your shift. Please wait.':'Selecting a row previews it. Confirm saves a draft; finishing the case starts the shift.');
      text(body.x,buttonY+1.5,message,body.w,{height:compact?.38:.48,color:error?'#e2a080':muted});
    });
  }

  const scene = {
    id: 'difficulty-select',
    handlesEscape: true,
    blocksInput: true,
    blocksWorld: true,
    worldPresentation: 'visible',
    lensPreset: 'calm',

    enter() { active = true; AUDIO.startMenuHiss(); },
    exit() { active = false; generation++; AUDIO.stopMenuHiss(); },
    update(dt) { t += dt; },

    pointer(e) {
      if (preparation && pending) return true;
      if (preparation && e.type === 'pointerdown' && (e.button ?? e.originalEvent?.button ?? 0) !== 0) return true;
      if (e.type === 'pointermove') hits.handle(e, { click: false });
      else if (e.type === 'pointerdown') hits.handle(e);
      return true;
    },

    key(e) {
      let k = String(e.key || '').toLowerCase();
      if(preparation){
        const action=e.controllerAction;
        if(pending)return true;
        if(e.repeat&&(['enter',' ','z','escape','b'].includes(k)||['confirm','back'].includes(action)))return true;
        if(action==='back'||k==='escape'||k==='b'){cancelPreparation();return true;}
        if(action==='confirm'){confirmPreset();return true;}
        if(error){if(['enter',' ','z'].includes(k))confirmPreset();return true;}
        if(action==='move_up')k='w';else if(action==='move_down')k='s';else if(action==='move_left')k='a';else if(action==='move_right')k='d';
      }

      if (mode === 'custom') {
        if (e.key === 'ArrowUp' || k === 'w') {
          ruleSel = (ruleSel - 1 + RULE_ORDER.length) % RULE_ORDER.length;
          AUDIO.menuMove();
          return true;
        }
        if (e.key === 'ArrowDown' || k === 's') {
          ruleSel = (ruleSel + 1) % RULE_ORDER.length;
          AUDIO.menuMove();
          return true;
        }
        if (e.key === 'ArrowLeft' || k === 'a' || e.key === 'ArrowRight' || k === 'd') {
          const delta = e.key === 'ArrowLeft' || k === 'a' ? -1 : 1;
          const key = RULE_ORDER[ruleSel];
          customValues = {
            ...customValues,
            [key]: cycleRuleValue(key, customValues[key], delta),
          };
          AUDIO.menuMove();
          return true;
        }
        if (e.key === 'Enter' || e.key === ' ' || k === 'z') {
          confirmPreset();
          return true;
        }
        if (e.key === 'Escape' || k === 'b') {
          mode = 'select';
          AUDIO.menuBack();
          return true;
        }
        return true;
      }

      if (e.key === 'ArrowUp' || k === 'w') {
        sel = (sel - 1 + presets.length) % presets.length;
        AUDIO.menuMove();
        return true;
      }
      if (e.key === 'ArrowDown' || k === 's') {
        sel = (sel + 1) % presets.length;
        AUDIO.menuMove();
        return true;
      }
      if (e.key === 'Enter' || e.key === ' ' || k === 'z') {
        confirmPreset();
        return true;
      }
      if (e.key === 'Escape' || k === 'b') {
        AUDIO.menuBack();
        scenes.pop();
        onCancel();
        return true;
      }
      return true;
    },

    render() {
      hits.reset();
      if(preparation){renderPreparation();return;}
      const { cols, rows } = uiSize();
      uiScrim(0.28);
      const w = Math.min(96, cols - 4);
      const detailRowsNeeded = 11 + RULE_ORDER.length * 2 + 3;
      const h = Math.min(Math.max(36, detailRowsNeeded + 7), rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      withMachinePanel(x, y, w, h, {
        wordmark: 'AUDIOCORP',
        label: mode === 'custom' ? 'CUSTOM DIFFICULTY' : 'DIFFICULTY',
        source: 'SETUP',
        footer: mode === 'custom'
          ? promptLine([{ action: 'select', label: 'RULE' }, { action: 'set', label: 'SET' }, { action: 'start', label: 'START' }, { action: 'back', label: 'DIFFICULTY' }])
          : promptLine([{ action: 'select', label: 'DIFFICULTY' }, { action: 'start', label: 'START' }, { action: 'back', label: 'BACK' }]),
        meter: true,
      }, (body) => {

      drawVfdText(
        body.x,
        body.y,
        mode === 'custom' ? 'CUSTOM DIFFICULTY' : 'SELECT DIFFICULTY',
        { color: UI_COLOR.amber, max: body.w },
      );
      const listW = Math.max(22, Math.floor(body.w * 0.36));
      const divider = body.x + listW + 1;
      uiLine(divider, body.y + 2, divider, body.y + body.h - 1, UI_COLOR.frame, 0.7);

      const menuY = body.y + 4;
      presets.forEach((preset, index) => {
        const on = index === sel;
        const locked = !!preset.locked;
        const rowStyle = locked ? 'ui-secondary' : on ? 'ui-amber' : 'ui-primary';
        const subStyle = locked ? 'ui-secondary' : on ? 'ui-primary' : 'ui-secondary';
        const mark = on ? '▸' : ' ';
        const lock = locked ? ' ◇' : '';
        hits.add({
          id: `difficulty:${preset.id}`,
          kind: 'difficulty-preset',
          x: body.x,
          y: menuY + index * 3 - 0.35,
          w: Math.max(1, listW - 1),
          h: 2.35,
          selected: on,
          label: preset.name,
          data: { index, preset: preset.id },
          onHover: () => { if (mode === 'select') selectPreset(index); },
          onClick: () => {
            if (mode === 'custom' && index !== sel) mode = 'select';
            selectPreset(index, { sound: false });
            confirmPreset();
          },
        });
        uiText(body.x, menuY + index * 3, `${mark} ${preset.name}${lock}`, rowStyle, locked ? 0.52 : 1);
        uiText(
          body.x + 3,
          menuY + index * 3 + 1,
          // A locked row has to say what unlocks it. It read just 'LOCKED', and
          // pressing it only plays a bump — so Dead Air was a visible dead end
          // with no stated way in, which is the one thing showing it was for.
          locked ? LOCKED_SUBTITLE : preset.subtitle,
          subStyle,
          locked ? 0.42 : on ? 0.9 : 0.55,
        );
      });

      const preset = selectedPreset();
      const detailX = divider + 3;
      const detailW = body.x + body.w - detailX;
      const values = preset.id === 'custom' ? customValues : preset.values;
      const danger = preset.id === 'dead-air';
      const locked = !!preset.locked;
      uiText(detailX, body.y + 3, `${preset.name} / ${locked ? 'LOCKED' : preset.subtitle}`, locked ? 'ui-secondary' : danger ? 'ui-danger' : 'ui-amber', locked ? 0.6 : 1);
      if (locked) uiText(detailX, body.y + 4, 'COMPLETE THE STORY ONCE TO UNLOCK.', 'ui-blue', 0.78);
      else if (preset.intended) uiText(detailX, body.y + 4, 'RECOMMENDED FOR A FIRST PLAYTHROUGH.', 'ui-blue');
      else if (preset.id === 'custom') uiText(detailX, body.y + 4, 'CUSTOM SETTINGS CANNOT EARN THE DEAD AIR ACHIEVEMENT.', 'ui-blue');
      const explanation = mode === 'custom'
        ? RULE_HELP[RULE_ORDER[ruleSel]] || preset.description
        : locked ? `${preset.description} Complete the story once to unlock this preset.` : preset.description;
      uiWrap(explanation, detailW).slice(0, 3).forEach((line, i) =>
        uiText(detailX, body.y + 6 + i, line, locked ? 'ui-secondary' : 'ui-primary', locked ? 0.58 : 1));

      let ry = body.y + 11;
      for (let index = 0; index < RULE_ORDER.length; index++) {
        const key = RULE_ORDER[index];
        const active = mode === 'custom' && index === ruleSel;
        const label = RULE_LABELS[key];
        const value = VALUE_LABELS[values[key]] || String(values[key]).toUpperCase();
        uiText(detailX, ry, `${active ? '▸' : ' '} ${label}`.slice(0, 25), active ? 'ui-amber' : 'ui-secondary', locked ? 0.42 : 1);
        const vx = detailX + Math.max(26, Math.floor(detailW * 0.56));
        const rendered = active ? `◀ ${value} ▶` : value;
        if (mode === 'custom') {
          hits.add({
            id: `difficulty-rule:${key}`,
            kind: 'difficulty-rule',
            x: detailX,
            y: ry - 0.35,
            w: Math.max(1, detailW),
            h: 1.4,
            selected: active,
            label,
            data: { index, key },
            onHover: () => selectRule(index),
            onClick: (_, event) => cycleCustomRule(index, Number(event?.cellX) < vx ? -1 : 1),
          });
        }
        uiText(vx, ry, rendered.slice(0, Math.max(1, detailX + detailW - vx)), locked ? 'ui-secondary' : danger ? 'ui-danger' : active ? 'ui-amber' : 'ui-blue', locked ? 0.46 : 1);
        ry += 2;
      }

      const p = presets.length <= 1 ? 1 : sel / (presets.length - 1);
      drawLocationIndicator(detailX, Math.min(body.y + body.h - 2, ry), Math.max(10, detailW - 2), p, {
        theme: danger ? 'amber' : 'green',
      });
      if (preset.locked) {
        uiCenter(y + h - 3, 'LOCKED · COMPLETE THE STORY ONCE TO UNLOCK DEAD AIR', 'ui-secondary');
      } else if (danger && Math.floor(t * 3) % 2 === 0) {
        uiCenter(y + h - 3, 'MAKING THE GAME EASIER WILL DISABLE THE DEAD AIR ACHIEVEMENT FOR THIS RUN', 'ui-danger');
      }
      });
    },

    view() {
      return {
        mode,
        preparation,
        pending,
        error,
        selected: selectedPreset()?.id || null,
        selectedRule: mode === 'custom' ? RULE_ORDER[ruleSel] : null,
        hitRegions: hits.view(),
      };
    },
    whenSettled: () => settled,
  };
  return scene;
}
