import * as scenes from './scenes.js';
import * as R3 from '../render/r3d.js';
import { uiCenter, uiFill, uiLine, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawLocationIndicator, drawMachinePanel, drawVfdCounter, drawVfdText } from '../render/presentation.js';
import { UI_COLOR } from '../render/palette.js';
import {
  borrowView,
  canCrossAcousticSeam,
  consoleAdvanceStep,
  enactCausalAnchor,
  hushPlaybackReport,
  makeHushPlayback,
  nextCausalAnchor,
  nextTimelineAnchor,
  permittedSpoolRate,
  tickHushPlayback,
  useOptionalPower,
} from '../causal/playback.js';
import { shadowFrameAt } from '../causal/tape.js';
import { deleteHushRunSession, saveHushRunSession } from '../platform/storage/storageService.js';
import { getMeta, metaCommit } from './save.js';
import { HUSH_DOSSIER } from './hush-dossier.js';
import * as AUDIO from '../audio/story-audio.js';
import { causalSpaceFor } from '../causal/spaces.js';

const SESSION_SCHEMA = 2;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Number(value) || 0));
const distance = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
const formatTapeTime = (value) => {
  const ms = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(ms / 60_000).toString().padStart(2, '0');
  const seconds = Math.floor((ms % 60_000) / 1000).toString().padStart(2, '0');
  return `${minutes}:${seconds}.${Math.floor((ms % 1000) / 100)}`;
};

function restoreState(tape, session) {
  const state = makeHushPlayback(tape, { now: session?.timeMs || 0 });
  if (!session || session.schema !== SESSION_SCHEMA || session.contentHash !== tape.contentHash) return state;
  state.density = clamp(session.density, 0, 100);
  state.enacted = new Set(session.enacted || []);
  state.corrected = new Set(session.corrected || []);
  state.ornaments = Math.max(0, Number(session.ornaments) || 0);
  state.seamsCrossed = Math.max(0, Number(session.seamsCrossed) || 0);
  state.filesOpened = new Set(session.filesOpened || []);
  state.emittedEvents = new Set(session.emittedEvents || []);
  state.initialized = true;
  return state;
}

function serializeState(state, position, cameraMode, spaceId) {
  return {
    schema: SESSION_SCHEMA,
    contentHash: state.tape.contentHash,
    timeMs: Math.round(state.timeMs),
    density: state.density,
    enacted: [...state.enacted],
    corrected: [...state.corrected],
    ornaments: state.ornaments,
    seamsCrossed: state.seamsCrossed,
    filesOpened: [...state.filesOpened],
    emittedEvents: [...state.emittedEvents],
    position: { ...position },
    spaceId,
    cameraMode,
    savedAt: Date.now(),
  };
}

function perceivedByPlayerShadow(position, frame, canSee) {
  if (String(position?.spaceId || 'conservatory') !== String(frame?.spaceId || 'conservatory')) return false;
  if (!frame || distance(position, frame) > 16) return false;
  return canSee ? !!canSee(frame, position) : true;
}

