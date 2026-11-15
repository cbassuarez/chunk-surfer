import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { loadProject, saveCodeDocument, saveDocument, subscribeToChanges } from './api';
import { codeEdits, codeFieldProblem } from './code-edits.js';
import { mergeRuntimeDocuments } from './runtime-refresh.js';
import {storyMatchesSearch,storySearchNode} from './story-search.js';
import { CaseButton, CaseLegend, FieldCaseSurface } from './FieldCaseChrome';
import { StoryComposer } from './StoryComposer';
import type { GraphViewMemory } from './StoryGraph';
import { StoryInspector } from './StoryInspector';
import type { AudioProject, DocumentEnvelope, MediaProject, NarrativeDocument, ProjectSnapshot, StoryLayout, StoryTransaction } from './types';
import { reachableNodeIds, validateAudioProject, validateMediaProject, validateNarrativeDocument, validateProjectManifest } from '../../../src/narrative/contracts.js';

const RECOVERY_KEY = 'chunk-surfer.narrative-studio.recovery.v1';

// DEEP LINK. `?doc=<documentId>&node=<nodeId>&line=<lineId>` opens the studio
// straight onto an authored document rather than the timeline — which is how
// tools/endings-audit links every ending's dialog back to the place it is
// written. Read once, at module load, because it seeds initial state; the query
// is then irrelevant and the studio behaves normally.
const deepLink = (() => {
  const params = new URLSearchParams(location.search);
  return {
    doc: params.get('doc') || '',
    node: params.get('node') || '',
    line: params.get('line') || '',
  };
})();
const StoryGraph = lazy(() => import('./StoryGraph').then((module) => ({ default: module.StoryGraph })));
const StoryPreview = lazy(() => import('./StoryPreview').then(module => ({ default: module.StoryPreview })));
const AudioWorkspace = lazy(() => import('./AudioWorkspace').then((module) => ({ default: module.AudioWorkspace })));
const DialogSelectWorkspace = lazy(() => import('./DialogSelectWorkspace').then((module) => ({ default: module.DialogSelectWorkspace })));
const MediaWorkspace = lazy(() => import('./MediaWorkspace').then((module) => ({ default: module.MediaWorkspace })));
type HistoryFrame = { document: NarrativeDocument; layout: StoryLayout; selectedId: string | null };
type HistoryState = Record<string, { past: HistoryFrame[]; future: HistoryFrame[] }>;
type AudioHistoryState = { past: AudioProject[]; future: AudioProject[] };
type Tab = 'dialog-select' | 'story' | 'media' | 'audio';
type StoryView = 'compose' | 'scene';

class WorkspaceErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Narrative Studio workspace failed', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="workspace-error">
      <span>WORKSPACE INTERRUPTED</span>
      <h1>This panel hit an error.</h1>
      <p>{this.state.error.message}</p>
      <button className="primary" onClick={this.props.onReset}>Return to Dialog Select</button>
    </section>;
  }
}

