import { useEffect, useRef, useState } from 'react';
import { createConversationProbe } from './conversation-probe.js';
import type { NarrativeDocument } from './types';

export function StoryPreview({ document, selectedId, fromCode = false, onCue, onPosition }: { document: NarrativeDocument; selectedId?: string | null; fromCode?: boolean; onCue: (cueId: string) => void; onPosition?: (nodeId: string) => void }) {
  const [contextText, setContextText] = useState('{\n  "flags": {}\n}');
  const [startAt, setStartAt] = useState(document.sourceGraph?.entryIds[0] || document.entry);
  const probe = useRef<ReturnType<typeof createConversationProbe> | null>(null);
  const [view, setView] = useState<any>(null), [error, setError] = useState('');
  const seenEvents = useRef(0);
  const reset = () => {
    try {
      const context = JSON.parse(contextText);
      probe.current?.stop();
      probe.current = createConversationProbe(document, context, document.nodes[startAt] ? startAt : document.entry, fromCode);
      seenEvents.current = 0; setView(probe.current.view()); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(() => { reset(); return () => probe.current?.stop(); }, [document]);
  useEffect(() => {
    if (!view) return;
    const next = view.events.slice(seenEvents.current);
    seenEvents.current = view.events.length;
    for (const event of next) if (event.type === 'cue') onCue(event.cueId);
  }, [view, onCue]);
  const run = (action: () => any) => { try { const next = action(); setView(next); if (next?.nodeId) onPosition?.(next.nodeId); setError(''); } catch (reason) { setError(String(reason)); } };
  return <section className="preview-panel" aria-label="Conversation probe">
    <div className="panel-heading"><span>CONVERSATION PROBE · PRODUCTION CURSOR</span><strong>{document.title} / {view?.nodeId}</strong></div>
    <p className="scene-reading-key">Speech permission, line order, visibility, revisits and spent answers use the game conversation machine. Choice flag callbacks are supplied here. World actions, beat effects, custom checks and caller exits are logged boundaries; verify them in game.</p>
    <div className="preview-columns">
      <div className="preview-stage">
        <div className="preview-speaker">{view?.who || 'DIRECTION'} · {view?.pending?.kind === 'say' ? 'PERMISSION TO SPEAK' : view?.pending?.kind === 'branch' ? 'QUESTION BANK' : 'LINE'}</div>
        <div className="preview-copy">{view?.finished ? 'END OF BRANCH · CONTROL RETURNS TO CALLER' : view?.line?.text || 'No spoken line'}</div>
        <div className="preview-choices">{(view?.pending?.options || []).map((choice: any, index: number) => <button key={`${choice.sourceId || index}`} disabled={choice.disabled === true} onClick={() => run(() => probe.current?.choose(index))}>{choice.text}</button>)}</div>
        {view?.pending?.kind === 'branch' && !view.pending.options.length && <p role="alert">This question bank has no available answers under the supplied flags. The runtime remains here.</p>}
        {!view?.finished && !view?.pending && <button className="primary" onClick={() => run(() => probe.current?.advance())}>Advance line</button>}
        <label>Start beat<select aria-label="Probe start beat" value={startAt} onChange={event => setStartAt(event.target.value)}>{Object.keys(document.nodes).map(id => <option key={id}>{id}</option>)}</select></label>
        {selectedId && <button onClick={() => setStartAt(selectedId)}>Use selected beat</button>}
        <button onClick={reset}>Reset with context</button>
        <pre className="probe-flags" aria-label="Probe flags">{JSON.stringify(view?.context?.flags || {}, null, 2)}</pre>
      </div>
      <div className="preview-context">
        <label>Initial story context<textarea aria-label="Probe context" rows={5} value={contextText} onChange={event => setContextText(event.target.value)} /></label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <div className="event-log" aria-label="Execution trace">{(view?.events || []).slice(-24).reverse().map((event: any, index: number) => <div key={index}><b>{event.type}</b> {event.text || event.choiceId || event.lineId || event.nodeId || event.cueId || ''}{event.goto ? ` → ${event.goto}` : ''}</div>)}</div>
      </div>
    </div>
  </section>;
}
