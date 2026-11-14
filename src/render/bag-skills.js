// The live Skills panel and its pointer regions share one rack layout.
import { skillPatchSource } from '../game/skill-patchbay.js';
import { uiCellMetrics, uiDraw } from './ui.js';
import { channelStripBounds, channelStripGeometry, drawChannelStripBay } from './patch-channel-strip.js';

const BRANCH_LABEL = Object.freeze({
  torch: 'TORCH',
  recorder: 'RECORDER',
  rig: 'SERVICE I/F',
  nerve: 'NERVE',
  fork: 'FORK',
  radio: 'RADIO',
});

export function patchBayLayout({ region, branches = [] }) {
  const metrics = uiCellMetrics();
  const { aspect } = metrics;
  const strip = channelStripBounds(region, metrics);
  const channels = channelStripGeometry({ region: strip.rack, branches, ...metrics });
  const sources = [], nodes = [], inputs = [], outputs = [], cables = [];
  const terminals = [];

  function socket({ id, branch, x, y, kind, entry = null, row, radius, width, height }) {
    return {
      id, branch, x, y, kind, skillId: entry?.id ?? null,
      techniqueId: entry?.techniqueId ?? null,
      rX: radius / aspect, rY: radius,
      hit: {
        x: x - width / 2,
        y: Math.min(y - height / 2, row.y + row.h - height - .015),
        w: width, h: height,
      },
    };
  }

  for (const channel of channels) {
    const branch = channel.id;
    const radius = channel.radius;
    sources.push(socket({
      id: `supply:${branch}`, branch, kind: 'output', x: channel.sourceX, y: channel.sourceY,
      row: channel.box, radius, width: Math.min(channel.sendWidth * .86, radius * 3.8 / aspect),
      height: Math.min(.95, radius * 4.2),
    }));

    for (const { entry, bounds, socketHeight, inputOffset, outputOffset } of channel.cells) {
      const installed = entry.owned || entry.pending;
      function port(kind, offset) {
        return socket({
          id: `${kind}:${entry.id}`, kind, branch, entry, radius,
          x: bounds.x + bounds.w * offset, y: bounds.y + bounds.h * socketHeight,
          row: bounds, width: Math.min(bounds.w * .39, radius * 3.6 / aspect),
          height: Math.min(bounds.h * .52, radius * 3.6),
        });
      }
      const input = port('input', entry.circuitBend ? .73 : inputOffset);
      const outPosition = port('output', entry.circuitBend ? .27 : outputOffset);
      const feed = entry.circuitBend ? { ...outPosition, ...skillPatchSource(entry.id), skillId:entry.id } : null;
      if (feed) terminals.push(feed);
      const output = installed && !feed ? outPosition : null;
      nodes.push({
        id: entry.id, techniqueId: entry.techniqueId, entry, branch, bounds, input, output, outPosition, feed, installed,
      });
      inputs.push(input);
      if (output) outputs.push(output);
    }
  }
  for (const node of nodes) {
    if (!node.installed) continue;
    const upstream = node.feed || (node.entry.lead
      ? nodes.find(other => other.branch === node.branch && other.entry.tier === node.entry.lead.fromTier)?.output
      : sources.find(source => source.branch === node.branch));
    if (upstream) cables.push({
      id: `lead:${node.id}`, skillId: node.id, branch: node.branch, from: upstream, to: node.input,
    });
  }
  return {
    ...region, strip, channels, sources, nodes, inputs, outputs, terminals, cables,
    sockets: [...sources, ...inputs, ...outputs, ...terminals], returnZone: strip.tray, detail: strip.detail,
  };
}

export function nextPatchBayNode(layout, selectedId, dx, dy) {
  const current = layout.nodes.find(node => node.id === selectedId);
  if (!current) return null;
  const { aspect } = uiCellMetrics();
  let best = null;
  let score = Infinity;
  for (const node of layout.nodes) {
    const x = (node.input.x - current.input.x) * aspect;
    const y = node.input.y - current.input.y;
    const ahead = x * dx + y * dy;
    if (ahead < .05) continue;
    const offset = Math.abs(dx ? y : x);
    const candidate = ahead + offset * 3 + offset * offset / ahead;
    if (candidate < score) { score = candidate; best = node; }
  }
  return best?.entry ?? null;
}

export function drawSkillsSection({ model, layout, selectedId, patchDrag = null, patchLayout = null, notePrompt = '' }) {
  const section = model?.sections?.find(item => item.id === 'skills');
  if (!section) return;
  const { branches, pins } = section.tree;
  const tree = patchLayout ?? patchBayLayout({ region: layout, branches });
  const hovered = patchDrag?.valid && !patchDrag.returnHover
    ? tree.inputs.find(socket => socket.id === patchDrag.targetId) : null;
  const lifted = patchDrag?.rerouteId
    ? tree.inputs.find(socket => socket.techniqueId === patchDrag.rerouteId) : null;
  uiDraw(surface => drawChannelStripBay(surface, tree, {
    labels: BRANCH_LABEL, selectedId, pins, patchDrag, hovered, lifted, notePrompt, returnHover: !!patchDrag?.returnHover,
  }));
}
