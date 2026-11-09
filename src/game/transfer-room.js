// THE FIELD REPLAYS.
//
// The extras room in the title's transfer slot: the night's fields and its
// interruptions, played ad-hoc for as long as anyone wants. It is built in the
// same machine panel the title and settings use, with their rows, their wordmark
// and their menu audio, and it owns nothing but the list. Every playback is the
// game's own — the window that becomes the picture, the seep plates, the dead
// door, the dead verbs, the cab's bleed — and none of it changes how any of
// those behave inside a run.
//
// Pure here, like the old register: the rows are the pools in
// interruption-director.js, the door and verb state machines are their pure
// counterparts, and every sound, plate and window arrives through the host.
import * as scenes from './scenes.js';
import { uiClear, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { withMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import * as AUDIO from '../audio/story-audio.js';
import {
  TAKEOVER_MEDIA, TAKEOVER_CLINICAL, TAKEOVER_COMFORT,
  SEEP_CARNAGE, SEEP_PASTORAL, CAB_BLEED,
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
  wheel: 'THE WHEEL', hubcap: 'THE HUBCAP', 'bent-metal': 'BENT METAL', glass: 'GLASS',
  'tail-lamps': 'TAIL-LAMPS', daisies: 'DAISIES', sun: 'SUN', lids: 'LIDS', sky: 'SKY',
  indicator: 'THE INDICATOR', wipers: 'THE WIPERS', radio: 'THE RADIO', water: 'WATER',
  knock: 'A KNOCK ON THE GLASS',
});

const TABS = Object.freeze([
  { id: 'scenes', label: 'SCENES' },
  { id: 'interruptions', label: 'INTERRUPTIONS' },
  { id: 'media', label: 'MEDIA' },
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

// The two lists, in the game's own pools. The field rows are the window that
// becomes the picture; the interruption rows are what can break into a room.
function fieldRows() {
  const rows = [];
  for (const id of TAKEOVER_MEDIA) rows.push({ kind: 'field', id, label: MEDIA_LABEL[id], detail: 'A moving media plate, as used by the takeover. This is a picture, not a place to walk.' });
  for (const id of TAKEOVER_CLINICAL) rows.push({ kind: 'field', id, label: MEDIA_LABEL[id], detail: 'A media plate from the take-arm pool. The SCENES list holds the places you can enter.' });
  for (const id of TAKEOVER_COMFORT) rows.push({ kind: 'field', id, label: MEDIA_LABEL[id], detail: 'A media plate from the torch pool. The SCENES list holds the places you can enter.' });
  return rows;
}
function interruptionRows() {
  const rows = [];
  for (const id of SEEP_CARNAGE) rows.push({ kind: 'seep', id, set: 'carnage', label: MEDIA_LABEL[id], detail: 'A seep. Printed over the room, gone before it is understood.' });
  for (const id of SEEP_PASTORAL) rows.push({ kind: 'seep', id, set: 'pastoral', label: MEDIA_LABEL[id], detail: 'A seep. Printed over the room, gone before it is understood.' });
  rows.push({ kind: 'door', id: 'dead-door', label: "THE DOOR THAT WON'T", detail: 'Press it. It answers once you stop trying.' });
  rows.push({ kind: 'verb', id: 'take-arm', label: 'THE RECORDER', detail: 'Enter the field and reach for the recorder with R. Walk and look; Escape returns here.' });
  rows.push({ kind: 'verb', id: 'torch', label: 'THE TORCH', detail: 'Enter the field and reach for the torch with F. Walk and look; Escape returns here.' });
  for (const bleed of CAB_BLEED) rows.push({ kind: 'bleed', id: bleed.kind, label: MEDIA_LABEL[bleed.kind], detail: 'Heard from the cab, wherever he is.' });
  return rows;
}
// The room's own door. Escape always works; this one is the night's.
function leaveRow() {
  return [{ kind: 'leave', id: 'leave', label: 'RETURN', detail: 'Return to the title or paused night. Nothing played here changes the night.' }];
}

export function makeTransferRoomScene({ meta = {}, host = null } = {}) {
  const rows = [transferSceneRows(), interruptionRows(), fieldRows(), leaveRow()];

  let tab = 0;
  let sel = 0;
  let scroll = 0;
  let note = null;
  let seepUntil = 0;
  let lastActivity = Date.now();
  let clockIndex = 0;
  let clockAt = Date.now();

  const list = () => rows[tab];
  const current = () => list()[sel] || null;
  const reset = () => { sel = 0; scroll = 0; };
  const show = (text) => { note = text; };
  const touch = () => { lastActivity = Date.now(); };
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
    enter() { AUDIO.startMenuHiss(); touch(); },
    exit() { AUDIO.stopMenuHiss(); host?.dispose?.(); },
    resume(){AUDIO.startMenuHiss();touch();},
    key(e) {
      const k = String(e.key || '').toLowerCase();
      const listRows = list();
      touch();
      // While a field is playing, the room stays out of the way: the window's
      // own long-press and hard limit end it. The idle field is the exception —
      // any key wakes the room.
      if (host?.viewing?.()) {
        if (e.key==='Escape'||k==='b') { host.cancelField?.(); touch(); }
        return true;
      }
      if (Date.now() < seepUntil) return true;
      if (e.key === 'Escape' || k === 'b') { AUDIO.menuBack(); scenes.pop(); return true; }
      if (e.key === 'Tab') {
        tab = (tab + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length;
        reset(); AUDIO.menuPage(); return true;
      }
      if (k === '1' || k === '2' || k === '3' || k==='4') {
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
        else if (row?.kind === 'field') { if (host?.beginField?.(row.id)) { AUDIO.menuPage(); show('Playing. Escape returns here.'); } else show('The media plate could not be opened.'); }
        else if (row?.kind === 'seep') { const ms = host?.flashSeep?.(row.id, row.set); if (ms) { seepUntil = Date.now() + ms; AUDIO.menuPage(); } }
        else if (row?.kind === 'bleed') { if (host?.playBleed?.(row.id)) AUDIO.menuPage(); }
        else if (row?.kind === 'door') {if(host?.beginScene?.('third'))AUDIO.stopMenuHiss();}
        else if (row?.kind === 'verb') {if(host?.beginScene?.('fourth',{kind:'verb',id:row.id}))AUDIO.stopMenuHiss();}
        else if (row?.kind === 'leave') {AUDIO.menuBack();scenes.pop();}
        return true;
      }
      return true;
    },
    render() {
      if(host?.sceneActive?.()){uiClear();return;}
      const { cols, rows: screenRows } = uiSize();
      // A seep owns the whole picture: the room yields it, the way the white
      // takes the room in a run, and comes back when the flash has gone.
      if (Date.now() < seepUntil) return;
      // Idle long enough and the room sinks into the empty field, the night's
      // own last image; any key wakes it.
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
