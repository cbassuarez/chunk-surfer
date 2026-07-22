import { useEffect, useMemo, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import Timeline from 'wavesurfer.js/dist/plugins/timeline.esm.js';
import Regions from 'wavesurfer.js/dist/plugins/regions.esm.js';
import Minimap from 'wavesurfer.js/dist/plugins/minimap.esm.js';
import Envelope from 'wavesurfer.js/dist/plugins/envelope.esm.js';
import { createCuePlayer } from '../../../src/audio/cue-player.js';
import { assetUrl } from './api';
import type { AudioAsset, AudioProject, CueDefinition, CueLayer, DocumentEnvelope } from './types';

function Waveform({ asset, layer, onLayer }: { asset: AudioAsset | null; layer: CueLayer | null; onLayer: (next: CueLayer) => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!root.current || !asset?.path) return;
    const styles = getComputedStyle(document.documentElement);
    const color = (name: string) => styles.getPropertyValue(name).trim();
    const phosphor = color('--cs-vfd-phosphor');
    const accent = color('--cs-vfd-accent');
    const marker = color('--cs-vfd-marker');
    const silkscreen = color('--cs-vfd-silkscreen');
    const regions = Regions.create();
    const envelope = Envelope.create({ volume: layer?.gain ?? 1, lineColor: accent, lineWidth: '2', dragPointSize: 7 });
    const wave = WaveSurfer.create({
      container: root.current, url: assetUrl(asset.path), height: 116, waveColor: silkscreen, progressColor: phosphor, cursorColor: marker, normalize: false,
      plugins: [regions, Timeline.create({ height: 20 }), Minimap.create({ height: 28, waveColor: silkscreen, progressColor: phosphor }), envelope],
    });
    wave.on('ready', () => {
      const start = Math.max(0, layer?.trimStart || 0);
      const end = Math.min(wave.getDuration(), layer?.trimEnd ?? wave.getDuration());
      regions.clearRegions();
      const region = regions.addRegion({ start, end, color: `color-mix(in srgb, ${accent} 14%, transparent)`, drag: true, resize: true });
      region.on('update-end', () => layer && onLayer({ ...layer, trimStart: region.start, trimEnd: region.end }));
      envelope.setPoints([
        { time: start, volume: 0 }, { time: start + Math.max(.01, layer?.fadeIn || 0), volume: layer?.gain ?? 1 },
        { time: Math.max(start, end - Math.max(.01, layer?.fadeOut || 0)), volume: layer?.gain ?? 1 }, { time: end, volume: 0 },
      ]);
    });
    root.current.ondblclick = () => wave.playPause();
    return () => wave.destroy();
  }, [asset?.id, layer?.id]);
  if (!asset?.path) return <div className="waveform-empty">Procedural source — auditioned through its runtime generator.</div>;
  return <div className="waveform" ref={root} />;
}

const numberValue = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function AutomationLane({ layer, onLayer }: { layer: CueLayer; onLayer: (next: CueLayer) => void }) {
  const lane = layer.automation?.[0];
  const points = lane?.points || [];
  const polyline = points.map((point) => `${Math.min(100, point.time * 20)},${50 - Math.max(0, Math.min(1, point.value)) * 42}`).join(' ');
  return <div className="automation-lane">
    <div className="section-title"><span>Automation · {lane?.parameter || 'gain'}</span><button onClick={() => onLayer({ ...layer, automation: [{ parameter: 'gain', points: [...points, { time: points.length ? points[points.length - 1].time + .5 : 0, value: 1 }] }] })}>＋ Point</button></div>
    <svg viewBox="0 0 100 54" preserveAspectRatio="none"><path d="M0 50H100" /><polyline points={polyline} /></svg>
    <div className="automation-points">{points.map((point, index) => <div key={index}>
      <input type="number" step=".05" value={point.time} onChange={(event) => { const automation = structuredClone(layer.automation!); automation[0].points[index].time = numberValue(event.target.value); onLayer({ ...layer, automation }); }} />
      <input type="number" step=".05" value={point.value} onChange={(event) => { const automation = structuredClone(layer.automation!); automation[0].points[index].value = numberValue(event.target.value); onLayer({ ...layer, automation }); }} />
    </div>)}</div>
  </div>;
}

