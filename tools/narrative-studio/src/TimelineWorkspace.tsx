import type { DocumentEnvelope, ProjectManifest, TimelineEntry } from './types';

export function TimelineWorkspace({ project, documents, selectedDocumentId, onSelect }: {
  project: ProjectManifest;
  documents: DocumentEnvelope[];
  selectedDocumentId: string;
  onSelect: (id: string) => void;
}) {
  const byId = new Map(documents.map((item) => [item.document.id, item]));
  const entries: TimelineEntry[] = project.timeline || [];
  const placed = new Set(entries.flatMap((entry) => entry.documents || []));
  const unplaced = documents.filter((item) => !placed.has(item.document.id));

  return <div className="timeline-workspace">
    <aside className="timeline-summary">
      <div className="panel-heading"><span>GAME TIMELINE</span><strong>{entries.length} groups</strong></div>
      <div className="timeline-stat"><b>{documents.length}</b><span>documents</span></div>
      <div className="timeline-stat"><b>{project.runtimeEntrypoints?.length || 0}</b><span>runtime entrypoints</span></div>
      <div className="timeline-stat"><b>{unplaced.length}</b><span>unplaced active docs</span></div>
    </aside>
    <main className="timeline-map">
      {entries.map((entry) => <section className={`timeline-group timeline-group--${entry.kind}`} key={entry.id}>
        <header><div><span>{entry.kind}</span><h2>{entry.title}</h2></div><strong>{entry.documents.length}</strong></header>
        <div className="timeline-docs">
          {entry.documents.map((documentId) => {
            const envelope = byId.get(documentId);
            const doc = envelope?.document;
            return <button key={documentId} className={documentId === selectedDocumentId ? 'is-active' : ''} onClick={() => doc && onSelect(documentId)} disabled={!doc}>
              <span>{doc?.title || 'Missing document'}</span>
              <small>{documentId}{doc ? ` · ${Object.keys(doc.nodes || {}).length} nodes` : ' · missing'}</small>
            </button>;
          })}
        </div>
      </section>)}
      {unplaced.length > 0 && <section className="timeline-group timeline-group--warning">
        <header><div><span>needs manifest</span><h2>Unplaced documents</h2></div><strong>{unplaced.length}</strong></header>
        <div className="timeline-docs">{unplaced.map((item) => <button key={item.document.id} onClick={() => onSelect(item.document.id)}>
          <span>{item.document.title}</span><small>{item.document.id}</small>
        </button>)}</div>
      </section>}
    </main>
  </div>;
}
