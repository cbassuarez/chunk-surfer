import * as scenes from '../game/scenes.js';
import { makeArchiveScene } from '../game/archive.js';
import { freshMeta, freshRunRecord } from '../progression/schema.js';
import { ACHIEVEMENT_DEFS } from '../progression/achievement-defs.js';
import { COMPLETION_ROOMS, COMPLETION_PAPERS, COMPLETION_LEADS, COMPLETION_DISCLOSURES, SECRET_DEFS } from '../progression/completion.js';
import { buildRunSummary } from '../progression/report.js';

export function achievementReviewFixture(kind = 'fresh') {
  const meta = freshMeta(), run = freshRunRecord({ id: 'achievement-ui-review', now: Date.now() }), at = Date.now();
  const receipt = () => ({ firstSeenAt: at, runId: run.id });
  if (kind !== 'fresh') {
    const ids = kind === 'complete' ? ACHIEVEMENT_DEFS.map(def => def.id)
      : ['ACH_WORK_ORDER','ACH_FIRST_TAKE','ACH_HUSH_MET','ACH_PLAYBACK','ACH_COFFEE','ACH_END_HELPED','ACH_LIGHT_OFF'];
    for (const id of ids) meta.achievements[id] = { unlockedAt: at, runId: run.id, build: 'EXPLICIT_UI_FIXTURE' };
    for (const id of COMPLETION_PAPERS.slice(0, kind === 'complete' ? undefined : 7)) meta.knowledge.documents[id] = { ...receipt(), firstSeenRunId: run.id, lastSeenAt: at, count: 1 };
    for (const row of COMPLETION_ROOMS.slice(0, kind === 'complete' ? undefined : 3)) meta.completion.rooms[row.id] = receipt();
    for (const row of COMPLETION_LEADS.slice(0, kind === 'complete' ? undefined : 2)) meta.completion.leads[row.id] = receipt();
    for (const id of COMPLETION_DISCLOSURES.slice(0, kind === 'complete' ? undefined : 1)) meta.completion.disclosures[id] = receipt();
    if (kind === 'complete') for (const row of SECRET_DEFS) meta.completion.secrets[row.id] = receipt();
    run.ledger.takes.rooms = Object.keys(meta.completion.rooms); run.ledger.takes.completed = run.ledger.takes.rooms.length;
    meta.endingsSeen = kind === 'complete' ? ['sacrifice','helped','inversion','drugged','surfaced','contact-won','contact-lost','tower-won','tower-lost'] : ['helped'];
    const summary = buildRunSummary({ endingId: 'helped', save: { run, rec: { takes: [], injuries: 0 }, flags: {}, items: [] }, meta, now: at });
    meta.returns.records[summary.id] = summary; meta.returns.history = [summary.id];
  }
  return { kind, meta, run };
}

export function installAchievementReview({ prepare = () => {} } = {}) {
  const panel = document.createElement('aside'); panel.id = 'achievement-review'; panel.setAttribute('aria-label', 'Developer achievement review');
  panel.style.cssText = 'position:fixed;inset:0 0 auto;z-index:2147483000;background:#111a13ee;color:#d9dfd0;padding:7px 10px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;font:12px system-ui';
  const label = document.createElement('strong'); label.textContent = 'DEV · ARCHIVE V1'; panel.append(label);
  const select = document.createElement('select'); select.id = 'achievement-review-profile'; select.setAttribute('aria-label', 'Review profile');
  for (const [id, text] of [['fresh','Fresh profile'],['partial','Partial profile'],['complete','100% profile']]) { const option = document.createElement('option'); option.value = id; option.textContent = text; select.append(option); } panel.append(select);
  let active = null, fixture = null;
  const output = document.createElement('pre'); output.id = 'achievement-review-state'; output.style.cssText = 'position:fixed;bottom:0;right:0;max-width:600px;max-height:190px;overflow:auto;z-index:2147483001;background:#101911ec;color:#cbdac5;font:10px monospace;display:none;padding:9px';
  const status = document.createElement('output'); status.id = 'achievement-review-status'; status.textContent = 'Read-only fixtures. No profile writes, unlocks or platform calls.';
  const button = (text, id, action) => { const el = document.createElement('button'); el.id = id; el.textContent = text; el.onclick = () => { try { action(); } catch (error) { status.textContent = String(error.stack || error); } }; panel.append(el); };
  function stage(tab) {
    if (active) scenes.remove(active); prepare(); fixture = achievementReviewFixture(select.value);
    active = makeArchiveScene({ meta: fixture.meta, getRun: () => fixture.run, initialTab: tab }); scenes.push(active);
    document.getElementById('map')?.focus?.({ preventScroll: true }); status.textContent = `${fixture.kind} · ${tab} · fixture only; not saved.`;
  }
  button('Achievements','achievement-review-achievements',() => stage('achievements'));
  button('Discoveries','achievement-review-discoveries',() => stage('discoveries'));
  button('Run history','achievement-review-history',() => stage('history'));
  button('Inspect state','achievement-review-inspect',() => { output.style.display = output.style.display === 'none' ? 'block' : 'none'; output.textContent = JSON.stringify({ fixture: fixture?.kind, state: active?.view?.() }, null, 2); });
  panel.append(status); document.body.append(panel, output);
  return { dispose() { if (active) scenes.remove(active); panel.remove(); output.remove(); } };
}
