import { Heerich } from 'heerich';
import './styles.css';

const embeddedSnapshot = __SYSTEM_MAP_SNAPSHOT__;
const app = document.getElementById('system-map-app');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  snapshot: embeddedSnapshot,
  traceId: embeddedSnapshot.defaultTraceId,
  selected: { type: 'trace', id: embeddedSnapshot.defaultTraceId },
  districts: new Set(embeddedSnapshot.districts.map((district) => district.id)),
  flows: new Set(Object.keys(embeddedSnapshot.flowTypes)),
};

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const idSafe = (value) => String(value).replace(/[^a-z0-9_-]/gi, '-');
const nodeById = () => new Map(state.snapshot.nodes.map((node) => [node.id, node]));
const edgeById = () => new Map(state.snapshot.edges.map((edge) => [edge.id, edge]));

function shell() {
  app.innerHTML = `
    <header class="system-header">
      <div>
        <p class="eyebrow">CHUNK SURFER / CURRENT CHECKOUT</p>
        <h1>System map</h1>
        <p class="subtitle">Control, data, persistence, generation, and IPC across the full repository lifecycle.</p>
      </div>
      <div class="header-controls" aria-label="Map selection controls">
        <label for="trace-select">Trace</label>
        <select id="trace-select"></select>
        <label for="node-select">Subsystem</label>
        <select id="node-select"></select>
      </div>
      <div class="audit-links" aria-label="Detail audits">
        <strong>Audits</strong>
        ${(state.snapshot.audits || []).map((audit) => `<a href="http://127.0.0.1:${audit.port}/" target="_blank" rel="noreferrer" title="${escapeHtml(audit.blurb)} — npm run ${escapeHtml(audit.npm)}">${escapeHtml(audit.title)}</a>`).join('')}
      </div>
    </header>
    <section class="map-workspace">
      <div class="map-column">
        <div id="legend" class="legend" aria-label="Map legend"></div>
        <div id="map-stage" class="map-stage" aria-live="polite"></div>
      </div>
      <aside id="explainer" class="explainer" aria-label="System map explainer"></aside>
    </section>
    <footer class="system-footer">
      <span>Evidence resolved <time id="generated-at"></time></span>
      <span id="map-counts"></span>
    </footer>`;

  const traceSelect = document.getElementById('trace-select');
  traceSelect.innerHTML = state.snapshot.traces.map((trace) => `<option value="${escapeHtml(trace.id)}">${escapeHtml(trace.label)}</option>`).join('');
  traceSelect.value = state.traceId;
  traceSelect.addEventListener('change', () => {
    state.traceId = traceSelect.value;
    state.selected = { type: 'trace', id: traceSelect.value };
    render();
  });

  const nodeSelect = document.getElementById('node-select');
  nodeSelect.innerHTML = `<option value="">Choose a subsystem…</option>${state.snapshot.nodes.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.label)}</option>`).join('')}`;
  nodeSelect.addEventListener('change', () => {
    if (!nodeSelect.value) return;
    const node = nodeById().get(nodeSelect.value);
    if (node) state.districts.add(node.district);
    state.selected = { type: 'node', id: nodeSelect.value };
    render();
  });

  document.getElementById('generated-at').dateTime = state.snapshot.generatedAt;
  document.getElementById('generated-at').textContent = new Date(state.snapshot.generatedAt).toLocaleString();
}

function legend() {
  const districtButtons = state.snapshot.districts.map((district) => `
    <button type="button" class="legend-toggle district-${escapeHtml(district.id)}" data-district-toggle="${escapeHtml(district.id)}" aria-pressed="${state.districts.has(district.id)}">
      <span class="legend-building" aria-hidden="true"></span>${escapeHtml(district.label)}
    </button>`).join('');
  const flowButtons = Object.entries(state.snapshot.flowTypes).map(([id, flow]) => `
    <button type="button" class="legend-toggle" data-flow-toggle="${escapeHtml(id)}" aria-pressed="${state.flows.has(id)}">
      <span class="legend-route flow-${escapeHtml(id)}" aria-hidden="true"></span>${escapeHtml(flow.label)}
    </button>`).join('');
  const legendElement = document.getElementById('legend');
  legendElement.innerHTML = `<div class="legend-group"><strong>Districts</strong>${districtButtons}</div><div class="legend-group"><strong>Payload routes</strong>${flowButtons}</div>`;
  legendElement.querySelectorAll('[data-district-toggle]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.districtToggle;
    if (state.districts.has(id) && state.districts.size > 1) state.districts.delete(id); else state.districts.add(id);
    render();
  }));
  legendElement.querySelectorAll('[data-flow-toggle]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.flowToggle;
    if (state.flows.has(id) && state.flows.size > 1) state.flows.delete(id); else state.flows.add(id);
    render();
  }));
}

function buildingStyle(district) {
  return {
    default: { fill: `var(--district-${district}-side)`, stroke: 'var(--map-structure)', strokeWidth: 0.75 },
    top: { fill: `var(--district-${district}-top)`, stroke: 'var(--map-structure)', strokeWidth: 0.75 },
    left: { fill: `var(--district-${district}-left)`, stroke: 'var(--map-structure)', strokeWidth: 0.75 },
  };
}

function addBox(engine, node, position, size, suffix = 'body') {
  engine.addGeometry({
    type: 'box', position, size,
    style: buildingStyle(node.district),
    meta: { node: node.id, district: node.district, part: suffix },
  });
}

function addBuilding(engine, node) {
  const { x, z, w, d, h } = node.grid;
  const base = Math.max(2, Math.floor(h * 0.58));
  const top = Math.max(1, h - base);
  switch (node.archetype) {
    case 'signal-tower':
      addBox(engine, node, [x, -2, z], [w, 2, d], 'base');
      addBox(engine, node, [x + 1, -h, z + 1], [Math.max(2, w - 2), h - 2, Math.max(2, d - 2)], 'tower');
      addBox(engine, node, [x + Math.floor(w / 2), -h - 3, z + Math.floor(d / 2)], [1, 3, 1], 'mast');
      break;
    case 'terraced-tower':
      addBox(engine, node, [x, -base, z], [w, base, d], 'lower');
      addBox(engine, node, [x + 1, -base - 3, z + 1], [w - 2, 3, d - 2], 'middle');
      addBox(engine, node, [x + 2, -h, z + 2], [Math.max(1, w - 4), top, Math.max(1, d - 4)], 'crown');
      break;
    case 'generator':
    case 'foundry':
    case 'cooling-plant':
      addBox(engine, node, [x, -base, z], [w, base, d], 'plant');
      addBox(engine, node, [x + 1, -h, z + 1], [1, top + 1, 1], 'stack-a');
      addBox(engine, node, [x + w - 2, -h + 1, z + d - 2], [1, Math.max(2, top), 1], 'stack-b');
      if (node.archetype === 'cooling-plant') addBox(engine, node, [x + 2, -base - 2, z + 2], [Math.max(2, w - 4), 2, Math.max(2, d - 4)], 'cooler');
      break;
    case 'courthouse':
      addBox(engine, node, [x, -2, z], [w, 2, d], 'steps');
      addBox(engine, node, [x + 1, -h + 1, z + 1], [w - 2, h - 3, d - 2], 'hall');
      for (let column = 1; column < w - 1; column += 2) addBox(engine, node, [x + column, -h + 1, z], [1, h - 3, 1], `column-${column}`);
      addBox(engine, node, [x, -h, z], [w, 1, d], 'roof');
      break;
    case 'theatre':
      addBox(engine, node, [x, -base, z], [w, base, d], 'auditorium');
      addBox(engine, node, [x + 1, -h, z + 2], [w - 2, top + 1, d - 2], 'fly-tower');
      addBox(engine, node, [x + 2, -2, z - 1], [Math.max(2, w - 4), 2, 1], 'marquee');
      break;
    case 'archive':
    case 'library':
    case 'vault':
      addBox(engine, node, [x, -h, z], [w, h, d], 'stacks');
      for (let bay = 1; bay < w - 1; bay += 2) addBox(engine, node, [x + bay, -h - 1, z + 1], [1, 1, Math.max(1, d - 2)], `clerestory-${bay}`);
      break;
    case 'studio':
    case 'workshop':
      addBox(engine, node, [x, -base, z], [w, base, d], 'floor');
      for (let roof = 0; roof < w; roof += 2) addBox(engine, node, [x + roof, -base - 2, z + 1], [1, 2, Math.max(2, d - 2)], `roof-${roof}`);
      break;
    case 'relay':
      addBox(engine, node, [x, -2, z], [w, 2, d], 'relay-base');
      addBox(engine, node, [x + 2, -h, z + 1], [1, h - 2, 2], 'relay-mast');
      addBox(engine, node, [x + 1, -h - 1, z + 1], [3, 1, 2], 'array');
      break;
    case 'shipyard':
      addBox(engine, node, [x, -3, z], [w, 3, d], 'dock');
      addBox(engine, node, [x + 1, -h, z + 1], [1, h - 3, 1], 'crane-a');
      addBox(engine, node, [x + 1, -h, z + 1], [w - 2, 1, 1], 'crane-boom');
      addBox(engine, node, [x + w - 2, -h + 2, z + d - 2], [1, h - 5, 1], 'crane-b');
      break;
    case 'depot':
    case 'warehouse':
      addBox(engine, node, [x, -base, z], [w, base, d], 'shed');
      addBox(engine, node, [x + 1, -base - 1, z + 1], [w - 2, 1, d - 2], 'roof-monitor');
      break;
    case 'compiler':
    case 'dispatch':
      addBox(engine, node, [x, -base, z], [w, base, d], 'podium');
      addBox(engine, node, [x + 1, -h, z + 1], [w - 2, top + 1, d - 2], 'core');
      addBox(engine, node, [x + 2, -h - 1, z + 2], [Math.max(1, w - 4), 1, Math.max(1, d - 4)], 'beacon');
      break;
    case 'control-hall':
      addBox(engine, node, [x, -base, z], [w, base, d], 'hall');
      addBox(engine, node, [x + 2, -h, z + 1], [Math.max(2, w - 4), top + 1, d - 2], 'control-room');
      break;
    case 'station':
      addBox(engine, node, [x, -base, z], [w, base, d], 'concourse');
      addBox(engine, node, [x + 1, -h, z + 1], [w - 2, top + 1, d - 2], 'clock-house');
      addBox(engine, node, [x + 2, -h - 2, z + 1], [1, 2, 1], 'clock');
      break;
    default:
      addBox(engine, node, [x, -h, z], [w, h, d]);
  }
}

function nodeAnchor(node, toward = null) {
  const { x, z, w, d } = node.grid;
  let ax = x + w / 2;
  let az = z + d / 2;
  if (toward) {
    const tx = toward.grid.x + toward.grid.w / 2;
    const tz = toward.grid.z + toward.grid.d / 2;
    const dx = tx - ax;
    const dz = tz - az;
    const span = Math.max(Math.abs(dx) / Math.max(w, 1), Math.abs(dz) / Math.max(d, 1), 1);
    ax += dx / span * 0.48;
    az += dz / span * 0.48;
  }
  return [ax, -0.25, az];
}

function routePath(engine, edge, nodes) {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  const a = engine.project(nodeAnchor(from, to));
  const b = engine.project(nodeAnchor(to, from));
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const direction = [...edge.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 1 : -1;
  const bend = Math.min(34, Math.max(12, length * 0.12)) * direction;
  const cx = (a.x + b.x) / 2 - dy / length * bend;
  const cy = (a.y + b.y) / 2 + dx / length * bend;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${cx.toFixed(2)} ${cy.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function routeMarkup(engine, visibleNodes, activeEdges) {
  const nodes = new Map(visibleNodes.map((node) => [node.id, node]));
  const edges = state.snapshot.edges.filter((edge) => state.flows.has(edge.kind) && nodes.has(edge.from) && nodes.has(edge.to));
  const markerDefs = Object.keys(state.snapshot.flowTypes).map((kind) => `<marker id="arrow-${kind}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="arrow-${kind}"/></marker>`).join('');
  const paths = [];
  const markers = [];
  for (const edge of edges) {
    const d = routePath(engine, edge, nodes);
    const active = activeEdges.has(edge.id);
    paths.push(`<path id="route-${idSafe(edge.id)}" class="payload-route flow-${edge.kind}${active ? ' is-trace' : ''}" data-edge="${escapeHtml(edge.id)}" d="${d}" marker-end="url(#arrow-${edge.kind})"/>`);
    if (active && !reducedMotion.matches) markers.push(`<circle class="payload-dot flow-fill-${edge.kind}" r="2.4" aria-hidden="true"><animateMotion dur="${2.7 + (edge.id.length % 4) * .35}s" repeatCount="indefinite" path="${d}"/></circle>`);
  }
  return `<defs>${markerDefs}</defs><g class="route-layer">${paths.join('')}${markers.join('')}</g>`;
}

