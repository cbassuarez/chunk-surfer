import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  Background, Connection, Controls, Edge, Handle, MarkerType, MiniMap, Node, NodeProps,
  Position, ReactFlow, ReactFlowProvider, useNodesState, useUpdateNodeInternals,
} from '@xyflow/react';
import type { NarrativeDocument, StoryLayout, StoryNode, StoryTransaction } from './types';

type GraphNodeData = { story: StoryNode; label: string; entry: boolean; highlighted: boolean; searchHit: boolean };

const StoryNodeCard = memo(({ data }: NodeProps<Node<GraphNodeData>>) => {
  const story = data.story;
  const updateNodeInternals = useUpdateNodeInternals();
  const handleSignature = `${story.goto || ''}|${(story.choices || []).map((choice) => choice.id).join('|')}`;
  useLayoutEffect(() => {
    updateNodeInternals(data.label);
  }, [data.label, handleSignature, updateNodeInternals]);
  return <div className={`story-node story-node--${story.type} ${data.highlighted ? 'is-path' : ''} ${data.searchHit ? 'is-search' : ''}`}>
    <Handle type="target" position={Position.Left} />
    <div className="story-node__eyebrow">{data.entry ? 'ENTRY · ' : ''}{story.type}</div>
    <div className="story-node__title">{story.speaker || data.label}</div>
    <div className="story-node__copy">{String(story.lines?.[0]?.text || 'No lines yet').slice(0, 120)}</div>
    {(story.choices || []).map((choice, index) => <div className="story-node__choice" key={choice.id}>
      <span>{index + 1}. {choice.text}</span>
      <Handle id={`choice:${choice.id}`} type="source" position={Position.Right} />
    </div>)}
    {story.goto && <Handle id="goto" type="source" position={Position.Right} className="story-node__goto" />}
  </div>;
});

const RegionCard = memo(({ data }: NodeProps<Node<{ label: string; color: string; kind: string }>>) =>
  <div className="graph-region" style={{ '--region-color': data.color } as React.CSSProperties}>
    <span>{data.kind}</span><strong>{data.label}</strong>
  </div>);

const nodeTypes = { story: StoryNodeCard, region: RegionCard };

function edgesFor(document: NarrativeDocument, path: Set<string>): Edge[] {
  const edges: Edge[] = [];
  for (const [nodeId, node] of Object.entries(document.nodes)) {
    if (node.goto) edges.push({
      id: `${nodeId}:goto`, source: nodeId, target: node.goto, sourceHandle: 'goto',
      animated: path.has(nodeId) && path.has(node.goto), markerEnd: { type: MarkerType.ArrowClosed },
      className: path.has(nodeId) && path.has(node.goto) ? 'path-edge' : '',
    });
    for (const choice of node.choices || []) if (choice.goto) edges.push({
      id: `${nodeId}:${choice.id}`, source: nodeId, target: choice.goto, sourceHandle: `choice:${choice.id}`,
      label: choice.text, markerEnd: { type: MarkerType.ArrowClosed },
      animated: path.has(nodeId) && path.has(choice.goto), className: path.has(nodeId) && path.has(choice.goto) ? 'path-edge' : '',
    });
  }
  return edges;
}

function pathTo(document: NarrativeDocument, target: string | null) {
  if (!target) return new Set<string>();
  const parents = new Map<string, Set<string>>();
  for (const [id, node] of Object.entries(document.nodes)) {
    for (const next of [node.goto, ...(node.choices || []).map((choice) => choice.goto)].filter(Boolean) as string[]) {
      if (!parents.has(next)) parents.set(next, new Set());
      parents.get(next)!.add(id);
    }
  }
  const found = new Set([target]);
  const pending = [target];
  while (pending.length) for (const parent of parents.get(pending.shift()!) || []) if (!found.has(parent)) { found.add(parent); pending.push(parent); }
  return found;
}

function regionNodes(document: NarrativeDocument, positions: StoryLayout['positions']): Node[] {
  return (document.regions || []).map((region, index) => {
    const points = region.nodeIds.map((id) => positions[id]).filter(Boolean);
    const minX = Math.min(...points.map((p) => p.x), 40 + index * 20) - 48;
    const minY = Math.min(...points.map((p) => p.y), 40 + index * 20) - 72;
    const maxX = Math.max(...points.map((p) => p.x), minX + 500) + 330;
    const maxY = Math.max(...points.map((p) => p.y), minY + 300) + 230;
    return {
      id: `region:${region.id}`, type: 'region', position: { x: minX, y: minY }, draggable: false, selectable: false,
      data: { label: region.title, kind: region.kind, color: region.color || '#F2A81E' },
      style: { width: Math.max(440, maxX - minX), height: Math.max(260, maxY - minY), zIndex: -2 },
    };
  });
}

