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
import { uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { withMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import * as AUDIO from '../audio/story-audio.js';
import {
  TAKEOVER_MEDIA, TAKEOVER_CLINICAL, TAKEOVER_COMFORT,
  SEEP_CARNAGE, SEEP_PASTORAL, CAB_BLEED, DEAD_DOOR_LINES, INTERRUPTION,
  freshDeadDoor, pressDeadDoor,
} from './interruption-director.js';

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
  { id: 'fields', label: 'FIELDS' },
  { id: 'interruptions', label: 'INTERRUPTIONS' },
]);

// The two lists, in the game's own pools. The field rows are the window that
// becomes the picture; the interruption rows are what can break into a room.
function fieldRows() {
  const rows = [];
  for (const id of TAKEOVER_MEDIA) rows.push({ kind: 'field', id, label: MEDIA_LABEL[id], detail: 'The window becomes the game. It stays until it lets go.' });
  for (const id of TAKEOVER_CLINICAL) rows.push({ kind: 'field', id, label: MEDIA_LABEL[id], detail: 'What the take-arm reaches for.' });
  for (const id of TAKEOVER_COMFORT) rows.push({ kind: 'field', id, label: MEDIA_LABEL[id], detail: 'What the torch reaches for.' });
  return rows;
}
function interruptionRows() {
  const rows = [];
  for (const id of SEEP_CARNAGE) rows.push({ kind: 'seep', id, set: 'carnage', label: MEDIA_LABEL[id], detail: 'A seep. Printed over the room, gone before it is understood.' });
  for (const id of SEEP_PASTORAL) rows.push({ kind: 'seep', id, set: 'pastoral', label: MEDIA_LABEL[id], detail: 'A seep. Printed over the room, gone before it is understood.' });
  rows.push({ kind: 'door', id: 'dead-door', label: "THE DOOR THAT WON'T", detail: 'Press it. It answers once you stop trying.' });
  rows.push({ kind: 'verb', id: 'take-arm', label: 'THE RECORDER', detail: 'Take-arm. It reads and clicks, and sometimes it does not take.' });
  rows.push({ kind: 'verb', id: 'torch', label: 'THE TORCH', detail: 'The light. It reads and clicks, and sometimes it does not come.' });
  for (const bleed of CAB_BLEED) rows.push({ kind: 'bleed', id: bleed.kind, label: MEDIA_LABEL[bleed.kind], detail: 'Heard from the cab, wherever he is.' });
  return rows;
}

export function makeTransferRoomScene({ meta = {}, host = null } = {}) {
  const rows = [fieldRows(), interruptionRows()];

  let tab = 0;
  let sel = 0;
  let scroll = 0;
  let door = null;
  let verb = null;
  let note = null;

  const list = () => rows[tab];
  const current = () => list()[sel] || null;
  const reset = () => { sel = 0; scroll = 0; };
  const show = (text) => { note = text; };

  // The dead door, played with the night's own pieces. It answers exactly when
  // the in-game one does, and the row says so.
  function pressDoor() {
    if (!host?.deadDoorCue || !host?.sayLine) return;
    door = door || freshDeadDoor('extras-door');
    const next = pressDeadDoor(door, Date.now() / 1000);
    door = next.door;
    host.deadDoorCue();
    if (!next.gave) {
      if (door.presses === 2 || door.presses === 4) host.sayLine(DEAD_DOOR_LINES[door.presses % DEAD_DOOR_LINES.length]);
      show(door.presses === 1 ? 'The handle goes, and the door does not.' : 'It still does not. (' + door.presses + ')');
    } else {
      door = null;
      show('It opens.');
    }
  }
  // The dead verb's quiet window, the same constants the night uses.
  function pressVerb(id) {
    if (!host?.deadVerb) return;
    const now = Date.now() / 1000;
    if (verb?.id === id && now - verb.at < INTERRUPTION.deadVerb.quiet && verb.presses < INTERRUPTION.deadVerb.presses) {
      verb = { id, at: now, presses: verb.presses + 1 };
      host.deadVerb(id);
      show("It reads and clicks. It didn't take.");
    } else {
      verb = { id, at: now, presses: 1 };
      host.deadVerb(id);
      show('It takes.');
    }
  }

  return {
    id: 'transfer-room', blocksInput: true, blocksWorld: true, lensPreset: 'calm',
    enter() { AUDIO.startMenuHiss(); },
    exit() { AUDIO.stopMenuHiss(); },
    key(e) {
      const k = String(e.key || '').toLowerCase();
      const listRows = list();
      // While a field is playing, the room stays out of the way: the window's
      // own long-press and hard limit end it.
      if (host?.viewing?.()) return true;
      if (e.key === 'Escape' || k === 'b') { AUDIO.menuBack(); scenes.pop(); return true; }
      if (e.key === 'Tab') {
        tab = (tab + (e.shiftKey ? TABS.length - 1 : 1)) % TABS.length;
        reset(); AUDIO.menuPage(); return true;
      }
      if (k === '1' || k === '2') {
        const next = Number(k) - 1;
        if (tab !== next) { tab = next; reset(); AUDIO.menuPage(); }
        return true;
      }
      if (!listRows.length) return true;
      if (e.key === 'ArrowUp' || k === 'w') { sel = (sel - 1 + listRows.length) % listRows.length; AUDIO.menuMove(); return true; }
      if (e.key === 'ArrowDown' || k === 's') { sel = (sel + 1) % listRows.length; AUDIO.menuMove(); return true; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'e') {
        const row = current();
        if (row?.kind === 'field') { if (host?.beginField?.(row.id)) { AUDIO.menuPage(); show('Playing. Hold E to let go.'); } }
        else if (row?.kind === 'seep') { if (host?.flashSeep?.(row.id, row.set)) AUDIO.menuPage(); }
        else if (row?.kind === 'bleed') { if (host?.playBleed?.(row.id)) AUDIO.menuPage(); }
        else if (row?.kind === 'door') pressDoor();
        else if (row?.kind === 'verb') pressVerb(row.id);
        return true;
      }
      return true;
    },
    render() {
      const { cols, rows: screenRows } = uiSize();
      uiFill(0, 0, cols, screenRows, UI_COLOR.glass);
      const w = Math.min(96, cols - 4), h = Math.min(38, screenRows - 4);
      const x = Math.floor((cols - w) / 2), y = Math.floor((screenRows - h) / 2);
      const listRows = list();
      const row = current();

      withMachinePanel(x, y, w, h, {
        label: 'FIELD REPLAYS',
        source: 'EXTRAS',
        footer: '↑↓ ROW · TAB LIST · ENTER PLAY · ESC CLOSE',
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
