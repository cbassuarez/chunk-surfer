// Free-form lens tuning was intentionally removed from the shipped runtime.
// Authored profile selection and read-only layer diagnostics now live in the
// God menu. Keep this no-op export for old development imports during the
// one-release migration window.
export function mountTuner() {
  return { panel: null, setState() {} };
}
