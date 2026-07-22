import type { AudioProject, MediaProject, NarrativeDocument, StoryChoice, StoryLayout, StoryLine, StoryNode, StoryTransaction } from './types';
import { renameStoryNode } from './story-transforms.js';

const field = (label: string, control: React.ReactNode, wide = false) => <label className={wide ? 'field field--wide' : 'field'}><span>{label}</span>{control}</label>;

export function StoryInspector({ document, layout, selectedId, audio, media, onTransaction, onCue }: {
  document: NarrativeDocument; layout: StoryLayout; selectedId: string | null; audio: AudioProject; media?: MediaProject;
  onTransaction: (transaction: StoryTransaction) => void; onCue: (cueId: string) => void;
}) {
  const selected = selectedId ? document.nodes[selectedId] : null;
  const transactDocument = (nextDocument: NarrativeDocument, nextSelectedId = selectedId) => onTransaction({ document: nextDocument, layout, selectedId: nextSelectedId });
  const updateDocument = (key: keyof NarrativeDocument, value: unknown) => transactDocument({ ...document, [key]: value });
  const updateNode = (change: Partial<StoryNode>) => {
    if (!selectedId) return;
    transactDocument({ ...document, nodes: { ...document.nodes, [selectedId]: { ...document.nodes[selectedId], ...change } } });
  };
  const rename = (id: string) => {
    if (!selectedId) return;
    onTransaction(renameStoryNode(document, layout, selectedId, id));
  };
  const storyArt = media?.storyArt || [];
  const cueList = audio.cues.map((cue) => cue.id);
  const toggleCue = (cues: string[] = [], cueId: string) => cues.includes(cueId) ? cues.filter((id) => id !== cueId) : [...cues, cueId];
  const reorder = <T,>(items: T[], index: number, delta: number) => {
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };
  const updateChoiceMutation = (choice: StoryChoice, kind: 'set' | 'clear', value: string) => ({
    ...choice,
    mutations: { ...(choice.mutations || {}), [kind]: value.split('\n').map((item) => item.trim()).filter(Boolean) },
  });
  const updateLine = (index: number, change: Partial<StoryLine>) => {
    const lines = structuredClone(selected?.lines || []);
    lines[index] = { ...lines[index], ...change };
    updateNode({ lines });
  };
  const updateChoice = (index: number, change: Partial<StoryChoice>) => {
    const choices = structuredClone(selected?.choices || []);
    choices[index] = { ...choices[index], ...change };
    updateNode({ choices });
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
      updateDocument('regions', [...document.regions, { id, title: 'New region', kind: 'custom', color: '#F2A81E', nodeIds: [] }]);
    }}>＋</button></div>{document.regions.map((region, index) => <div className="region-row" key={region.id}>
      <input type="color" value={region.color || '#F2A81E'} onChange={(event) => { const regions = structuredClone(document.regions); regions[index].color = event.target.value; updateDocument('regions', regions); }} />
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
        transactDocument({ ...document, regions });
      }}><option value="">Unassigned</option>{document.regions.map((region) => <option key={region.id} value={region.id}>{region.title}</option>)}</select>)}
    </div>

    <div className="panel-section">
      <div className="section-title"><span>Lines</span><button onClick={() => updateNode({ lines: [...selected.lines, { id: `${selectedId}.line.${selected.lines.length + 1}`, who: 'direction', text: 'New line.' }] })}>＋</button></div>
      {selected.lines.map((line, index) => <div className="line-card" key={line.id}>
        <div className="line-card__head"><input value={line.who || ''} placeholder="speaker" onChange={(event) => { const lines = structuredClone(selected.lines); lines[index].who = event.target.value; updateNode({ lines }); }} />
          <button disabled={index === 0} onClick={() => updateNode({ lines: reorder(selected.lines, index, -1) })}>↑</button>
          <button disabled={index === selected.lines.length - 1} onClick={() => updateNode({ lines: reorder(selected.lines, index, 1) })}>↓</button>
          <button onClick={() => updateNode({ lines: selected.lines.filter((_, i) => i !== index) })}>×</button></div>
        <textarea rows={4} value={line.text || ''} onChange={(event) => { const lines = structuredClone(selected.lines); lines[index].text = event.target.value; updateNode({ lines }); }} />
        <div className="line-meta"><input value={line.when || ''} placeholder="condition" onChange={(event) => { const lines = structuredClone(selected.lines); lines[index].when = event.target.value || undefined; updateNode({ lines }); }} />
          <select value={(line.art as any)?.id || (line.artId as string) || ''} onChange={(event) => updateLine(index, { art: event.target.value ? { id: event.target.value } : undefined, artId: undefined })}><option value="">No art</option>{storyArt.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select>
          <select value="" onChange={(event) => event.target.value && updateLine(index, { cues: toggleCue(line.cues, event.target.value) })}><option value="">Toggle cue</option>{cueList.map((cueId) => <option key={cueId}>{cueId}</option>)}</select>
          {line.cues?.[0] && <button onClick={() => onCue(line.cues![0])}>Open cue</button>}</div>
        <div className="line-meta line-meta--wide">
          <input value={String(line.channel || '')} placeholder="channel" onChange={(event) => updateLine(index, { channel: event.target.value || undefined })} />
          <input type="number" step=".05" value={line.hold ?? ''} placeholder="hold" onChange={(event) => updateLine(index, { hold: event.target.value === '' ? undefined : Number(event.target.value) })} />
          <input type="number" step=".05" value={line.rate ?? ''} placeholder="rate" onChange={(event) => updateLine(index, { rate: event.target.value === '' ? undefined : Number(event.target.value) })} />
        </div>
        {!!line.cues?.length && <div className="cue-chips">{line.cues.map((cueId) => <button key={cueId} onClick={() => updateLine(index, { cues: (line.cues || []).filter((id) => id !== cueId) })}>{cueId} ×</button>)}</div>}
      </div>)}
    </div>

    <div className="panel-section">
      <div className="section-title"><span>Choices</span><button onClick={() => updateNode({ choices: [...(selected.choices || []), { id: `${selectedId}.choice.${(selected.choices || []).length + 1}`, text: 'New choice' }] })}>＋</button></div>
      {(selected.choices || []).map((choice, index) => <div className="choice-card" key={choice.id}>
        <input value={choice.text} onChange={(event) => { const choices = structuredClone(selected.choices || []); choices[index].text = event.target.value; updateNode({ choices }); }} />
        <div className="choice-actions">
          <button disabled={index === 0} onClick={() => updateNode({ choices: reorder(selected.choices || [], index, -1) })}>↑</button>
          <button disabled={index === (selected.choices || []).length - 1} onClick={() => updateNode({ choices: reorder(selected.choices || [], index, 1) })}>↓</button>
        </div>
        <select value={choice.goto || ''} onChange={(event) => { const choices = structuredClone(selected.choices || []); choices[index].goto = event.target.value || undefined; updateNode({ choices }); }}><option value="">Terminal</option>{Object.keys(document.nodes).map((id) => <option key={id}>{id}</option>)}</select>
        <input value={choice.when || ''} placeholder="condition" onChange={(event) => { const choices = structuredClone(selected.choices || []); choices[index].when = event.target.value || undefined; updateNode({ choices }); }} />
        <textarea rows={2} value={(choice.mutations?.set || []).join('\n')} placeholder="set mutations, one per line" onChange={(event) => updateChoice(index, updateChoiceMutation(choice, 'set', event.target.value))} />
        <textarea rows={2} value={(choice.mutations?.clear || []).join('\n')} placeholder="clear mutations, one per line" onChange={(event) => updateChoice(index, updateChoiceMutation(choice, 'clear', event.target.value))} />
        <button onClick={() => updateNode({ choices: (selected.choices || []).filter((_, i) => i !== index) })}>×</button>
      </div>)}
    </div>
  </aside>;
}
