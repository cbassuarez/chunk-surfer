// The licence gate's parsing half — deliberately free of any bundler-specific
// import so it stays testable under plain Node. The document itself arrives
// from eula-text.js, which is the only place that knows how the text is loaded.
//
// Standard builds have no startup licence gate. The agreement remains readable
// in Settings; explicitly enabled development model components retain their
// separate consent path before local model execution.

function normalizeEulaText(text) {
  return String(text || '').replace(/\r\n?/g, '\n');
}

function eulaLines(text) {
  return normalizeEulaText(text).split('\n');
}

const EULA_GATE_SECTION_TITLES = Object.freeze([
  /optional local ai model resources/i,
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

// Keep model-specific clauses discoverable for developers who explicitly opt
// into SD; regular players can review the full general agreement in settings.
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
