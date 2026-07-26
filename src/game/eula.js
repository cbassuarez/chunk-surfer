// The licence gate's parsing half — deliberately free of any bundler-specific
// import so it stays testable under plain Node. The document itself arrives
// from eula-text.js, which is the only place that knows how the text is loaded.
//
// Why this gate exists at all: the bundled model stack (Stable Diffusion 1.5,
// its depth ControlNet, and the Hyper-SD LoRA) ships under CreativeML Open
// RAIL-M. That licence is not a file you are allowed to merely include — its
// use restrictions have to be passed on to whoever ends up running the weights.
// Shipping EULA.md inside the app bundle satisfies distribution. It does not
// satisfy notice.

function normalizeEulaText(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function eulaLines(text) {
  return normalizeEulaText(text).split('\n');
}

const EULA_GATE_SECTION_TITLES = Object.freeze([
  /bundled local ai model resources/i,
  /mandatory model-use restrictions/i,
  /generated outputs/i,
]);

export function eulaVersion(text) {
  return normalizeEulaText(text).match(/^Version:\s*(.+)$/m)?.[1]?.trim() || 'unversioned';
}

export function eulaPreamble(text) {
  const lines = eulaLines(text);
  const firstSection = lines.findIndex((line) => /^##\s+/.test(line));
  const versionLine = lines.findIndex((line) => /^Version:\s*/i.test(line));
  if (firstSection < 0 || versionLine < 0 || firstSection <= versionLine) return [];
  return lines
    .slice(versionLine + 1, firstSection)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/\*\*/g, ''));
}

export function eulaSections(text) {
  const sections = [];
  let current = null;
  for (const raw of eulaLines(text)) {
    const line = raw.trimEnd();
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { title: heading[1].trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const value = line.trim();
    if (value) current.lines.push(value.replace(/^-\s+/, '· ').replace(/\*\*/g, ''));
  }
  return sections;
}

// The sections a player actually has to read before the model runs: what is
// bundled, and what they may not do with it. The rest of the agreement stays
// one keystroke away in the settings.
export function eulaGateSections(text) {
  const sections = eulaSections(text);
  return EULA_GATE_SECTION_TITLES
    .map((pattern) => sections.find((section) => pattern.test(section.title)))
    .filter(Boolean);
}

export function eulaAccepted(meta, text) {
  const version = eulaVersion(text);
  return !!meta?.eulaAccepted && version !== 'unversioned' && meta.eulaAccepted === version;
}
