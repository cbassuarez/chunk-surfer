import assert from 'node:assert/strict';
import fs from 'node:fs';

const yml = fs.readFileSync('.github/workflows/release.yml', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tauri = fs.readFileSync('src-tauri/tauri.conf.json', 'utf8');

assert.match(pkg.scripts['tauri:build'], /tauri build --config src-tauri\/tauri\.lens\.conf\.json/, 'tauri builds always merge the offline lens bundle config');
assert.match(pkg.scripts['beta:build:mac'], /npm run tauri:build -- --target aarch64-apple-darwin --bundles dmg/, 'local mac beta build uses the mandatory bundled Tauri build');
assert.match(yml, /Windows x64[\s\S]*args: --bundles msi/, 'windows release builds explicit MSI bundle');
assert.match(yml, /src-tauri\/target\/release\/bundle\/msi\/\*\.msi/, 'windows MSI artifact path is uploaded');
assert.doesNotMatch(yml, /Windows x64[\s\S]*args: --bundles nsis/, 'windows release does not invoke makensis for large offline lens builds');
assert.doesNotMatch(tauri, /"nsis"/, 'default Tauri bundle targets do not include NSIS');
assert.match(yml, /Linux x64[\s\S]*args: --bundles appimage,deb/, 'linux release builds explicit AppImage and deb bundles');
assert.match(yml, /libwebkit2gtk-4\.1-dev libayatana-appindicator3-dev/, 'linux runner installs current Tauri WebKit dependencies');
assert.match(yml, /actions\/upload-artifact@v4/, 'matrix jobs upload local bundles first');
assert.match(yml, /actions\/download-artifact@v4/, 'single release job downloads built bundles');
assert.match(yml, /gh release upload[\s\S]*--clobber/, 'single release job uploads all assets with clobber');
assert.match(yml, /gh release download[\s\S]*'\*\.dmg'[\s\S]*'\*\.exe'[\s\S]*'\*\.msi'[\s\S]*'\*\.AppImage'[\s\S]*'\*\.deb'/, 'release job verifies downloadable mac/windows/linux assets');
assert.match(yml, /build_bundle\.py --target \$\{\{ matrix\.target \}\}/, 'each target packages its own lens executable and model resources');
assert.match(yml, /npm ci/, 'release installs the exact locked frontend dependency graph');
assert.match(yml, /release-preflight\.mjs/, 'release validates source versions against its tag');
assert.doesNotMatch(yml, /args: --config src-tauri\/tauri\.lens\.conf\.json/, 'release matrix does not duplicate the mandatory lens config flag');
assert.doesNotMatch(yml, /macOS Intel|x86_64-apple-darwin/, 'unsupported macOS Intel package is not built');
console.log('release workflow contract tests ok');
