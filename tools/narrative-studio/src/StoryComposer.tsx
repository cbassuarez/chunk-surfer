import type { AudioProject, MediaProject, NarrativeDocument, StoryChoice, StoryLayout, StoryLine, StoryNode, StoryTransaction } from './types';
import {
  addChoiceWithResponse,
  allocateStoryId,
  attachDetachedAsChoice,
  canMakeLinear,
  createResponseForChoice,
  deleteStoryNode,
  detachedStoryNodeIds,
  incomingStoryReferences,
  makeNodeLinear,
  removeChoicePreservingResponse,
  renameStoryNode,
} from './story-transforms.js';

const field = (label: string, control: React.ReactNode, wide = false) => <label className={wide ? 'field field--wide' : 'field'}><span>{label}</span>{control}</label>;
const cleanList = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
const reorder = <T,>(items: T[], index: number, delta: number) => {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export function StoryComposer({ document, layout, selectedId, audio, media, onTransaction, onSelect, onCue }: {
  document: NarrativeDocument;
  layout: StoryLayout;
  selectedId: string;
  audio: AudioProject;
  media: MediaProject;
  onTransaction: (transaction: StoryTransaction) => void;
  onSelect: (id: string) => void;
  onCue: (cueId: string) => void;
}) {
  const selected = document.nodes[selectedId] || document.nodes[document.entry];
  const activeId = selected?.id || selectedId;
  if (!selected) return <section className="story-composer story-composer--empty"><p>No editable beat is selected.</p></section>;

  const transactDocument = (nextDocument: NarrativeDocument, nextSelectedId = activeId) => onTransaction({ document: nextDocument, layout, selectedId: nextSelectedId });
  const updateNodeById = (nodeId: string, change: Partial<StoryNode>) => {
    const next = structuredClone(document);
    next.nodes[nodeId] = { ...next.nodes[nodeId], ...change };
    transactDocument(next);
  };
  const updateSelected = (change: Partial<StoryNode>) => updateNodeById(activeId, change);
  const updateLine = (nodeId: string, index: number, change: Partial<StoryLine>) => {
    const next = structuredClone(document);
    const lines = structuredClone(next.nodes[nodeId]?.lines || []);
    lines[index] = { ...lines[index], ...change };
    next.nodes[nodeId].lines = lines;
    transactDocument(next);
  };
  const addLine = (nodeId: string) => {
    const next = structuredClone(document);
    const node = next.nodes[nodeId];
    const id = allocateStoryId(next, `${nodeId}.line.${(node.lines || []).length + 1}`);
    node.lines = [...(node.lines || []), { id, who: 'direction', text: '' }];
    transactDocument(next);
  };
  const removeLine = (nodeId: string, index: number) => {
    const next = structuredClone(document);
    next.nodes[nodeId].lines = (next.nodes[nodeId].lines || []).filter((_: StoryLine, itemIndex: number) => itemIndex !== index);
    transactDocument(next);
  };
  const updateChoice = (index: number, change: Partial<StoryChoice>) => {
    const next = structuredClone(document);
    const choices = structuredClone(next.nodes[activeId].choices || []);
    choices[index] = { ...choices[index], ...change };
    next.nodes[activeId].choices = choices;
    transactDocument(next);
  };
  const toggleCue = (cues: string[] = [], cueId: string) => cues.includes(cueId) ? cues.filter((id) => id !== cueId) : [...cues, cueId];
  const cueIds = audio.cues.map((cue) => cue.id);
  const storyArt = media.storyArt || [];
  const choices = selected.choices || [];
  const detachedIds = detachedStoryNodeIds(document);
  const makeLinearReason = choices.length !== 1 ? 'Available when one choice remains'
    : !choices[0].goto ? 'The choice needs a response target'
    : choices[0].when || choices[0].cues?.length || choices[0].exit ? 'Remove the choice condition, cue, or exit before making it linear'
    : '';

  const lineEditor = (nodeId: string, line: StoryLine, index: number, responseLabel = '') => <article className="composer-line" key={line.id} data-line-id={line.id}>
    <div className="composer-line__head">
      <input aria-label={`${responseLabel || 'Beat'} line ${index + 1} speaker`} value={line.who || ''} placeholder="speaker" onChange={(event) => updateLine(nodeId, index, { who: event.target.value })} />
      <span>{line.id}</span>
      <button aria-label={`Move ${responseLabel || 'beat'} line ${index + 1} up`} disabled={index === 0} onClick={() => updateNodeById(nodeId, { lines: reorder(document.nodes[nodeId].lines || [], index, -1) })}>↑</button>
      <button aria-label={`Move ${responseLabel || 'beat'} line ${index + 1} down`} disabled={index === (document.nodes[nodeId].lines || []).length - 1} onClick={() => updateNodeById(nodeId, { lines: reorder(document.nodes[nodeId].lines || [], index, 1) })}>↓</button>
      <button aria-label={`Remove ${responseLabel || 'beat'} line ${index + 1}`} onClick={() => removeLine(nodeId, index)}>×</button>
    </div>
    <textarea aria-label={`${responseLabel || 'Beat'} line ${index + 1} text`} rows={4} value={line.text || ''} placeholder="Write the line…" onChange={(event) => updateLine(nodeId, index, { text: event.target.value })} />
    <details className="composer-details"><summary>Line details</summary>
      <div className="composer-detail-grid">
        {field('Condition', <input value={line.when || ''} placeholder="flags.example && keys>=3" onChange={(event) => updateLine(nodeId, index, { when: event.target.value || undefined })} />, true)}
        {field('Art', <select value={(line.art as { id?: string } | undefined)?.id || (line.artId as string) || ''} onChange={(event) => updateLine(nodeId, index, { art: event.target.value ? { id: event.target.value } : undefined, artId: undefined })}><option value="">No art</option>{storyArt.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select>)}
        {field('Cue', <select value="" onChange={(event) => event.target.value && updateLine(nodeId, index, { cues: toggleCue(line.cues, event.target.value) })}><option value="">Toggle cue</option>{cueIds.map((id) => <option key={id}>{id}</option>)}</select>)}
        {field('Channel', <input value={String(line.channel || '')} onChange={(event) => updateLine(nodeId, index, { channel: event.target.value || undefined })} />)}
        {field('Hold', <input type="number" step=".05" value={line.hold ?? ''} onChange={(event) => updateLine(nodeId, index, { hold: event.target.value === '' ? undefined : Number(event.target.value) })} />)}
        {field('Rate', <input type="number" step=".05" value={line.rate ?? ''} onChange={(event) => updateLine(nodeId, index, { rate: event.target.value === '' ? undefined : Number(event.target.value) })} />)}
      </div>
      {!!line.cues?.length && <div className="cue-chips">{line.cues.map((id) => <button key={id} onClick={() => updateLine(nodeId, index, { cues: (line.cues || []).filter((cueId) => cueId !== id) })}>{id} ×</button>)}</div>}
    </details>
  </article>;

  return <section className="story-composer">
    <header className="composer-header">
      <div><span>BEAT COMPOSER</span><strong>{document.title}</strong></div>
      <label>Beat<select aria-label="Beat" value={activeId} onChange={(event) => onSelect(event.target.value)}>{Object.keys(document.nodes).map((id) => <option key={id} value={id}>{id}</option>)}</select></label>
      <div className="composer-badges"><span>{selected.lines?.length || 0} lines</span><span>{choices.length} choices</span>{activeId === document.entry && <span>entry</span>}</div>
    </header>

    <div className="composer-scroll">
      <div className="composer-structure-bar">
        <button onClick={() => addLine(activeId)}>＋ Line</button>
        <button className="primary" onClick={() => onTransaction(addChoiceWithResponse(document, layout, activeId))}>{choices.length ? '＋ Choice' : 'Turn into choice beat'}</button>
        <button disabled={!canMakeLinear(selected)} title={makeLinearReason} onClick={() => onTransaction(makeNodeLinear(document, layout, activeId))}>Make linear</button>
        <label>Continue to<select aria-label="Continue to" disabled={!!choices.length} value={selected.goto || ''} onChange={(event) => updateSelected({ goto: event.target.value || undefined, ...(event.target.value ? { exit: undefined } : {}) })}><option value="">End here</option>{Object.keys(document.nodes).filter((id) => id !== activeId).map((id) => <option key={id}>{id}</option>)}</select></label>
      </div>

      <section className="composer-section">
        <div className="composer-section__title"><div><span>SETUP</span><strong>Lines</strong></div><button onClick={() => addLine(activeId)}>＋ Line</button></div>
        <div className="composer-stack">{(selected.lines || []).map((line, index) => lineEditor(activeId, line, index))}</div>
        {!selected.lines?.length && <button className="composer-empty-action" onClick={() => addLine(activeId)}>This beat has no text. Add a line.</button>}
      </section>

      <section className="composer-section composer-section--choices">
        <div className="composer-section__title"><div><span>PLAYER AGENCY</span><strong>Choices</strong></div><button onClick={() => onTransaction(addChoiceWithResponse(document, layout, activeId))}>＋ Choice</button></div>
        {!choices.length && <div className="composer-empty-state"><p>This beat currently continues without asking the player.</p><button className="primary" onClick={() => onTransaction(addChoiceWithResponse(document, layout, activeId))}>Turn into choice beat</button></div>}
        <div className="composer-choice-stack">{choices.map((choice, choiceIndex) => {
          const response = choice.goto ? document.nodes[choice.goto] : null;
          const incoming = response ? incomingStoryReferences(document, response.id) : [];
          const shared = incoming.length > 1;
          return <article className="composer-choice" key={choice.id} data-choice-id={choice.id}>
            <div className="composer-choice__head"><span>CHOICE {choiceIndex + 1}</span><code>{choice.id}</code><div>
              <button aria-label={`Move choice ${choiceIndex + 1} up`} disabled={choiceIndex === 0} onClick={() => updateSelected({ choices: reorder(choices, choiceIndex, -1) })}>↑</button>
              <button aria-label={`Move choice ${choiceIndex + 1} down`} disabled={choiceIndex === choices.length - 1} onClick={() => updateSelected({ choices: reorder(choices, choiceIndex, 1) })}>↓</button>
              <button aria-label={`Remove choice ${choiceIndex + 1}`} title="Detach choice; keep its response beat" onClick={() => onTransaction(removeChoicePreservingResponse(document, layout, activeId, choice.id))}>×</button>
            </div></div>
            <label className="choice-label"><span>What the player chooses</span><input aria-label={`Choice ${choiceIndex + 1} label`} value={choice.text} placeholder="Write the choice…" onChange={(event) => updateChoice(choiceIndex, { text: event.target.value })} /></label>
            <label className="choice-destination"><span>Response</span><select aria-label={`Choice ${choiceIndex + 1} destination`} value={choice.goto || ''} onChange={(event) => updateChoice(choiceIndex, { goto: event.target.value || undefined, exit: undefined })}><option value="">Terminal — end here</option>{Object.keys(document.nodes).filter((id) => id !== activeId).map((id) => <option key={id}>{id}</option>)}</select></label>

            {response && response.id !== activeId ? <section className="inline-response">
              <div className="inline-response__head"><div><span>RESPONSE</span><strong>{response.id}</strong></div><div>{shared && <span className="shared-badge">Shared by {incoming.length} paths</span>}<button onClick={() => onSelect(response.id)}>Open as beat</button></div></div>
              <label className="response-speaker"><span>Response heading / speaker</span><input value={response.speaker || ''} onChange={(event) => updateNodeById(response.id, { speaker: event.target.value })} /></label>
              <div className="composer-stack composer-stack--response">{(response.lines || []).map((line, lineIndex) => lineEditor(response.id, line, lineIndex, `Choice ${choiceIndex + 1} response`))}</div>
              <div className="inline-response__footer"><button onClick={() => addLine(response.id)}>＋ Response line</button>
                {response.choices?.length ? <span>This response branches into {response.choices.length} choices. Open it as a beat to edit them.</span>
                  : <label>After response<select aria-label={`Choice ${choiceIndex + 1} response continuation`} value={response.goto || ''} onChange={(event) => updateNodeById(response.id, { goto: event.target.value || undefined })}><option value="">End here</option>{Object.keys(document.nodes).filter((id) => id !== response.id).map((id) => <option key={id}>{id}</option>)}</select></label>}
              </div>
            </section> : <div className="inline-response inline-response--empty"><p>{choice.goto === activeId ? 'This choice returns to the current beat.' : 'This choice ends without a response.'}</p>{choice.goto !== activeId && <button onClick={() => onTransaction(createResponseForChoice(document, layout, activeId, choice.id))}>＋ Create response</button>}</div>}

            <details className="composer-details composer-details--choice"><summary>Choice details</summary>
              <div className="composer-detail-grid">
                {field('Condition', <input value={choice.when || ''} placeholder="flags.example" onChange={(event) => updateChoice(choiceIndex, { when: event.target.value || undefined })} />, true)}
                {field('Toggle cue', <select value="" onChange={(event) => event.target.value && updateChoice(choiceIndex, { cues: toggleCue(choice.cues, event.target.value) })}><option value="">Select cue</option>{cueIds.map((id) => <option key={id}>{id}</option>)}</select>)}
                {choice.cues?.[0] && field('Cue editor', <button onClick={() => onCue(choice.cues![0])}>Open {choice.cues[0]}</button>)}
                {field('Exit event', <input value={choice.exit || ''} placeholder="Optional runtime exit" onChange={(event) => updateChoice(choiceIndex, { exit: event.target.value || undefined, ...(event.target.value ? { goto: undefined } : {}) })} />, true)}
                {field('Set mutations', <textarea rows={3} value={(choice.mutations?.set || []).join('\n')} onChange={(event) => updateChoice(choiceIndex, { mutations: { ...(choice.mutations || {}), set: cleanList(event.target.value) } })} />, true)}
                {field('Clear mutations', <textarea rows={3} value={(choice.mutations?.clear || []).join('\n')} onChange={(event) => updateChoice(choiceIndex, { mutations: { ...(choice.mutations || {}), clear: cleanList(event.target.value) } })} />, true)}
              </div>
              {!!choice.cues?.length && <div className="cue-chips">{choice.cues.map((id) => <button key={id} onClick={() => updateChoice(choiceIndex, { cues: (choice.cues || []).filter((cueId) => cueId !== id) })}>{id} ×</button>)}</div>}
            </details>
          </article>;
        })}</div>
      </section>

      {!!detachedIds.length && <details className="detached-tray"><summary>Detached beats <span>{detachedIds.length}</span></summary><p>These beats are preserved but no entry path reaches them.</p><div>{detachedIds.map((id) => <article key={id}><div><strong>{id}</strong><span>{document.nodes[id].lines?.[0]?.text || 'No text'}</span></div><button onClick={() => onSelect(id)}>Open</button><button disabled={id === activeId} onClick={() => onTransaction(attachDetachedAsChoice(document, layout, activeId, id))}>Attach here</button><button className="warning" disabled={id === document.entry || (document.entries || []).includes(id)} onClick={() => confirm(`Delete detached beat ${id}? This cannot be recovered after saving.`) && onTransaction(deleteStoryNode(document, layout, id))}>Delete</button></article>)}</div></details>}

      <details className="composer-node-details"><summary>Advanced beat details</summary>
        <div className="composer-detail-grid">
          {field('ID', <input defaultValue={activeId} key={activeId} onBlur={(event) => { const nextId = event.target.value.trim(); if (nextId !== activeId) onTransaction(renameStoryNode(document, layout, activeId, nextId)); }} />)}
          {field('Classification', <select value={selected.type || 'dialogue'} onChange={(event) => updateSelected({ type: event.target.value })}><option>dialogue</option><option>choice</option><option>sequence</option><option>checkpoint</option><option>battle</option><option>battle-round</option><option>ending</option></select>)}
          {field('Heading / speaker', <input value={selected.speaker || ''} onChange={(event) => updateSelected({ speaker: event.target.value })} />, true)}
          {field('Condition', <input value={selected.when || ''} onChange={(event) => updateSelected({ when: event.target.value || undefined })} />, true)}
          {field('Art', <select value={(selected.art as { id?: string } | undefined)?.id || String(selected.artId || '')} onChange={(event) => updateSelected({ art: event.target.value ? { id: event.target.value } : undefined, artId: undefined })}><option value="">No art</option>{storyArt.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select>)}
          {field('Toggle cue', <select value="" onChange={(event) => event.target.value && updateSelected({ cues: toggleCue(selected.cues, event.target.value) })}><option value="">Select cue</option>{cueIds.map((id) => <option key={id}>{id}</option>)}</select>)}
          {selected.cues?.[0] && field('Cue editor', <button onClick={() => onCue(selected.cues![0])}>Open {selected.cues[0]}</button>)}
          {field('Region', <select value={document.regions.find((region) => region.nodeIds.includes(activeId))?.id || ''} onChange={(event) => {
            const next = structuredClone(document);
            for (const region of next.regions) region.nodeIds = region.nodeIds.filter((id) => id !== activeId);
            next.regions.find((region) => region.id === event.target.value)?.nodeIds.push(activeId);
            transactDocument(next);
          }}><option value="">Unassigned</option>{document.regions.map((region) => <option key={region.id} value={region.id}>{region.title}</option>)}</select>)}
          {field('Automatic continuation', <select disabled={!!choices.length} value={selected.goto || ''} onChange={(event) => updateSelected({ goto: event.target.value || undefined, ...(event.target.value ? { exit: undefined } : {}) })}><option value="">End here</option>{Object.keys(document.nodes).filter((id) => id !== activeId).map((id) => <option key={id}>{id}</option>)}</select>)}
          {field('Exit event', <input value={selected.exit || ''} placeholder="Optional runtime exit" onChange={(event) => updateSelected({ exit: event.target.value || undefined, ...(event.target.value ? { goto: undefined } : {}) })} />, true)}
          {field('Set mutations', <textarea rows={3} value={(selected.mutations?.set || []).join('\n')} onChange={(event) => updateSelected({ mutations: { ...(selected.mutations || {}), set: cleanList(event.target.value) } })} />, true)}
          {field('Clear mutations', <textarea rows={3} value={(selected.mutations?.clear || []).join('\n')} onChange={(event) => updateSelected({ mutations: { ...(selected.mutations || {}), clear: cleanList(event.target.value) } })} />, true)}
        </div>
        {!!selected.cues?.length && <div className="cue-chips">{selected.cues.map((id) => <button key={id} onClick={() => updateSelected({ cues: (selected.cues || []).filter((cueId) => cueId !== id) })}>{id} ×</button>)}</div>}
      </details>
    </div>
  </section>;
}
