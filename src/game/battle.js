// Physical redaction battles.
//
// The sheet is the fight. There are no dialogue answers and no abstract combat
// verbs: the player blacks out words, reads what remains, and the other hand
// works on the same text when the reading does not hold.

import * as scenes from './scenes.js';
import { uiSize, uiFill, uiText, uiWrap, uiStrokeRect, uiLine } from '../render/ui.js';
import { drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import { createSamDialogVoice, isVoiced } from '../audio/sam-voice.js';
import { TYPE_GAIN, TYPE_LEVEL } from '../audio/story-audio.js';
import { textCps } from './access.js';
import {
  applyOpponentMove,
  beginRedactionStroke,
  createRedactionState,
  layoutRedactionTokens,
  moveRedactionCursor,
  paintRedaction,
  survivingText,
  toggleRedaction,
  undoRedaction,
  validateBattleDefinition,
  validateReading,
} from './redaction.js';

const COL_W = 82;
const CPS = 40;
const DEFAULT_MAX_ATTEMPTS = 2;
const textOf = (line) => String(line?.text ?? line ?? '');
const whoOf = (line) => line?.who || 'direction';

export function makeBattleScene({
  battle, playSound, fx, audio, getAudio, difficulty = null,
  onWin = () => {}, onLose = () => {}, onAbort = () => {},
} = {}) {
  const definitionErrors = validateBattleDefinition(battle);
  if (definitionErrors.length) throw new Error(`invalid redaction battle: ${definitionErrors.join('; ')}`);

  const voice = createSamDialogVoice({ volume: 0.26, getAudio });
  voice.warm?.();

  const baseHealth = Math.max(1, Number(battle.health) || Math.ceil(battle.challenges.length / 2));
  const maxHealth = Math.max(1, baseHealth + (Number(difficulty?.healthBonus) || 0));
  const maxAttempts = Math.max(1, Number(difficulty?.maxAttempts) || DEFAULT_MAX_ATTEMPTS);
  let playerHealth = maxHealth;
  let enemyHealth = maxHealth;
  let challengeIndex = -1;
  let sheet = null;
  let phase = 'talk';                 // talk | puzzle | counter | done
  let queue = [];
  let cur = null, typed = 0, acc = 0, held = 0, handle = null;
  let onTalkEnd = () => {};
  let result = null;
  let notice = '';
  let noticeUntil = 0;
  let counterUntil = 0;
  let afterCounter = null;
  let lastLayout = [];
  let pointerDown = false;
  let pointerPaint = true;
  let pointerSeen = new Set();
  let submissions = 0;
  let failedSubmissions = 0;

  function stopVoice() { handle?.stop?.(); handle = null; }

  function speak(lines, then) {
    queue = (lines || []).slice();
    onTalkEnd = then || (() => {});
    phase = 'talk';
    nextLine();
  }

  function nextLine() {
    stopVoice();
    audio?.stopTyping?.();
    cur = queue.shift() || null;
    typed = 0; acc = 0; held = 0;
    if (!cur) { onTalkEnd(); return; }
    const who = whoOf(cur), text = textOf(cur);
    if (cur.cue) fx?.cue?.(cur.cue);
    if (text && isVoiced(who) && cur.voice !== false) {
      handle = voice.start(text, { speaker: who, rate: cur.rate || 1 });
    } else if (text) {
      audio?.startTyping?.({ gain: TYPE_GAIN * (TYPE_LEVEL[who === 'direction' ? 'direction' : 'thought'] || 1) });
    }
  }

  function beginChallenge() {
    challengeIndex++;
    if (challengeIndex >= battle.challenges.length) {
      finish(enemyHealth < playerHealth ? 'win' : 'lose');
      return;
    }
    sheet = createRedactionState(battle.challenges[challengeIndex]);
    notice = 'BLACK OUT THE WORDS THAT MAKE THE READING LIE.';
    noticeUntil = performance.now() + 1900;
    phase = 'puzzle';
    playSound?.({ threat: 0.36 + challengeIndex * 0.11 });
  }

  function counter(move, then) {
    const blacked = move.blackout?.length || 0;
    const scraped = move.scrape?.length || 0;
    notice = blacked && scraped ? 'THE OTHER HAND BLACKS OUT ONE WORD AND SCRAPES ANOTHER CLEAN.'
      : blacked ? 'THE OTHER HAND BLACKS OUT A WORD.'
        : scraped ? 'THE OTHER HAND SCRAPES A WORD CLEAN.'
          : 'THE OTHER HAND WAITS INSIDE THE TEXT.';
    noticeUntil = performance.now() + 1500;
    counterUntil = performance.now() + 850;
    afterCounter = then;
    phase = 'counter';
    audio?.menuMove?.();
  }

  function submitReading() {
    if (phase !== 'puzzle' || !sheet) return;
    const verdict = validateReading(sheet);
    submissions++;
    if (!verdict.ok) failedSubmissions++;
    audio?.menuConfirm?.();
    if (verdict.ok) {
      enemyHealth = Math.max(0, enemyHealth - 1);
      notice = `READING HOLDS · ${verdict.text}`;
      noticeUntil = performance.now() + 1700;
      if (enemyHealth <= 0) { finish('win'); return; }
      counter({ blackout:[], scrape:[] }, beginChallenge);
      return;
    }

    const move = applyOpponentMove(sheet);
    if (sheet.attempts >= maxAttempts) {
      playerHealth = Math.max(0, playerHealth - 1);
      if (playerHealth <= 0) { counter(move, () => finish('lose')); return; }
      counter(move, beginChallenge);
    } else counter(move, () => { phase = 'puzzle'; });
  }

  function finish(kind) {
    if (result) return;
    result = kind;
    phase = 'done';
    speak(kind === 'win' ? battle.win : battle.lose, () => {
      stopVoice(); audio?.stopTyping?.();
      scenes.pop();
      const metrics = {
        attempts: Math.max(1, submissions),
        failedSubmissions,
        challenges: battle.challenges.length,
        playerHealth,
        enemyHealth,
      };
      (kind === 'win' ? onWin : onLose)(metrics);
    });
  }

  function hitToken(cx, cy) {
    return lastLayout.find((p) => cy === p.y && cx >= p.x && cx < p.x + p.w) || null;
  }

  function pointerCell(e) {
    return { x: Math.floor(Number(e.cellX)), y: Math.floor(Number(e.cellY)) };
  }

  function paintAt(e) {
    if (!sheet) return false;
    const p = pointerCell(e), hit = hitToken(p.x, p.y);
    if (!hit || pointerSeen.has(hit.id)) return false;
    pointerSeen.add(hit.id);
    sheet.cursor = hit.index;
    return paintRedaction(sheet, hit.id, pointerPaint);
  }

  return {
    id: `battle:${battle.id}`,
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'battle',

    enter() { speak(battle.intro, beginChallenge); },
    exit() { pointerDown = false; stopVoice(); audio?.stopTyping?.(); if (!result) onAbort(); },

    battleView() {
      return {
        phase,
        challenge: challengeIndex,
        challenges: battle.challenges.length,
        playerHealth,
        enemyHealth,
        result,
        attempts: sheet?.attempts || 0,
        submissions,
        failedSubmissions,
        cursor: sheet?.cursor || 0,
        surviving: sheet ? survivingText(sheet) : '',
        tokens: sheet ? sheet.challenge.tokens.map((t) => ({...t})) : [],
        readings: sheet ? sheet.challenge.readings.map((r) => ({required:[...r.required],forbidden:[...r.forbidden],maxVisible:r.maxVisible})) : [],
        playerRedacted: sheet ? [...sheet.player] : [],
        opponentRedacted: sheet ? [...sheet.opponent] : [],
        line: cur ? textOf(cur) : '',
        who: cur ? whoOf(cur) : null,
        typed,
      };
    },

    update(dt) {
      if (phase === 'counter' && performance.now() >= counterUntil) {
        const next = afterCounter; afterCounter = null;
        next?.();
      }
      if (!cur || phase !== 'talk') return;
      const text = textOf(cur);
      held += dt;
      if (handle) { typed = handle.done() ? text.length : Math.min(text.length, handle.charsFor()); return; }
      if (typed < text.length) {
        acc += dt;
        typed = Math.min(text.length, Math.floor(acc * textCps(CPS) * (cur.rate || 1)));
        if (typed >= text.length) audio?.stopTyping?.();
      }
    },

    key(e) {
      if (phase === 'talk') {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'z') {
          if (!cur) return true;
          const text = textOf(cur);
          if (typed < text.length) { typed = text.length; handle?.finish?.(); handle = null; audio?.stopTyping?.(); return true; }
          if (held >= 0.2) nextLine();
        }
        return true;
      }
      if (phase !== 'puzzle' || !sheet) return true;

      const layout = layoutRedactionTokens(sheet.challenge, Math.max(24, Math.min(COL_W - 8, uiSize().cols - 14)));
      if (e.key === 'ArrowLeft' || e.key === 'a') moveRedactionCursor(sheet, 'left', layout);
      else if (e.key === 'ArrowRight' || e.key === 'd') moveRedactionCursor(sheet, 'right', layout);
      else if (e.key === 'ArrowUp' || e.key === 'w') moveRedactionCursor(sheet, 'up', layout);
      else if (e.key === 'ArrowDown' || e.key === 's') moveRedactionCursor(sheet, 'down', layout);
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'z' || e.controllerAction === 'confirm') {
        toggleRedaction(sheet, sheet.challenge.tokens[sheet.cursor]?.id); audio?.menuMove?.();
      } else if (e.key === 'r' || e.key === 'R' || e.controllerAction === 'recorder') submitReading();
      else if (e.key === 'Backspace' || (e.controller && e.controllerAction === 'back')) undoRedaction(sheet);
      // Escape is deliberately swallowed. A keyboard Escape is not an undo.
      return true;
    },

    pointer(e) {
      if (phase !== 'puzzle' || !sheet) return true;
      if (e.type === 'pointerdown') {
        const p = pointerCell(e), hit = hitToken(p.x, p.y);
        if (!hit) return true;
        pointerDown = true;
        pointerSeen = new Set();
        pointerPaint = !sheet.player.has(hit.id);
        beginRedactionStroke(sheet);
        paintAt(e);
        return true;
      }
      if (e.type === 'pointermove' && pointerDown) { paintAt(e); return true; }
      if (e.type === 'pointerup' || e.type === 'pointercancel') { pointerDown = false; pointerSeen.clear(); return true; }
      return true;
    },

    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, 'rgba(2,2,3,0.95)');
      const w = Math.min(COL_W, cols - 6), x = Math.floor((cols - w) / 2);
      const panel = drawMachinePanel(x - 2, 1, w + 4, rows - 2, {
        label:'TRANSCRIPT', source:'REDACTION', meter:true,
        footer: phase === 'puzzle'
          ? '[ARROWS] MOVE · [ENTER] BLACKOUT · [R] READ · [BACKSPACE] UNDO'
          : '[SPACE] CONTINUE',
      });

      drawVfdText(panel.x, panel.y, battle.enemy || 'THE SOUND OF SILENCE', { color:UI_COLOR.danger, max:panel.w });
      const hp = (n) => `${'■'.repeat(n)}${'□'.repeat(Math.max(0, maxHealth - n))}`;
      uiText(panel.x, panel.y + 2, `YOU  ${hp(playerHealth)}`, 'ui-primary');
      const enemy = `IT  ${hp(enemyHealth)}`;
      uiText(panel.x + Math.max(0, panel.w - enemy.length), panel.y + 2, enemy, 'ui-danger');
      uiLine(panel.x, panel.y + 3.2, panel.x + panel.w, panel.y + 3.2, UI_COLOR.frame, 0.7);

      if (phase === 'talk' && cur) {
        const label = whoOf(cur).toUpperCase();
        uiText(panel.x, panel.y + 5, label, 'ui-label');
        const lines = uiWrap(textOf(cur).slice(0, typed), panel.w);
        lines.slice(0, Math.max(2, rows - 12)).forEach((line, i) =>
          uiText(panel.x, panel.y + 7 + i, line, whoOf(cur) === 'direction' ? 'ui-secondary' : 'ui-primary'));
        return;
      }

      if (!sheet) return;
      uiText(panel.x, panel.y + 5, `SHEET ${challengeIndex + 1}/${battle.challenges.length} · ATTEMPT ${Math.min(maxAttempts, sheet.attempts + 1)}/${maxAttempts}`, 'ui-label');
      const local = layoutRedactionTokens(sheet.challenge, panel.w);
      const startY = panel.y + 7;
      lastLayout = local.map((p) => ({ ...p, x:p.x + panel.x, y:p.y + startY }));
      for (const p of lastLayout) {
        const token = sheet.challenge.tokens[p.index];
        const playerBar = sheet.player.has(token.id), opponentBar = sheet.opponent.has(token.id);
        if (!playerBar && !opponentBar) uiText(p.x, p.y, token.text, 'ui-primary');
        else {
          uiFill(p.x, p.y + 0.18, p.w, 0.64, 'rgba(0,0,0,0.98)');
          uiLine(p.x, p.y + 0.52, p.x + p.w, p.y + 0.52,
            opponentBar ? UI_COLOR.danger : UI_COLOR.amber, opponentBar ? 0.92 : 0.62, 1);
        }
        if (phase === 'puzzle' && p.index === sheet.cursor) uiStrokeRect(p.x - 0.2, p.y - 0.05, p.w + 0.4, 1, UI_COLOR.primary, 0.9, 1);
      }

      const tokenRows = lastLayout.reduce((m, p) => Math.max(m, p.y - startY + 1), 1);
      const readY = startY + tokenRows + 2;
      uiText(panel.x, readY, 'READBACK', 'ui-label');
      const readback = survivingText(sheet) || '[SILENCE]';
      uiWrap(readback, panel.w).slice(0, 3).forEach((line, i) => uiText(panel.x, readY + 2 + i, line, 'ui-counter'));
      if (notice && performance.now() < noticeUntil) {
        uiText(panel.x, Math.min(panel.y + panel.h - 2, readY + 6), uiWrap(notice, panel.w)[0], phase === 'counter' ? 'ui-danger' : 'ui-amber');
      }
    },
  };
}
