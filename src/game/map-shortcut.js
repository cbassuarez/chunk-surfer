// The map's direct keyboard control. Desktop shortcuts and text entry keep
// their owners; a held key never opens and immediately closes the field case.
export function isMapShortcut(event = {}) {
  return !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey
    && (event.code === 'KeyM' || String(event.key || '').toLowerCase() === 'm');
}
