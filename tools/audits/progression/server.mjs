// What the player earns. `npm run progression:audit`.
import { serveAudit } from '../shared.mjs';
import { auditById } from '../registry.mjs';
import { buildAudit } from './audit.mjs';
import { renderAudit } from './render.mjs';

serveAudit({ audit: auditById('progression'), build: buildAudit, render: renderAudit });
