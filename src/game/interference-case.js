const TOKEN_RE = /^(OPERATOR|HOST|INPUT) [0-9A-F]{4}$/u;
const CASE_RE = /^FIELD-[0-9A-F]{8}$/u;
const ENDING_CLASSIFICATION = Object.freeze({
  sacrifice: 'CONTAINMENT',
  helped: 'INTERVENTION',
  inversion: 'INVERSION',
  drugged: 'CONTAMINATION',
  surfaced: 'EXTRACTION',
});
const RESPONSE_CLASSIFICATIONS = new Set([
  'UNRESOLVED',
  'VIGILANCE', 'LOW VIGILANCE',
  'COMPOSURE', 'LOW COMPOSURE',
  'EXPOSURE', 'LOW EXPOSURE',
  'RESISTANCE', 'LOW RESISTANCE',
]);

const clampText = (value, limit = 96) => String(value || '').replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, limit);
const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(keyBytes, text, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle) throw new Error('secure identity masking unavailable');
  const key = await cryptoApi.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await cryptoApi.subtle.sign('HMAC', key, new TextEncoder().encode(String(text)));
  return bytesToHex(signed).toUpperCase();
}

export async function maskIdentitySnapshot(snapshot = {}, keyBytes, cryptoApi = globalThis.crypto) {
  const resolved = [
    ['persona', 'OPERATOR', snapshot.persona],
    ['hostname', 'HOST', snapshot.hostname],
    ['mic', 'INPUT', snapshot.mic],
  ];
  const tokens = {};
  const material = [];
  for (const [field, prefix, entry] of resolved) {
    if (!entry?.value) continue;
    const digest = await hmacHex(keyBytes, `${field}\0${entry.source || field}\0${entry.value}`, cryptoApi);
    tokens[field] = { token: `${prefix} ${digest.slice(0, 4)}`, source: entry.source || field };
    material.push(`${field}:${digest}`);
  }
  const caseDigest = await hmacHex(keyBytes, material.length ? material.join('|') : 'operator-unresolved', cryptoApi);
  return { schema: 1, caseId: `FIELD-${caseDigest.slice(0, 8)}`, tokens };
}

export function normalizeInterferenceRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value;
  const tokens = {};
  for (const field of ['persona', 'hostname', 'mic']) {
    const entry = source.tokens?.[field];
    if (!TOKEN_RE.test(String(entry?.token || ''))) continue;
    tokens[field] = {
      token: entry.token,
      source: ['steam', 'os', 'host', 'mic'].includes(entry.source) ? entry.source : field,
    };
  }
  const revisions = (Array.isArray(source.revisions) ? source.revisions : []).slice(-32).map((entry, index) => ({
    id: clampText(entry?.id || `revision-${index + 1}`, 64),
    battleId: clampText(entry?.battleId, 64),
    stage: ['foreshadow', 'recognition', 'control', 'handoff', 'ending'].includes(entry?.stage) ? entry.stage : 'recognition',
    result: ['active', 'win', 'lose', 'abort', 'filed'].includes(entry?.result) ? entry.result : 'active',
    roomId: clampText(entry?.roomId, 64),
    choiceIds: unique(entry?.choiceIds).map((id) => clampText(id, 96)).slice(0, 24),
    actionIds: unique(entry?.actionIds).map((id) => clampText(id, 64)).slice(0, 24),
    windowEvents: unique(entry?.windowEvents).map((id) => clampText(id, 32)).slice(0, 24),
    perfectCounters: Math.max(0, Math.floor(Number(entry?.perfectCounters) || 0)),
    missedResponses: Math.max(0, Math.floor(Number(entry?.missedResponses) || 0)),
    annotation: clampText(entry?.annotation, 180),
  })).filter((entry) => entry.id && entry.battleId);
  return {
    schema: 1,
    caseId: CASE_RE.test(String(source.caseId || '')) ? source.caseId : null,
    tokens,
    revisions,
    classification: Object.values(ENDING_CLASSIFICATION).includes(source.classification) ? source.classification : null,
    responseClassification: RESPONSE_CLASSIFICATIONS.has(source.responseClassification)
      ? source.responseClassification
      : 'UNRESOLVED',
    endingId: Object.prototype.hasOwnProperty.call(ENDING_CLASSIFICATION, source.endingId) ? source.endingId : null,
    status: ['open', 'contested', 'filed'].includes(source.status) ? source.status : 'open',
    artifactRevision: Math.max(0, Math.floor(Number(source.artifactRevision) || revisions.length)),
  };
}

