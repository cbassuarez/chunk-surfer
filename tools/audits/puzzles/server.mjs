// Every puzzle and microgame. `npm run puzzles:audit`.
import { serveAudit } from '../shared.mjs';
import { auditById } from '../registry.mjs';
import { buildAudit } from './audit.mjs';
import { renderAudit } from './render.mjs';

serveAudit({ audit: auditById('puzzles'), build: buildAudit, render: renderAudit });
