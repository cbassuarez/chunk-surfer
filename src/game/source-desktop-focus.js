// Native key-window truth can arrive before WebKit's DOM focus. Visibility
// always wins, including an occluded WebView inside a still-key native window.
export function sourceDesktopInputActive(presentation = null, documentApi = globalThis.document) {
  if (documentApi?.hidden || documentApi?.visibilityState === 'hidden') return false;
  const confirmed = presentation?.hasFocus?.();
  if (typeof confirmed === 'boolean') return confirmed;
  return typeof documentApi?.hasFocus !== 'function' || documentApi.hasFocus();
}
