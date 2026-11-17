// Title screen. Also the audio gate: nothing may call ensureCtx() until a key
// has been pressed here, which satisfies browser autoplay policy and gives the
// first sound of the piece a deliberate moment of silence to arrive out of.
//
// Path register keeps explicit actions beside a fixed phosphor lattice. Available
// actions follow profile history; the bezel reads the real program output.

import * as scenes from './scenes.js';
import { uiSize, uiCellMetrics, uiWithAlpha } from '../render/ui.js';
import { withMachinePanel, machinePanelAperture } from '../render/presentation.js';
import { createPathRegisterDisplay } from '../render/title-path-register.js';
import { createPathRegisterMotion, pathRegisterLayout, PATH_REGISTER_CONFIRM } from '../render/title-path-register-model.js';
import { hardwareMotionReduced } from '../render/hardware-material.js';
import { createHitRegions } from '../render/hit-regions.js';
import { titleMenuItems } from './title-menu.js';
import { getMeta, hasActiveRun } from './save.js';
import * as AUDIO from '../audio/story-audio.js';
import { monitorProgramMeasurement, monitorSnapshotForRms } from '../audio/monitor.js';
import { bootWeather, bootWeatherAudio, drainBootFlashes, drainBootThunder, renderBootWeather, stepBootWeatherTitleTail } from './boot-weather.js';
import { transferRoomCopy } from './post-run-copy.js';
import { achievementCompletion } from '../progression/achievements.js';

const TITLE_MENU_TWO_COLUMN_MIN_W = 64;

