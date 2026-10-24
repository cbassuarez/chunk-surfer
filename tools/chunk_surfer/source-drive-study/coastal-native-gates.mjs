// Passed directly into Puppeteer's browser realm; keep it closure-free.
export function coastalNativeMenuReady() {
  const status = document.getElementById('title-a11y-status')?.textContent || '';
  return !!window.__probe?.testRun && window.__scenes?.top?.()?.id === 'title'
    && (status.includes('START A NEW NIGHT.') || status.includes('RESUME THE NIGHT YOU LEFT.'));
}