function labelsMarkup(engine, visibleNodes, activeNodeIds) {
  const districtLabels = state.snapshot.districts.filter((district) => state.districts.has(district.id)).map((district) => {
    const point = engine.project([district.bounds.x + 1, -0.3, district.bounds.z + 1]);
    return `<text class="district-label district-label-${district.id}" x="${point.x}" y="${point.y - 8}">${escapeHtml(district.label.toUpperCase())}</text>`;
  }).join('');
  const nodeLabels = visibleNodes.map((node) => {
    const point = engine.project([node.grid.x + node.grid.w / 2, -node.grid.h - 1, node.grid.z + node.grid.d / 2]);
    return `<text class="building-label${activeNodeIds.has(node.id) ? ' is-trace' : ''}" data-node="${escapeHtml(node.id)}" x="${point.x}" y="${point.y - 5}" text-anchor="middle">${escapeHtml(node.label)}</text>`;
  }).join('');
  return `<g class="label-layer">${districtLabels}${nodeLabels}</g>`;
}

function renderMap() {
  const stage = document.getElementById('map-stage');
  const activeTrace = state.snapshot.traces.find((trace) => trace.id === state.traceId);
  const activeEdges = new Set(activeTrace?.edgeIds || []);
  const allNodes = nodeById();
  const activeNodeIds = new Set([...activeEdges].flatMap((edgeId) => {
    const edge = edgeById().get(edgeId);
    return edge ? [edge.from, edge.to] : [];
  }));
  const visibleNodes = state.snapshot.nodes.filter((node) => state.districts.has(node.district));
  const engine = new Heerich({ tile: 12, camera: { type: 'isometric', angle: 45 }, gap: 0.035 });
  for (const district of state.snapshot.districts.filter((item) => state.districts.has(item.id))) {
    engine.addGeometry({
      type: 'box', position: [district.bounds.x, 0, district.bounds.z], size: [district.bounds.w, 1, district.bounds.d],
      style: {
        default: { fill: `var(--district-${district.id}-ground)`, stroke: 'var(--map-grid)', strokeWidth: 0.5 },
        top: { fill: `var(--district-${district.id}-ground)`, stroke: 'var(--map-grid)', strokeWidth: 0.5 },
      },
      meta: { district: district.id, ground: 'true' },
    });
  }
  for (const node of visibleNodes) addBuilding(engine, node);
  const routes = routeMarkup(engine, visibleNodes, activeEdges);
  const labels = labelsMarkup(engine, visibleNodes, activeNodeIds);
  stage.innerHTML = engine.toSVG({ padding: 44, append: `${routes}${labels}` });
  const svg = stage.querySelector('svg');
  svg?.setAttribute('role', 'img');
  svg?.setAttribute('aria-label', `Isometric Chunk Surfer system map. Active trace: ${activeTrace?.label || 'none'}.`);
  svg?.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const selected = state.selected;
  if (selected.type === 'node') stage.querySelectorAll(`[data-node="${CSS.escape(selected.id)}"]`).forEach((element) => element.classList.add('is-selected'));
  if (selected.type === 'edge') stage.querySelectorAll(`[data-edge="${CSS.escape(selected.id)}"]`).forEach((element) => element.classList.add('is-selected'));
  for (const nodeId of activeNodeIds) stage.querySelectorAll(`[data-node="${CSS.escape(nodeId)}"]`).forEach((element) => element.classList.add('is-trace'));

  stage.onclick = (event) => {
    const edgeElement = event.target.closest?.('[data-edge]');
    const nodeElement = event.target.closest?.('[data-node]');
    if (edgeElement) state.selected = { type: 'edge', id: edgeElement.dataset.edge };
    else if (nodeElement) state.selected = { type: 'node', id: nodeElement.dataset.node };
    else return;
    render();
  };
  stage.onpointerover = (event) => {
    const id = event.target.closest?.('[data-node]')?.dataset.node;
    if (!id) return;
    stage.querySelectorAll(`[data-node="${CSS.escape(id)}"]`).forEach((element) => element.classList.add('is-hovered'));
  };
  stage.onpointerout = (event) => {
    const id = event.target.closest?.('[data-node]')?.dataset.node;
    if (!id) return;
    stage.querySelectorAll(`[data-node="${CSS.escape(id)}"]`).forEach((element) => element.classList.remove('is-hovered'));
  };

  document.getElementById('map-counts').textContent = `${visibleNodes.length}/${state.snapshot.nodes.length} systems · ${state.snapshot.edges.filter((edge) => state.flows.has(edge.kind) && allNodes.has(edge.from) && allNodes.has(edge.to)).length} routes`;
}

