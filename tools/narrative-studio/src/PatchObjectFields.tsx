import { useEffect, useRef, useState } from 'react';
import { validateConditionExpression } from '../../../src/narrative/conditions.js';
import type { NarrativeDocument } from './types';
import { patchValue } from './patch-commands.js';

type ObjectRef = { kind: string; nodeId: string; id: string; collection?: string; graphId: string };
export function DraftField({ label, value = '', multiline = false, condition = false, onCommit }: { label: string; value?: string; multiline?: boolean; condition?: boolean; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value), [error, setError] = useState('');
  const cancelled = useRef(false);
  useEffect(() => { setDraft(value); setError(''); }, [value]);
  const commit = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    const problem = condition ? validateConditionExpression(draft).join('; ') : '';
    setError(problem); if (!problem && draft !== value) onCommit(draft);
  };
  const props = { 'aria-label': label, 'aria-invalid': !!error, value: draft, className: 'nodrag nowheel', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value), onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.currentTarget.blur(); return; }
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; setDraft(value); setError(''); event.currentTarget.blur(); }
      if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.blur(); }
    } };
  return <label className="patch-field"><span>{label}</span>{multiline ? <textarea {...props} rows={3} /> : <input {...props} />}{error && <small role="alert">{error}</small>}</label>;
}

export function PatchObjectFields({ document, object, onFields }: { document: NarrativeDocument; object: ObjectRef; onFields: (fields: Record<string, unknown>) => void }) {
  const value = patchValue(document, object) as any;
  if (!value) return null;
  const list = (text: string) => text.split(/\n/).map(item => item.trim()).filter(Boolean);
  return <div className="patch-object-fields nodrag nowheel">
    <small className="patch-identity" title={object.id}>{object.kind.toUpperCase()} · {object.id}</small>
    {object.kind === 'beat' ? <DraftField label="Beat heading" value={value.speaker || ''} onCommit={speaker => onFields({ speaker })} /> : <>
      {object.kind === 'line' && <DraftField label="Speaker" value={value.who || ''} onCommit={who => onFields({ who })} />}
      <DraftField label={object.kind === 'choice' ? 'Choice text' : 'Line text'} multiline value={value.text || ''} onCommit={text => onFields({ text })} />
    </>}
    <DraftField label={object.kind === 'choice' ? 'Available when' : object.kind === 'line' ? 'Visible when' : 'Condition · caller owned'} condition value={value.when || ''} onCommit={when => onFields({ when: when || undefined })} />
    {object.kind === 'line' && value.who === 'me' && <>
      <label className="patch-check"><input type="checkbox" checked={value.say !== false} onChange={event => onFields({ say: event.target.checked ? undefined : false })} />Ask permission to speak</label>
      <DraftField label="Speech picker prompt" value={value.prompt || ''} onCommit={prompt => onFields({ prompt: prompt || undefined })} />
    </>}
    {object.kind === 'choice' && <>
      <label className="patch-check"><input type="checkbox" checked={!!value.hideWhenAsked} onChange={event => onFields({ hideWhenAsked: event.target.checked || undefined })} />Hide after asking</label>
      <label className="patch-check"><input type="checkbox" checked={!!value.disabled} onChange={event => onFields({ disabled: event.target.checked || undefined })} />Visible but disabled</label>
    </>}
    <details><summary>Effects, cues and source</summary>
      <p>{object.kind === 'choice' ? 'Choice callback runs before the destination jump.' : object.kind === 'line' ? 'Line callback and cue fire once when uttered, after any speech permission.' : 'Beat conditions and effects depend on the game caller.'}</p>
      {object.kind !== 'line' && <>
        <DraftField label="Set flags · one per line" multiline value={(value.mutations?.set || []).join('\n')} onCommit={text => onFields({ mutations: { ...value.mutations, set: list(text) } })} />
        <DraftField label="Clear flags · one per line" multiline value={(value.mutations?.clear || []).join('\n')} onCommit={text => onFields({ mutations: { ...value.mutations, clear: list(text) } })} />
      </>}
      <DraftField label="Cue IDs · one per line" multiline value={(value.cues || []).join('\n')} onCommit={text => onFields({ cues: list(text) })} />
      {object.kind === 'line' && <DraftField label="Minimum hold · seconds" value={value.hold == null ? '' : String(value.hold)} onCommit={text => onFields({ hold: text === '' ? undefined : Math.max(0, Number(text) || 0) })} />}
      <code>{String(value.source || value.sourceId || 'Authored in this document')}</code>
      {value.check && <p>Caller-owned check: {JSON.stringify(value.check)}. Edit in the full form / source.</p>}
    </details>
  </div>;
}
