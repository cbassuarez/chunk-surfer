// The shipped game is first-person 3D. Legacy canvas/DOM renderers remain
// available only as explicit development diagnostics while they are retired.
export function resolveRenderer(requested, { development = false } = {}) {
  if (development && requested === 'canvas') return 'canvas';
  if (development && requested === 'dom') return 'dom';
  return '3d';
}