export function AudioWorkspace({ project, selectedCueId, documents, onSelectedCue, onProject, onStatus }: {
  project: AudioProject; selectedCueId: string | null; documents?: DocumentEnvelope[]; onSelectedCue: (id: string) => void; onProject: (project: AudioProject) => void;
  onStatus?: (status: string) => void;
}) {
  const [search, setSearch] = useState('');
  const cue = project.cues.find((item) => item.id === selectedCueId) || project.cues[0];
  const [selectedLayerId, setSelectedLayerId] = useState(cue?.layers[0]?.id || '');
  useEffect(() => setSelectedLayerId(cue?.layers[0]?.id || ''), [cue?.id]);
  const layer = cue?.layers.find((item) => item.id === selectedLayerId) || cue?.layers[0] || null;
  const asset = project.assets.find((item) => item.id === layer?.assetId) || null;
  const context = useRef<AudioContext | null>(null);
  const buffers = useRef(new Map<string, AudioBuffer>());

  const cues = useMemo(() => project.cues.filter((item) => `${item.id} ${item.title}`.toLowerCase().includes(search.toLowerCase())), [project.cues, search]);
  const assets = useMemo(() => project.assets.filter((item) => `${item.id} ${item.path || item.generator}`.toLowerCase().includes(search.toLowerCase())), [project.assets, search]);
  const backlinks = useMemo(() => {
    if (!cue?.id) return [];
    const refs: Array<{ documentId: string; nodeId: string; label: string }> = [];
    for (const envelope of documents || []) {
      for (const [nodeId, node] of Object.entries(envelope.document.nodes || {})) {
        if ((node.cues || []).includes(cue.id)) refs.push({ documentId: envelope.document.id, nodeId, label: 'node' });
        for (const line of node.lines || []) if ((line.cues || []).includes(cue.id)) refs.push({ documentId: envelope.document.id, nodeId, label: line.id || 'line' });
        for (const choice of node.choices || []) if ((choice.cues || []).includes(cue.id)) refs.push({ documentId: envelope.document.id, nodeId, label: choice.id || 'choice' });
      }
    }
    return refs;
  }, [cue?.id, documents]);

  const updateCue = (next: CueDefinition) => onProject({ ...project, cues: project.cues.map((item) => item.id === cue.id ? next : item) });
  const updateLayer = (next: CueLayer) => updateCue({ ...cue, layers: cue.layers.map((item) => item.id === next.id ? next : item) });
  const audition = async () => {
    try {
      context.current ||= new AudioContext();
      await context.current.resume();
      const player = (createCuePlayer as any)({
        context: context.current, destination: context.current.destination,
        loadBuffer: async (source: AudioAsset) => {
          if (!source.path) return null;
          if (buffers.current.has(source.id)) return buffers.current.get(source.id)!;
          const response = await fetch(assetUrl(source.path));
          if (!response.ok) throw new Error(`Audio asset failed to load (${response.status})`);
          const decoded = await context.current!.decodeAudioData(await response.arrayBuffer());
          buffers.current.set(source.id, decoded); return decoded;
        },
      });
      await player.play(cue as any, new Map(project.assets.map((item) => [item.id, item])));
      onStatus?.(`Auditioning ${cue.title}`);
    } catch (error) {
      onStatus?.(`Audition failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const addCue = () => {
    let index = project.cues.length + 1; let id = `cue-${index}`;
    while (project.cues.some((item) => item.id === id)) id = `cue-${++index}`;
    const firstAsset = project.assets[0];
    const next: CueDefinition = {
      id, title: 'New cue', bus: 'sfx', concurrency: 'overlap',
      layers: firstAsset ? [{ id: `${id}.layer.1`, assetId: firstAsset.id, gain: 1, playbackRate: 1, pan: 0 }] : [],
      effects: firstAsset ? undefined : ['fx:pending'],
    };
    onProject({ ...project, cues: [...project.cues, next] }); onSelectedCue(id);
  };

  return <div className="audio-workspace">
    <aside className="audio-browser">
      <div className="panel-heading"><span>AUDIO INDEX</span><strong>{project.assets.length} assets</strong></div>
      <input className="search" placeholder="Search cues and files" value={search} onChange={(event) => setSearch(event.target.value)} />
      <div className="browser-heading"><span>Cues</span><button onClick={addCue}>＋</button></div>
      <div className="browser-list">{cues.map((item) => <button className={item.id === cue?.id ? 'is-active' : ''} key={item.id} onClick={() => onSelectedCue(item.id)}><b>{item.title}</b><small>{item.id} · {item.layers.length} layer{item.layers.length === 1 ? '' : 's'}</small></button>)}</div>
      <div className="browser-heading"><span>Assets</span><small>{assets.length}</small></div>
      <div className="browser-list browser-list--assets">{assets.map((item) => <button key={item.id} onDoubleClick={() => cue && updateCue({ ...cue, layers: [...cue.layers, { id: `${cue.id}.layer.${cue.layers.length + 1}`, assetId: item.id, gain: 1, playbackRate: 1, pan: 0 }] })}><b>{item.path?.split('/').pop() || item.generator}</b><small>{item.kind} · {item.tags?.join(', ')}</small></button>)}</div>
    </aside>

    <main className="audio-editor">
      {cue ? <>
        <div className="audio-header"><div><span>CUE RECIPE</span><input value={cue.title} onChange={(event) => updateCue({ ...cue, title: event.target.value })} /><small>{cue.id}</small></div><button className="primary" onClick={audition}>▶ Audition cue</button></div>
        <div className="cue-properties">
          <label>Bus<select value={cue.bus || 'sfx'} onChange={(event) => updateCue({ ...cue, bus: event.target.value })}>{project.buses.map((bus) => <option key={bus}>{bus}</option>)}</select></label>
          <label>Concurrency<select value={cue.concurrency || 'overlap'} onChange={(event) => updateCue({ ...cue, concurrency: event.target.value })}><option>overlap</option><option>replace</option><option>ignore</option></select></label>
          <label>Stop fade ms<input type="number" value={cue.stopFadeMs || 0} onChange={(event) => updateCue({ ...cue, stopFadeMs: numberValue(event.target.value) })} /></label>
          <label>Effects<input value={(cue.effects || []).join(', ')} onChange={(event) => updateCue({ ...cue, effects: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label>
        </div>
        <div className="timeline">
          <div className="timeline-ruler"><span>0s</span><span>1s</span><span>2s</span><span>3s</span><span>4s</span><span>5s</span></div>
          {cue.layers.map((item) => <button key={item.id} className={`timeline-track ${item.id === layer?.id ? 'is-active' : ''}`} onClick={() => setSelectedLayerId(item.id)}><span className="track-name">{project.assets.find((asset) => asset.id === item.assetId)?.path?.split('/').pop() || item.assetId}</span><i style={{ left: `${Math.min(80, (item.delay || 0) * 20)}%`, width: `${Math.max(8, Math.min(100, ((item.trimEnd || 4) - (item.trimStart || 0)) * 20))}%` }} /></button>)}
        </div>
        <Waveform asset={asset} layer={layer} onLayer={updateLayer} />
        {layer && <div className="layer-editor">
          <div className="panel-heading layer-heading"><div><span>SELECTED LAYER</span><strong>{layer.id}</strong></div><button onClick={() => updateCue({ ...cue, layers: cue.layers.filter((item) => item.id !== layer.id) })}>Remove layer</button></div>
          <div className="field-grid field-grid--audio">
            <label>Asset<select value={layer.assetId} onChange={(event) => updateLayer({ ...layer, assetId: event.target.value })}>{project.assets.map((item) => <option key={item.id} value={item.id}>{item.path || item.generator}</option>)}</select></label>
            {(['gain', 'pan', 'playbackRate', 'delay', 'trimStart', 'trimEnd', 'fadeIn', 'fadeOut'] as const).map((name) => <label key={name}>{name}<input type="number" step=".01" value={layer[name] ?? (name === 'gain' || name === 'playbackRate' ? 1 : 0)} onChange={(event) => updateLayer({ ...layer, [name]: numberValue(event.target.value) })} /></label>)}
            <label>Loop<input type="checkbox" checked={!!layer.loop} onChange={(event) => updateLayer({ ...layer, loop: event.target.checked })} /></label>
          </div>
          <AutomationLane layer={layer} onLayer={updateLayer} />
        </div>}
        <div className="acoustic-editor"><div className="section-title"><span>Gameplay acoustics</span></div><textarea key={cue.id} rows={5} defaultValue={JSON.stringify(cue.acoustic || {}, null, 2)} onBlur={(event) => {
          try { updateCue({ ...cue, acoustic: JSON.parse(event.target.value || '{}') }); event.target.setCustomValidity(''); }
          catch { event.target.setCustomValidity('Acoustic metadata must be valid JSON'); event.target.reportValidity(); }
        }} /></div>
        <div className="trigger-index"><div className="section-title"><span>When this cue plays</span><button onClick={() => {
          let index = project.triggers.length + 1; let id = `trigger.${cue.id}.${index}`;
          while (project.triggers.some((item) => item.id === id)) id = `trigger.${cue.id}.${++index}`;
          onProject({ ...project, triggers: [...project.triggers, { id, event: 'game.event', cueId: cue.id }] });
        }}>＋ Trigger</button></div>{project.triggers.filter((item) => item.cueId === cue.id).map((trigger) => <div className="trigger-row" key={trigger.id}>
          <input value={trigger.event} onChange={(event) => onProject({ ...project, triggers: project.triggers.map((item) => item.id === trigger.id ? { ...item, event: event.target.value } : item) })} />
          <input value={trigger.when || ''} placeholder="condition" onChange={(event) => onProject({ ...project, triggers: project.triggers.map((item) => item.id === trigger.id ? { ...item, when: event.target.value || undefined } : item) })} />
          <button onClick={() => onProject({ ...project, triggers: project.triggers.filter((item) => item.id !== trigger.id) })}>×</button>
        </div>)}
        <div className="cue-backlinks">{backlinks.map((ref) => <span key={`${ref.documentId}:${ref.nodeId}:${ref.label}`}>{ref.documentId} · {ref.nodeId} · {ref.label}</span>)}</div></div>
      </> : <div className="empty-state">Create or select a cue.</div>}
    </main>
  </div>;
}
