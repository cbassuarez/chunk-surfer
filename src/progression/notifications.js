import { getMeta, metaCommit } from '../game/save.js';
import { achievementDefinition } from './achievements.js';

export function noticePolicy({ recording, battle, finale, dialoguePending, threat = 0, platformKind = 'browser' } = {}) {
  if (recording || battle || finale || dialoguePending || threat > 0.35) return 'defer';
  return platformKind === 'steam' ? 'pulse' : 'full';
}

export function peekNotice() {
  return getMeta()?.presentation?.pendingNotices?.[0] || null;
}

export function resolveNotice(notice) {
  if (!notice) return null;
  if (notice.type === 'achievement') {
    const def = achievementDefinition(notice.achievementId);
    return def ? { ...notice, title: def.name, body: def.description, hidden: def.hidden } : null;
  }
  return notice;
}

export function consumeNotice(id) {
  const meta = getMeta();
  const pendingNotices = (meta.presentation.pendingNotices || []).filter((notice) => notice.id !== id);
  metaCommit({ presentation: { ...meta.presentation, pendingNotices } });
}
