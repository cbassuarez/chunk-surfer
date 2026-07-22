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

export function eulaVersion(text) {
  return String(text || '').match(/^Version:\s*(.+)$/m)?.[1]?.trim() || 'unversioned';
}

export function eulaSections(text) {
  const sections = [];
  let current = null;
  for (const line of String(text || '').split('\n')) {
    const heading = line.match(/^##\s+(.+)$/);
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
  const wanted = /model resources|model-use restrictions|Generated outputs/i;
  return eulaSections(text).filter((section) => wanted.test(section.title));
}

export function eulaAccepted(meta, text) {
  const version = eulaVersion(text);
  return !!meta?.eulaAccepted && version !== 'unversioned' && meta.eulaAccepted === version;
}
