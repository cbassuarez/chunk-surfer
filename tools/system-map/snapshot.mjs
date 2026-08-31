import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

import {
  DEFAULT_TRACE_ID,
  DISTRICTS,
  FLOW_TYPES,
  SYSTEM_EDGES,
  SYSTEM_NODES,
  SYSTEM_TRACES,
} from './topology.mjs';
import { AUDITS } from '../audits/registry.mjs';

export const REPO_ROOT = resolve(import.meta.dirname, '../..');

export class SystemMapContractError extends Error {
  constructor(errors) {
    super(`System map contract failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
    this.name = 'SystemMapContractError';
    this.errors = errors;
  }
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z;
}

function traceIsConnected(trace, edgeById) {
  const edges = trace.edgeIds.map((id) => edgeById.get(id)).filter(Boolean);
  if (!edges.length) return false;
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
    adjacency.get(edge.from).add(edge.to);
    adjacency.get(edge.to).add(edge.from);
  }
  const [first] = adjacency.keys();
  const visited = new Set([first]);
  const pending = [first];
  while (pending.length) {
    for (const next of adjacency.get(pending.shift()) || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      pending.push(next);
    }
  }
  return visited.size === adjacency.size;
}

export function topologyContractErrors() {
  const errors = [];
  const nodeIds = SYSTEM_NODES.map((node) => node.id);
  const edgeIds = SYSTEM_EDGES.map((edge) => edge.id);
  const traceIds = SYSTEM_TRACES.map((trace) => trace.id);
  const districtIds = new Set(DISTRICTS.map((district) => district.id));
  const nodeById = new Map(SYSTEM_NODES.map((node) => [node.id, node]));
  const edgeById = new Map(SYSTEM_EDGES.map((edge) => [edge.id, edge]));

  for (const id of duplicates(nodeIds)) errors.push(`duplicate node id ${id}`);
  for (const id of duplicates(edgeIds)) errors.push(`duplicate edge id ${id}`);
  for (const id of duplicates(traceIds)) errors.push(`duplicate trace id ${id}`);
  if (!SYSTEM_TRACES.some((trace) => trace.id === DEFAULT_TRACE_ID)) errors.push(`default trace ${DEFAULT_TRACE_ID} is missing`);

  for (const node of SYSTEM_NODES) {
    if (!districtIds.has(node.district)) errors.push(`${node.id} has unknown district ${node.district}`);
    if (!node.summary?.trim()) errors.push(`${node.id} is missing a summary`);
    if (!node.evidence?.length) errors.push(`${node.id} has no evidence`);
    for (const key of ['x', 'z', 'w', 'd', 'h']) if (!Number.isFinite(node.grid?.[key]) || node.grid[key] <= 0) errors.push(`${node.id} has invalid grid.${key}`);
  }
  for (let index = 0; index < SYSTEM_NODES.length; index += 1) {
    for (let other = index + 1; other < SYSTEM_NODES.length; other += 1) {
      const a = SYSTEM_NODES[index];
      const b = SYSTEM_NODES[other];
      if (rectanglesOverlap(a.grid, b.grid)) errors.push(`${a.id} overlaps ${b.id}`);
    }
  }

  for (const edge of SYSTEM_EDGES) {
    if (!nodeById.has(edge.from)) errors.push(`${edge.id} has unknown source ${edge.from}`);
    if (!nodeById.has(edge.to)) errors.push(`${edge.id} has unknown target ${edge.to}`);
    if (!FLOW_TYPES[edge.kind]) errors.push(`${edge.id} has unknown flow type ${edge.kind}`);
    if (!edge.payload?.trim()) errors.push(`${edge.id} has no payload description`);
    if (!edge.evidence?.length) errors.push(`${edge.id} has no evidence`);
  }

  for (const trace of SYSTEM_TRACES) {
    if (!trace.edgeIds?.length) errors.push(`${trace.id} has no edges`);
    for (const edgeId of trace.edgeIds || []) if (!edgeById.has(edgeId)) errors.push(`${trace.id} references unknown edge ${edgeId}`);
    if (!traceIsConnected(trace, edgeById)) errors.push(`${trace.id} is not a connected path`);
  }
  return errors;
}

function safeSourcePath(root, relativePath) {
  const full = resolve(root, relativePath);
  if (full !== root && !full.startsWith(`${root}${sep}`)) throw new Error(`${relativePath} escapes the repository root`);
  return full;
}

async function resolveEvidence(evidence, { root, sources }) {
  const path = String(evidence?.path || '');
  const anchor = String(evidence?.anchor || '');
  if (!path || !anchor) throw new Error('evidence requires path and anchor');
  if (!sources.has(path)) sources.set(path, readFile(safeSourcePath(root, path), 'utf8'));
  const source = await sources.get(path);
  const lines = source.split(/\r?\n/);
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) if (lines[index].includes(anchor)) matches.push(index);
  if (!matches.length) throw new Error(`${path} is missing anchor ${JSON.stringify(anchor)}`);
  if (matches.length > 1) throw new Error(`${path} anchor ${JSON.stringify(anchor)} is ambiguous (${matches.length} matches)`);
  const index = matches[0];
  const startIndex = Math.max(0, index - 1);
  const endIndex = Math.min(lines.length - 1, index + 1);
  return {
    path,
    line: index + 1,
    endLine: endIndex + 1,
    purpose: evidence.purpose || '',
    excerpt: lines.slice(startIndex, endIndex + 1).map((line, offset) => ({ line: startIndex + offset + 1, text: line.trimEnd() })),
  };
}

async function hydrateEntries(entries, options) {
  const hydrated = [];
  const errors = [];
  for (const entry of entries) {
    const evidence = [];
    for (const item of entry.evidence || []) {
      try { evidence.push(await resolveEvidence(item, options)); }
      catch (error) { errors.push(`${entry.id}: ${error.message}`); }
    }
    hydrated.push({ ...entry, evidence });
  }
  return { hydrated, errors };
}

export async function buildSystemMapSnapshot({ root = REPO_ROOT } = {}) {
  const errors = topologyContractErrors();
  const sources = new Map();
  const options = { root, sources };
  const [nodes, edges] = await Promise.all([
    hydrateEntries(SYSTEM_NODES, options),
    hydrateEntries(SYSTEM_EDGES, options),
  ]);
  errors.push(...nodes.errors, ...edges.errors);
  if (errors.length) throw new SystemMapContractError(errors);
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    repo: { name: 'chunk-surfer', root },
    defaultTraceId: DEFAULT_TRACE_ID,
    flowTypes: FLOW_TYPES,
    districts: DISTRICTS,
    nodes: nodes.hydrated,
    edges: edges.hydrated,
    traces: SYSTEM_TRACES,
    // The detail views. Each audit reads one part of the game out of its own
    // declarations; the map says where a system is, and the audit says what is
    // in it. `systems` is how a node knows which audit to offer.
    audits: AUDITS,
  };
}