function titleMenuColumnCount(bodyW, itemCount) {
  return bodyW >= TITLE_MENU_TWO_COLUMN_MIN_W && itemCount > 4 ? 2 : 1;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// Screen-reader help retains detail beyond the short visual action line.
const TITLE_ROW_HELP = Object.freeze({
  'continue': 'RESUME THE NIGHT YOU LEFT.',
  'new-run': 'START A NEW NIGHT.',
  'archive': 'TRACK 100% COMPLETION, DISCOVERIES AND FILED RETURNS.',
  'return-index': 'THE ENDINGS YOU HAVE REACHED, AND THE ONES YOU HAVE NOT.',
  'about': 'CREDITS AND INFORMATION ABOUT THE GAME.',
  'quit': 'CLOSE CHUNK SURFER.',
  'settings': 'AUDIO, DISPLAY, CONTROLS AND ACCESSIBILITY.',
});

export function titleRowHelp(item, { filed = 0 } = {}) {
  if (!item) return '';
  if (item.id === 'archive') { const progress = achievementCompletion(getMeta()); return `${progress.completed}/${progress.total} ACHIEVEMENTS · ${progress.percent.toFixed(progress.complete ? 0 : 1)}% COMPLETE. DISCOVERIES AND FILED RETURNS.`; }
  if (item.id === 'transfer-room') return transferRoomCopy({ filed,unlocked:true }).short;
  if (item.id === 'continue' && item.disabled) return 'NO RUN IN PROGRESS.';
  return TITLE_ROW_HELP[item.id] || '';
}

export function makeTitleScene({
  buildLabel = '',
  onNewGame,
  onContinue,
  onTransferRoom = () => {},
  onSettings,
  onArchive = () => {},
  onReturnIndex = () => {},
  onAbout = () => {},
  onQuit = null,
  onAudioGate = () => {},
  onSelectionChange = () => {},
  presentationState = () => null,
} = {}) {
  const meta = getMeta();
  const replay = (meta.endingsSeen?.length || 0) > 0;
  const filed = Object.keys(meta.knowledge?.documents || {}).length;
  const transferRoomOpen = replay || filed > 0;
  const activeRun = hasActiveRun();

  const actions = { continue:onContinue, 'new-run':onNewGame, archive:onArchive,
    'return-index':onReturnIndex, 'transfer-room':onTransferRoom, settings:onSettings,
    about:onAbout, quit:onQuit };
  const items = titleMenuItems(meta, {activeRun, desktop:typeof onQuit === 'function'})
    .map(item => ({...item, run:actions[item.id], stay:true}));

  let sel = 0;
  const display = createPathRegisterDisplay();
  const motion = createPathRegisterMotion(items[sel]?.id);
  const settleMotion = () => motion.settle();
  let audioPrimed = false;
  // The bezel meter reads the actual output bus.
  let programRms = 0;
  let programPeak = 0;
  let programClipped = false;
  let confirmNewRun = false;
  let menuScroll = 0;
  let activationHeld = false;
  const hits = createHitRegions();
  let a11yStatus=null;
  function ensureA11y(){
    const map=document.querySelector('.map')||document.querySelector('#map');
    if(map){map.setAttribute('role','application');map.setAttribute('aria-label','Chunk Surfer case select. Use arrow keys to move and Enter or Space to confirm.');}
    let node=document.getElementById('title-a11y-status');
    if(!node){node=document.createElement('div');node.id='title-a11y-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');Object.assign(node.style,{position:'fixed',width:'1px',height:'1px',overflow:'hidden',clip:'rect(0 0 0 0)',clipPath:'inset(50%)',whiteSpace:'nowrap'});document.body.appendChild(node);}
    a11yStatus=node;
  }
  function announceSelection(){
    if(!a11yStatus)return;
    const item=items[sel];
    const warning=item?.confirms?' Replaces the active night. Profile history is kept.':'';
    a11yStatus.textContent=`${item?.label||'Menu item'}.${item?.disabled?' Unavailable.':''} ${confirmNewRun?PATH_REGISTER_CONFIRM:titleRowHelp(item,{filed})}${warning}`;
  }

  function primeAudio() {
    if (audioPrimed) return;
    audioPrimed = true;
    onAudioGate();
    AUDIO.startMenuHiss();
  }

  function disarm() {
    confirmNewRun = false;
  }

  function select(index, { sound = true } = {}) {
    if (index < 0 || index >= items.length) return false;
    if (items[index]?.disabled) return false;
    if (sel === index) return true;
    sel = index;
    motion.select(items[sel]?.id, nowMs(), hardwareMotionReduced());
    disarm();
    if (sound) AUDIO.menuMove();
    onSelectionChange(items[sel]?.id||'',sel);
    announceSelection();
    return true;
  }

  function moveSelection(index) {
    const next = (index + items.length) % items.length;
    if (next !== sel) {
      sel = next;
      motion.select(items[sel]?.id, nowMs(), hardwareMotionReduced());
      onSelectionChange(items[sel]?.id||'',sel);
    }
    disarm();
    announceSelection();
    AUDIO.menuMove();
  }

  function activateCurrent() {
    const item = items[sel];
    if (!item) return true;

    if (item.disabled || item.locked) {
      AUDIO.menuDenied();
      item.run?.();
      disarm();
      return true;
    }

    if (item.confirms && !confirmNewRun) {
      confirmNewRun = true;
      announceSelection();
      AUDIO.menuConfirm();
      return true;
    }

    AUDIO.menuConfirm();
    if (item.stay) {
      item.run?.();
      disarm();
      return true;
    }

    scenes.pop();
    item.run?.();
    return true;
  }

  function pointer(e) {
    primeAudio();
    if (e.type === 'pointermove') {
      hits.handle(e, { click: false });
      return true;
    }
    if (e.type === 'pointerdown') {
      if ((e.originalEvent?.button ?? e.button ?? 0) !== 0) return true;
      hits.handle(e);
      return true;
    }
    return true;
  }

  return {
    id: 'title',
    blocksInput: true,
    blocksWorld: true,
    worldPresentation: 'visible',
    lensPreset: 'calm',

    enter() {
      document.body.classList.add('title-screen');
      document.addEventListener('visibilitychange', settleMotion);
      window.addEventListener('blur', settleMotion);
      motion.settle();
      primeAudio();
      const map = document.querySelector('.map') || document.querySelector('#map');
      try { map?.setAttribute('tabindex', '0'); map?.focus({ preventScroll: true }); } catch (_) {}
      ensureA11y();
      onSelectionChange(items[sel]?.id||'',sel);
      announceSelection();
    },

    exit() {
      document.body.classList.remove('title-screen');
      document.removeEventListener('visibilitychange', settleMotion);
      window.removeEventListener('blur', settleMotion);
      display.dispose();
      const map=document.querySelector('.map')||document.querySelector('#map');map?.removeAttribute('role');map?.removeAttribute('aria-label');a11yStatus?.remove?.();a11yStatus=null;
      AUDIO.stopMenuHiss();
    },

    // Overlay menus stop their own transport bed on exit. Re-acquire the title
    // bed when the title becomes the top scene again without replaying enter().
    resume() {
      activationHeld = false;
      motion.settle();
      primeAudio();
      AUDIO.startMenuHiss();
    },

    pointer,

    key(e) {
      primeAudio();
      const k = String(e.key || '').toLowerCase();
      const code = e.code || '';

      if (e.key === 'ArrowUp' || k === 'w' || code === 'KeyW') {
        moveSelection(sel - 1);
        return true;
      }

      if (e.key === 'ArrowDown' || k === 's' || code === 'KeyS') {
        moveSelection(sel + 1);
        return true;
      }

      if (e.key === 'Home') { moveSelection(0); return true; }
      if (e.key === 'End') { moveSelection(items.length - 1); return true; }
      if (e.key === 'ArrowLeft' || k === 'a' || code === 'KeyA') return true;
      if (e.key === 'ArrowRight' || k === 'd' || code === 'KeyD') return true;

      if (
        e.key === 'Enter' || code === 'Enter' ||
        e.key === ' ' || code === 'Space' ||
        k === 'z' || code === 'KeyZ'
      ) {
        if (e.repeat || activationHeld) return true;
        activationHeld = true;
        return activateCurrent();
      }

      return true;
    },
    keyup(e) {
      if (['Enter',' ','z'].includes(e.key) || ['Enter','Space','KeyZ'].includes(e.code)) activationHeld = false;
      return true;
    },

    update(dt) {
      // Program audio is distinct from the in-run player exposure meter.
      const program = monitorProgramMeasurement?.();
      programRms = program?.active ? (Number(program.rms) || 0) : 0;
      programPeak = Math.max(programRms, Number(program?.peak) || 0);
      programClipped = !!program?.clipped;

      // Weather is a launch bridge now, not a credits-only decoration. Keep
      // the same storm transport alive under CASE SELECT and hand it to the
      // world acoustics when play begins.
      const weather=bootWeather();
      if(!weather)return;
      // CASE SELECT owns no emitter. The exact particles that survived the
      // credits keep their normal trajectories while one shared presentation
      // envelope eases their visibility away.
      stepBootWeatherTitleTail(weather,dt,{stormActive:true});
      bootWeatherAudio()?.update?.({presence:.78,wind:weather.wind});
      // The flash, then the sound it sent. See thunder.js: the render happens
      // in the gap between them, not on the frame the clap lands.
      for(const flash of drainBootFlashes(weather))bootWeatherAudio()?.prepare?.(flash);
      for(const thunder of drainBootThunder(weather))bootWeatherAudio()?.strike?.(thunder);
    },

    render() {
      const presentationAlpha=Math.max(0,Math.min(1,Number(presentationState?.()?.menuAlpha??1)));
      return uiWithAlpha(presentationAlpha,()=>{
      hits.reset();

      const weather=bootWeather();
      if(weather)renderBootWeather(weather,{alpha:weather.presentationAlpha});

      const { cols, rows } = uiSize();
      const w = Math.min(78, cols - 4);
      const estimatedBodyW = Math.max(1, w - 6);
      // Preserve the original bezel dimensions independently of the new list.
      const frameItemCount = transferRoomOpen ? 7 : 6;
      const estimatedColumns = titleMenuColumnCount(estimatedBodyW, frameItemCount);
      const estimatedRows = Math.ceil(frameItemCount / estimatedColumns);
      const bodyRowsNeeded = 15 + Math.max(0, estimatedRows - 1) * 2;
      const h = Math.min(Math.max(28, bodyRowsNeeded + 7), rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      withMachinePanel(x, y, w, h, {
        label: 'CASE SELECT',
        source: '4417-C',
        footerParts: [{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }],
        meter: true,
        // Real level, through the same dB mapping, ballistics and peak hold the
        // recorder's meter uses (audio/dual-trace.js) — so the title shows the same
        // machine behaving the same way, which is what it was always claiming.
        meterSnapshot: {...monitorSnapshotForRms(programRms, {
          peak: programPeak,
          clipped: programClipped,
        }),sourceId:'title-program',peakKind:'sample'},
      }, (body) => {

      const layout = pathRegisterLayout(machinePanelAperture(x,y,w,h), {
        ...uiCellMetrics(),displayScale:Number(document.documentElement?.dataset?.stageScale)||1,
      }, {itemCount:items.length,selected:sel,scroll:menuScroll});
      menuScroll = layout.start;
      const time = motion.time(nowMs(), {reduced:hardwareMotionReduced(),visible:!document.hidden});
      display.draw(layout,items,sel,{activeRun,confirm:confirmNewRun,buildLabel,time});
      for (const row of layout.rows) {
        const i=row.index,item=items[i];
        hits.add({
          id:`title:${item.id}`,kind:'title-item',...row.hit,
          disabled:item.disabled,selected:i===sel,danger:item.confirms&&confirmNewRun,
          label:item.label,data:{index:i,item},
          onHover:()=>select(i),
          onClick:()=>{
            if(!select(i,{sound:false})&&!item.disabled)return;
            activateCurrent();
          },
        });
      }
      });
      });
    },
  };
}
