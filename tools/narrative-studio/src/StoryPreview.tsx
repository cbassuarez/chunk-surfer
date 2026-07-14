import { useEffect, useMemo, useRef, useState } from 'react';
import { createNarrativeExecutor } from '../../../src/narrative/executor.js';
import type { NarrativeDocument } from './types';

export function StoryPreview({ document, onCue }: { document: NarrativeDocument; onCue: (cueId: string) => void }) {
  const [contextText, setContextText] = useState('{\n  "flags": {},\n  "named": false,\n  "steps": 0\n}');
  const executor = useRef<any>(null);
  const [view, setView] = useState<any>(null);
  const [error, setError] = useState('');
  const seenEvents = useRef(0);

  const reset = () => {
    try {
      const context = JSON.parse(contextText);
      executor.current = createNarrativeExecutor(document as any, context);
      seenEvents.current = 0; setView(executor.current.view()); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  useEffect(reset, [document.id]);
  useEffect(() => {
    if (!view) return;
    const next = view.events.slice(seenEvents.current);
    seenEvents.current = view.events.length;
    for (const event of next) if (event.type === 'cue') onCue(event.cueId);
  }, [view, onCue]);

  const advance = () => setView(executor.current?.advance());
  const choose = (id: string) => setView(executor.current?.choose(id));
  const recent = useMemo(() => (view?.events || []).slice(-8).reverse(), [view]);

  return <section className="preview-panel">
    <div className="panel-heading"><span>REAL RUNTIME PREVIEW</span><strong>{document.title}</strong></div>
    <div className="preview-columns">
      <div className="preview-stage">
        <div className="preview-speaker">{view?.node?.speaker || view?.line?.who || 'DIRECTION'}</div>
        <div className="preview-copy">{view?.line?.text || (view?.finished ? 'END OF BRANCH' : view?.choices?.length ? 'Choose a response.' : 'Ready.')}</div>
        <div className="preview-choices">{(view?.choices || []).map((choice: any) => <button key={choice.id} onClick={() => choose(choice.id)}>{choice.text}</button>)}</div>
        {!view?.finished && !(view?.choices || []).length && <button className="primary" onClick={advance}>Advance</button>}
        <button onClick={reset}>Reset</button>
      </div>
      <div className="preview-context">
        <label>Story context<textarea rows={7} value={contextText} onChange={(event) => setContextText(event.target.value)} /></label>
        {error && <div className="error-box">{error}</div>}
        <div className="event-log">{recent.map((event: any, index: number) => <div key={`${event.type}-${index}`}><b>{event.type}</b> {event.cueId || event.choiceId || event.lineId || event.nodeId || ''}</div>)}</div>
      </div>
    </div>
  </section>;
}