export function createInterferenceRecord(masked) {
  return normalizeInterferenceRecord({
    schema: 1,
    caseId: masked?.caseId,
    tokens: masked?.tokens || {},
    revisions: [],
    classification: null,
    responseClassification: 'UNRESOLVED',
    endingId: null,
    status: 'open',
    artifactRevision: 0,
  });
}

export function appendInterferenceRevision(record, revision = {}) {
  const current = normalizeInterferenceRecord(record);
  if (!current?.caseId) return null;
  const next = normalizeInterferenceRecord({
    ...current,
    responseClassification: RESPONSE_CLASSIFICATIONS.has(revision.responseClassification)
      ? revision.responseClassification
      : current.responseClassification,
    status: revision.stage === 'handoff' ? 'contested' : current.status,
    artifactRevision: current.artifactRevision + 1,
    revisions: [...current.revisions, {
      ...revision,
      id: revision.id || `${revision.battleId || 'battle'}:${current.artifactRevision + 1}`,
    }],
  });
  return next;
}

export function finalizeInterferenceRecord(record, endingId) {
  const current = normalizeInterferenceRecord(record);
  if (!current?.caseId || !ENDING_CLASSIFICATION[endingId]) return current;
  const annotations = {
    sacrifice: 'RETURN PATH: OPERATOR RETAINED. THE ROOM ACCEPTED THE LAST WORD.',
    helped: 'UNATTRIBUTED REVISION: THE REPORT CALLS IT HELP. THE SIGNAL DOES NOT.',
    inversion: 'PRE-ROLL DISCREPANCY: READ THE RETURNS FROM THE BOTTOM.',
    drugged: 'UNATTRIBUTED REVISION: EVIDENCE INVALIDATED. ANNOTATION RETAINED.',
    surfaced: 'RETURN PATH: BORROWED IDENTITY RELEASED. CARRIER SIGNAL FALLING.',
  };
  const next = appendInterferenceRevision(current, {
    battleId: `ending:${endingId}`,
    stage: 'ending',
    result: 'filed',
    annotation: annotations[endingId],
  });
  return normalizeInterferenceRecord({
    ...next,
    endingId,
    classification: ENDING_CLASSIFICATION[endingId],
    status: 'filed',
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/gu, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

export function interferenceManifest(record) {
  const safe = normalizeInterferenceRecord(record);
  if (!safe?.caseId) return '';
  const lines = [
    'AUDIOCORP / FIELD RETURN',
    `CASE ${safe.caseId}`,
    `STATUS ${safe.status.toUpperCase()}`,
    `CLASSIFICATION ${safe.classification || 'WITHHELD'}`,
    `RESPONSE CLASSIFICATION ${safe.responseClassification}`,
    '',
    'RESOLVED CATEGORIES',
    `PERSONA ${safe.tokens.persona?.token || 'UNRESOLVED'} / ${safe.tokens.persona?.source || 'NONE'}`,
    `HOST ${safe.tokens.hostname?.token || 'UNRESOLVED'}`,
    `INPUT ${safe.tokens.mic?.token || 'UNRESOLVED'}`,
    '',
    'REVISION TRACE',
    'ARCHITECTURAL EVENT HISTORY',
  ];
  const revisions = safe.endingId === 'inversion' ? [...safe.revisions].reverse() : safe.revisions;
  for (const revision of revisions) {
    lines.push(`${revision.id} | ${revision.stage.toUpperCase()} | ${revision.battleId} | ${revision.result.toUpperCase()}`);
    if (revision.choiceIds.length) lines.push(`  DIALOGUE ${revision.choiceIds.join(' / ')}`);
    if (revision.actionIds.length) lines.push(`  ACTIONS ${revision.actionIds.join(' / ')}`);
    if (revision.windowEvents.length) lines.push(`  WINDOW ${revision.windowEvents.join(' / ')}`);
    if (revision.annotation) lines.push(`  ${revision.annotation}`);
  }
  lines.push('', 'No microphone audio, file contents, processes, friends, network data, or other-application data were collected.');
  return `${lines.join('\n')}\n`;
}

export function interferenceHtml(record) {
  const safe = normalizeInterferenceRecord(record);
  if (!safe?.caseId) return '';
  const identityRows = [
    ['OPERATOR', safe.tokens.persona?.token || 'UNRESOLVED', safe.tokens.persona?.source || 'NONE'],
    ['HOST', safe.tokens.hostname?.token || 'UNRESOLVED', safe.tokens.hostname?.source || 'NONE'],
    ['INPUT', safe.tokens.mic?.token || 'UNRESOLVED', safe.tokens.mic?.source || 'NONE'],
  ].map(([label, token, source]) => `<tr><th>${label}</th><td>${escapeHtml(token)}</td><td>${escapeHtml(source.toUpperCase())}</td></tr>`).join('');
  const orderedRevisions = safe.endingId === 'inversion' ? [...safe.revisions].reverse() : safe.revisions;
  const revisions = orderedRevisions.map((revision, index) => `
    <article class="revision ${revision.stage === 'handoff' || revision.stage === 'ending' ? 'contested' : ''}">
      <header><span>REV ${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(revision.battleId.toUpperCase())}</strong><em>${escapeHtml(revision.result.toUpperCase())}</em></header>
      <p>${escapeHtml(revision.stage.toUpperCase())} / ${escapeHtml(revision.roomId || 'UNFILED ROOM')}</p>
      ${revision.choiceIds.length ? `<p>LANGUAGE TRACE: ${escapeHtml(revision.choiceIds.join(' · '))}</p>` : ''}
      ${revision.actionIds.length ? `<p>OPERATOR ACTIONS: ${escapeHtml(revision.actionIds.join(' · '))}</p>` : ''}
      ${revision.windowEvents.length ? `<p>WINDOW PATH: ${escapeHtml(revision.windowEvents.join(' → '))}</p>` : ''}
      ${revision.annotation ? `<blockquote>${escapeHtml(revision.annotation)}</blockquote>` : ''}
    </article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safe.caseId} / FIELD RETURN</title><style>
    :root{color-scheme:dark;background:#050707;color:#cad7c8;font:15px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}body{max-width:920px;margin:0 auto;padding:40px 28px;background:linear-gradient(180deg,#081010,#030505)}h1{color:#d68a30;letter-spacing:.12em}h2{color:#789f9b;font-size:13px;letter-spacing:.2em;border-bottom:1px solid #26413e;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin:22px 0}th,td{padding:8px;border-bottom:1px solid #162421;text-align:left}th{color:#718985}.classification{font-size:22px;color:#c76742}.revision{margin:18px 0;padding:16px;border:1px solid #263c38;background:#07100e}.revision header{display:flex;gap:18px;color:#789f9b}.revision header strong{color:#d7c88e}.revision header em{margin-left:auto;color:#8ba88f}.contested{border-color:#6e2929;box-shadow:inset 4px 0 #7a2727}.contested blockquote{color:#d45f56;transform:rotate(-.35deg);font-weight:700}footer{margin-top:36px;color:#64736e;font-size:12px}.redacted{background:#0b0d0c;color:#0b0d0c;padding:0 12px}</style></head><body>
    <p>AUDIOCORP / FIELD OPERATIONS / SIGNAL PATH</p><h1>FIELD RETURN ${escapeHtml(safe.caseId)}</h1>
    <p class="classification">${escapeHtml(safe.classification || 'CLASSIFICATION WITHHELD')} · ${escapeHtml(safe.status.toUpperCase())}</p>
    <p>RESPONSE CLASSIFICATION: ${escapeHtml(safe.responseClassification)}</p>
    <h2>OPERATOR RESOLUTION</h2><table>${identityRows}</table>
    <h2>REVISION HISTORY</h2>${revisions || '<p>NO BATTLE REVISIONS FILED.</p>'}
    <footer>LOCAL-ONLY CASE MATERIAL. EXACT IDENTITY VALUES WERE HELD IN MEMORY AND REDACTED BEFORE FILING. NO MICROPHONE AUDIO WAS RECORDED.</footer>
  </body></html>`;
}

export function endingClassification(endingId) {
  return ENDING_CLASSIFICATION[endingId] || null;
}