function StoryGraphInner({ document, layout, selectedId, search, onSelect, onEdit, onTransaction }: {
  document: NarrativeDocument; layout: StoryLayout; selectedId: string | null; search: string;
  onSelect: (id: string | null) => void; onEdit: (id: string) => void; onTransaction: (transaction: StoryTransaction) => void;
}) {
  const [traceEnding, setTraceEnding] = useState<string | null>(null);
  const path = useMemo(() => pathTo(document, traceEnding), [document, traceEnding]);
  const initialNodes = useMemo(() => [
    ...regionNodes(document, layout.positions),
    ...Object.entries(document.nodes).map(([id, story], index) => ({
      id, type: 'story', position: layout.positions[id] || { x: 100 + (index % 4) * 360, y: 100 + Math.floor(index / 4) * 260 },
      data: { story, label: id, entry: (document.entries || [document.entry]).includes(id), highlighted: path.has(id), searchHit: !!search && JSON.stringify(story).toLowerCase().includes(search.toLowerCase()) },
    })),
  ], [document, layout.positions, path, search]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  const edges = useMemo(() => edgesFor(document, path), [document, path]);

  const connect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const next = structuredClone(document);
    const source = next.nodes[connection.source];
    if (!source) return;
    if (connection.sourceHandle?.startsWith('choice:')) {
      const id = connection.sourceHandle.slice(7);
      const choice = source.choices?.find((item) => item.id === id);
      if (choice) { choice.goto = connection.target; delete choice.exit; }
    } else { source.goto = connection.target; delete source.exit; }
    onTransaction({ document: next, layout, selectedId: connection.source });
  }, [document, layout, onTransaction]);

  const persistPositions = useCallback((_event: unknown, node: Node) => {
    if (node.id.startsWith('region:')) return;
    onTransaction({ document, layout: { ...layout, positions: { ...layout.positions, [node.id]: node.position } }, selectedId: node.id });
  }, [document, layout, onTransaction]);

  const autoLayout = useCallback(async () => {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges) adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]);
    const entries = [...new Set([document.entry, ...(document.entries || [])].filter(Boolean))];
    const levels = new Map<string, number>();
    const pending: Array<[string, number]> = entries.map((id) => [id, 0]);
    while (pending.length) {
      const [id, level] = pending.shift()!;
      if (levels.has(id) && levels.get(id)! <= level) continue;
      levels.set(id, level);
      for (const next of adjacency.get(id) || []) pending.push([next, level + 1]);
    }
    for (const id of Object.keys(document.nodes)) if (!levels.has(id)) levels.set(id, Math.max(0, levels.size));
    const buckets = new Map<number, string[]>();
    for (const [id, level] of levels) buckets.set(level, [...(buckets.get(level) || []), id]);
    const positions = { ...layout.positions };
    for (const [level, ids] of buckets) ids.sort().forEach((id, index) => { positions[id] = { x: 80 + level * 430, y: 90 + index * 250 }; });
    onTransaction({ document, layout: { ...layout, positions }, selectedId });
  }, [document, edges, layout, onTransaction, selectedId]);

  const addNode = () => {
    const next = structuredClone(document);
    let n = Object.keys(next.nodes).length + 1;
    let id = `node-${n}`; while (next.nodes[id]) id = `node-${++n}`;
    next.nodes[id] = { id, type: 'dialogue', speaker: '', lines: [{ id: `${id}.line.1`, who: 'direction', text: 'New line.' }] };
    next.regions[0]?.nodeIds.push(id);
    onTransaction({ document: next, layout: { ...layout, positions: { ...layout.positions, [id]: { x: 120, y: 120 } } }, selectedId: id });
  };

  const removeNode = () => {
    if (!selectedId || selectedId === document.entry) return;
    const next = structuredClone(document); delete next.nodes[selectedId];
    for (const node of Object.values(next.nodes)) {
      if (node.goto === selectedId) delete node.goto;
      for (const choice of node.choices || []) if (choice.goto === selectedId) delete choice.goto;
    }
    for (const region of next.regions) region.nodeIds = region.nodeIds.filter((id) => id !== selectedId);
    const positions = { ...layout.positions }; delete positions[selectedId];
    onTransaction({ document: next, layout: { ...layout, positions }, selectedId: document.entry });
  };

  const endings = Object.values(document.nodes).filter((node) => node.type === 'ending');
  return <div className="graph-shell">
    <div className="canvas-toolbar">
      <button onClick={addNode}>＋ Node</button><button onClick={removeNode} disabled={!selectedId || selectedId === document.entry}>Delete</button>
      <button onClick={autoLayout}>Auto-layout</button>
      <label>Trace ending <select value={traceEnding || ''} onChange={(event) => setTraceEnding(event.target.value || null)}><option value="">Off</option>{endings.map((node) => <option key={node.id} value={node.id}>{node.id}</option>)}</select></label>
    </div>
    <ReactFlow
      nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeDragStop={persistPositions}
      onConnect={connect} onNodeClick={(_event: React.MouseEvent, node: Node) => !node.id.startsWith('region:') && onSelect(node.id)}
      onNodeDoubleClick={(_event: React.MouseEvent, node: Node) => !node.id.startsWith('region:') && onEdit(node.id)}
      onPaneClick={() => onSelect(null)} fitView minZoom={.15} maxZoom={1.7} nodesDraggable snapToGrid snapGrid={[12, 12]}
      defaultEdgeOptions={{ type: 'smoothstep' }} colorMode="dark"
    >
      <Background color="var(--cs-vfd-silkscreen)" gap={24} size={1} /><Controls /><MiniMap pannable zoomable nodeColor={(node) => node.id.startsWith('region:') ? 'var(--cs-glass-soft)' : (node.data as any)?.story?.type === 'ending' ? 'var(--cs-vfd-marker)' : 'var(--cs-vfd-phosphor)'} />
    </ReactFlow>
  </div>;
}

export function StoryGraph(props: Parameters<typeof StoryGraphInner>[0]) {
  return <ReactFlowProvider><StoryGraphInner {...props} /></ReactFlowProvider>;
}
