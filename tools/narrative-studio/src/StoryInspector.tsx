import type { AudioProject, NarrativeDocument, StoryNode } from './types';

const field = (label: string, control: React.ReactNode, wide = false) => <label className={wide ? 'field field--wide' : 'field'}><span>{label}</span>{control}</label>;

export function StoryInspector({ document, selectedId, audio, onDocument, onCue, onRename }: {
  document: NarrativeDocument; selectedId: string | null; audio: AudioProject;
  onDocument: (doc: NarrativeDocument) => void; onCue: (cueId: string) => void; onRename?: (id: string) => void;
}) {
  const selected = selectedId ? document.nodes[selectedId] : null;
  const updateDocument = (key: keyof NarrativeDocument, value: unknown) => onDocument({ ...document, [key]: value });
  const updateNode = (change: Partial<StoryNode>) => {
    if (!selectedId) return;
    onDocument({ ...document, nodes: { ...document.nodes, [selectedId]: { ...document.nodes[selectedId], ...change } } });
  };
  const rename = (id: string) => {
    if (!selectedId || !id || id === selectedId || document.nodes[id]) return;
    const next = structuredClone(document);
    next.nodes[id] = { ...next.nodes[selectedId], id }; delete next.nodes[selectedId];
    if (next.entry === selectedId) next.entry = id;
    next.entries = (next.entries || []).map((entry) => entry === selectedId ? id : entry);
    for (const node of Object.values(next.nodes)) {
      if (node.goto === selectedId) node.goto = id;
      for (const choice of node.choices || []) if (choice.goto === selectedId) choice.goto = id;
    }
    for (const region of next.regions) region.nodeIds = region.nodeIds.map((nodeId) => nodeId === selectedId ? id : nodeId);
    onDocument(next); onRename?.(id);
  };

  if (!selected) return <aside className="inspector">
    <div className="panel-heading"><span>PROJECT</span><strong>{document.title}</strong></div>
    {field('Title', <input value={document.title} onChange={(event) => updateDocument('title', event.target.value)} />)}
    {field('Status', <select value={document.status} onChange={(event) => updateDocument('status', event.target.value)}><option>active</option><option>draft</option><option>legacy</option></select>)}
    {field('Entry', <select value={document.entry} onChange={(event) => updateDocument('entry', event.target.value)}>{Object.keys(document.nodes).map((id) => <option key={id}>{id}</option>)}</select>)}
    {field('Notes', <textarea rows={8} value={document.notes || ''} onChange={(event) => updateDocument('notes', event.target.value)} />, true)}
    <div className="panel-section"><div className="section-title"><span>Regions</span><button onClick={() => {
      let index = document.regions.length + 1; let id = `${document.id}.region-${index}`;
      while (document.regions.some((region) => region.id === id)) id = `${document.id}.region-${++index}`;
      updateDocument('regions', [...document.regions, { id, title: 'New region', kind: 'custom', color: '#315d6b', nodeIds: [] }]);
    }}>＋</button></div>{document.regions.map((region, index) => <div className="region-row" key={region.id}>
      <input type="color" value={region.color || '#245c62'} onChange={(event) => { const regions = structuredClone(document.regions); regions[index].color = event.target.value; updateDocument('regions', regions); }} />
      <input value={region.title} onChange={(event) => { const regions = structuredClone(document.regions); regions[index].title = event.target.value; updateDocument('regions', regions); }} />
      <span>{region.nodeIds.length}</span>
    </div>)}</div>
  </aside>;

  return <aside className="inspector">
    <div className="panel-heading"><span>NODE</span><strong>{selectedId}</strong></div>
    <div className="field-grid">
      {field('ID', <input defaultValue={selectedId || ''} onBlur={(event) => rename(event.target.value.trim())} />)}
      {field('Type', <select value={selected.type || 'dialogue'} onChange={(event) => updateNode({ type: event.target.value })}><option>dialogue</option><option>choice</option><option>sequence</option><option>checkpoint</option><option>battle</option><option>ending</option></select>)}
      {field('Speaker', <input value={selected.speaker || ''} onChange={(event) => updateNode({ speaker: event.target.value })} />)}
      {field('Condition', <input value={selected.when || ''} placeholder="flags.example && keys>=3" onChange={(event) => updateNode({ when: event.target.value || undefined })} />)}
      {field('Automatic next', <select value={selected.goto || ''} onChange={(event) => updateNode({ goto: event.target.value || undefined })}><option value="">Terminal / choices</option>{Object.keys(document.nodes).filter((id) => id !== selectedId).map((id) => <option key={id}>{id}</option>)}</select>)}
      {field('Region', <select value={document.regions.find((region) => region.nodeIds.includes(selectedId!))?.id || ''} onChange={(event) => {
        const regions = structuredClone(document.regions);
        for (const region of regions) region.nodeIds = region.nodeIds.filter((id) => id !== selectedId);
        regions.find((region) => region.id === event.target.value)?.nodeIds.push(selectedId!);
        onDocument({ ...document, regions });
      }}><option value="">Unassigned</option>{document.regions.map((region) => <option key={region.id} value={region.id}>{region.title}</option>)}</select>)}
    </div>

    <div className="panel-section">
      <div className="section-title"><span>Lines</span><button onClick={() => updateNode({ lines: [...selected.lines, { id: `${selectedId}.line.${selected.lines.length + 1}`, who: 'direction', text: 'New line.' }] })}>＋</button></div>
      {selected.lines.map((line, index) => <div className="line-card" key={line.id}>
        <div className="line-card__head"><input value={line.who || ''} placeholder="speaker" onChange={(event) => { const lines = structuredClone(selected.lines); lines[index].who = event.target.value; updateNode({ lines }); }} />
          <button onClick={() => updateNode({ lines: selected.lines.filter((_, i) => i !== index) })}>×</button></div>
        <textarea rows={4} value={line.text || ''} onChange={(event) => { const lines = structuredClone(selected.lines); lines[index].text = event.target.value; updateNode({ lines }); }} />
        <div className="line-meta"><input value={line.when || ''} placeholder="condition" onChange={(event) => { const lines = structuredClone(selected.lines); lines[index].when = event.target.value || undefined; updateNode({ lines }); }} />
          <select value={line.cues?.[0] || ''} onChange={(event) => { const lines = structuredClone(selected.lines); lines[index].cues = event.target.value ? [event.target.value] : []; updateNode({ lines }); }}><option value="">No cue</option>{audio.cues.map((cue) => <option key={cue.id}>{cue.id}</option>)}</select>
          {line.cues?.[0] && <button onClick={() => onCue(line.cues![0])}>Open cue</button>}</div>
      </div>)}
    </div>

    <div className="panel-section">
      <div className="section-title"><span>Choices</span><button onClick={() => updateNode({ choices: [...(selected.choices || []), { id: `${selectedId}.choice.${(selected.choices || []).length + 1}`, text: 'New choice' }] })}>＋</button></div>
      {(selected.choices || []).map((choice, index) => <div className="choice-card" key={choice.id}>
        <input value={choice.text} onChange={(event) => { const choices = structuredClone(selected.choices || []); choices[index].text = event.target.value; updateNode({ choices }); }} />
        <select value={choice.goto || ''} onChange={(event) => { const choices = structuredClone(selected.choices || []); choices[index].goto = event.target.value || undefined; updateNode({ choices }); }}><option value="">Terminal</option>{Object.keys(document.nodes).map((id) => <option key={id}>{id}</option>)}</select>
        <input value={choice.when || ''} placeholder="condition" onChange={(event) => { const choices = structuredClone(selected.choices || []); choices[index].when = event.target.value || undefined; updateNode({ choices }); }} />
        <button onClick={() => updateNode({ choices: (selected.choices || []).filter((_, i) => i !== index) })}>×</button>
      </div>)}
    </div>
  </aside>;
}
