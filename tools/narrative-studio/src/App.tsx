import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { loadProject, saveDocument, subscribeToChanges } from './api';
import { StoryInspector } from './StoryInspector';
import { StoryPreview } from './StoryPreview';
import type { AudioProject, DocumentEnvelope, MediaProject, NarrativeDocument, ProjectSnapshot, StoryLayout } from './types';
import { reachableNodeIds, validateAudioProject, validateMediaProject, validateNarrativeDocument, validateProjectManifest } from '../../../src/narrative/contracts.js';

const RECOVERY_KEY = 'chunk-surfer.narrative-studio.recovery.v1';
const StoryGraph = lazy(() => import('./StoryGraph').then((module) => ({ default: module.StoryGraph })));
const AudioWorkspace = lazy(() => import('./AudioWorkspace').then((module) => ({ default: module.AudioWorkspace })));
const TimelineWorkspace = lazy(() => import('./TimelineWorkspace').then((module) => ({ default: module.TimelineWorkspace })));
const MediaWorkspace = lazy(() => import('./MediaWorkspace').then((module) => ({ default: module.MediaWorkspace })));
type HistoryFrame = { document: NarrativeDocument; layout: StoryLayout };
type HistoryState = Record<string, { past: HistoryFrame[]; future: HistoryFrame[] }>;
type AudioHistoryState = { past: AudioProject[]; future: AudioProject[] };
type Tab = 'timeline' | 'story' | 'media' | 'audio';

