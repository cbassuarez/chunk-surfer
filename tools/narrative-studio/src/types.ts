export type StoryLine = {
  id: string;
  who?: string;
  text?: string;
  role?: string;
  when?: string;
  cues?: string[];
  hold?: number;
  rate?: number;
  [key: string]: unknown;
};

export type StoryChoice = {
  id: string;
  text: string;
  goto?: string;
  exit?: string;
  when?: string;
  cues?: string[];
  mutations?: { set?: string[]; clear?: string[] };
  [key: string]: unknown;
};

export type StoryNode = {
  id: string;
  type: string;
  speaker?: string;
  lines: StoryLine[];
  choices?: StoryChoice[];
  goto?: string;
  exit?: string;
  when?: string;
  cues?: string[];
  mutations?: { set?: string[]; clear?: string[] };
  [key: string]: unknown;
};

export type StoryRegion = {
  id: string;
  title: string;
  kind: string;
  color?: string;
  nodeIds: string[];
  parentId?: string;
};

export type CombatMusicProfile =
  | { mode: 'fixed'; lead: 'lead-1' | 'lead-2' | 'lead-3' }
  | { mode: 'movement'; movementLeads: Array<'lead-1' | 'lead-2' | 'lead-3'> };

export type CombatDefinition = {
  id: string;
  enemy: string;
  movements: Array<{ id: string; coherence: number; [key: string]: unknown }>;
  music: CombatMusicProfile;
  [key: string]: unknown;
};

export type NarrativeDocument = {
  schemaVersion: number;
  id: string;
  title: string;
  status: string;
  entry: string;
  entries?: string[];
  tags?: string[];
  notes?: string;
  regions: StoryRegion[];
  nodes: Record<string, StoryNode>;
  metadata?: Record<string, unknown> & { combat?: CombatDefinition };
};

export type StoryLayout = {
  schemaVersion: number;
  documentId: string;
  positions: Record<string, { x: number; y: number }>;
  regions: Record<string, { x?: number; y?: number; width?: number; height?: number; collapsed?: boolean }>;
};

export type StoryTransaction = {
  document: NarrativeDocument;
  layout: StoryLayout;
  selectedId?: string | null;
};

export type AudioAsset = {
  id: string;
  kind: 'file' | 'procedural';
  path?: string;
  generator?: string;
  tags?: string[];
};

export type CueLayer = {
  id: string;
  assetId: string;
  gain?: number;
  pan?: number;
  playbackRate?: number;
  delay?: number;
  trimStart?: number;
  trimEnd?: number;
  fadeIn?: number;
  fadeOut?: number;
  loop?: boolean;
  bus?: string;
  gainRange?: [number, number];
  panRange?: [number, number];
  playbackRateRange?: [number, number];
  automation?: Array<{ parameter: string; points: Array<{ time: number; value: number }> }>;
};

export type CueDefinition = {
  id: string;
  title: string;
  bus?: string;
  concurrency?: string;
  stopFadeMs?: number;
  layers: CueLayer[];
  effects?: string[];
  acoustic?: Record<string, unknown>;
};

export type AudioProject = {
  schemaVersion: number;
  id: string;
  assets: AudioAsset[];
  cues: CueDefinition[];
  triggers: Array<{ id: string; event: string; cueId: string; when?: string }>;
  buses: string[];
  acousticCatalogue: Record<string, unknown>;
};

export type MediaAsset = {
  id: string;
  kind: 'image' | 'placeholder';
  path?: string;
  tags?: string[];
};

export type StoryArtSlot = {
  id: string;
  assetId?: string;
  label: string;
  caption: string;
  status: string;
  tone: string;
  mode: string;
  alt: string;
  transform?: {
    focalPoint?: { x: number; y: number };
    crop?: { x: number; y: number; width: number; height: number };
    fit?: string;
  };
};

export type MediaProject = {
  schemaVersion: number;
  id: string;
  title: string;
  assets: MediaAsset[];
  storyArt: StoryArtSlot[];
};

export type TimelineEntry = {
  id: string;
  title: string;
  kind: string;
  documents: string[];
};

export type ProjectManifest = {
  schemaVersion: number;
  id: string;
  narrative: string[];
  audio: string[];
  media: string[];
  runtimeEntrypoints?: string[];
  timeline?: TimelineEntry[];
};

export type DocumentEnvelope = {
  path: string;
  revision: string;
  document: NarrativeDocument;
  layoutPath: string;
  layoutRevision: string;
  layout: StoryLayout;
};

export type ProjectSnapshot = {
  project: ProjectManifest;
  projectRevision: string;
  documents: DocumentEnvelope[];
  audio: { path: string; revision: string; document: AudioProject };
  media: { path: string; revision: string; document: MediaProject };
};