export function makeHushRunScene({
  tape,
  session = null,
  spawn = null,
  canMove = () => true,
  describePosition = () => ({}),
  canSee = null,
  seams = [],
  listenCells = () => [],
  spaceAdapters = [],
  onTapeEvent = () => {},
  onCausalCorrection = () => {},
  onPlayerShadowFrame = () => {},
  onComplete = () => {},
  onExit = () => {},
} = {}) {
  if (!tape) throw new Error('THE HUSH requires a causal tape');
  const hadSession = session?.contentHash === tape.contentHash;
  let phase = hadSession ? 'resume' : 'play';
  let resumeChoice = 0;
  let state = restoreState(tape, hadSession ? session : null);
  const firstFrame = shadowFrameAt(tape, 0) || { x: 0, y: 0, floorH: 0, renderGroup: '' };
  const firstAnchor = tape.anchors?.[0]?.locus || null;
  let activeSpace = causalSpaceFor(spaceAdapters, { spaceId: hadSession ? session?.spaceId : firstFrame.spaceId });
  let position = hadSession && session.position
    ? { ...session.position, spaceId: session.spaceId || session.position.spaceId || activeSpace?.id || 'conservatory' }
    : {
      x: spawn?.x ?? firstAnchor?.x ?? firstFrame.x,
      y: spawn?.y ?? firstAnchor?.y ?? firstFrame.y,
      floorH: spawn?.floorH ?? firstAnchor?.floorH ?? firstFrame.floorH,
      roomId: spawn?.roomId ?? firstAnchor?.roomId ?? '',
      spaceId: spawn?.spaceId ?? firstAnchor?.spaceId ?? firstFrame.spaceId ?? activeSpace?.id ?? 'conservatory',
    };
  let cameraMode = hadSession && ['prowl', 'listen'].includes(session.cameraMode) ? session.cameraMode : 'prowl';
  let borrowHeld = false;
  let borrowExhausted = false;
  let spoolHeld = false;
  let transportRate = 1;
  let lastWallMs = performance.now();
  let saveClock = 0;
  let message = '';
  let messageUntil = 0;
  let terminalOpen = false;
  let terminalSelection = 0;
  let terminalCursor = 0;
  let terminalOpenedAt = 0;
  const entryLook=R3.r3dLookAngles();
  let prowlLook={...entryLook};

  const flash = (text, seconds = 2.2) => { message = text; messageUntil = performance.now() + seconds * 1000; };
  const shadow = () => shadowFrameAt(tape, state.timeMs);
  const perceived = () => perceivedByPlayerShadow(position, shadow(), canSee);
  const nextActionAnchor = () => nextCausalAnchor(state);
  const nextRecordedAnchor = () => nextTimelineAnchor(state);
  const anchorRemaining = () => nextRecordedAnchor() ? nextRecordedAnchor().at - state.timeMs : Infinity;
  const nearRecorder = () => tape.events.some((event) => Math.abs(event.at - state.timeMs) <= 1500
    && /record|playback|take/.test(`${event.type} ${event.payload?.kind || ''}`));

  function persistTerminal(id = null) {
    const meta = getMeta();
    const opened = id ? [...new Set([...(meta.legacyTerminal?.opened || []), id])] : meta.legacyTerminal?.opened || [];
    metaCommit({ legacyTerminal: {
      ...meta.legacyTerminal,
      opened,
      cursors: { ...(meta.legacyTerminal?.cursors || {}), ...(id ? { [id]: terminalCursor } : {}) },
      lastFileId: id || meta.legacyTerminal?.lastFileId || null,
    } });
    if (id) state.filesOpened.add(id);
  }

  function openTerminal() {
    terminalOpen = true;
    terminalOpenedAt = performance.now();
    const meta = getMeta();
    const last = meta.legacyTerminal?.lastFileId;
    terminalSelection = Math.max(0, HUSH_DOSSIER.findIndex((record) => record.id === last));
    terminalCursor = Math.max(0, meta.legacyTerminal?.cursors?.[HUSH_DOSSIER[terminalSelection]?.id] || 0);
    persistTerminal(HUSH_DOSSIER[terminalSelection]?.id);
  }

  function closeTerminal(reason = '') {
    if (!terminalOpen) return;
    persistTerminal(HUSH_DOSSIER[terminalSelection]?.id);
    terminalOpen = false;
    if (reason) flash(reason);
  }

  function restart() {
    activeSpace?.exit?.();
    state = makeHushPlayback(tape);
    position = {
      x: spawn?.x ?? firstAnchor?.x ?? firstFrame.x,
      y: spawn?.y ?? firstAnchor?.y ?? firstFrame.y,
      floorH: spawn?.floorH ?? firstAnchor?.floorH ?? firstFrame.floorH,
      roomId: spawn?.roomId ?? firstAnchor?.roomId ?? '',
      spaceId: spawn?.spaceId ?? firstAnchor?.spaceId ?? firstFrame.spaceId ?? 'conservatory',
    };
    activeSpace = causalSpaceFor(spaceAdapters, position);
    const entered=activeSpace?.enter?.({timeMs:0,position,frame:firstFrame,restart:true});
    if(entered)position=activeSpace.describePosition(entered);
    cameraMode = 'prowl';
    phase = 'play';
    void deleteHushRunSession();
  }

  function tryAnchor(verb) {
    const result = enactCausalAnchor(state, verb, position);
    if (result.ok) {
      flash(`${verb.toUpperCase()} / ARMED`);
    }
    return result;
  }

  function optional(verb) {
    const causal = tryAnchor(verb);
    if (causal.ok) return true;
    if (causal.reason === 'WRONG_LOCUS') { flash('VERB MATCH / WRONG LOCUS'); return false; }
    const result = useOptionalPower(state, verb, { perceived: perceived(), mutatesRecordedState: false });
    if (!result.ok) { flash(result.reason.replaceAll('_', ' ')); return false; }
    onTapeEvent({ type: 'ornament', actor: 'hush', payload: { verb, position: { ...position } } });
    flash(`${verb.toUpperCase()} / ORNAMENT`);
    return true;
  }

  function seamAtPosition() {
    return seams.find((seam) => distance(position, seam.from) <= (seam.radius || 2.5)
      || distance(position, seam.to) <= (seam.radius || 2.5));
  }

  function interact() {
    const causal = tryAnchor('contact');
    if (causal.ok) return;
    if (causal.reason === 'WRONG_LOCUS') { flash('CONTACT / WRONG LOCUS'); return; }
    if (position.roomId === 'spur-substation' || position.hiddenRoom) { openTerminal(); return; }
    const seam = seamAtPosition();
    if (seam) {
      const allowed = canCrossAcousticSeam(state, { perceived: perceived() });
      if (!allowed.ok) { flash(allowed.reason.replaceAll('_', ' ')); return; }
      const used = useOptionalPower(state, 'seam', { perceived: false });
      if (!used.ok) { flash(used.reason.replaceAll('_', ' ')); return; }
      const from = distance(position, seam.from) <= (seam.radius || 2.5);
      const departed = { ...position };
      position = { ...(from ? seam.to : seam.from) };
      onTapeEvent({ type: 'ornament', actor: 'hush', payload: { verb: 'seam', from: departed, position: { ...position } } });
      flash(`ACOUSTIC SEAM / ${seam.id || 'CROSSED'}`);
      return;
    }
    flash('NO CAUSAL LOCUS');
  }

  function move(dx, dy) {
    if (borrowHeld || terminalOpen || cameraMode === 'listen') return;
    const next = { ...position, x: position.x + dx, y: position.y + dy };
    const allowed = activeSpace
      ? activeSpace.canMove(position, next)
      : canMove(next.x, next.y, position);
    if (!allowed) { flash('DENSE SURFACE'); return; }
    position = activeSpace
      ? activeSpace.describePosition(next)
      : { ...next, ...describePosition(next.x,next.y), spaceId: position.spaceId || 'conservatory' };
  }

  function actionFor(e) {
    if (e.controllerAction) return e.controllerAction;
    const k = String(e.key || '').toLowerCase();
    const code = e.code || '';
    if (e.key === 'ArrowUp' || k === 'w') return 'move_up';
    if (e.key === 'ArrowDown' || k === 's') return 'move_down';
    if (e.key === 'ArrowLeft' || k === 'a') return 'move_left';
    if (e.key === 'ArrowRight' || k === 'd') return 'move_right';
    if (k === 'e' || code === 'KeyE') return 'interact';
    if (k === 'r' || code === 'KeyR') return 'recorder';
    if (k === 'b' || code === 'KeyB') return 'bag';
    if (k === 'f' || code === 'KeyF') return 'light';
    if (k === 'p' || code === 'KeyP') return 'playback';
    if (e.key === ' ' || code === 'Space') return 'mark';
    if (e.key === 'Shift' || code === 'ShiftLeft' || code === 'ShiftRight') return 'quiet';
    if (e.key === 'Escape') return 'menu';
    if (e.key === 'Enter' || code === 'Enter') return 'confirm';
    return '';
  }

  function terminalKey(action) {
    if (action === 'move_up') { terminalSelection = (terminalSelection - 1 + HUSH_DOSSIER.length) % HUSH_DOSSIER.length; terminalCursor = getMeta().legacyTerminal?.cursors?.[HUSH_DOSSIER[terminalSelection].id] || 0; persistTerminal(HUSH_DOSSIER[terminalSelection].id); return true; }
    if (action === 'move_down') { terminalSelection = (terminalSelection + 1) % HUSH_DOSSIER.length; terminalCursor = getMeta().legacyTerminal?.cursors?.[HUSH_DOSSIER[terminalSelection].id] || 0; persistTerminal(HUSH_DOSSIER[terminalSelection].id); return true; }
    if (action === 'move_left') { terminalCursor = Math.max(0, terminalCursor - 1); persistTerminal(HUSH_DOSSIER[terminalSelection].id); return true; }
    if (action === 'move_right' || action === 'confirm') {
      const record = HUSH_DOSSIER[terminalSelection];
      const lineCount = record.paragraphs.flatMap((paragraph) => [...uiWrap(paragraph, 54), '']).length;
      terminalCursor = Math.min(Math.max(0, lineCount - 2), terminalCursor + 1);
      persistTerminal(record.id);
      return true;
    }
    if (action === 'menu' || action === 'back' || action === 'interact') { closeTerminal(); return true; }
    return true;
  }

  function resumeKey(action) {
    if (action === 'move_left' || action === 'move_right' || action === 'move_up' || action === 'move_down') { resumeChoice = 1 - resumeChoice; AUDIO.menuMove(); return true; }
    if (action === 'confirm' || action === 'interact') { if (resumeChoice === 1) restart(); else phase = 'play'; AUDIO.menuConfirm(); return true; }
    if (action === 'menu' || action === 'back') { scenes.pop(); return true; }
    return true;
  }

  function finishRun() {
    phase = 'report';
    onComplete(hushPlaybackReport(state), { deferExit: true });
  }

  return {
    id: 'hush-run', blocksInput: true, blocksWorld: true, allowsLook: true, lookProfile: 'hush',
    enter() {
      AUDIO.startMenuHiss();lastWallMs=performance.now();
      const entered=activeSpace?.enter?.({timeMs:state.timeMs,position,frame:shadow(),resume:hadSession});
      if(entered)position=activeSpace.describePosition(entered);
    },
    exit() {
      AUDIO.stopMenuHiss();
      const sessionTask = state.completed
        ? deleteHushRunSession()
        : saveHushRunSession(serializeState(state, position, cameraMode, position.spaceId));
      onPlayerShadowFrame(null);
      activeSpace?.exit?.();
      R3.r3dSetLookAngles({...entryLook,immediate:true});
      onExit({sessionTask});
    },
    key(e) {
      const action = actionFor(e);
      if (phase === 'resume') return resumeKey(action);
      if (phase === 'report') {
        if (action === 'confirm' || action === 'interact' || action === 'menu' || action === 'back') scenes.pop();
        return true;
      }
      if (terminalOpen) return terminalKey(action);
      if (action === 'move_up') { move(0, -1); return true; }
      if (action === 'move_down') { move(0, 1); return true; }
      if (action === 'move_left') { move(-1, 0); return true; }
      if (action === 'move_right') { move(1, 0); return true; }
      if (action === 'interact') { interact(); return true; }
      if (action === 'recorder') { optional('taunt'); return true; }
      if (action === 'bag') { optional('haunt'); return true; }
      if (action === 'light') { optional('manifest'); return true; }
      if (action === 'mark') { cameraMode = cameraMode === 'prowl' ? 'listen' : 'prowl'; return true; }
      if (action === 'playback') {
        const remaining = anchorRemaining();
        if (borrowExhausted) flash('BORROW LIMIT / RELEASE PLAYBACK');
        else if (!Number.isFinite(remaining)) flash('BORROW / NO REMAINING SOURCE');
        else if (remaining > 8000) flash(`BORROW CLOSED / OPENS IN ${((remaining - 8000) / 1000).toFixed(1)}S`);
        else { prowlLook = R3.r3dLookAngles(); borrowHeld = true; }
        return true;
      }
      if (action === 'quiet') { spoolHeld = true; return true; }
      if (action === 'menu' || action === 'back') { scenes.pop(); return true; }
      return true;
    },
    keyup(e) {
      const action = actionFor(e);
      if (action === 'playback') { borrowHeld=false;borrowExhausted=false;state.borrowMs=0;R3.r3dSetLookAngles({...prowlLook,immediate:true}); return true; }
      if (action === 'quiet') { spoolHeld = false; return true; }
      return false;
    },
    update(dt) {
      const now = performance.now();
      const wallElapsed = Math.max(0, now - lastWallMs);
      lastWallMs = now;
      if (phase !== 'play') return;
      const wasTerminalOpen = terminalOpen;
      const terminalAdvance = wasTerminalOpen ? consoleAdvanceStep(anchorRemaining(), wallElapsed) : null;
      const playbackWall = terminalAdvance ? terminalAdvance.elapsedMs : Math.max(0, dt) * 1000;
      if (terminalAdvance?.eject) closeTerminal('ANCHOR PRE-ROLL / CONSOLE EJECT');
      const borrowing = borrowHeld && !!borrowView(state);
      const requestedSpool = spoolHeld && !wasTerminalOpen ? permittedSpoolRate(anchorRemaining()) : 1;
      const result = tickHushPlayback(state, playbackWall, {
        perceived: perceived(), nearRecorder: nearRecorder(), requestedSpool, borrowing,
      });
      transportRate = result.rate || 1;
      // Tape consumers sometimes need the causal operator's position rather
      // than the borrowed camera pose (notably when rebuilding Source state).
      // Pass it explicitly so an event can never relocate HUSH to the prior
      // operator merely because Borrow is being held at that instant.
      result.events.forEach((event) => onTapeEvent(event, {
        position: { ...position },
        timeMs: state.timeMs,
        spaceId: position.spaceId,
      }));
      result.corrections.forEach((anchor) => {
        if (anchor.locus?.spaceId && anchor.locus.spaceId !== position.spaceId) {
          const nextSpace = causalSpaceFor(spaceAdapters, { spaceId: anchor.locus.spaceId });
          activeSpace?.exit?.();
          activeSpace = nextSpace || activeSpace;
          const entered = activeSpace?.enter?.({ anchor, timeMs: state.timeMs, correction: true });
          position = activeSpace?.describePosition?.(entered || { ...anchor.locus }) || { ...position, ...anchor.locus };
        }
        onCausalCorrection(anchor);
        flash(`CAUSAL CORRECTION / ${anchor.verb.toUpperCase()}`);
      });
      if(borrowHeld&&state.borrowMs>=3000){borrowHeld=false;borrowExhausted=true;R3.r3dSetLookAngles({...prowlLook,immediate:true});}
      saveClock += playbackWall;
      const shadowSpace = shadow()?.spaceId;
      if (shadowSpace && shadowSpace !== position.spaceId) {
        const nextSpace = causalSpaceFor(spaceAdapters, { spaceId: shadowSpace });
        if (nextSpace && nextSpace !== activeSpace) {
          activeSpace?.exit?.();
          activeSpace = nextSpace;
          const entered = activeSpace.enter({ timeMs: state.timeMs, correction: false, frame: shadow() });
          position = activeSpace.describePosition(entered || shadow() || position);
        }
      }
      onPlayerShadowFrame(shadow());
      if (saveClock >= 2000) { saveClock = 0; void saveHushRunSession(serializeState(state, position, cameraMode, position.spaceId)); }
      if (result.completed) finishRun();
      if (position.roomId !== 'spur-substation') {
        const seam = seams.find((entry) => distance(position, entry.to) <= (entry.radius || 2.5) && entry.to.roomId === 'spur-substation');
        if (seam) position = { ...position, roomId: 'spur-substation', hiddenRoom: true };
      }
    },
    worldView() {
      if (phase !== 'play') return { x: position.x, y: position.y, floorH: position.floorH, subject: 'hush', sensoryProfile: 'hush-prowl', suppressActors: true };
      const borrowed = borrowHeld ? borrowView(state) : null;
      if (borrowed) return { ...borrowed, subject: 'playerShadow', sensoryProfile: 'borrow', suppressActors: true };
      return { ...position, subject: 'hush', sensoryProfile: cameraMode === 'listen' ? 'hush-listen' : 'hush-prowl', suppressActors: true };
    },
    view() { return { phase, cameraMode, timeMs: state.timeMs, durationMs: tape.durationMs, density: state.density, nextAnchor: nextActionAnchor()?.id || null, timelineAnchor: nextRecordedAnchor()?.id || null, transportRate, report: state.completed ? hushPlaybackReport(state) : null, terminalOpen }; },
    render() {
      const { cols, rows } = uiSize();
      if (phase === 'resume') {
        uiFill(0, 0, cols, rows, UI_COLOR.glass);
        const panelW = Math.min(70, cols - 4), panelH = Math.min(24, rows - 4);
        const body = drawMachinePanel(Math.floor((cols - panelW) / 2), Math.floor((rows - panelH) / 2), panelW, panelH, {
          label: 'CAUSAL TRANSPORT', source: 'SOURCE TAPE', meter: false, theme: 'green', model: 'CT-02',
          footer: 'ENTER SELECT   ESC TITLE',
        });
        drawVfdText(body.x, body.y, 'SECOND TRACK HELD', { scale: 1, theme: 'green' });
        uiText(body.x, body.y + 3, 'AN UNFINISHED CAUSAL PASS REMAINS ON THIS TAPE.', 'ui-secondary');
        ['RESUME TAPE', 'RESTART TAPE'].forEach((label, index) => uiText(body.x + 3, body.y + 6 + index * 4, `${resumeChoice === index ? '▸' : ' '} ${label}`, resumeChoice === index ? 'ui-amber' : 'ui-secondary'));
        return;
      }
      if (phase === 'report') {
        uiFill(0, 0, cols, rows, UI_COLOR.glass);
        const report = hushPlaybackReport(state);
        const w = Math.min(76, cols - 4), h = Math.min(32, rows - 4);
        const body = drawMachinePanel(Math.floor((cols - w) / 2), Math.floor((rows - h) / 2), w, h, {
          label: 'SECOND TRACK', source: report.label, meter: false, theme: 'green', model: 'CT-02',
          footer: 'ENTER RETURN TO TITLE',
        });
        drawVfdCounter(body.x, body.y, String(report.synchronization).padStart(3, '0'), { scale: 2, theme: 'green' });
        drawVfdText(body.x + 12, body.y, report.label, { scale: 1, theme: 'green' });
        drawLocationIndicator(body.x, body.y + 4, Math.min(40, body.w - 2), report.synchronization / 100, { theme: 'green' });
        [['MANUAL CAUSES', `${report.manualCauses} / ${report.totalCauses}`], ['WEIGHTED CAUSE', `${report.manualWeight} / ${report.totalWeight}`], ['CORRECTIONS', report.corrections], ['ORNAMENTS', report.ornaments], ['ACOUSTIC SEAMS', report.acousticSeams], ['TERMINAL FILES', report.terminalFiles]].forEach(([label, value], index) => {
          uiText(body.x + 2, body.y + 7 + index * 2, label, 'ui-secondary');
          uiText(body.x + 28, body.y + 7 + index * 2, String(value), 'ui-primary');
        });
        uiText(body.x + 2, body.y + body.h - 2, 'NO NEW RETURN FILED. ORIGINAL CASE UNCHANGED.', 'ui-label');
        return;
      }
      if (terminalOpen) {
        uiFill(0, 0, cols, rows, UI_COLOR.glass);
        const w = Math.min(104, cols - 4), h = Math.min(38, rows - 4);
        const body = drawMachinePanel(Math.floor((cols - w) / 2), Math.floor((rows - h) / 2), w, h, {
          label: 'LEGACY TRANSFER ROOM', source: `+${Math.floor((performance.now() - terminalOpenedAt) / 1000)}S`,
          meter: false, theme: 'green', model: 'TR-4417', footer: 'UP/DOWN FILE   LEFT/RIGHT READ   E CLOSE',
        });
        drawVfdText(body.x, body.y, 'ROOM-ONLY TERMINAL', { scale: 1, theme: 'green' });
        const listW = Math.min(31, Math.floor(body.w * 0.35));
        HUSH_DOSSIER.forEach((record, index) => uiText(body.x, body.y + 4 + index * 2, `${terminalSelection === index ? '▸' : ' '} ${record.title}`.slice(0, listW), terminalSelection === index ? 'ui-amber' : getMeta().legacyTerminal?.opened?.includes(record.id) ? 'ui-primary' : 'ui-secondary'));
        const record = HUSH_DOSSIER[terminalSelection];
        const dx = body.x + listW + 3;
        uiText(dx, body.y + 4, record.title, 'ui-amber');
        uiText(dx, body.y + 6, record.source, 'ui-label');
        uiText(dx, body.y + 7, [record.date, record.status].filter(Boolean).join(' / ').slice(0, body.w - listW - 4), 'ui-secondary');
        const lines = record.paragraphs.flatMap((paragraph) => [...uiWrap(paragraph, body.w - listW - 4), '']);
        const visibleLines = Math.max(1, body.h - 12);
        terminalCursor = Math.min(terminalCursor, Math.max(0, lines.length - visibleLines));
        lines.slice(terminalCursor, terminalCursor + visibleLines).forEach((line, index) => uiText(dx, body.y + 9 + index, line, 'ui-primary'));
        const remain = anchorRemaining();
        if (remain <= 12_000) uiText(dx, body.y + body.h - 2, `FIXED EJECT IN ${Math.max(0, ((remain - 8000) / 1000)).toFixed(1)}S`, 'ui-danger');
        return;
      }
      const recordedAnchor = nextRecordedAnchor();
      const remaining = recordedAnchor ? Math.max(0, recordedAnchor.at - state.timeMs) : 0;
      const armed = !!recordedAnchor && state.enacted.has(recordedAnchor.id);
      const arming = !!recordedAnchor && remaining <= (recordedAnchor.armingWindowMs || 6000);
      const playerShadowPerception = perceived();
      const locusDistance = recordedAnchor ? distance(position, recordedAnchor.locus) : 0;
      if (cameraMode === 'listen') {
        uiFill(0, 0, cols, rows, UI_COLOR.glass);
        const field = drawMachinePanel(1, 1, cols - 2, rows - 2, {
          label: 'ACOUSTIC FIELD DISPLAY', source: `TAPE ${transportRate}X`, meter: false, theme: 'green', model: 'AF-08',
          footer: 'SPACE PROWL   E CAUSE/SEAM   P BORROW   SHIFT SPOOL',
        });
        drawVfdText(field.x, field.y, 'LISTEN', { scale: 1, theme: 'green' });
        drawVfdCounter(field.x + Math.max(12, field.w - 10), field.y, formatTapeTime(state.timeMs), { theme: 'green' });
        uiText(field.x, field.y + 2, recordedAnchor
          ? `${recordedAnchor.verb.toUpperCase()}  T-${(remaining / 1000).toFixed(1)}  ${armed ? 'ARMED' : arming ? 'WINDOW OPEN' : 'PENDING'}  ${locusDistance.toFixed(1)}M`
          : 'END OF CAUSAL INDEX', armed ? 'ui-primary' : arming ? 'ui-danger' : 'ui-secondary');
        uiText(field.x, field.y + 3, `PLAYER SHADOW PERCEPTION ${playerShadowPerception ? 'DIRECT / POWER LOCKED' : 'EXCLUDED'}   DENSITY ${Math.round(state.density).toString().padStart(3, '0')}`, playerShadowPerception ? 'ui-danger' : 'ui-label');
        const cells = listenCells(position, 14);
        const cx = Math.floor(field.x + field.w / 2), cy = Math.floor(field.y + field.h / 2) + 1;
        const mapTop = field.y + 5, mapBottom = field.y + field.h - 3;
        const s = shadow();
        for (const cell of cells) {
          const x = cx + Math.round(cell.x - position.x), y = cy + Math.round(cell.y - position.y);
          if (x < field.x || y < mapTop || x >= field.x + field.w || y >= mapBottom) continue;
          const excluded = !!s && distance(s, cell) <= 16 && (canSee ? canSee(s, cell) : true);
          const glyph = cell.seam ? '=' : excluded ? '×' : cell.solid ? '░' : cell.heard ? '.' : ' ';
          const role = cell.seam ? 'ui-amber' : excluded ? 'ui-danger' : cell.solid ? 'ui-secondary' : 'ui-primary';
          uiText(x, y, glyph, role, cell.seam ? .9 : excluded ? .24 : cell.solid ? .28 : .38);
        }
        if (s) uiText(cx + Math.round(s.x - position.x), cy + Math.round(s.y - position.y), '○', 'ui-blue');
        if (recordedAnchor) uiText(cx + Math.round(recordedAnchor.locus.x - position.x), cy + Math.round(recordedAnchor.locus.y - position.y), '+', 'ui-danger');
        uiText(cx, cy, '●', 'ui-amber');
        uiText(field.x, field.y + field.h - 2, '● HUSH   ○ PLAYER SHADOW   + CAUSAL LOCUS   = ACOUSTIC SEAM   × PERCEPTION', 'ui-label');
        if (message && performance.now() < messageUntil) uiCenter(field.y + field.h - 4, message, message.includes('CORRECTION') ? 'ui-danger' : 'ui-amber');
        return;
      }
      const borrowed = borrowHeld && !!borrowView(state);
      const panelW = Math.min(104, cols - 2), panelH = Math.min(15, rows - 2);
      const panelX = Math.floor((cols - panelW) / 2), panelY = rows - panelH - 1;
      const transport = drawMachinePanel(panelX, panelY, panelW, panelH, {
        label: 'CAUSAL TRANSPORT', source: borrowed ? 'PLAYER SHADOW' : `TAPE ${transportRate}X`, meter: false, theme: 'green', model: 'CT-02',
        footer: 'E CAUSE/SEAM  R TAUNT  B HAUNT  F MANIFEST  P BORROW  SPACE LISTEN  SHIFT SPOOL',
      });
      drawVfdText(transport.x, transport.y, borrowed ? 'BORROW' : 'PROWL', { scale: 1, theme: 'green' });
      drawVfdCounter(transport.x + Math.max(12, transport.w - 10), transport.y, formatTapeTime(state.timeMs), { theme: 'green' });
      uiText(transport.x, transport.y + 2, recordedAnchor
        ? `${recordedAnchor.verb.toUpperCase()}  T-${(remaining / 1000).toFixed(1)}  ${armed ? 'ARMED / AWAIT CANONICAL TIME' : arming ? 'ARMING WINDOW' : 'PENDING'}  ${locusDistance.toFixed(1)}M`
        : 'NO REMAINING CAUSAL LOCUS', armed ? 'ui-primary' : arming ? 'ui-danger' : 'ui-secondary');
      uiText(transport.x, transport.y + 4, `DENSITY ${Math.round(state.density).toString().padStart(3, '0')}  PROTECTED 025`, 'ui-label');
      drawLocationIndicator(transport.x + 26, transport.y + 4, Math.min(28, Math.max(8, transport.w - 52)), state.density / 100, { theme: 'green' });
      uiText(transport.x + Math.max(56, transport.w - 27), transport.y + 4, playerShadowPerception ? 'DIRECT PERCEPTION / LOCK' : 'PLAYER SHADOW EXCLUDED', playerShadowPerception ? 'ui-danger' : 'ui-secondary');
      if (message && performance.now() < messageUntil) uiText(transport.x, transport.y + 7, message.slice(0, transport.w), message.includes('CORRECTION') ? 'ui-danger' : 'ui-amber');
    },
  };
}
