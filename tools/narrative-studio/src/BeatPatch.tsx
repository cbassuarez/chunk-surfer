import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, MiniMap, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow } from '@xyflow/react';
import type { Connection, Edge, Node, NodeProps, Viewport } from '@xyflow/react';
import { CaseButton } from './FieldCaseChrome';
import { PatchCable, PatchPort } from './PatchCable';
import { PatchObjectFields } from './PatchObjectFields';
import { collectionGraphId, connectLineOrder, lineGraphId, patchObject, runPatchCommand } from './patch-commands.js';
import type { NarrativeDocument, StoryLayout, StoryTransaction } from './types';

type Memory = { viewport?: Viewport; collection?: string; selected?: string };
type CardData = { document: NarrativeDocument; object: any; command: (command: any) => void; collection: string; index: number; count: number };
const LineCard = memo(({ data, selected }: NodeProps<Node<CardData>>) => <article className={`patch-line ${selected ? 'is-selected' : ''}`} data-line-object={data.object.id}>
  <header>LINE {data.index + 1} / {data.count} · {data.collection === 'revisitLines' ? 'ON RETURN' : 'FIRST VISIT'}</header>
  <PatchPort id="in" type="target" position={Position.Left} title="Sequence input: place this line after another line" />
  <PatchObjectFields document={data.document} object={data.object} onFields={fields => data.command({ type: 'update', object: data.object, fields })} />
  <footer><button className="nodrag" onClick={() => data.command({ type: 'line', nodeId: data.object.nodeId, collection: data.collection, index: data.index + 1 })}>＋ Line after</button><span>Next line<PatchPort id="next" type="source" position={Position.Right} title="Sequence output: move a line immediately after this one" /></span></footer>
</article>);
const HeadCard = memo(({ data }: NodeProps<Node<{ title: string; note: string }>>) => <article className="patch-collection"><strong>{data.title}</strong><p>{data.note}</p><span>First line<PatchPort id="next" type="source" position={Position.Right} title="Collection head: move a line to the beginning" /></span></article>);
const BankCard = memo(({ data }: NodeProps<Node<{ title: string; note: string }>>) => <article className="patch-collection patch-collection--end"><PatchPort id="in" type="target" position={Position.Left} disabled title="Sequence completion; edit the continuation in the scene" /><strong>{data.title}</strong><p>{data.note}</p></article>);
const types = { line: LineCard, head: HeadCard, bank: BankCard };
const edgeTypes = { patch: PatchCable };

