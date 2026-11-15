import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, ReactFlowProvider,
  useNodesInitialized, useNodesState, useReactFlow, useUpdateNodeInternals,
} from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps, Viewport } from '@xyflow/react';
import type { NarrativeDocument, StoryChoice, StoryLayout, StoryNode, StoryTransaction } from './types';
import { buildSceneGraph, choiceGraphId, exitGraphId, layoutSceneGraph, sceneScopes } from './scene-graph.js';
import { CaseButton } from './FieldCaseChrome';
import { PatchCable, PatchPort, CABLE_COLORS } from './PatchCable';
import { patchStoryConnection, reconnectStoryConnection, unplugStoryConnections } from './graph-patching.js';
import { lineGraphId, patchObject, patchValue, removalInfo, runPatchCommand } from './patch-commands.js';
import { PatchObjectFields } from './PatchObjectFields';
import { BeatPatch } from './BeatPatch';

export type GraphViewMemory = { viewport?: Viewport; scope?: string; mode?: 'flow' | 'saved'; detailId?: string; details?: Record<string, { viewport?: Viewport; collection?: string; selected?: string }> };
type GraphNodeData = {
  story: StoryNode; label: string; entry: boolean; detached: boolean; join: boolean; returning: boolean;
  fromCode: boolean; knownScope: boolean; highlighted: boolean; searchHit: boolean; region: string;
  onEdit: (id: string, choiceId?: string) => void;
  onPatch: (id: string) => void;
};
const condition = (item: { when?: string; [key: string]: unknown }) => item.when || String(item.if || '');
const StoryNodeCard = memo(({ id, data, selected }: NodeProps<Node<GraphNodeData>>) => {
  const story = data.story;
  const updateNodeInternals = useUpdateNodeInternals();
  const signature = `${story.goto || story.targetName || ''}|${(story.choices || []).map(choice => choice.id).join('|')}`;
  useLayoutEffect(() => { updateNodeInternals(id); }, [id, signature, updateNodeInternals]);
  const lines = story.lines || [];
  return <div className={`story-node story-node--${story.type} ${selected ? 'is-selected' : ''} ${data.highlighted ? 'is-path' : ''} ${data.searchHit ? 'is-search' : ''} ${data.detached ? 'is-detached' : ''}`} data-story-node={id}>
    <PatchPort id="in" type="target" position={Position.Left} disabled={data.fromCode} title="Dialogue input: continue or return here" />
    <div className="story-node__eyebrow">{data.entry ? 'START · ' : ''}{data.join ? 'JOIN · ' : ''}{data.returning ? 'RETURN POINT · ' : ''}{data.detached ? 'DISCONNECTED · ' : ''}{id.endsWith('.revisitLines') ? 'RETURN PROSE' : story.type}</div>
    <div className="story-node__title">{story.speaker || id}</div>
    <div className="story-node__identity" title={String(story.source || id)}>{story.speaker ? id : data.region || String(story.source || '')}</div>
    {condition(story) && <div className="story-node__condition" title={condition(story)}>IF {condition(story)}</div>}
    <div className="story-node__copy nodrag nowheel" tabIndex={0} aria-label={`Dialogue in ${id}`}>
      {lines.length ? lines.map(line => <p key={line.id}><b>{line.who || 'direction'}</b>{condition(line) && <small>IF {condition(line)}</small>}<span>{line.text || String(line.direction || 'Empty line')}</span></p>) : <p><span>No spoken lines · structural beat</span></p>}
      {!!story.revisitLines?.length && <div className="story-node__revisit"><b>ON RETURN</b>{story.revisitLines.map(line => <p key={line.id}><b>{line.who || 'direction'}</b>{condition(line) && <small>IF {condition(line)}</small>}<span>{line.text}</span></p>)}</div>}
    </div>
    <div className="story-node__ports">
      <div className="patch-outlet patch-outlet--choices">Choices · {story.choices?.length || 0}<PatchPort id="choices" type="source" position={Position.Right} kind="ownership" disabled={data.fromCode} title="Choice ownership: connect to a choice's owner input" /></div>
      <div className="patch-outlet">Continue / return<PatchPort id="goto" type="source" position={Position.Right} disabled={data.fromCode || !!story.choices?.length} title="Continuation: connect to a dialogue input or end terminal" /></div>
      <div className="patch-outlet">Exit<PatchPort id="exit" type="source" position={Position.Right} kind="exit" disabled={data.fromCode || !!story.choices?.length} title="Exit: connect to an exit terminal" /></div>
    </div>
    <Handle id="revisit" type="source" position={Position.Bottom} isConnectable={false} className="story-node__variant-handle" />
    <div className="story-node__footer"><span>{lines.length} lines{story.revisitLines?.length ? ` + ${story.revisitLines.length} on return` : ''}{!story.goto && !story.targetName && !story.choices?.length ? data.fromCode && !data.knownScope ? ' · continuation unverified' : ' · END' : ''}</span><button className="nodrag" onClick={event => { event.stopPropagation(); data.fromCode ? data.onEdit(id) : data.onPatch(id); }}>{data.fromCode ? 'Edit words' : 'Patch lines'}</button></div>
  </div>;
});
type ChoiceData = { ownerId: string; choice: StoryChoice; index: number; fromCode: boolean; onEdit: (id: string, choiceId?: string) => void };
const ChoiceCard = memo(({ id, data, selected }: NodeProps<Node<ChoiceData>>) => <div className={`patch-choice ${selected ? 'is-selected' : ''}`} data-choice-node={id}>
  <div className="patch-choice__heading">CHOICE {data.index + 1}<small title={data.ownerId}>of {data.ownerId}</small></div>
  <PatchPort id="owner" type="target" position={Position.Left} kind="ownership" disabled={data.fromCode} title="Owner input: connect a dialogue beat's CHOICES outlet" />
  <div className="patch-choice__text nodrag nowheel" tabIndex={0}>{data.choice.text || 'Empty choice label'}</div>
  <div className="patch-choice__condition" title={condition(data.choice)}>{condition(data.choice) ? `IF ${condition(data.choice)}` : data.choice.hideWhenAsked ? 'Hidden after asking' : 'Always available'}</div>
  <div className="patch-outlet patch-choice__route">Response / return / end<PatchPort id="route" type="source" position={Position.Right} disabled={data.fromCode} title="Choice route: connect to any dialogue input or exit terminal" /></div>
  {!!data.choice.check && <div className="patch-outlet">Caller check · failure<PatchPort id="fail" type="source" position={Position.Right} disabled={data.fromCode} title="Caller check failure: connect to a dialogue input; execution depends on game caller" /></div>}
  <button className="nodrag" onClick={event => { event.stopPropagation(); data.onEdit(data.ownerId, data.choice.id); }}>Edit choice</button>
</div>);
const BoundaryCard = memo(({ data }: NodeProps<Node<{ label: string; kind: string; event: string; fromCode: boolean }>>) => <div className={`graph-boundary graph-boundary--${data.kind}`}>
  <PatchPort id="in" type="target" position={Position.Left} kind={data.kind} disabled={data.kind !== 'exit' || data.fromCode} title={data.kind === 'exit' ? 'Exit input: patch a dialogue or choice output here' : 'Unresolved target; repair this route at its source'} /><span>{data.kind === 'unresolved' ? 'RELATIONSHIP UNRESOLVED' : 'EXIT TERMINAL'}</span><strong>{data.label}</strong>
</div>);
const GroupLabel = memo(({ data }: NodeProps<Node<{ label: string }>>) => <div className="graph-group-label">{data.label}</div>);
const nodeTypes = { story: StoryNodeCard, choice: ChoiceCard, boundary: BoundaryCard, group: GroupLabel };
const edgeTypes = { patch: PatchCable };

