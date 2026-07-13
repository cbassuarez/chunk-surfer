// Browser-safe profile transport. Export/import contains permanent knowledge and
// settings only; it never serializes or replaces the active night.

export function downloadJsonFile(data, filename = 'chunk-surfer-profile.json') {
  if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
  let url = '';
  try {
    const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch (_) {
    return false;
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export function chooseJsonFile({ accept = 'application/json,.json' } = {}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof FileReader === 'undefined') {
      resolve({ ok: false, error: 'UNAVAILABLE' });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = false;
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(result);
    };

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { finish({ ok: false, error: 'CANCELLED' }); return; }
      if (file.size > 2 * 1024 * 1024) { finish({ ok: false, error: 'TOO_LARGE' }); return; }

      const reader = new FileReader();
      reader.onerror = () => finish({ ok: false, error: 'READ_FAILED' });
      reader.onload = () => {
        try {
          finish({ ok: true, value: JSON.parse(String(reader.result || '')) });
        } catch (_) {
          finish({ ok: false, error: 'INVALID_JSON' });
        }
      };
      reader.readAsText(file);
    }, { once: true });

    // `cancel` is supported by modern browsers. A focus fallback prevents a
    // dangling hidden input on older implementations when the picker closes.
    input.addEventListener('cancel', () => finish({ ok: false, error: 'CANCELLED' }), { once: true });
    const onFocus = () => setTimeout(() => {
      if (!settled && !input.files?.length) finish({ ok: false, error: 'CANCELLED' });
    }, 350);
    window.addEventListener('focus', onFocus, { once: true });

    input.click();
  });
}
