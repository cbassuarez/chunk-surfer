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
  metadata?: Record<string, unknown>;
};

export type StoryLayout = {
  schemaVersion: number;
  documentId: string;
  positions: Record<string, { x: number; y: number }>;
  regions: Record<string, { x?: number; y?: number; width?: number; height?: number; collapsed?: boolean }>;
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

export type DocumentEnvelope = {
  path: string;
  revision: string;
  document: NarrativeDocument;
  layoutPath: string;
  layoutRevision: string;
  layout: StoryLayout;
};

export type ProjectSnapshot = {
  project: { id: string; schemaVersion: number };
  documents: DocumentEnvelope[];
  audio: { path: string; revision: string; document: AudioProject };
};
