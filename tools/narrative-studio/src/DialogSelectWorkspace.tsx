import type { DocumentEnvelope, ProjectManifest, TimelineEntry } from './types';
import { projectStudioTimeline } from './timeline-model.js';
import { storyMatchesSearch } from './story-search.js';

export function DialogSelectWorkspace({ project, documents, selectedDocumentId, search, onSearch, onSelect }: {
  project: ProjectManifest; documents: DocumentEnvelope[]; selectedDocumentId: string;
  search: string; onSearch: (query: string) => void; onSelect: (id: string) => void;
}) {
  const byId = new Map(documents.map(item => [item.document.id, item]));
  const entries: TimelineEntry[] = projectStudioTimeline(project, documents);
  const placed = new Set(entries.flatMap(entry => entry.documents || []));
  const remaining = documents.filter(item => !placed.has(item.document.id));
  const groups = [...entries,
    { id: 'other-authored', title: 'Other authored documents', kind: 'collection', documents: remaining.filter(item => !item.fromCode).map(item => item.document.id) },
    { id: 'other-code', title: 'Other source collections', kind: 'collection', documents: remaining.filter(item => item.fromCode).map(item => item.document.id) },
  ];
  const visible = new Set(documents.filter(item => storyMatchesSearch(item, search)).map(item => item.document.id));
  return <div className="timeline-workspace dialog-select-workspace">
    <aside className="timeline-summary">
      <div className="panel-heading"><span>DIALOG SELECT</span><strong>Find the scene. See its structure.</strong></div>
      <input className="search" aria-label="Find dialogue" placeholder="Scene, speaker, or dialogue…" value={search} onChange={event => onSearch(event.target.value)} />
      <div className="timeline-stat"><b>{visible.size}</b><span>{search.trim() ? 'matching documents' : 'documents / source collections'}</span></div>
      <p className="dialog-select-help">Open a card to see its complete graph, then select a beat to edit.</p>
      <p className="dialog-select-help">Authored documents declare their entries. Source collections may contain several conversations; unverified starts and relationships are marked in Story.</p>
    </aside>
    <main className="timeline-map">
      <div className="dialog-select-heading"><span>SELECT → UNDERSTAND → EDIT</span><h1>Scenes & conversations</h1><p>Browse the project groups or search the words themselves.</p></div>
      {groups.map(entry => {
        const ids = entry.documents.filter(id => visible.has(id) || (!search && !byId.has(id)));
        if (!ids.length) return null;
        return <section className={`timeline-group timeline-group--${entry.kind}`} key={entry.id}>
          <header><div><span>{entry.kind === 'sequence' ? 'project group' : entry.kind}</span><h2>{entry.title}</h2></div><strong>{ids.length}</strong></header>
          <div className="timeline-docs">{ids.map(id => {
            const envelope = byId.get(id), doc = envelope?.document;
            const nodes = Object.values(doc?.nodes || {});
            const choices = nodes.reduce((total, node) => total + (node.choices?.length || 0), 0);
            const excerpt = nodes.find(node => node.id === doc?.entry)?.lines?.[0]?.text || nodes.find(node => node.lines.length)?.lines[0]?.text;
            return <button key={id} data-document-id={id} className={id === selectedDocumentId ? 'is-active' : ''} disabled={!doc} onClick={() => onSelect(id)}>
              <small className="dialog-card-kind">{envelope?.fromCode ? doc?.sourceGraph?.scopePrefix ? 'CONVERSATION · CODE' : 'SOURCE COLLECTION' : 'AUTHORED DOCUMENT'}</small>
              <span>{doc?.title || 'Missing document'}</span><p>{excerpt || 'Structural / conditional material'}</p>
              <small>{nodes.length} nodes · {choices} choices <b>Open graph →</b></small><small title={envelope?.module || id}>{envelope?.module || id}</small>
            </button>;
          })}</div>
        </section>;
      })}
      {!visible.size && <div className="empty-state">No dialogue matches “{search}”.</div>}
    </main>
  </div>;
}