// A map says where a system is; an audit says what is inside it. Where one
// exists for the selected system, offer it — the audit may not be running, and
// the page it lands on says how to start it.
function auditMarkup(nodeId) {
  const audits = (state.snapshot.audits || []).filter((audit) => audit.systems.includes(nodeId));
  if (!audits.length) return '';
  return `<h3>Audit this system</h3>${audits.map((audit) => `
    <a class="audit-card" href="http://127.0.0.1:${audit.port}/" target="_blank" rel="noreferrer">
      <span>${escapeHtml(audit.title)}</span>
      <small>${escapeHtml(audit.blurb)}</small>
      <code>npm run ${escapeHtml(audit.npm)}</code>
    </a>`).join('')}`;
}

function citationMarkup(evidence) {
  return evidence.map((citation) => `
    <details class="citation">
      <summary><code>${escapeHtml(citation.path)}:${citation.line}</code><span>${escapeHtml(citation.purpose)}</span></summary>
      <pre>${citation.excerpt.map((line) => `<span><b>${line.line}</b>${escapeHtml(line.text)}</span>`).join('\n')}</pre>
    </details>`).join('');
}

function flowBadge(kind) {
  return `<span class="flow-badge flow-badge-${escapeHtml(kind)}"><span class="legend-route flow-${escapeHtml(kind)}" aria-hidden="true"></span>${escapeHtml(state.snapshot.flowTypes[kind]?.label || kind)}</span>`;
}