function upstream(links: Array<{ source: string; target: string }>, target: string) {
  const found = new Set<string>(target ? [target] : []), pending = [...found];
  while (pending.length) {
    const id = pending.pop();
    for (const edge of links) if (edge.target === id && !found.has(edge.source)) { found.add(edge.source); pending.push(edge.source); }
  }
  return found;
}

type Props = {
  document: NarrativeDocument; layout: StoryLayout; selectedId: string | null; search: string;
  wordsOnly?: boolean; visible: boolean; memory: GraphViewMemory; inspectorOpen: boolean;
  onToggleInspector: () => void; onSelect: (id: string | null) => void; onEdit: (id: string, choiceId?: string) => void;
  onTransaction: (transaction: StoryTransaction) => void;
};
function StoryGraphInner({ document, layout, selectedId, search, wordsOnly = false, visible, memory, inspectorOpen, onToggleInspector, onSelect, onEdit, onTransaction, onPatch }: Props & { onPatch: (id: string) => void }) {
  const scopes = useMemo(() => sceneScopes(document, wordsOnly), [document, wordsOnly]);
  const [scopeId, setScopeId] = useState(memory.scope || scopes[0].id);
  const scope = scopes.find(item => item.id === scopeId) || scopes[0];
  const [mode, setMode] = useState<'flow' | 'saved'>(memory.mode || 'flow');
  const [traceEnding, setTraceEnding] = useState('');
  const [selectedPatchId, setSelectedPatchId] = useState<string | null>(null);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [exitName, setExitName] = useState('');
  const [dockOpen, setDockOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [multi, setMulti] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; position: { x: number; y: number }; connection?: Connection; edgeId?: string } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const connectionProblem = useRef('');
  const reconnecting = useRef<string | null>(null);
  const selections = useRef(new WeakMap<NarrativeDocument, string>());
  const [patchStatus, setPatchStatus] = useState('Drag an outlet to a compatible input. Drag a cable end to rewire it.');
  const graph = useMemo(() => buildSceneGraph(document, { fromCode: wordsOnly, nodeIds: scope.nodeIds, splitChoices: true, exits: layout.exits }), [document, wordsOnly, scope, layout.exits]);
  useEffect(() => {
    const saved = selections.current.get(document);
    const savedChoice = graph.choices.find(item => item.id === saved);
    if (saved && saved !== selectedPatchId && (saved === selectedId || savedChoice?.ownerId === selectedId)) { setSelectedPatchId(saved); return; }
    if (!selectedPatchId) return;
    const choice = graph.choices.find(item => item.id === selectedPatchId);
    if (choice ? choice.ownerId !== selectedId : document.nodes[selectedPatchId] ? selectedPatchId !== selectedId : !graph.boundaries.some(item => item.id === selectedPatchId)) setSelectedPatchId(null);
  }, [selectedId, selectedPatchId, graph, document.nodes]);
  const path = useMemo(() => upstream(graph.links, traceEnding), [graph, traceEnding]);
  const positions = useMemo(() => layoutSceneGraph(graph, document), [graph, document]);
  const shownPositions = useMemo(() => mode === 'flow' ? positions : { ...positions, ...layout.positions }, [mode, positions, layout.positions]);
  const knownScope = !!document.sourceGraph?.scopePrefix;
  const initialNodes = useMemo<Node[]>(() => [
    ...graph.nodeIds.map(id => ({
      id, type: 'story', position: shownPositions[id], selected: multi.includes(id) || (selectedPatchId || selectedId) === id, deletable: false,
      data: { story: document.nodes[id], label: id, ...graph.facts[id], fromCode: wordsOnly, knownScope,
        highlighted: path.has(id), searchHit: !!search.trim() && JSON.stringify(document.nodes[id]).toLowerCase().includes(search.trim().toLowerCase()),
        region: document.regions.find(region => region.nodeIds.includes(id))?.title || '', onEdit, onPatch },
    })),
    ...graph.choices.map(item => ({ id: item.id, type: 'choice', position: shownPositions[item.id], selected: multi.includes(item.id) || selectedPatchId === item.id, deletable: false, data: { ...item, fromCode: wordsOnly, onEdit } })),
    ...graph.boundaries.map(item => ({ id: item.id, type: 'boundary', position: shownPositions[item.id], data: { ...item, fromCode: wordsOnly }, deletable: false })),
    ...(mode === 'flow' ? graph.components.map((ids, index) => ({
      id: `group:${index}`, type: 'group', position: { x: Math.min(...ids.map(id => positions[id].x)), y: Math.min(...ids.map(id => positions[id].y)) - 44 },
      data: { label: ids.some(id => graph.entries.has(id)) ? ids.length === 1 ? 'INDEPENDENT ENTRY' : `ENTRY ROUTE${graph.components.length > 1 ? ` · GROUP ${index + 1}` : ''} → PROGRESSION` : ids.every(id => id.startsWith('terminal:')) ? 'EXIT PATCH POINTS' : wordsOnly ? 'SOURCE MATERIAL · START UNVERIFIED' : 'NO PATH FROM A DECLARED ENTRY' }, draggable: false, selectable: false,
    })) : []),
  ], [graph, document, shownPositions, selectedId, wordsOnly, knownScope, path, search, onEdit, onPatch, mode, positions, selectedPatchId, multi]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  const flow = useReactFlow();
  const initialized = useNodesInitialized();
  const fitted = useRef(false);
  useEffect(() => {
    if (!visible || !initialized || fitted.current) return;
    fitted.current = true;
    if (memory.viewport) flow.setViewport(memory.viewport);
    else if (search.trim() && selectedId) flow.fitView({ nodes: [{ id: selectedId }], maxZoom: .9, padding: .25 });
    else flow.fitView({ padding: .12, minZoom: .015, maxZoom: .85 });
  }, [visible, initialized, memory, flow, search, selectedId]);
  // Selecting a searched beat or a node in the composer should bring that beat
  // into view on return, while an unchanged selection preserves the viewport.
  const previousSelection = useRef(selectedId), wasVisible = useRef(visible);
  useEffect(() => {
    if (!visible) { wasVisible.current = false; return; }
    if (!initialized) return;
    if (!wasVisible.current && previousSelection.current !== selectedId && selectedId && graph.nodeIds.includes(selectedId)) flow.fitView({ nodes: [{ id: selectedId }], maxZoom: .9, padding: .3, duration: 180 });
    wasVisible.current = true; previousSelection.current = selectedId;
  }, [visible, initialized, selectedId, flow, graph.nodeIds]);
  const edges = useMemo<Edge[]>(() => graph.links.map(link => ({
    id: link.id, type: 'patch', source: link.source, target: link.target, sourceHandle: link.handle, targetHandle: link.targetHandle || 'in', data: { kind: link.kind, conditional: !!link.when }, selected: selectedCableId === link.id, deletable: !wordsOnly && link.handle !== 'fail' && !['ownership', 'revisit'].includes(link.kind), reconnectable: wordsOnly || link.kind === 'revisit' ? false : link.kind === 'ownership' ? 'source' : link.handle === 'fail' ? 'target' : true,
    label: link.kind === 'return' ? `↶ Return · ${link.label.slice(0, 48)}` : link.kind === 'revisit' ? link.label : link.handle === 'route' ? link.kind === 'exit' ? 'End / exit' : link.kind === 'unresolved' ? 'Unresolved' : 'Response' : link.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: CABLE_COLORS[link.kind] || CABLE_COLORS.next },
    className: `scene-edge scene-edge--${link.kind} ${link.when ? 'scene-edge--conditional' : ''} ${traceEnding && path.has(link.source) && path.has(link.target) ? 'path-edge' : ''} ${selectedId === link.source || selectedId === link.target ? 'is-related' : ''}`,
    zIndex: selectedId === link.source || selectedId === link.target ? 2 : 0,
  })), [graph, path, traceEnding, selectedId, selectedCableId, wordsOnly]);

  const connect = (connection: Connection, oldEdgeId?: string) => {
    if (wordsOnly) return;
    const geometry = { ...layout, positions: { ...layout.positions, ...currentPositions() } };
    const result = oldEdgeId ? reconnectStoryConnection(document, geometry, oldEdgeId, connection) : patchStoryConnection(document, geometry, connection);
    setPatchStatus(result.problem || 'Patched. The conversation now follows this connection.');
    if (result.changed) {
      setMode('saved'); memory.mode = 'saved';
      selections.current.set(document, selectedPatchId || selectedId || '');
      const choice = graph.choices.find(item => item.id === connection.target);
      selections.current.set(result.document, connection.sourceHandle === 'choices' && choice && connection.source ? choiceGraphId(connection.source, choice.choice.id) : connection.source || result.selectedId || '');
      onTransaction(result);
      if (connection.sourceHandle === 'choices') { const choice = graph.choices.find(item => item.id === connection.target); if (choice && connection.source) setSelectedPatchId(choiceGraphId(connection.source, choice.choice.id)); }
    }
  };
  const unplug = (ids: string[]) => {
    if (wordsOnly) return;
    const result = unplugStoryConnections(document, { ...layout, positions: { ...layout.positions, ...currentPositions() } }, ids);
    selections.current.set(document, selectedPatchId || selectedId || ''); selections.current.set(result.document, selectedPatchId || selectedId || '');
    onTransaction(result);
    setMode('saved'); memory.mode = 'saved';
    setSelectedCableId(null); setPatchStatus('Cable unplugged. That route now ends here.');
  };
  const currentPositions = () => Object.fromEntries(flow.getNodes().filter(node => node.type !== 'group').map(node => [node.id, node.position]));
  const command = (input: any) => {
    if (wordsOnly) { setPatchStatus('Structure is authored in the named source module. Open the form to edit literal words.'); return; }
    const result: any = runPatchCommand(document, { ...layout, positions: { ...layout.positions, ...currentPositions() } }, input);
    setPatchStatus(result.problem || result.message || 'Updated.');
    if (!result.changed) return;
    selections.current.set(document, selectedPatchId || selectedId || '');
    selections.current.set(result.document, result.patchId?.startsWith('line:') ? result.selectedId || '' : result.patchId || result.selectedId || '');
    setMode('saved'); memory.mode = 'saved'; setMulti([]); setSelectedPatchId(result.patchId || result.selectedId || null); setSelectedCableId(null);
    onTransaction(result); setDockOpen(true);
  };
  const persistPositions = (_event: unknown, node: Node) => {
    if (node.type === 'group') return;
    setMode('saved'); memory.mode = 'saved';
    onTransaction({ document, layout: { ...layout, positions: { ...layout.positions, ...currentPositions(), [node.id]: node.position } }, selectedId: graph.choices.find(item => item.id === node.id)?.ownerId || (document.nodes[node.id] ? node.id : selectedId) });
  };
  const arrange = () => {
    const sizes = Object.fromEntries(flow.getNodes().map(node => [node.id, node.measured || {}]));
    const arranged = layoutSceneGraph(graph, document, sizes);
    setMode('saved'); memory.mode = 'saved';
    onTransaction({ document, layout: { ...layout, positions: { ...layout.positions, ...Object.fromEntries(Object.entries(arranged)) } }, selectedId });
    requestAnimationFrame(() => flow.fitView({ padding: .12, minZoom: .015, maxZoom: .85 }));
  };
  const selectedChoice = graph.choices.find(item => item.id === selectedPatchId);
  const activePatchId = selectedPatchId || selectedId;
  const activeObject = patchObject(document, activePatchId);
  const activeValue = activeObject && patchValue(document, activeObject);
  const removeInfo = removalInfo(document, activeObject);
  const selectedLink = graph.links.find(item => item.id === selectedCableId);
  const linkObject = selectedLink && patchObject(document, selectedLink.source);
  const routeObject = selectedLink ? linkObject : activeObject;
  const routeValue = routeObject && patchValue(document, routeObject);
  const routeConnection = routeObject && { source: routeObject.graphId, sourceHandle: selectedLink?.handle === 'fail' ? 'fail' : routeObject.kind === 'choice' ? 'route' : 'goto', target: '', targetHandle: 'in' };
  const openCreate = () => { const bounds = canvasRef.current?.getBoundingClientRect(); if (!bounds) return; const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2; setMenu({ x, y, position: flow.screenToFlowPosition({ x, y }) }); };
  const selectedObjects = () => { const ids = flow.getNodes().filter(node => node.selected && patchObject(document, node.id)).map(node => node.id); return ids.length ? ids : activePatchId ? [activePatchId] : []; };
  const askRemove = () => { setRemoveIds(selectedObjects()); setRemoveOpen(true); };
  const addExit = () => {
    const event = exitName.trim(); if (!event) return;
    const id = exitGraphId(event);
    const nextLayout = { ...layout, exits: { ...layout.exits, [id]: { event } }, positions: { ...layout.positions, ...currentPositions(), ...(menu ? { [id]: menu.position } : {}) } };
    if (menu?.connection) {
      const result = patchStoryConnection(document, nextLayout, { ...menu.connection, target: id, targetHandle: 'in' });
      if (!result.changed) { setPatchStatus(result.problem); return; }
      onTransaction(result);
    } else onTransaction({ document, layout: nextLayout });
    setMode('saved'); memory.mode = 'saved'; setExitName(''); setMenu(null);
  };
  const endings = graph.nodeIds.filter(id => document.nodes[id].type === 'ending' || (!document.nodes[id].goto && !document.nodes[id].choices?.length));
  return <div className="graph-shell" aria-label="Scene timeline" tabIndex={0} onKeyDown={event => {
    if (event.key === 'Escape') { setMenu(null); setRemoveOpen(false); setSelectedCableId(null); setMulti([]); return; }
    if ((event.target as HTMLElement).closest('input,textarea,select,button')) return;
    if (wordsOnly) return;
    const focusedEdge = (event.target as HTMLElement).closest('.react-flow__edge')?.getAttribute('data-id');
    const focusedNode = (event.target as HTMLElement).closest('.react-flow__node')?.getAttribute('data-id');
    if (event.key === 'Enter' && focusedEdge) { event.preventDefault(); setSelectedCableId(focusedEdge); setDockOpen(true); return; }
    if (event.key === 'Enter' && focusedNode && document.nodes[focusedNode]) { event.preventDefault(); onPatch(focusedNode); return; }
    if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); openCreate(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); command({ type: 'duplicate', patchIds: selectedObjects() }); }
    if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); if (selectedLink && selectedLink.handle !== 'fail' && !['ownership', 'revisit'].includes(selectedLink.kind)) unplug([selectedLink.id]); else if (!selectedLink && activeObject) askRemove(); }
    if (event.key === 'Enter' && activeObject?.kind === 'beat') { event.preventDefault(); onPatch(activeObject.nodeId); }
  }}>
    <div className="scene-heading"><div><span>SCENE TIMELINE</span><strong>{document.title}</strong><small>{graph.nodeIds.length} / {Object.keys(document.nodes).length} beats · {graph.choices.length} choice nodes · {graph.links.length} cables{graph.unresolved ? ` · ${graph.unresolved} unresolved` : ''}</small></div>
      <div className="scene-heading__actions"><CaseButton onClick={() => flow.fitView({ padding: .12, minZoom: .015, maxZoom: .85 })}>Fit scene</CaseButton><CaseButton disabled={!activePatchId} onClick={() => activePatchId && flow.fitView({ nodes: [{ id: activePatchId }], maxZoom: 1, padding: .35, duration: 180 })}>Focus selected</CaseButton><CaseButton disabled={wordsOnly || !selectedId} title={wordsOnly ? 'Source module owns this structure; use Edit words' : 'Open individual line objects and their sequence'} onClick={() => selectedId && onPatch(selectedId)}>Patch beat</CaseButton><CaseButton className={inspectorOpen ? 'is-active' : ''} onClick={onToggleInspector}>Full inspector</CaseButton><CaseButton disabled={!selectedId} onClick={() => selectedId && onEdit(selectedChoice?.ownerId || selectedId, selectedChoice?.choice.id)}>Edit form</CaseButton></div>
    </div>
    <div className="scene-tools">
      <label>Scope <select aria-label="Graph scope" value={scope.id} onChange={event => { setScopeId(event.target.value); memory.scope = event.target.value; memory.viewport = undefined; fitted.current = false; }}>{scopes.map(item => <option key={item.id} value={item.id}>{item.title} · {item.nodeIds.length}</option>)}</select></label>
      <label>Layout <select aria-label="Graph layout" value={mode} onChange={event => { const next = event.target.value as 'flow' | 'saved'; setMode(next); memory.mode = next; }}><option value="flow">Progression</option><option value="saved">Saved positions</option></select></label>
      <CaseButton onClick={arrange}>Save flow layout</CaseButton>
      {!wordsOnly && <><CaseButton onClick={openCreate}>＋ Object</CaseButton><CaseButton className={dockOpen ? 'is-active' : ''} onClick={() => setDockOpen(open => !open)}>Patch selection</CaseButton></>}
      <label>Trace <select aria-label="Trace ending" value={traceEnding} onChange={event => setTraceEnding(event.target.value)}><option value="">Off</option>{endings.map(id => <option key={id} value={id}>{id}</option>)}</select></label>
    </div>
    <div className="scene-reading-key patch-legend"><span style={{ color: CABLE_COLORS.ownership }}>● Owns choice</span><span style={{ color: CABLE_COLORS.next }}>● Continue / response</span><span style={{ color: CABLE_COLORS.return }}>● Return</span><span style={{ color: CABLE_COLORS.exit }}>● Exit</span><span style={{ color: CABLE_COLORS.unresolved }}>● Unresolved</span><span role="status">{wordsOnly ? knownScope ? 'Source node table · structure in code; move nodes and edit words here.' : 'Source collection · scene boundaries / unmarked starts unverified; structure in code.' : patchStatus}</span></div>
    <div className={`scene-canvas-row ${dockOpen ? 'has-patch-dock' : ''}`} ref={canvasRef}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeDragStop={persistPositions}
      onConnect={connection => connect(connection)} onReconnect={(old, connection) => connect(connection, old.id)} onReconnectStart={(_event, edge) => { reconnecting.current = edge.id; }} onReconnectEnd={(_event, _edge, _type, state) => { if (!state.isValid) setPatchStatus(connectionProblem.current || 'Reconnection cancelled; the original cable is retained.'); reconnecting.current = null; }} reconnectRadius={16} isValidConnection={connection => { const result = reconnecting.current ? reconnectStoryConnection(document, layout, reconnecting.current, connection) : patchStoryConnection(document, layout, connection); connectionProblem.current = result.problem; return !wordsOnly && result.changed; }} onEdgesDelete={edges => unplug(edges.map(edge => edge.id))} nodesConnectable={!wordsOnly} onNodeClick={(event, node) => { setSelectedPatchId(node.id); selections.current.set(document, node.id); setSelectedCableId(null); setDockOpen(true); setMulti(event.shiftKey ? current => [...new Set([...current, ...(activePatchId ? [activePatchId] : []), node.id])] : []); const owner = graph.choices.find(item => item.id === node.id)?.ownerId; if (owner || document.nodes[node.id]) onSelect(owner || node.id); }}
      onNodeDoubleClick={(_event, node) => { const choice = graph.choices.find(item => item.id === node.id); if (choice || wordsOnly) { setDockOpen(true); if (wordsOnly) onEdit(choice?.ownerId || node.id, choice?.choice.id); } else if (document.nodes[node.id]) onPatch(node.id); }} onEdgeClick={(_event, edge) => { setSelectedCableId(edge.id); setDockOpen(true); }} onPaneClick={() => { selections.current.delete(document); setSelectedPatchId(null); setSelectedCableId(null); setMulti([]); setMenu(null); }}
      onPaneContextMenu={event => { event.preventDefault(); if (!wordsOnly) setMenu({ x: event.clientX, y: event.clientY, position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) }); }}
      onEdgeContextMenu={(event, edge) => { event.preventDefault(); if (wordsOnly) return; setSelectedCableId(edge.id); setMenu({ x: event.clientX, y: event.clientY, position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }), edgeId: edge.id }); }}
      onConnectStart={() => { connectionProblem.current = ''; setPatchStatus('Patch ownership to an owner input; patch a response / continuation to a dialogue or exit input. Drop on empty canvas to create.'); }}
      onConnectEnd={(event, state) => {
        if (state.isValid || wordsOnly || !state.fromNode) return;
        if (state.toNode) { setPatchStatus(connectionProblem.current || 'Incompatible ports. Ownership and progression are separate connections.'); return; }
        if (state.fromHandle?.type !== 'source') { setPatchStatus('Start contextual creation from an output port.'); return; }
        const point = 'changedTouches' in event ? event.changedTouches[0] : event;
        setMenu({ x: point.clientX, y: point.clientY, position: flow.screenToFlowPosition({ x: point.clientX, y: point.clientY }), connection: { source: state.fromNode.id, sourceHandle: state.fromHandle.id || null, target: '', targetHandle: 'in' } });
      }}
      onMoveEnd={(_event, viewport) => { memory.viewport = viewport; }}
      minZoom={.015} maxZoom={1.7} nodesDraggable snapToGrid snapGrid={[12, 12]} deleteKeyCode={null}
      defaultEdgeOptions={{ type: 'smoothstep' }} colorMode="dark" onlyRenderVisibleElements={false}>
      <Background color="var(--studio-muted)" gap={24} size={1} /><Controls showInteractive={false} /><MiniMap pannable zoomable nodeColor={node => node.type === 'boundary' ? 'var(--studio-danger)' : (node.data as Partial<GraphNodeData>).entry ? 'var(--studio-annotation)' : 'var(--studio-accent)'} />
    </ReactFlow>
    {dockOpen && <aside className="patch-dock" aria-label="Patch selection"><div className="patch-dock-heading"><strong>{selectedLink ? 'CABLE' : 'OBJECT'}</strong><button aria-label="Close patch selection" onClick={() => setDockOpen(false)}>×</button></div>
      {selectedLink && <><p><code>{selectedLink.source}</code> → <code>{selectedLink.target}</code></p><p>{selectedLink.kind === 'ownership' ? 'Ownership only. Move the source end or choose a different owner.' : selectedLink.kind === 'return' ? 'Jump to an earlier beat. Returning to a hub uses its return prose or reopens its question bank.' : 'One route executes after the source. Other incoming routes are independent arrivals.'}</p>{selectedLink.when && <p>IF {selectedLink.when}</p>}
        {!wordsOnly && !['ownership', 'revisit'].includes(selectedLink.kind) && <div className="patch-dock-actions"><button onClick={() => command({ type: 'insert', edgeId: selectedLink.id, position: { x: (shownPositions[selectedLink.source].x + shownPositions[selectedLink.target].x) / 2, y: shownPositions[selectedLink.source].y + 70 } })}>Insert beat in cable</button>{selectedLink.handle !== 'fail' && <button onClick={() => unplug([selectedLink.id])}>Unplug · end route here</button>}</div>}
      </>}
      {wordsOnly ? <p>Structural edits belong to <code>{String(document.nodes[selectedId || '']?.source || 'the source module')}</code>. Use Edit form for writable literal words.</p> : routeObject && <>
        {!selectedLink && <div className="patch-dock-actions"><button onClick={() => command({ type: 'duplicate', patchIds: selectedObjects() })}>Duplicate</button><button onClick={askRemove}>Remove…</button>{routeObject.kind === 'beat' && <button onClick={() => command({ type: 'choice', nodeId: routeObject.nodeId })}>＋ Choice + response</button>}</div>}
        <PatchObjectFields document={document} object={routeObject} onFields={fields => command({ type: 'update', object: routeObject, fields })} />
        {routeObject.kind === 'beat' && document.nodes[routeObject.nodeId].lines.length === 1 && <PatchObjectFields document={document} object={patchObject(document, lineGraphId(routeObject.nodeId, 'lines', document.nodes[routeObject.nodeId].lines[0].id))!} onFields={fields => command({ type: 'update', object: patchObject(document, lineGraphId(routeObject.nodeId, 'lines', document.nodes[routeObject.nodeId].lines[0].id)), fields })} />}
        {routeObject.kind === 'choice' && <label className="patch-field"><span>Choice owner</span><select aria-label="Choice owner" value={routeObject.nodeId} onChange={event => connect({ source: event.target.value, sourceHandle: 'choices', target: routeObject.graphId, targetHandle: 'owner' })}>{Object.keys(document.nodes).map(id => <option key={id}>{id}</option>)}</select></label>}
        {(routeObject.kind === 'choice' || !routeValue?.choices?.length) && routeConnection && <><label className="patch-field"><span>Destination · jump or end</span><select aria-label="Patch destination" value={selectedLink?.handle === 'fail' ? String((routeValue?.check as any)?.fail || '') : routeValue?.goto || exitGraphId(String(routeValue?.exit || ''))} onChange={event => connect({ ...routeConnection, target: event.target.value })}><optgroup label="Dialogue inputs">{Object.keys(document.nodes).map(id => <option key={id}>{id}</option>)}</optgroup>{selectedLink?.handle !== 'fail' && <optgroup label="Exit terminals">{graph.boundaries.filter(item => item.kind === 'exit').map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>}</select></label>{selectedLink?.handle !== 'fail' && <button onClick={() => command({ type: routeValue?.goto || routeValue?.exit ? 'insert' : 'successor', ...(routeValue?.goto || routeValue?.exit ? { edgeId: graph.links.find(link => link.source === routeObject.graphId && link.handle === routeConnection.sourceHandle)?.id } : { connection: routeConnection }) })}>＋ Connected beat</button>}</>}
        {routeObject.kind === 'beat' && <button onClick={() => onPatch(routeObject.nodeId)}>Open line objects</button>}
        {routeObject.kind === 'choice' && routeValue?.goto && <button onClick={() => onPatch(String(routeValue.goto))}>Patch response lines</button>}
      </>}
      {!selectedLink && !routeObject && <p>Select a beat, answer, or cable. Right-click the canvas or press N to create.</p>}
      <p className="patch-shortcuts">N create · Enter patch beat · Shift click multi-select · ⌘/Ctrl D duplicate · Delete remove · Esc cancel</p>
    </aside>}
    {menu && <div className="patch-menu" role="dialog" aria-label="Create patch object" style={{ left: Math.min(menu.x, window.innerWidth - 270), top: Math.min(menu.y, window.innerHeight - 235) }}><strong>{menu.edgeId ? 'Insert in selected cable' : menu.connection ? 'Create from outlet' : 'Create object'}</strong>
      {!['choices', 'exit'].includes(menu.connection?.sourceHandle || '') && <button onClick={() => { command({ type: menu.edgeId ? 'insert' : menu.connection ? 'successor' : 'beat', edgeId: menu.edgeId, connection: menu.connection, position: menu.position }); setMenu(null); }}>＋ Beat with line</button>}
      {(!menu.connection || menu.connection.sourceHandle === 'choices') && !menu.edgeId && <button disabled={!selectedId && !menu.connection?.source} onClick={() => { command({ type: 'choice', nodeId: menu.connection?.source || selectedId }); setMenu(null); }}>＋ Choice with response</button>}
      {!menu.edgeId && menu.connection?.sourceHandle !== 'choices' && <><input aria-label="Create exit event" placeholder="Exit event name" value={exitName} onChange={event => setExitName(event.target.value)} /><button disabled={!exitName.trim()} onClick={addExit}>＋ Exit terminal{menu.connection ? ' and connect' : ''}</button></>}
      <button onClick={() => setMenu(null)}>Cancel</button></div>}
    {removeOpen && activeObject && <div className="patch-menu patch-confirm" role="dialog" aria-label="Remove object"><strong>Remove {removeIds.length > 1 ? `${removeIds.length} selected objects` : activeObject.id}?</strong>{removeIds.length > 1 ? <><p>Incoming routes end. Response beats remain unless selected. This is one undo step.</p><button onClick={() => { command({ type: 'remove-many', patchIds: removeIds }); setRemoveOpen(false); }}>Remove selection</button></> : <><p>{activeObject.kind === 'choice' ? 'Remove this answer. Its response beats stay in the scene.' : `${removeInfo.incoming} incoming routes. Removing this beat also removes its lines, conditions and effects.`}</p>
      {removeInfo.canBypass && <button onClick={() => { command({ type: 'remove', object: activeObject, preserve: true }); setRemoveOpen(false); }}>Remove and join surrounding routes</button>}
      <button onClick={() => { command({ type: 'remove', object: activeObject, preserve: false }); setRemoveOpen(false); }}>{activeObject.kind === 'choice' ? 'Remove choice; keep response' : 'Remove; incoming routes end'}</button></>}<button onClick={() => setRemoveOpen(false)}>Cancel</button></div>}
    </div>
  </div>;
}
export function StoryGraph(props: Props) {
  const [detailId, setDetailId] = useState(props.memory.detailId || '');
  useEffect(() => { if (detailId && !props.document.nodes[detailId]) { setDetailId(''); props.memory.detailId = ''; } }, [detailId, props.document.nodes, props.memory]);
  const open = (id: string) => { if (props.wordsOnly) return; setDetailId(id); props.memory.detailId = id; props.onSelect(id); };
  const back = () => { setDetailId(''); props.memory.detailId = ''; };
  return <div className="story-patch-views"><div className={detailId && props.document.nodes[detailId] ? 'is-hidden' : 'scene-patch-view'}><ReactFlowProvider><StoryGraphInner {...props} visible={props.visible && !detailId} onPatch={open} /></ReactFlowProvider></div>
    {detailId && props.document.nodes[detailId] && <BeatPatch document={props.document} layout={props.layout} nodeId={detailId} memory={(props.memory.details ||= {})[detailId] ||= {}} onBack={back} onTransaction={props.onTransaction} />}
  </div>;
}
