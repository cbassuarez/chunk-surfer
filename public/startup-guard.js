// Classic and dependency-free: failure in an optional asset or the game's
// module graph must not turn the loading decoration into a permanent screen.
(function (window, document) {
  'use strict';
  var surface = document.getElementById('startupRecovery');
  var phase = 'starting', bootComplete = false, needsGraphics = true, frameComplete = false;
  var slowTimer = 0, reloadTimer = 0, reloadKey = null, reloadUsed = false;
  var graphicsAttempted = false, graphicsActive = false, graphicsPromise = null, taggedGraphicsFailure = false;
  var entries = [], totalReports = 0, droppedReports = 0, serial = 0;
  var DIAGNOSTIC_LIMIT = 32, RELOAD_DELAY_MS = 1000;

  function text(value, limit) {
    try { return String(value == null ? '' : value).slice(0, limit); }
    catch (_) { return 'Unprintable error'; }
  }
  function errorCode(error) { try { return text(error && error.code, 80); } catch (_) { return ''; } }
  function errorDetail(error) {
    try { return text(error && (error.stack || error.message) || error || 'Unknown startup error', 1600); }
    catch (_) { return 'Unknown startup error'; }
  }
  function report(error, metadata) {
    metadata = metadata || {};
    var source = text(metadata.source || 'explicit-report', 80);
    var category = text(metadata.category || 'runtime', 64);
    var detail = errorDetail(error), code = errorCode(error), last = entries[entries.length - 1];
    totalReports++;
    if (last && last.source === source && last.category === category && last.detail === detail && last.code === code) {
      last.count++; return last.id;
    }
    var entry = { id: ++serial, source: source, category: category, code: code, detail: detail, count: 1 };
    if (entries.length >= DIAGNOSTIC_LIMIT) { entries.shift(); droppedReports++; }
    entries.push(entry); return entry.id;
  }
  function nativeCall(command, args) {
    var api = window.__TAURI_INTERNALS__ || (window.__TAURI__ && window.__TAURI__.core);
    if (!api || typeof api.invoke !== 'function') return Promise.resolve(null);
    try { return Promise.resolve(api.invoke(command, args)); }
    catch (error) { return Promise.reject(error); }
  }
  function setPhase(value) {
    phase = value;
    if (surface) surface.setAttribute('data-phase', value);
  }
  function stopVan(reason) {
    try { if (window.__chunkStartupVan) window.__chunkStartupVan.finish(reason); }
    catch (error) { report(error, { source: 'startup-van', category: 'optional' }); }
  }
  function currentReloadKey() {
    try {
      var href = text(window.location && window.location.href, 8192).split('#')[0];
      return href ? 'chunk.startup.quiet-reload.v1:' + href : null;
    } catch (_) { return null; }
  }
  function cancelReload() {
    if (reloadTimer) window.clearTimeout(reloadTimer);
    reloadTimer = 0;
  }
  function reserveReload() {
    var storage, key = currentReloadKey();
    try {
      if (!key || !window.location || typeof window.location.reload !== 'function') return false;
      storage = window.sessionStorage;
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return false;
      if (storage.getItem(key) !== null) { reloadUsed = true; return false; }
      // Claim the only attempt before scheduling it, and verify persistence.
      // If storage is unavailable/unreliable, silence is safer than a loop.
      storage.setItem(key, '1');
      if (storage.getItem(key) !== '1') return false;
      reloadKey = key; reloadUsed = true; return true;
    } catch (error) {
      report(error, { source: 'quiet-reload-storage', category: 'recovery-unavailable' });
      return false;
    }
  }
  function scheduleReload() {
    if (reloadTimer || graphicsActive || !reserveReload()) return false;
    reloadTimer = window.setTimeout(function () {
      reloadTimer = 0;
      if (phase === 'ready' || graphicsActive || currentReloadKey() !== reloadKey) return;
      stopVan('quiet-reload');
      report('Retrying the same document once.', { source: 'quiet-reload', category: 'recovery' });
      try { window.location.reload(); }
      catch (error) { report(error, { source: 'quiet-reload', category: 'recovery-unavailable' }); }
    }, RELOAD_DELAY_MS);
    return true;
  }
  function resetReloadBudgetAfterSuccess() {
    var key = currentReloadKey();
    try {
      if (key && window.sessionStorage && typeof window.sessionStorage.removeItem === 'function') {
        window.sessionStorage.removeItem(key);
      }
    } catch (error) { report(error, { source: 'quiet-reload-storage', category: 'recovery-unavailable' }); }
    reloadUsed = false;
  }
  function recover(manual, reason) {
    if (phase === 'ready' || !taggedGraphicsFailure || graphicsAttempted) return graphicsPromise || Promise.resolve(false);
    graphicsAttempted = true; graphicsActive = true;
    cancelReload(); setPhase('recovering'); stopVan('graphics-recovery');
    graphicsPromise = nativeCall('chunk_graphics_recover', {
      reason: text(reason || 'Tagged graphics startup failure', 1000), manual: !!manual
    }).then(function (info) {
      if (info && info.restarting) return true;
      graphicsActive = false;
      setPhase('waiting');
      report(info && info.canRecover === false ? 'Graphics recovery alternatives are exhausted.' : 'Graphics recovery did not restart the document.',
        { source: 'native-graphics-recovery', category: 'recovery-unavailable' });
      finishIfReady();
      return false;
    }).catch(function (error) {
      graphicsActive = false; setPhase('waiting');
      report(error, { source: 'native-graphics-recovery', category: 'recovery-unavailable' });
      finishIfReady();
      return false;
    });
    return graphicsPromise;
  }
  function fail(error, metadata) {
    metadata = metadata || {};
    var graphics = errorCode(error) === 'CHUNK_GRAPHICS_STARTUP';
    report(error, { source: metadata.source || 'boot', category: graphics ? 'graphics' : metadata.category || 'boot' });
    // A late runtime failure must not cover or restart a game which booted.
    if (phase === 'ready') return false;
    // Earlier frame evidence cannot certify a later failed boot. A genuine
    // subsequent boot and fresh frame may still recover this same document.
    bootComplete = false; frameComplete = false;
    if (slowTimer) window.clearTimeout(slowTimer);
    slowTimer = 0;
    setPhase(graphicsActive ? 'recovering' : 'waiting');
    stopVan('boot-interrupted');
    if (graphics) {
      taggedGraphicsFailure = true;
      void recover(false, errorDetail(error));
    } else scheduleReload();
    return true;
  }
  function finishIfReady() {
    if (!bootComplete || (needsGraphics && !frameComplete) || phase === 'ready' || graphicsActive) return false;
    setPhase('ready');
    if (slowTimer) window.clearTimeout(slowTimer);
    slowTimer = 0; cancelReload(); resetReloadBudgetAfterSuccess();
    if (surface) surface.setAttribute('aria-hidden', 'true');
    if (needsGraphics) nativeCall('chunk_graphics_ready').catch(function (error) {
      report(error, { source: 'native-graphics-ready', category: 'recovery-unavailable' });
    });
    var departing = false;
    function retireDecoration() {
      if (surface) surface.hidden = true;
    }
    try {
      var van = window.__chunkStartupVan;
      if (van && typeof van.reveal === 'function') departing = van.reveal(retireDecoration) === true;
      else if (van && typeof van.finish === 'function') van.finish('game-ready');
    } catch (error) { report(error, { source: 'startup-van', category: 'optional' }); }
    if (!departing) retireDecoration();
    return true;
  }
  function booted(requireGraphics) {
    bootComplete = true; needsGraphics = !!requireGraphics; return finishIfReady();
  }
  function frame() { frameComplete = true; return finishIfReady(); }
  function isMainScript(target) {
    return target && target.tagName === 'SCRIPT' && (target.id === 'chunkMain' || /\/src\/main\.js(?:[?#]|$)/.test(target.src || ''));
  }
  function onError(event) {
    if (isMainScript(event.target)) {
      fail(event.error || 'The main game module could not load.', { source: 'main-import', category: 'import' });
    } else if (errorCode(event.error) === 'CHUNK_GRAPHICS_STARTUP') {
      fail(event.error, { source: 'global-error' });
    } else if (event.error) {
      report(event.error, { source: 'global-error', category: 'runtime' });
    } else {
      var target = event.target;
      report('Optional resource unavailable: ' + text(target && target.src || target && target.href || target && target.tagName, 500),
        { source: 'resource', category: 'optional' });
    }
  }
  function onRejection(event) {
    if (errorCode(event.reason) === 'CHUNK_GRAPHICS_STARTUP') fail(event.reason, { source: 'promise-rejection' });
    else report(event.reason, { source: 'promise-rejection', category: 'runtime' });
  }
  window.__chunkStartup = Object.freeze({
    booted: booted, frame: frame, fail: fail, report: report,
    retryGraphics: function () { return recover(true, 'Requested tagged graphics recovery'); },
    status: function () { return phase; },
    diagnostics: function () {
      return { phase: phase, bootComplete: bootComplete, needsGraphics: needsGraphics, frameComplete: frameComplete,
        reloadScheduled: !!reloadTimer, reloadUsed: reloadUsed, graphicsAttempted: graphicsAttempted, graphicsActive: graphicsActive,
        totalReports: totalReports, droppedReports: droppedReports,
        entries: entries.map(function (entry) { return { id: entry.id, source: entry.source, category: entry.category,
          code: entry.code, detail: entry.detail, count: entry.count }; }) };
    }
  });
  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);
  // A slow document can still finish. Waiting never restarts or fabricates
  // readiness, and none of these paths deletes player saves or settings.
  slowTimer = window.setTimeout(function () {
    slowTimer = 0;
    if (phase === 'ready') return;
    if (!graphicsActive) setPhase('waiting');
    report('Startup is still waiting for a completed boot and frame.', { source: 'startup-watchdog', category: 'stalled' });
  }, 90000);
}(window, document));