export function App() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>(deepLink.doc ? 'story' : 'dialog-select');
  const [selectedDocumentId, setSelectedDocumentId] = useState(deepLink.doc);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(deepLink.node || null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dirtyStories, setDirtyStories] = useState(new Set<string>());
  const [dirtyAudio, setDirtyAudio] = useState(false);
  const [dirtyMedia, setDirtyMedia] = useState(false);
  const [dirtyProject, setDirtyProject] = useState(false);
  const [externalChanges, setExternalChanges] = useState(new Set<string>());
  const [status, setStatus] = useState('Loading project…');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [storyView, setStoryView] = useState<StoryView>(deepLink.line ? 'compose' : 'scene');
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [editChoiceId, setEditChoiceId] = useState<string | undefined>();
  const graphViews = useRef<Record<string, GraphViewMemory>>({});
  const sceneSelections = useRef<Record<string, string | null>>({});
  const [history, setHistory] = useState<HistoryState>({});
  const [audioHistory, setAudioHistory] = useState<AudioHistoryState>({ past: [], future: [] });
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [recoveryAvailable, setRecoveryAvailable] = useState(() => !!localStorage.getItem(RECOVERY_KEY));
  // A code refresh arrives on a socket; it must see the current unsaved set.
  const dirtyRef = useRef(dirtyStories);
  dirtyRef.current = dirtyStories;

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
      const fromCode = loaded.documents.filter((item) => item.fromCode).length;
      const summary = `${loaded.documents.length - fromCode} story documents · ${fromCode} from code · ${loaded.audio.document.assets.length} audio assets`;
      // A deep link asks for one line; the studio selects per node, so say which
      // line was wanted rather than silently landing on its node.
      setStatus(deepLink.line ? `${summary} · opened at ${deepLink.doc}#${deepLink.line}` : summary);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
  }, []);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    let disposed=false,refresh=0;
    const unsubscribe=subscribeToChanges((event) => {
      if(event.type==='runtime-export-failed'){
        setStatus(`Dialogue refresh failed: ${event.message || 'check the studio terminal'}`);return;
      }
      if(event.type==='runtime-refresh'){
        const requested=++refresh;
        loadProject().then((loaded)=>{
          if(disposed||requested!==refresh)return;
          setSnapshot((current)=>mergeRuntimeDocuments(current,loaded,dirtyRef.current));
          setStatus(`Dialogue refreshed · ${loaded.documents.filter(item=>item.fromCode).length} modules from the game code`);
        }).catch((error)=>{if(!disposed)setStatus(`Dialogue refresh failed: ${error instanceof Error?error.message:String(error)}`);});
        return;
      }
      const changedPath = event.path;
      if(changedPath)setExternalChanges((current) => new Set(current).add(changedPath));
    });
    return()=>{disposed=true;unsubscribe();};
  }, []);

  const envelope = snapshot?.documents.find((item) => item.document.id === selectedDocumentId) || null;
  const document = envelope?.document || null;
  const audio = snapshot?.audio.document || null;
  const media = snapshot?.media.document || null;
  // A code-derived trace whose quote is computed at runtime has no literal to
  // check; that is a fact about the code, not an authoring error to show.
  const storyValidation = useMemo(() => {
    if (!document) return { ok: true, errors: [] };
    const result = validateNarrativeDocument(document);
    if (!envelope?.fromCode) return result;
    const errors = result.errors.filter((error: { path: string }) => !/\.quotes$/.test(error.path));
    return { ...result, ok: !errors.length, errors };
  }, [document, envelope?.fromCode]);
  // Words built partly in code ({room}, a helper's prefix) have to survive an
  // edit; the first one that does not is shown, and Save waits for it.
  const codeProblem = useMemo(() => {
    if (!envelope?.fromCode || !envelope.base) return '';
    for (const edit of codeEdits(envelope.base, envelope.document).edits) {
      const problem = codeFieldProblem(envelope.codeFields, edit.id, edit.field, edit.to);
      if (problem) return `${edit.id}: ${problem}`;
    }
    return '';
  }, [envelope]);
  const audioValidation = useMemo(() => audio ? validateAudioProject(audio) : { ok: true, errors: [] }, [audio]);
  const mediaValidation = useMemo(() => media ? validateMediaProject(media) : { ok: true, errors: [] }, [media]);
  const authored = useMemo(() => (snapshot?.documents || []).filter((item) => !item.fromCode), [snapshot?.documents]);
  const projectValidation = useMemo(() => snapshot ? validateProjectManifest(snapshot.project, { documents: authored.map((item) => item.document), documentIds: authored.map((item) => item.document.id) }) : { ok: true, errors: [] }, [snapshot, authored]);
  const unreachable = useMemo(() => document ? Object.keys(document.nodes).filter((id) => !reachableNodeIds(document).has(id)) : [], [document]);
  const activeSelectedNodeId = document && selectedNodeId && document.nodes[selectedNodeId] ? selectedNodeId : document?.entry || null;

  const updateStory = (transaction: StoryTransaction, dirty = true) => {
    if (!snapshot || !envelope) return;
    // Dialogue written in code: its words change here, its structure does not.
    if (envelope.fromCode && dirty) {
      const { edits, refused } = codeEdits(envelope.base ?? envelope.document, transaction.document);
      const locked = edits.map((edit) => envelope.codeFields?.[edit.id]?.[edit.field as 'who' | 'text']?.locked).find(Boolean);
      if (refused.length || locked) {
        if ('selectedId' in transaction) setSelectedNodeId(transaction.selectedId ?? null);
        setStatus(`${refused[0]?.what || locked} · ${envelope.module}`);
        return;
      }
    }
    if (dirty) setHistory((current) => {
      const item = current[envelope.document.id] || { past: [], future: [] };
      return { ...current, [envelope.document.id]: { past: [...item.past.slice(-99), { document: envelope.document, layout: envelope.layout, selectedId: activeSelectedNodeId }], future: [] } };
    });
    setSnapshot({ ...snapshot, documents: snapshot.documents.map((item) => item.document.id === envelope.document.id ? { ...item, ...(item.fromCode && dirty ? { base: item.base ?? item.document } : {}), document: transaction.document, layout: transaction.layout } : item) });
    if ('selectedId' in transaction) setSelectedNodeId(transaction.selectedId ?? null);
    if (dirty) setDirtyStories((current) => new Set(current).add(envelope.document.id));
  };
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
    const current = { document: envelope.document, layout: envelope.layout, selectedId: activeSelectedNodeId };
    setSnapshot({ ...snapshot, documents: snapshot.documents.map((entry) => entry.document.id === envelope.document.id ? { ...entry, document: frame.document, layout: frame.layout } : entry) });
    setSelectedNodeId(frame.selectedId);
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
    const invalidDraft = window.document.querySelector<HTMLElement>('.story-workspace [aria-invalid="true"]');
    if (invalidDraft) { invalidDraft.focus(); setStatus(`Save blocked: correct ${invalidDraft.getAttribute('aria-label') || 'the invalid patch field'}, or press Escape to cancel its draft.`); return; }
    setStatus(`Saving ${envelope.document.title}…`);
    if (envelope.fromCode) {
      try {
        const saved = await saveCodeDocument(envelope.path, envelope.revision, envelope.document, envelope.base ?? envelope.document);
        // A layout file is only made once a beat has actually been placed.
        const layout = envelope.layoutRevision || Object.keys(envelope.layout.positions || {}).length
          ? await saveDocument(envelope.layoutPath, envelope.layoutRevision, envelope.layout) : { revision: envelope.layoutRevision };
        setSnapshot({ ...snapshot, documents: snapshot.documents.map((item) => item.document.id === envelope.document.id
          ? { ...item, document: saved.document || item.document, base: undefined, revision: saved.revision, codeFields: saved.codeFields, layoutRevision: layout.revision } : item) });
        setDirtyStories((current) => { const next = new Set(current); next.delete(envelope.document.id); return next; });
        setHistory((current) => { const next = { ...current }; delete next[envelope.document.id]; return next; });
        const shared = saved.alsoChanged ? ` · ${saved.alsoChanged} more line${saved.alsoChanged === 1 ? '' : 's'} share${saved.alsoChanged === 1 ? 's' : ''} those words in code and changed too` : '';
        setStatus(saved.changed ? `Saved ${saved.changed} edit${saved.changed === 1 ? '' : 's'} into ${envelope.module}${shared}${saved.warnings?.length ? ` · ${saved.warnings[0]}` : ''}` : `Saved ${envelope.document.title}`);
      } catch (error) { setStatus(`Save blocked: ${error instanceof Error ? error.message : String(error)}`); }
      return;
    }
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

  const latestSave = useRef<() => void>(() => {});
  latestSave.current = () => { if (tab === 'story') saveStory(); else if (tab === 'audio') saveAudio(); else if (tab === 'media') saveMedia(); else saveProject(); };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        // Inline patch fields commit on blur. Save after that render so the
        // keyboard shortcut cannot persist the previous field value.
        (event.target as HTMLElement)?.blur?.();
        requestAnimationFrame(() => latestSave.current());
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
    if (!snapshot) return;
    // Loading a clean disk snapshot must not erase the unsaved record before
    // the author has had a chance to restore it.
    if (!dirtyStories.size && !dirtyAudio && !dirtyMedia && !dirtyProject) { if (!recoveryAvailable) localStorage.removeItem(RECOVERY_KEY); return; }
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ at: Date.now(), stories: snapshot.documents.filter((item) => dirtyStories.has(item.document.id)), audio: dirtyAudio ? snapshot.audio : null, media: dirtyMedia ? snapshot.media : null, project: dirtyProject ? snapshot.project : null }));
  }, [snapshot, dirtyStories, dirtyAudio, dirtyMedia, dirtyProject, recoveryAvailable]);

  const restoreRecovery = () => {
    if (!snapshot) return;
    const raw = localStorage.getItem(RECOVERY_KEY);
    if (!raw) return;
    let recovery;
    try { recovery = JSON.parse(raw); }
    catch {
      localStorage.removeItem(RECOVERY_KEY);
      setRecoveryAvailable(false);
      setStatus('Discarded an unreadable local recovery record');
      return;
    }
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
  // Authored documents first, then the dialogue still written in code. Search
  // reaches into the lines themselves, so any sentence the game says is findable.
  const visibleDocuments = useMemo(() => (snapshot?.documents || []).filter((item) => storyMatchesSearch(item,search))
    .sort((a, b) => Number(!!a.fromCode) - Number(!!b.fromCode)), [snapshot?.documents, search]);

  if (!snapshot || !document || !audio || !media || !envelope) return <div className="loading"><div className="studio-mark">CS</div><p>{status}</p></div>;
  const saveDisabled = tab === 'story' ? !dirtyStories.has(document.id) || !storyValidation.ok || !!codeProblem
    : tab === 'audio' ? !dirtyAudio || !audioValidation.ok
    : tab === 'media' ? !dirtyMedia || !mediaValidation.ok
    : !dirtyProject || !projectValidation.ok;
  const saveActive = tab === 'story' ? saveStory : tab === 'audio' ? saveAudio : tab === 'media' ? saveMedia : saveProject;
  return <div className="studio cs-machine-panel field-case-studio"><FieldCaseSurface />
    <header className="topbar cs-machine-header">
      <div className="brand"><CaseLegend>AUDIOCORP · NARRATIVE STUDIO</CaseLegend></div>
      <nav><CaseButton material="kit" className={tab === 'dialog-select' ? 'is-active' : ''} onClick={() => setTab('dialog-select')}>Dialog Select</CaseButton><CaseButton material="map" className={tab === 'story' ? 'is-active' : ''} onClick={() => setTab('story')}>Story</CaseButton><CaseButton material="sheets" className={tab === 'media' ? 'is-active' : ''} onClick={() => setTab('media')}>Media</CaseButton><CaseButton material="skills" className={tab === 'audio' ? 'is-active' : ''} onClick={() => setTab('audio')}>Audio Timeline</CaseButton></nav>
      <div className="top-actions">
        {externalChanges.size > 0 && <CaseButton className="warning" onClick={reload}>↻ {externalChanges.size} external change{externalChanges.size === 1 ? '' : 's'}</CaseButton>}
        {recoveryAvailable && <CaseButton className="warning" onClick={restoreRecovery}>Recover local edits</CaseButton>}
        {tab === 'story' && <><CaseButton aria-label="Undo story change" disabled={!history[document.id]?.past.length} onClick={() => restoreFrame('undo')}>↶</CaseButton><CaseButton aria-label="Redo story change" disabled={!history[document.id]?.future.length} onClick={() => restoreFrame('redo')}>↷</CaseButton></>}
        {tab === 'audio' && <><CaseButton disabled={!audioHistory.past.length} onClick={() => restoreAudioFrame('undo')}>↶</CaseButton><CaseButton disabled={!audioHistory.future.length} onClick={() => restoreAudioFrame('redo')}>↷</CaseButton></>}
        {tab === 'story' && <CaseButton onClick={() => setPreviewOpen((open) => !open)}>{previewOpen ? 'Close probe' : 'Conversation probe'}</CaseButton>}
        <CaseButton className="primary" disabled={saveDisabled} onClick={saveActive}>Save <kbd>⌘S</kbd></CaseButton>
      </div>
    </header>

    <WorkspaceErrorBoundary key={tab} onReset={() => { setSelectedNodeId(null); setPreviewOpen(false); setTab('dialog-select'); }}>
    <Suspense fallback={<div className="loading"><div className="studio-mark">CS</div><p>Loading workspace…</p></div>}>
    {tab === 'dialog-select' ? <DialogSelectWorkspace project={snapshot.project} documents={snapshot.documents} selectedDocumentId={document.id} search={search} onSearch={setSearch} onSelect={(id) => { const item = snapshot.documents.find(item => item.document.id === id); if (!item) return; sceneSelections.current[document.id] = activeSelectedNodeId; setSelectedDocumentId(id); setSelectedNodeId(search.trim() ? storySearchNode(item, search) : sceneSelections.current[id] || item.document.entry); setStoryView('scene'); setTab('story'); }} />
    : tab === 'story' ? <div className={`story-workspace story-workspace--${storyView} ${previewOpen ? 'has-preview' : ''} ${inspectorOpen && storyView === 'scene' ? 'has-inspector' : ''}`}>
      <aside className="story-browser">
        <div className="panel-heading"><span>SCENES / SOURCE COLLECTIONS</span><strong>{authored.length} documents · {snapshot.documents.length - authored.length} from code</strong></div>
        <div className="story-view-switch"><CaseButton className={storyView === 'scene' ? 'is-active' : ''} onClick={() => setStoryView('scene')}>Scene overview</CaseButton><CaseButton className={storyView === 'compose' ? 'is-active' : ''} onClick={() => setStoryView('compose')}>Edit beat</CaseButton></div>
        <input className="search" placeholder="Search dialogue, scenes, choices" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="story-list">{visibleDocuments.map((item) => <button key={item.document.id} className={item.document.id === document.id ? 'is-active' : ''} onClick={() => {
          sceneSelections.current[document.id] = activeSelectedNodeId; setSelectedDocumentId(item.document.id); setSelectedNodeId(search.trim() ? storySearchNode(item,search) : sceneSelections.current[item.document.id] || item.document.entry); setStoryView('scene'); }}>
          <i style={{ background: item.document.regions.find((region) => region.kind === 'ending')?.color || item.document.regions[0]?.color }} />
          <span><b>{item.document.title}</b><small>{item.fromCode ? item.module : item.document.id} · {Object.keys(item.document.nodes).length} nodes</small></span>
          {dirtyStories.has(item.document.id) && <em>●</em>}
        </button>)}</div>
        <div className="validation-summary"><span className={storyValidation.ok && !unreachable.length ? 'valid' : 'invalid'}>{storyValidation.ok ? 'Schema valid' : `${storyValidation.errors.length} errors`}</span><span>{envelope.fromCode ? 'Source starts / conditions require code context' : unreachable.length ? `${unreachable.length} unreachable` : 'All nodes reachable'}</span></div>
      </aside>
      <main className="story-main">{envelope.fromCode && <div className={`code-banner${codeProblem ? ' code-banner--problem' : ''}`}>{codeProblem || <>Written in <code>{envelope.module}</code>. Edit the words here; Save writes them into the module. Beats, their order, where choices lead and conditions stay in code.</>}</div>}<div className={`story-graph-container ${storyView === 'compose' ? 'is-hidden' : ''}`}><StoryGraph key={document.id} document={document} layout={envelope.layout} selectedId={activeSelectedNodeId} search={search} wordsOnly={!!envelope.fromCode} visible={storyView === 'scene'} memory={graphViews.current[document.id] ||= {}} inspectorOpen={inspectorOpen} onToggleInspector={() => setInspectorOpen(open => !open)} onSelect={setSelectedNodeId} onEdit={(id, choiceId) => { setSelectedNodeId(id); setEditChoiceId(choiceId); setStoryView('compose'); }} onTransaction={updateStory} /></div>
        {storyView === 'compose' && activeSelectedNodeId && <div className="story-editor-container"><div className="editor-context"><CaseButton onClick={() => setStoryView('scene')}>← Back to scene</CaseButton><span>{document.title} / <b>{activeSelectedNodeId}</b></span></div><StoryComposer focusChoiceId={editChoiceId} document={document} layout={envelope.layout} selectedId={activeSelectedNodeId} audio={audio} media={media} codeFields={envelope.fromCode ? envelope.codeFields || {} : undefined} onTransaction={updateStory} onSelect={setSelectedNodeId} onCue={(id) => openCue(id, true)} /></div>}</main>
      {storyView === 'scene' && inspectorOpen && <StoryInspector document={document} layout={envelope.layout} selectedId={activeSelectedNodeId} audio={audio} media={media} codeFields={envelope.fromCode ? envelope.codeFields || {} : undefined} onTransaction={updateStory} onCue={(id) => openCue(id, true)} />}
      {previewOpen && <StoryPreview document={document} selectedId={activeSelectedNodeId} fromCode={!!envelope.fromCode} onPosition={setSelectedNodeId} onCue={(id) => openCue(id)} />}
    </div> : tab === 'media' ? <MediaWorkspace project={media} selectedId={selectedMediaId} onSelected={setSelectedMediaId} onProject={updateMedia} />
    : <AudioWorkspace project={audio} selectedCueId={selectedCueId} documents={snapshot.documents} onSelectedCue={setSelectedCueId} onProject={updateAudio} onStatus={setStatus} />}
    </Suspense>
    </WorkspaceErrorBoundary>

    <footer className="statusbar cs-machine-footer"><span>{status}</span><span>{tab === 'dialog-select' ? `${snapshot.project.timeline?.length || 0} groups · ${projectValidation.errors.length} errors` : tab === 'story' ? `${Object.keys(document.nodes).length} nodes · ${document.regions.length} regions · ${storyValidation.errors.length} errors` : tab === 'media' ? `${media.storyArt.length} story slots · ${mediaValidation.errors.length} errors` : `${audio.cues.length} cues · ${audio.triggers.length} triggers · ${audioValidation.errors.length} errors`}</span></footer>
  </div>;
}
