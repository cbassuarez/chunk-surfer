import { spawnSync } from 'node:child_process';
import process from 'node:process';

const tests = [
  'test/bag.spec.mjs',
  'test/map-core.spec.mjs',
  'test/map-live-data.spec.mjs',
  'test/hush-telemetry.spec.mjs',
  'test/acoustic-core.spec.mjs',
  'test/recordist-acoustics.spec.mjs',
  'test/hush-audio-pure.spec.mjs',
  'test/hush-audio-runtime.spec.mjs',
  'test/hush-mix.spec.mjs',
  'test/hush-audio-firewall.spec.mjs',
  'test/audio-context-recovery.test.mjs',
  'test/fear-pressure.spec.mjs',
  'test/fear-overlay.test.mjs',
  'test/god-menu.test.mjs',
  'test/pause-menu.test.mjs',
  'test/sample-field-boot-contract.test.mjs',
  'test/map-bag-integration.spec.mjs',
  'test/map-information-firewall.spec.mjs',
  'test/progression-pure.spec.mjs',
  'test/progression-profile.spec.mjs',
  'test/progression-runtime.spec.mjs',
  'test/progression-migration.spec.mjs',
  'test/platform-sync.spec.mjs',
  'test/storage-platform.spec.mjs',
  'test/launch-parity.spec.mjs',
  'test/dev-launch-contract.test.mjs',
  'test/release-workflow.spec.mjs',
  'test/menu-layout-contract.spec.mjs',
  'test/transcript-layout.test.mjs',
  'test/opening-credits.test.mjs',
  'test/renderer-policy.test.mjs',
  'test/look-profiles.test.mjs',
  'test/diffusion-lens-contract.test.mjs',
  'test/material-cache-contract.test.mjs',
  'test/radio-progression.spec.mjs',
  'test/redaction-system.spec.mjs',
  'test/personalized-interference.spec.mjs',
  'test/chunk-surf-state.spec.mjs',
  'test/narrative-studio.spec.mjs',
];

for (const file of tests) {
  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`all ${tests.length} test files passed`);
