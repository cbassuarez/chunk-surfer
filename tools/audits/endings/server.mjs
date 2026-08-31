// Every ending. `npm run endings:audit`.
import { serveAudit } from '../shared.mjs';
import { auditById } from '../registry.mjs';
import { buildAudit } from './audit.mjs';
import { renderAudit } from './render.mjs';

serveAudit({ audit: auditById('endings'), build: buildAudit, render: renderAudit });