function edgeButton(edge, direction = '') {
  const nodes = nodeById();
  return `<button type="button" class="connection" data-select-edge="${escapeHtml(edge.id)}"><span>${escapeHtml(direction || edge.label)}</span><small>${escapeHtml(nodes.get(edge.from)?.label)} → ${escapeHtml(nodes.get(edge.to)?.label)}</small></button>`;
}

function renderExplainer() {
  const panel = document.getElementById('explainer');
  const nodes = nodeById();
  const edges = edgeById();
  const selected = state.selected;
  if (selected.type === 'node') {
    const node = nodes.get(selected.id);
    if (!node) return;
    const inbound = state.snapshot.edges.filter((edge) => edge.to === node.id);
    const outbound = state.snapshot.edges.filter((edge) => edge.from === node.id);
    panel.innerHTML = `
      <p class="eyebrow">${escapeHtml(state.snapshot.districts.find((district) => district.id === node.district)?.label || node.district)}</p>
      <h2>${escapeHtml(node.label)}</h2>
      <p class="panel-summary">${escapeHtml(node.summary)}</p>
      <h3>Responsibilities</h3>
      <ul>${node.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <div class="connection-grid">
        <section><h3>Inbound · ${inbound.length}</h3>${inbound.map((edge) => edgeButton(edge)).join('') || '<p class="empty">None</p>'}</section>
        <section><h3>Outbound · ${outbound.length}</h3>${outbound.map((edge) => edgeButton(edge)).join('') || '<p class="empty">None</p>'}</section>
      </div>
      ${auditMarkup(node.id)}
      <h3>Source evidence</h3>${citationMarkup(node.evidence)}`;
  } else if (selected.type === 'edge') {
    const edge = edges.get(selected.id);
    if (!edge) return;
    panel.innerHTML = `
      <p class="eyebrow">PAYLOAD ROUTE</p>
      <h2>${escapeHtml(edge.label)}</h2>
      <p class="route-endpoints"><button type="button" data-select-node="${escapeHtml(edge.from)}">${escapeHtml(nodes.get(edge.from)?.label)}</button><span>→</span><button type="button" data-select-node="${escapeHtml(edge.to)}">${escapeHtml(nodes.get(edge.to)?.label)}</button></p>
      ${flowBadge(edge.kind)}
      <h3>Payload</h3><p class="payload-copy">${escapeHtml(edge.payload)}</p>
      <h3>Control/data evidence</h3>${citationMarkup(edge.evidence)}`;
  } else {
    const trace = state.snapshot.traces.find((item) => item.id === selected.id) || state.snapshot.traces.find((item) => item.id === state.traceId);
    if (!trace) return;
    panel.innerHTML = `
      <p class="eyebrow">ACTIVE END-TO-END TRACE</p>
      <h2>${escapeHtml(trace.label)}</h2>
      <p class="panel-summary">${escapeHtml(trace.summary)}</p>
      <h3>Route segments</h3>
      <div class="trace-steps">${trace.edgeIds.map((edgeId, index) => {
        const edge = edges.get(edgeId);
        return edge ? `<div class="trace-step"><span>${index + 1}</span>${edgeButton(edge)}</div>` : '';
      }).join('')}</div>`;
  }
  panel.querySelectorAll('[data-select-edge]').forEach((button) => button.addEventListener('click', () => { state.selected = { type: 'edge', id: button.dataset.selectEdge }; render(); }));
  panel.querySelectorAll('[data-select-node]').forEach((button) => button.addEventListener('click', () => {
    const node = nodes.get(button.dataset.selectNode);
    if (node) state.districts.add(node.district);
    state.selected = { type: 'node', id: button.dataset.selectNode };
    render();
  }));
}

function render() {
  document.getElementById('trace-select').value = state.traceId;
  document.getElementById('node-select').value = state.selected.type === 'node' ? state.selected.id : '';
  legend();
  renderMap();
  renderExplainer();
}

async function refreshSnapshot() {
  try {
    const response = await fetch('./api/system-map', { cache: 'no-store' });
    if (!response.ok) throw new Error(`system map API ${response.status}`);
    const next = await response.json();
    if (next?.schema === 1) state.snapshot = next;
  } catch (error) {
    console.info(`Using embedded system-map snapshot: ${error.message || error}`);
  }
}

shell();
await refreshSnapshot();
document.getElementById('generated-at').dateTime = state.snapshot.generatedAt;
document.getElementById('generated-at').textContent = new Date(state.snapshot.generatedAt).toLocaleString();
render();
reducedMotion.addEventListener('change', render);
