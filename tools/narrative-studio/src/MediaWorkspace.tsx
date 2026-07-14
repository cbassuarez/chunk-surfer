import { assetUrl } from './api';
import type { MediaProject, StoryArtSlot } from './types';

const field = (label: string, control: React.ReactNode) => <label className="field"><span>{label}</span>{control}</label>;
const numberValue = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function MediaWorkspace({ project, selectedId, onSelected, onProject }: {
  project: MediaProject;
  selectedId: string | null;
  onSelected: (id: string) => void;
  onProject: (project: MediaProject) => void;
}) {
  const slot = project.storyArt.find((item) => item.id === selectedId) || project.storyArt[0] || null;
  const asset = project.assets.find((item) => item.id === slot?.assetId) || null;
  const updateSlot = (next: StoryArtSlot) => onProject({ ...project, storyArt: project.storyArt.map((item) => item.id === next.id ? next : item) });
  const setTransform = (change: Partial<NonNullable<StoryArtSlot['transform']>>) => slot && updateSlot({ ...slot, transform: { ...(slot.transform || {}), ...change } });
  const addSlot = () => {
    let index = project.storyArt.length + 1;
    let id = `story-art-${index}`;
    while (project.storyArt.some((item) => item.id === id)) id = `story-art-${++index}`;
    const next: StoryArtSlot = { id, label: 'New Slot', caption: '[item] placeholder', status: 'PLACEHOLDER', tone: 'missing', mode: 'compact', alt: '[item] placeholder' };
    onProject({ ...project, storyArt: [...project.storyArt, next] });
    onSelected(id);
  };

  return <div className="media-workspace">
    <aside className="media-browser">
      <div className="panel-heading"><span>MEDIA INDEX</span><strong>{project.storyArt.length} story slots</strong></div>
      <div className="browser-heading"><span>Story art</span><button onClick={addSlot}>＋</button></div>
      <div className="browser-list browser-list--media">{project.storyArt.map((item) => <button key={item.id} className={item.id === slot?.id ? 'is-active' : ''} onClick={() => onSelected(item.id)}>
        <b>{item.label}</b><small>{item.id} · {item.status}{item.assetId ? ` · ${item.assetId}` : ' · placeholder'}</small>
      </button>)}</div>
    </aside>
    <main className="media-editor">
      {slot ? <>
        <div className="media-preview">
          {asset?.path ? <img src={assetUrl(asset.path)} alt={slot.alt} /> : <div className="media-placeholder">{slot.caption || '[item] placeholder'}</div>}
          <div><span>{slot.status}</span><h1>{slot.label}</h1><p>{slot.caption}</p></div>
        </div>
        <div className="media-fields">
          {field('Label', <input value={slot.label} onChange={(event) => updateSlot({ ...slot, label: event.target.value })} />)}
          {field('Status', <select value={slot.status} onChange={(event) => updateSlot({ ...slot, status: event.target.value })}><option>STILL</option><option>THRESHOLD</option><option>PLACEHOLDER</option><option>UNAVAILABLE</option></select>)}
          {field('Asset', <select value={slot.assetId || ''} onChange={(event) => updateSlot({ ...slot, assetId: event.target.value || undefined })}><option value="">Placeholder only</option>{project.assets.map((item) => <option key={item.id} value={item.id}>{item.path || item.id}</option>)}</select>)}
          {field('Mode', <select value={slot.mode} onChange={(event) => updateSlot({ ...slot, mode: event.target.value })}><option>compact</option><option>hero</option><option>boss</option></select>)}
          {field('Tone', <select value={slot.tone} onChange={(event) => updateSlot({ ...slot, tone: event.target.value })}><option>person</option><option>threshold</option><option>subject</option><option>device</option><option>signal</option><option>missing</option></select>)}
          {field('Fit', <select value={slot.transform?.fit || 'cover'} onChange={(event) => setTransform({ fit: event.target.value })}><option>cover</option><option>contain</option></select>)}
          {field('Focal X', <input type="number" min="0" max="1" step=".01" value={slot.transform?.focalPoint?.x ?? .5} onChange={(event) => setTransform({ focalPoint: { x: numberValue(event.target.value, .5), y: slot.transform?.focalPoint?.y ?? .5 } })} />)}
          {field('Focal Y', <input type="number" min="0" max="1" step=".01" value={slot.transform?.focalPoint?.y ?? .5} onChange={(event) => setTransform({ focalPoint: { x: slot.transform?.focalPoint?.x ?? .5, y: numberValue(event.target.value, .5) } })} />)}
          <label className="field field--wide"><span>Caption / placeholder</span><textarea rows={3} value={slot.caption} onChange={(event) => updateSlot({ ...slot, caption: event.target.value })} /></label>
          <label className="field field--wide"><span>Alt text</span><textarea rows={3} value={slot.alt} onChange={(event) => updateSlot({ ...slot, alt: event.target.value })} /></label>
        </div>
      </> : <div className="empty-state">Create or select a story-art slot.</div>}
    </main>
  </div>;
}