function BeatPatchInner({ document, layout, nodeId, memory, onBack, onTransaction }: { document: NarrativeDocument; layout: StoryLayout; nodeId: string; memory: Memory; onBack: () => void; onTransaction: (transaction: StoryTransaction) => void }) {
  const beat = document.nodes[nodeId], flow = useReactFlow();
  const [collection, setCollection] = useState(memory.collection || 'lines');
  const [selected, setSelected] = useState(memory.selected || '');
  const [selectedEdge, setSelectedEdge] = useState('');
  const [status, setStatus] = useState('Sequence cables edit authored order. Conditions remain on their lines.');
  const [menu, setMenu] = useState<{ x: number; y: number; position: { x: number; y: number }; after?: number } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const selections = useRef(new WeakMap<NarrativeDocument, Record<string, string>>());
  const collectionRows = collection === 'revisitLines' ? beat.revisitLines || [] : beat.lines;
  const object = patchObject(document, selected);
  const positions = useRef<Record<string, { x: number; y: number }>>({});
  useEffect(() => {
    const saved = selections.current.get(document)?.[collection];
    const next = saved ?? (patchObject(document, selected) ? selected : '');
    setSelected(next); memory.selected = next;
  }, [document, collection]);
  const transact = (result: any) => {
    setStatus(result.problem || result.message || 'Order updated.');
    if (!result.changed) return;
    selections.current.set(document, { ...selections.current.get(document), [collection]: selected });
    selections.current.set(result.document, { ...selections.current.get(result.document), [collection]: result.patchId || '' });
    setSelected(result.patchId || ''); memory.selected = result.patchId || '';
    onTransaction(result);
  };
  const command = (input: any) => { capture(); transact(runPatchCommand(document, { ...layout, positions: { ...layout.positions, ...positions.current } }, { nodeId, ...input })); };
  const initial = useMemo<Node[]>(() => {
    const head = collectionGraphId(nodeId, collection);
    return [
      { id: head, type: 'head', position: layout.positions[head] || { x: 20, y: 80 }, data: { title: collection === 'revisitLines' ? 'ON RETURN' : 'FIRST VISIT', note: collection === 'revisitLines' ? 'Use these lines on a return visit. A hub without return prose reopens its question bank; other beats repeat normal lines.' : 'Player-paced sequence. A hidden line is skipped; no alternate branch is created.' }, deletable: false },
      ...collectionRows.map((line, index) => ({ id: lineGraphId(nodeId, collection, line.id), type: 'line', position: layout.positions[lineGraphId(nodeId, collection, line.id)] || { x: 380 + index * 390, y: 80 }, selected: selected === lineGraphId(nodeId, collection, line.id), data: { document, object: { kind: 'line', nodeId, collection, id: line.id, graphId: lineGraphId(nodeId, collection, line.id) }, command, collection, index, count: collectionRows.length }, deletable: false })),
      { id: 'bank', type: 'bank', position: { x: 380 + collectionRows.length * 390, y: 80 }, data: { title: beat.choices?.length ? `${beat.choices.length} ANSWERS` : beat.goto ? `CONTINUE → ${beat.goto}` : 'END / CALLER', note: beat.choices?.length ? 'The question bank follows the visible lines. Return to the scene to patch its individual answers.' : 'Sequence completion reaches the existing continuation. Edit that route in the scene.' }, deletable: false },
    ];
  }, [document, layout, nodeId, collection, selected]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial);
  useEffect(() => setNodes(initial), [initial, setNodes]);
  const edges = useMemo<Edge[]>(() => [...collectionRows.map((line, index) => ({ id: `sequence:${line.id}`, type: 'patch', source: index ? lineGraphId(nodeId, collection, collectionRows[index - 1].id) : collectionGraphId(nodeId, collection), sourceHandle: 'next', target: lineGraphId(nodeId, collection, line.id), targetHandle: 'in', data: { kind: 'sequence' }, label: `${index + 1}`, selected: selectedEdge === `sequence:${line.id}`, deletable: false, reconnectable: true })),
    { id: 'sequence:end', type: 'patch', source: collectionRows.length ? lineGraphId(nodeId, collection, collectionRows[collectionRows.length - 1].id) : collectionGraphId(nodeId, collection), sourceHandle: 'next', target: 'bank', targetHandle: 'in', data: { kind: 'sequence' }, label: 'Then', deletable: false, reconnectable: false },
  ], [collectionRows, nodeId, collection, selectedEdge]);
  const ready = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (ready.current) return;
      ready.current = true;
      if (memory.viewport) flow.setViewport(memory.viewport);
      else flow.fitView({ padding: .16, maxZoom: .8, minZoom: .06 });
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes, memory, flow]);
  const capture = () => { positions.current = Object.fromEntries(flow.getNodes().filter(node => node.id !== 'bank').map(node => [node.id, node.position])); };
  const reorder = (connection: Connection) => { capture(); transact(connectLineOrder(document, { ...layout, positions: { ...layout.positions, ...positions.current } }, connection)); };
  const insert = () => {
    const edge = edges.find(item => item.id === selectedEdge);
    const target = edge && patchObject(document, edge.target);
    const index = target ? collectionRows.findIndex(line => line.id === target.id) : object?.kind === 'line' ? collectionRows.findIndex(line => line.id === object.id) + 1 : collectionRows.length;
    command({ type: 'line', collection, index });
  };
  return <section className="beat-patch" tabIndex={0} aria-label={`Beat patch ${nodeId}`} onKeyDown={event => {
    if (event.key === 'Escape') { setMenu(null); setRemoveOpen(false); setSelectedEdge(''); return; }
    if ((event.target as HTMLElement).closest('input,textarea,select,button')) return;
    if (event.key.toLowerCase() === 'n' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); insert(); }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && object) { event.preventDefault(); command({ type: 'duplicate', object }); }
    if (['Delete', 'Backspace'].includes(event.key) && object) { event.preventDefault(); setRemoveOpen(true); }
  }}>
    <header className="scene-heading"><div><span>BEAT PATCH · {document.title}</span><strong>{nodeId}</strong><small>{collectionRows.length} line objects · one ordered sequence · {beat.choices?.length || 0} answers</small></div><div className="scene-heading__actions"><CaseButton onClick={onBack}>← Scene overview</CaseButton><CaseButton onClick={() => flow.fitView({ padding: .16, maxZoom: .85, minZoom: .06 })}>Fit beat</CaseButton><CaseButton disabled={!selected} onClick={() => flow.fitView({ nodes: [{ id: selected }], maxZoom: .95, padding: .25 })}>Focus object</CaseButton></div></header>
    <div className="scene-tools"><label>Sequence<select aria-label="Beat sequence" value={collection} onChange={event => { setCollection(event.target.value); memory.collection = event.target.value; memory.viewport = undefined; ready.current = false; setSelected(''); setSelectedEdge(''); }}><option value="lines">First visit · {beat.lines.length}</option><option value="revisitLines">On return · {beat.revisitLines?.length || 0}</option></select></label><CaseButton onClick={insert}>{selectedEdge ? 'Insert line in cable' : '＋ Line'}</CaseButton><CaseButton disabled={!object} onClick={() => command({ type: 'duplicate', object })}>Duplicate</CaseButton><CaseButton disabled={!object} onClick={() => setRemoveOpen(true)}>Remove…</CaseButton>
      {object?.kind === 'line' && <><CaseButton onClick={() => { const index = collectionRows.findIndex(line => line.id === object.id); command({ type: 'move-line', object, index: Math.max(0, index - 1) }); }}>↑ Earlier</CaseButton><CaseButton onClick={() => { const index = collectionRows.findIndex(line => line.id === object.id); command({ type: 'move-line', object, index: index + 1 }); }}>↓ Later</CaseButton><CaseButton onClick={() => command({ type: 'move-line', object, collection: collection === 'lines' ? 'revisitLines' : 'lines' })}>Move to {collection === 'lines' ? 'return' : 'first visit'}</CaseButton></>}
    </div>
    <div className="scene-reading-key" role="status">{status} · N create · ⌘/Ctrl D duplicate · Esc cancel · edit text, then blur or ⌘/Ctrl Enter to commit</div>
    <div className="beat-patch-canvas">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={types} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onConnect={reorder} onReconnect={(_old, connection) => reorder(connection)} isValidConnection={connection => connectLineOrder(document, layout, connection).changed}
        onNodeClick={(_event, node) => { setSelected(node.id); memory.selected = node.id; selections.current.set(document, { ...selections.current.get(document), [collection]: node.id }); setSelectedEdge(''); }} onEdgeClick={(_event, edge) => { setSelectedEdge(edge.id); setSelected(''); }} onPaneClick={() => { setSelectedEdge(''); setMenu(null); }}
        onNodeDragStop={() => { capture(); onTransaction({ document, layout: { ...layout, positions: { ...layout.positions, ...positions.current } }, selectedId: nodeId }); }}
        onPaneContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, position: flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }) }); }}
        onConnectEnd={(event, state) => { if (state.isValid || !state.fromNode || state.toNode) return; const source = patchObject(document, state.fromNode.id); const index = source?.kind === 'line' ? collectionRows.findIndex(line => line.id === source.id) + 1 : 0; const point = 'changedTouches' in event ? event.changedTouches[0] : event; setMenu({ x: point.clientX, y: point.clientY, position: flow.screenToFlowPosition({ x: point.clientX, y: point.clientY }), after: index }); }}
        onMoveEnd={(_event, viewport) => { memory.viewport = viewport; }} minZoom={.04} maxZoom={1.3} deleteKeyCode={null} colorMode="dark"><Background gap={24} /><Controls showInteractive={false} /><MiniMap pannable zoomable /></ReactFlow>
      {menu && <div className="patch-menu" style={{ left: Math.min(menu.x, window.innerWidth - 255), top: Math.min(menu.y, window.innerHeight - 150) }} role="dialog" aria-label="Create line"><strong>{menu.after == null ? 'New ordered line' : 'Create connected line'}</strong><button onClick={() => { command({ type: 'line', collection, index: menu.after ?? collectionRows.length, position: menu.position }); setMenu(null); }}>＋ Line {menu.after == null ? 'at end' : 'here'}</button><button onClick={() => setMenu(null)}>Cancel</button></div>}
      {removeOpen && object && <div className="patch-menu patch-confirm" role="dialog" aria-label="Remove line"><strong>Remove {object.id}?</strong><p>The surrounding sequence stays joined. All other lines and their properties are preserved.</p><button onClick={() => { command({ type: 'remove', object }); setRemoveOpen(false); }}>Remove line</button><button onClick={() => setRemoveOpen(false)}>Cancel</button></div>}
    </div>
  </section>;
}
export function BeatPatch(props: Parameters<typeof BeatPatchInner>[0]) { return <ReactFlowProvider><BeatPatchInner {...props} /></ReactFlowProvider>; }
