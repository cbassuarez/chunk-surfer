// THE FIELD REPLAYS.
//
// The extras room in the title's transfer slot: the night's fields, played
// ad-hoc for as long as anyone wants. It is built in the
// same machine panel the title and settings use, with their rows, their wordmark
// and their menu audio, and it owns nothing but the list. SCENES opens the
// actual playable visits. MEDIA ARCHIVE preserves the original source clips;
// those clips no longer interrupt ordinary play.
import * as scenes from './scenes.js';
import { uiClear, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { withMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import * as AUDIO from '../audio/story-audio.js';
import {
  TAKEOVER_MEDIA, TAKEOVER_CLINICAL, TAKEOVER_COMFORT,
} from './interruption-director.js';
import { LOG_DATE } from '../data/transfer-registry.js';
import {MEMORY_FIELD_VISITS} from '../data/memory-field.js';

const MEDIA_LABEL = Object.freeze({
  'flowers-seb': 'FLOWERS', clouds: 'CLOUDS', pollination: 'POLLINATION',
  'sunflower-datamosh': 'SUNFLOWER (DATAMOSH)', 'empty-field': 'EMPTY FIELD',
  'apoptosis-organelles': 'APOPTOSIS', 'mitotic-catastrophe': 'MITOTIC CATASTROPHE',
  microfilariae: 'MICROFILARIAE', 'schistosoma-eggs': 'SCHISTOSOMA EGGS',
  'boar-corpse-decomposition': 'BOAR CORPSE',
  'orion-nebula-flythrough': 'ORION NEBULA', 'sea-nettle-jellyfish': 'SEA NETTLE',
  'starling-murmuration': 'STARLINGS',
});

const TABS = Object.freeze([
  { id: 'scenes', label: 'SCENES' },
  { id: 'media', label: 'MEDIA ARCHIVE' },
  { id: 'leave', label: 'LEAVE' },
]);

const SCENE_LABELS=Object.freeze({first:'THE FIRST BREATH',second:'THE ANT AND THE FIELD',third:"THE DOOR THAT WON'T",fourth:'THE WEIGHT AGAINST IT',fifth:'THE LAST DOOR'});
export function transferSceneRows(){
  return MEMORY_FIELD_VISITS.map(visit=>({kind:'scene',id:visit.id,label:SCENE_LABELS[visit.id],
    detail:visit.walk?'Enter the actual field. Walk, look and reach for its door. Escape returns here.':
      'Let the first breath pass, then walk and look around its field. Escape returns here.'}));
}

// The night log's own times, read one at a time: the room's clock, failing.
const CLOCK_TIMES = Object.freeze(Object.values(LOG_DATE));
const CLOCK_STEP_MS = 14000;
const CLOCK_HOLD_MS = 26000;

// Archive only: retained source clips never schedule world interruptions.
function mediaRows() {
  const rows = [];
  for (const id of [...TAKEOVER_MEDIA,...TAKEOVER_CLINICAL,...TAKEOVER_COMFORT]) {
    rows.push({kind:'media',id,label:MEDIA_LABEL[id],detail:'Archived source media. This is a picture, not a walkable scene or a world interruption. SCENES holds the places you can enter.'});
  }
  return rows;
}
// The room's own door. Escape always works; this one is the night's.
function leaveRow() {
  return [{ kind: 'leave', id: 'leave', label: 'RETURN', detail: 'Return to the title or paused night. Nothing played here changes the night.' }];
}

export function makeTransferRoomScene({ meta = {}, host = null } = {}) {
  const rows = [transferSceneRows(), mediaRows(), leaveRow()];

  let tab = 0;
  let sel = 0;
  let scroll = 0;
  let note = null;
  let clockIndex = 0;
  let clockAt = Date.now();

  const list = () => rows[tab];
  const current = () => list()[sel] || null;
  const reset = () => { sel = 0; scroll = 0; };
  const show = (text) => { note = text; };
  // The failing clock, from the night log's own times. It runs while the room
  // is open, holds at the end the way the sheets do, and starts again.
  function clockNow() {
    const now = Date.now();
    if (clockIndex < CLOCK_TIMES.length - 1 && now - clockAt >= CLOCK_STEP_MS) {
      clockIndex += 1; clockAt = now;
    } else if (clockIndex === CLOCK_TIMES.length - 1 && now - clockAt >= CLOCK_HOLD_MS) {
      clockIndex = 0; clockAt = now;
    }
    return CLOCK_TIMES[clockIndex];
  }

  return {
    id: 'transfer-room', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); },
    exit() { AUDIO.stopMenuHiss(); host?.dispose?.(); },
    resume(){AUDIO.startMenuHiss();},
    key(e) {
      const k = String(e.key || '').toLowerCase();
      const listRows = list();
      // Archive media owns its own player until it finishes or is cancelled.
      if (host?.viewing?.()) {
        if (e.key==='Escape'||k==='b') host.cancelField?.();
        return true;
      }
      if (e.key === 'Escape' || k === 'b') { AUDIO.menuBack(); scenes.pop(); return true; }
      if (e.key === 'Tab') {
        tab = (tab + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length;
        reset(); AUDIO.menuPage(); return true;
      }
      if (k === '1' || k === '2' || k === '3') {
        const next = Number(k) - 1;
        if (tab !== next) { tab = next; reset(); AUDIO.menuPage(); }
        return true;
      }
      if (!listRows.length) return true;
      if (e.key === 'ArrowUp' || k === 'w') { sel = (sel - 1 + listRows.length) % listRows.length; AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowDown' || k === 's') { sel = (sel + 1) % listRows.length; AUDIO.menuMove(); return true; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'e') {
        const row = current();
        if(row?.kind==='scene'){
          if(host?.beginScene?.(row.id)){AUDIO.stopMenuHiss();show('Returned from '+row.label+'.');}
          else show('The scene could not be opened.');
        }
        else if (row?.kind === 'media') { if (host?.beginField?.(row.id)) { AUDIO.menuPage(); show('Archive playing. Escape returns here.'); } else show('The archived media could not be opened.'); }
        else if (row?.kind === 'leave') {AUDIO.menuBack();scenes.pop();}
        return true;
      }
      return true;
    },
    render() {
      if(host?.sceneActive?.()){uiClear();return;}
      const { cols, rows: screenRows } = uiSize();
      uiFill(0, 0, cols, screenRows, UI_COLOR.glass);
      const w = Math.min(96, cols - 4), h = Math.min(38, screenRows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((screenRows - h) / 2);
      const listRows = list();
      const row = current();

      withMachinePanel(x, y, w, h, {
        label: 'FIELD REPLAYS',
        source: 'EXTRAS · ' + clockNow(),
        footer: '↑↓ ROW · TAB LIST · ENTER OPEN · ESC BACK',
        meter: false,
      }, (body) => {
        drawVfdText(body.x, body.y, 'W. ELLERY / WORKS', { color: UI_COLOR.amber, max: body.w });

        let tx = body.x;
        TABS.forEach((entry, i) => {
          const on = i === tab;
          const label = '[' + (i + 1) + '] ' + entry.label;
          uiText(tx, body.y + 2, label, on ? 'ui-amber' : 'ui-secondary');
          tx += label.length + 3;
        });

        // One column of rows, the way the title and settings keep them; the
        // detail pane reads the selected row.
        const listW = Math.max(34, Math.floor(body.w * 0.52));
        const divider = body.x + listW + 1;
        uiLine(divider, body.y + 4, divider, body.y + body.h - 1, UI_COLOR.frame, 0.65);

        const cap = Math.max(1, body.h - 8);
        if (sel < scroll) scroll = sel;
        if (sel >= scroll + cap) scroll = sel - cap + 1;

        if (!listRows.length) {
          uiWrap('Nothing filed. The pools are authored elsewhere; the room only lists them.', listW - 1)
            .slice(0, 3).forEach((line, i) => uiText(body.x, body.y + 6 + i, line, 'ui-secondary'));
        }
        listRows.slice(scroll, scroll + cap).forEach((entry, j) => {
          const i = scroll + j;
          const on = i === sel;
          const line = (on ? '▸ ' : '  ') + entry.label;
          uiText(body.x, body.y + 6 + j, line.slice(0, listW - 1), on ? 'ui-amber' : 'ui-primary');
        });

        const dx = divider + 3, dw = Math.max(20, body.x + body.w - dx - 1);
        if (!row) return;
        let dy = body.y + 4;
        uiWrap(row.label, dw).slice(0, 2).forEach((line) => uiText(dx, dy++, line, 'ui-amber'));
        dy++;
        uiWrap(row.detail, dw).slice(0, 5).forEach((line) => uiText(dx, dy++, line, 'ui-primary'));
        dy += 2;
        // What the machine says right now: the last thing that played, or how
        // to read the room. One line, replaced, the way a display does it.
        const stateLine = note || 'Play anything, as long as you want. Nothing here advances the night.';
        uiText(dx, dy++, 'NOW', 'ui-label');
        uiWrap(stateLine, dw).slice(0, 4).forEach((line) => uiText(dx, dy++, line, 'ui-green'));
      });
    },
  };
}
