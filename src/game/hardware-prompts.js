// Presentation-only keyboard aliases. Existing action reducers still own all
// bindings and timing; this simply lets a depicted key move with its real key.
export function hardwarePromptIds(event = {}) {
  if (event.controller) return [];
  const code = String(event.code || ''), key = String(event.key || '');
  let label = /^Key[A-Z]$/.test(code) ? code.slice(3)
    : /^Digit[0-9]$/.test(code) ? code.slice(5)
    : code === 'Space' || key === ' ' ? 'SPACE'
    : code === 'Escape' || key === 'Escape' ? 'ESC'
    : code.startsWith('Shift') || key === 'Shift' ? 'SHIFT'
    : code === 'Enter' || key === 'Enter' ? 'ENTER'
    : code === 'Tab' || key === 'Tab' ? 'TAB'
    : /^[a-z0-9]$/i.test(key) ? key.toUpperCase() : null;
  if (!label) return [];
  const labels = [label];
  if (label === 'ENTER' || label === 'SPACE') labels.push('ENTER / SPACE');
  return labels.map(value => `prompt:${value}`);
}