export function App() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>('timeline');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dirtyStories, setDirtyStories] = useState(new Set<string>());
  const [dirtyAudio, setDirtyAudio] = useState(false);
  const [dirtyMedia, setDirtyMedia] = useState(false);
  const [dirtyProject, setDirtyProject] = useState(false);
  const [externalChanges, setExternalChanges] = useState(new Set<string>());
  const [status, setStatus] = useState('Loading project…');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [history, setHistory] = useState<HistoryState>({});
  const [audioHistory, setAudioHistory] = useState<AudioHistoryState>({ past: [], future: [] });
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);

  const reload = useCallback(async () => {
    try {
      const loaded = await loadProject();
      setSnapshot(loaded);
      setSelectedDocumentId((current) => current && loaded.documents.some((item) => item.document.id === current) ? current : loaded.documents[0]?.document.id || '');
      setSelectedCueId((current) => current || loaded.audio.document.cues[0]?.id || null);
      setSelectedMediaId((current) => current || loaded.media.document.storyArt[0]?.id || null);
      setDirtyStories(new Set()); setDirtyAudio(false); setDirtyMedia(false); setDirtyProject(false); setExternalChanges(new Set());
      setHistory({}); setAudioHistory({ past: [], future: [] });
      setRecoveryAvailable(!!localStorage.getItem(RECOVERY_KEY));
      setStatus(`${loaded.documents.length} story documents · ${loaded.audio.document.assets.length} audio assets`);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => subscribeToChanges((event) => {
    setExternalChanges((current) => new Set(current).add(event.path));
  }), []);

  const envelope = snapshot?.documents.find((item) => item.document.id === selectedDocumentId) || null;
  const document = envelope?.document || null;
  const audio = snapshot?.audio.document || null;
  const media = snapshot?.media.document || null;
  const storyValidation = useMemo(() => document ? validateNarrativeDocument(document) : { ok: true, errors: [] }, [document]);
  const audioValidation = useMemo(() => audio ? validateAudioProject(audio) : { ok: true, errors: [] }, [audio]);
  const mediaValidation = useMemo(() => media ? validateMediaProject(media) : { ok: true, errors: [] }, [media]);
  const projectValidation = useMemo(() => snapshot ? validateProjectManifest(snapshot.project, { documents: snapshot.documents.map((item) => item.document), documentIds: snapshot.documents.map((item) => item.document.id) }) : { ok: true, errors: [] }, [snapshot]);
  const unreachable = useMemo(() => document ? Object.keys(document.nodes).filter((id) => !reachableNodeIds(document).has(id)) : [], [document]);

  const updateEnvelope = (change: Partial<DocumentEnvelope>, dirty = true) => {
    if (!snapshot || !envelope) return;
    if (dirty) setHistory((current) => {
      const item = current[envelope.document.id] || { past: [], future: [] };
      return { ...current, [envelope.document.id]: { past: [...item.past.slice(-99), { document: envelope.document, layout: envelope.layout }], future: [] } };
    });
    setSnapshot({ ...snapshot, documents: snapshot.documents.map((item) => item.document.id === envelope.document.id ? { ...item, ...change } : item) });
    if (dirty) setDirtyStories((current) => new Set(current).add(envelope.document.id));
  };
  const updateDocument = (next: NarrativeDocument) => updateEnvelope({ document: next });
  const updateLayout = (next: StoryLayout) => updateEnvelope({ layout: next });
  const updateAudio = (next: AudioProject) => {
    if (!snapshot) return;
    setAudioHistory((current) => ({ past: [...current.past.slice(-99), snapshot.audio.document], future: [] }));
    setSnapshot({ ...snapshot, audio: { ...snapshot.audio, document: next } }); setDirtyAudio(true);
  };
  const updateMedia = (next: MediaProject) => { if (snapshot) { setSnapshot({ ...snapshot, media: { ...snapshot.media, document: next } }); setDirtyMedia(true); } };

  const restoreFrame = (direction: 'undo' | 'redo') => {
    if (!snapshot || !envelope) return;
    const item = history[envelope.document.id] || { past: [], future: [] };
    const source = direction === 'undo' ? item.past : item.future;
    if (!source.length) return;
    const frame = source[source.length - 1];
    const current = { document: envelope.document, layout: envelope.layout };
    setSnapshot({ ...snapshot, documents: snapshot.documents.map((entry) => entry.document.id === envelope.document.id ? { ...entry, ...frame } : entry) });
    setHistory({ ...history, [envelope.document.id]: direction === 'undo'
      ? { past: item.past.slice(0, -1), future: [...item.future, current] }
      : { past: [...item.past, current], future: item.future.slice(0, -1) } });
    setDirtyStories((value) => new Set(value).add(envelope.document.id));
  };

  const restoreAudioFrame = (direction: 'undo' | 'redo') => {
    if (!snapshot) return;
    const source = direction === 'undo' ? audioHistory.past : audioHistory.future;
    if (!source.length) return;
    const frame = source[source.length - 1];
    const current = snapshot.audio.document;
    setSnapshot({ ...snapshot, audio: { ...snapshot.audio, document: frame } });
    setAudioHistory(direction === 'undo'
      ? { past: audioHistory.past.slice(0, -1), future: [...audioHistory.future, current] }
      : { past: [...audioHistory.past, current], future: audioHistory.future.slice(0, -1) });
    setDirtyAudio(true);
  };

  const saveStory = useCallback(async () => {
    if (!snapshot || !envelope) return;
    setStatus(`Saving ${envelope.document.title}…`);
    try {
      const story = await saveDocument(envelope.path, envelope.revision, envelope.document);
      const layout = await saveDocument(envelope.layoutPath, envelope.layoutRevision, envelope.layout);
      setSnapshot({ ...snapshot, documents: snapshot.documents.map((item) => item.document.id === envelope.document.id ? { ...item, revision: story.revision, layoutRevision: layout.revision } : item) });
      setDirtyStories((current) => { const next = new Set(current); next.delete(envelope.document.id); return next; });
      setExternalChanges((current) => { const next = new Set(current); next.delete(envelope.path); next.delete(envelope.layoutPath); return next; });
      setStatus(`Saved ${envelope.document.title}`);
    } catch (error) { setStatus(`Save blocked: ${error instanceof Error ? error.message : String(error)}`); }
  }, [snapshot, envelope]);

  const saveAudio = useCallback(async () => {
    if (!snapshot) return;
    setStatus('Saving audio project…');
    try {
      const saved = await saveDocument(snapshot.audio.path, snapshot.audio.revision, snapshot.audio.document);
      setSnapshot({ ...snapshot, audio: { ...snapshot.audio, revision: saved.revision } }); setDirtyAudio(false); setStatus('Saved audio project');
    } catch (error) { setStatus(`Save blocked: ${error instanceof Error ? error.message : String(error)}`); }
  }, [snapshot]);

  const saveMedia = useCallback(async () => {
    if (!snapshot) return;
    setStatus('Saving media project…');
    try {
      const saved = await saveDocument(snapshot.media.path, snapshot.media.revision, snapshot.media.document);
      setSnapshot({ ...snapshot, media: { ...snapshot.media, revision: saved.revision } }); setDirtyMedia(false); setStatus('Saved media project');
    } catch (error) { setStatus(`Save blocked: ${error instanceof Error ? error.message : String(error)}`); }
  }, [snapshot]);

  const saveProject = useCallback(async () => {
    if (!snapshot) return;
    setStatus('Saving project manifest…');
    try {
      const saved = await saveDocument('project.json', snapshot.projectRevision, snapshot.project);
      setSnapshot({ ...snapshot, projectRevision: saved.revision }); setDirtyProject(false); setStatus('Saved project manifest');
    } catch (error) { setStatus(`Save blocked: ${error instanceof Error ? error.message : String(error)}`); }
  }, [snapshot]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (tab === 'story') saveStory();
        else if (tab === 'audio') saveAudio();
        else if (tab === 'media') saveMedia();
        else saveProject();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') { event.preventDefault(); setPreviewOpen((open) => !open); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        if (tab === 'story') { event.preventDefault(); restoreFrame(event.shiftKey ? 'redo' : 'undo'); }
        if (tab === 'audio') { event.preventDefault(); restoreAudioFrame(event.shiftKey ? 'redo' : 'undo'); }
      }
    };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [tab, saveStory, saveAudio, saveMedia, saveProject, history, audioHistory, snapshot, envelope]);

  useEffect(() => {
    if (!snapshot || (!dirtyStories.size && !dirtyAudio && !dirtyMedia && !dirtyProject)) { localStorage.removeItem(RECOVERY_KEY); return; }
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ at: Date.now(), stories: snapshot.documents.filter((item) => dirtyStories.has(item.document.id)), audio: dirtyAudio ? snapshot.audio : null, media: dirtyMedia ? snapshot.media : null, project: dirtyProject ? snapshot.project : null }));
  }, [snapshot, dirtyStories, dirtyAudio, dirtyMedia, dirtyProject]);

  const restoreRecovery = () => {
    if (!snapshot) return;
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return;
    const recovery = JSON.parse(raw);
    const recoveredStories = new Map((recovery.stories || []).map((item: DocumentEnvelope) => [item.document.id, item]));
    setSnapshot({
      ...snapshot,
      project: recovery.project || snapshot.project,
      documents: snapshot.documents.map((item) => recoveredStories.get(item.document.id) as DocumentEnvelope || item),
      audio: recovery.audio || snapshot.audio,
      media: recovery.media || snapshot.media,
    });
    setDirtyStories(new Set((recovery.stories || []).map((item: DocumentEnvelope) => item.document.id)));
    setDirtyAudio(!!recovery.audio); setDirtyMedia(!!recovery.media); setDirtyProject(!!recovery.project);
    setRecoveryAvailable(false);
    setStatus('Recovered unsaved local Studio changes');
  };

  const openCue = (cueId: string, switchTab = false) => { setSelectedCueId(cueId); if (switchTab) setTab('audio'); };
  const visibleDocuments = useMemo(() => (snapshot?.documents || []).filter((item) => `${item.document.title} ${item.document.id} ${(item.document.tags || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [snapshot?.documents, search]);

  if (!snapshot || !document || !audio || !media || !envelope) return <div className="loading"><div className="studio-mark">CS</div><p>{status}</p></div>;
  const saveDisabled = tab === 'story' ? !dirtyStories.has(document.id) || !storyValidation.ok
    : tab === 'audio' ? !dirtyAudio || !audioValidation.ok
    : tab === 'media' ? !dirtyMedia || !mediaValidation.ok
    : !dirtyProject || !projectValidation.ok;
  const saveActive = tab === 'story' ? saveStory : tab === 'audio' ? saveAudio : tab === 'media' ? saveMedia : saveProject;
  return <div className="studio">
    <header className="topbar">
      <div className="brand"><div className="studio-mark">CS</div><div><strong>NARRATIVE STUDIO</strong><span>Chunk Surfer authoring system</span></div></div>
      <nav><button className={tab === 'timeline' ? 'is-active' : ''} onClick={() => setTab('timeline')}>Timeline</button><button className={tab === 'story' ? 'is-active' : ''} onClick={() => setTab('story')}>Story Graph</button><button className={tab === 'media' ? 'is-active' : ''} onClick={() => setTab('media')}>Media</button><button className={tab === 'audio' ? 'is-active' : ''} onClick={() => setTab('audio')}>Audio Timeline</button></nav>
      <div className="top-actions">
        {externalChanges.size > 0 && <button className="warning" onClick={reload}>↻ {externalChanges.size} external change{externalChanges.size === 1 ? '' : 's'}</button>}
        {recoveryAvailable && <button className="warning" onClick={restoreRecovery}>Recover local edits</button>}
        {tab === 'story' && <><button disabled={!history[document.id]?.past.length} onClick={() => restoreFrame('undo')}>↶</button><button disabled={!history[document.id]?.future.length} onClick={() => restoreFrame('redo')}>↷</button></>}
        {tab === 'audio' && <><button disabled={!audioHistory.past.length} onClick={() => restoreAudioFrame('undo')}>↶</button><button disabled={!audioHistory.future.length} onClick={() => restoreAudioFrame('redo')}>↷</button></>}
        {tab === 'story' && <button onClick={() => setPreviewOpen((open) => !open)}>{previewOpen ? 'Close preview' : 'Runtime preview'}</button>}
        <button className="primary" disabled={saveDisabled} onClick={saveActive}>Save <kbd>⌘S</kbd></button>
      </div>
    </header>

    <Suspense fallback={<div className="loading"><div className="studio-mark">CS</div><p>Loading workspace…</p></div>}>
    {tab === 'timeline' ? <TimelineWorkspace project={snapshot.project} documents={snapshot.documents} selectedDocumentId={document.id} onSelect={(id) => { setSelectedDocumentId(id); setSelectedNodeId(null); setTab('story'); }} />
    : tab === 'story' ? <div className={`story-workspace ${previewOpen ? 'has-preview' : ''}`}>
      <aside className="story-browser">
        <div className="panel-heading"><span>STORY INDEX</span><strong>{snapshot.documents.length} documents</strong></div>
        <input className="search" placeholder="Search scenes, tags, endings" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="story-list">{visibleDocuments.map((item) => <button key={item.document.id} className={item.document.id === document.id ? 'is-active' : ''} onClick={() => { setSelectedDocumentId(item.document.id); setSelectedNodeId(null); }}>
          <i style={{ background: item.document.regions.find((region) => region.kind === 'ending')?.color || item.document.regions[0]?.color }} />
          <span><b>{item.document.title}</b><small>{item.document.id} · {Object.keys(item.document.nodes).length} nodes</small></span>
          {dirtyStories.has(item.document.id) && <em>●</em>}
        </button>)}</div>
        <div className="validation-summary"><span className={storyValidation.ok && !unreachable.length ? 'valid' : 'invalid'}>{storyValidation.ok ? 'Schema valid' : `${storyValidation.errors.length} errors`}</span><span>{unreachable.length ? `${unreachable.length} unreachable` : 'All nodes reachable'}</span></div>
      </aside>
      <StoryGraph document={document} layout={envelope.layout} selectedId={selectedNodeId} search={search} onSelect={setSelectedNodeId} onDocument={updateDocument} onLayout={updateLayout} />
      <StoryInspector document={document} selectedId={selectedNodeId} audio={audio} media={media} onDocument={updateDocument} onCue={(id) => openCue(id, true)} onRename={setSelectedNodeId} />
      {previewOpen && <StoryPreview document={document} onCue={(id) => openCue(id)} />}
    </div> : tab === 'media' ? <MediaWorkspace project={media} selectedId={selectedMediaId} onSelected={setSelectedMediaId} onProject={updateMedia} />
    : <AudioWorkspace project={audio} selectedCueId={selectedCueId} documents={snapshot.documents} onSelectedCue={setSelectedCueId} onProject={updateAudio} />}
    </Suspense>

    <footer className="statusbar"><span>{status}</span><span>{tab === 'timeline' ? `${snapshot.project.timeline?.length || 0} groups · ${projectValidation.errors.length} errors` : tab === 'story' ? `${Object.keys(document.nodes).length} nodes · ${document.regions.length} regions · ${storyValidation.errors.length} errors` : tab === 'media' ? `${media.storyArt.length} story slots · ${mediaValidation.errors.length} errors` : `${audio.cues.length} cues · ${audio.triggers.length} triggers · ${audioValidation.errors.length} errors`}</span></footer>
  </div>;
}
