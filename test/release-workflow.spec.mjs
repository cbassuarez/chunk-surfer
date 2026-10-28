import assert from 'node:assert/strict';
import fs from 'node:fs';

const yml = fs.readFileSync('.github/workflows/release.yml', 'utf8');
const releaseMatrix = fs.readFileSync('scripts/release-matrix.mjs', 'utf8');
const portablePackager = fs.readFileSync('scripts/package-windows-portable.mjs', 'utf8');
const featureSmoke = fs.readFileSync('tools/chunk_surfer/tests/feature-regression-smoke.mjs', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const windowsTauri = JSON.parse(fs.readFileSync('src-tauri/tauri.windows.conf.json', 'utf8'));

assert.equal(pkg.scripts['tauri:build'], 'tauri build', 'standard Tauri builds never attach the SD lens overlay');
assert.match(pkg.scripts['tauri:build:steam'], /steamworks:verify/, 'Steam builds verify their redistributables');
assert.match(pkg.scripts['beta:build:mac'], /npm run tauri:build -- --target aarch64-apple-darwin --bundles dmg/,
  'local mac beta builds the lean app');
assert.doesNotMatch(pkg.scripts['beta:build:mac'], /lens:bundle/);
assert.match(pkg.scripts['lens:verify'], /validate-lens-bundle-contract\.mjs/,
  'local optional SD tooling retains its separate verifier');
assert.equal(tauri.bundle.resources['../LEGAL/EULA.md'], 'EULA.md');
assert.equal(tauri.bundle.resources['steamworks-runtime/'], 'steamworks/');
assert.equal(tauri.bundle.externalBin, undefined, 'the normal app includes no external SD executable');
assert.ok(!fs.existsSync('src-tauri/tauri.lens.conf.json'), 'obsolete SD packaging overlay has been removed');
assert.match(pkg.scripts['itch:stage'], /scripts\/itch-release\.mjs stage/, 'itch staging script exists for public beta uploads');
assert.match(pkg.scripts['itch:preview'], /scripts\/itch-release\.mjs preview/, 'itch preview script exists for Butler channel diffs');
assert.match(pkg.scripts['itch:push'], /scripts\/itch-release\.mjs push/, 'itch publish script exists for Butler channel pushes');
assert.match(pkg.scripts['test:feature-smoke'], /run-feature-regression-smoke\.mjs/, 'cross-platform visual smoke has one portable entrypoint');
assert.match(yml, /publish:[\s\S]*default: false[\s\S]*type: boolean/, 'manual release validation does not publish unless explicitly requested');
assert.match(yml, /platform:[\s\S]*type: choice[\s\S]*- linux/, 'manual validation can target only the failed native platform');
assert.match(yml, /matrix: \$\{\{ fromJSON\(needs\.configure\.outputs\.matrix\) \}\}/, 'release jobs consume the selected platform matrix');
assert.match(releaseMatrix, /Windows x64[\s\S]*args: '--no-bundle'/, 'windows release skips installers and validates its portable build');
assert.match(releaseMatrix, /release\/windows\/\*\.zip/, 'windows portable zip artifact path is uploaded');
assert.match(yml, /scripts\/package-windows-portable\.mjs/, 'windows release stages a portable app directory');
assert.match(yml, /Expand-Archive[\s\S]*validate-windows-portable\.mjs "\$verifyRoot\/Chunk Surfer"/, 'windows release validates a clean extraction of the portable zip');
assert.match(pkg.scripts['windows:validate'], /validate-windows-portable\.mjs/, 'windows portable validator has a local entrypoint');
assert.match(portablePackager, /Do not run the game from Windows Explorer\\'s zip preview/, 'portable instructions require complete extraction');
assert.match(portablePackager, /Microsoft Edge WebView2 Runtime/, 'portable instructions document the desktop runtime prerequisite');
assert.doesNotMatch(yml, /Windows x64[\s\S]*args: --bundles (?:nsis|msi)/, 'windows release does not invoke NSIS or MSI installer linkers');
assert.match(yml, /Prepare release upload assets[\s\S]*split -b 1900M/, 'release upload splits assets larger than GitHub release limits');
assert.match(yml, /Public beta downloads are staged on itch\.io first/, 'GitHub release notes point players to itch first');
assert.match(yml, /developer mirror/, 'GitHub release notes identify split assets as a developer mirror');
assert.match(yml, /publish-itch:[\s\S]*needs: build[\s\S]*BUTLER_API_KEY: \$\{\{ secrets\.BUTLER_API_KEY \}\}/, 'itch publish job runs after platform builds with Butler secret');
assert.match(yml, /publish-itch:[\s\S]*if: github\.event_name == 'push' \|\| inputs\.publish == true/, 'tag pushes publish automatically while manual validation remains safe');
assert.match(yml, /publish-itch:[\s\S]*ITCH_TARGET: \$\{\{ vars\.ITCH_TARGET \}\}/, 'itch publish job reads the target from repository variables');
assert.match(yml, /curl -L -o butler\.zip https:\/\/broth\.itch\.zone\/butler\/linux-amd64\/LATEST\/archive\/default/, 'itch publish job installs Butler on Ubuntu');
assert.match(yml, /publish-itch:[\s\S]*npm run itch:stage[\s\S]*npm run itch:preview[\s\S]*npm run itch:push/, 'itch publish job stages, previews, and pushes all channels');
assert.match(yml, /publish-prerelease:[\s\S]*needs: \[build, publish-itch\]/, 'GitHub mirror waits for itch publication');
assert.match(yml, /sha256sum "\$file" > "release-upload-assets\/\$name\.sha256"/, 'split release assets get checksum manifests');
assert.match(yml, /gh release delete-asset/, 'release upload clears stale beta assets before uploading current assets');
assert.ok(!tauri.bundle.targets.includes('nsis'), 'default Tauri bundle targets do not include NSIS');
assert.deepEqual(windowsTauri.bundle.targets, ['app'], 'Windows Tauri config avoids installer targets; release CI zips the portable app');
assert.match(yml, /Build Tauri bundles[\s\S]*if: matrix\.platform != 'ubuntu-22\.04'/, 'generic bundle build excludes Linux');
assert.match(yml, /Build Linux AppImage[\s\S]*--bundles appimage[\s\S]*Upload Linux AppImage[\s\S]*Reclaim Linux AppImage staging space[\s\S]*rm -rf src-tauri\/target\/release\/bundle\/appimage[\s\S]*Build Linux deb[\s\S]*--bundles deb[\s\S]*Upload Linux deb/, 'linux uploads and clears AppImage staging before building deb');
assert.match(yml, /Upload desktop bundles[\s\S]*if: matrix\.platform != 'ubuntu-22\.04'/, 'generic artifact upload excludes separately uploaded Linux bundles');
assert.match(yml, /libwebkit2gtk-4\.1-dev libayatana-appindicator3-dev/, 'linux runner installs current Tauri WebKit dependencies');
assert.match(yml, /Free Linux runner disk[\s\S]*\/usr\/share\/dotnet[\s\S]*docker system prune -af/,
  'linux release clears hosted-runner disk for reliable native packaging');
assert.doesNotMatch(yml, /actions\/cache\/restore@v4|actions\/cache\/save@v4|install_torch\.py|build_bundle\.py|lens-bundle-v2/,
  'the release workflow neither installs nor bundles Stable Diffusion');
assert.match(yml, /Verify delivered macOS DMG contents[\s\S]*find "\$unpack"[^\n]*-name '\*\.app'[\s\S]*npm run lean:verify --/,
  'CI inspects the delivered app; DMG-only Tauri packaging removes its intermediate app directory');
assert.match(yml, /Verify delivered macOS DMG contents[\s\S]*for dmg in "\$\{dmgs\[@\]\}"[\s\S]*hdiutil attach "\$dmg" -readonly -nobrowse[\s\S]*lean:verify[\s\S]*hdiutil detach/,
  'CI checks each delivered DMG through a read-only mount and detaches it');
assert.match(yml, /Verify lean Linux AppImage contents[\s\S]*--appimage-extract[\s\S]*lean:verify/,
  'CI extracts and scans Linux AppImages for forbidden SD payloads');
assert.match(yml, /Verify lean Linux deb contents[\s\S]*dpkg-deb -x[\s\S]*lean:verify/,
  'CI extracts and scans Linux Debian packages for forbidden SD payloads');
assert.match(yml,/for image in "\$\{images\[@\]\}"/,'every AppImage artifact is inspected');
assert.match(yml,/for deb in "\$\{debs\[@\]\}"/,'every Debian artifact is inspected');
const visualStep=yml.split('      - name: Run cross-platform visual smoke')[1]?.split('      - name: Upload visual parity captures')[0];
assert.ok(visualStep);assert.doesNotMatch(visualStep,/continue-on-error:\s*true/,'a failed cross-platform visual check blocks publication');
assert.match(yml, /actions\/upload-artifact@v4/, 'matrix jobs upload local bundles first');
assert.match(yml, /actions\/download-artifact@v4/, 'single release job downloads built bundles');
assert.match(yml, /name: Resolve release tag[\s\S]*id: tag[\s\S]*echo \"tag=\$tag\" >> \"\$GITHUB_OUTPUT\"/, 'release job resolves a publish tag before using steps.tag outputs');
assert.match(yml, /TAG: \${\{ steps\.tag\.outputs\.tag \}\}/, 'release publish steps consume the resolved tag output');
assert.match(yml, /gh release upload[\s\S]*--clobber/, 'single release job uploads all assets with clobber');
assert.match(yml, /gh release download[\s\S]*'\*\.dmg'[\s\S]*'\*\.zip'[\s\S]*'\*\.AppImage'[\s\S]*'\*\.deb'[\s\S]*'\*\.part-\*'[\s\S]*'\*\.sha256'/, 'release job verifies downloadable mac/windows/linux assets and split parts');
assert.match(yml, /Run cross-platform visual smoke[\s\S]*npm run test:feature-smoke[\s\S]*Upload visual parity captures/, 'each native build job captures the same visual regression path');
assert.match(yml, /Run cross-platform visual smoke[\s\S]*timeout-minutes: 10/, 'visual parity validation cannot hang a release runner indefinitely');
assert.match(yml, /FEATURE_SMOKE_TIMEOUT_MS: \$\{\{ matrix\.platform == 'ubuntu-22\.04' && '540000' \|\| '300000' \}\}/, 'Linux software rendering receives a bounded extended visual-smoke window');
assert.match(yml, /FEATURE_SMOKE_FRAME_TIMEOUT_MS: \$\{\{ matrix\.platform == 'ubuntu-22\.04' && '60000' \|\| matrix\.platform == 'windows-latest' && '30000' \|\| '10000' \}\}/, 'slow hosted renderers receive a bounded window to collect real performance samples');
assert.match(yml, /Run Windows native process tests[\s\S]*if: matrix\.platform == 'windows-latest'[\s\S]*cargo test --manifest-path src-tauri\/Cargo\.toml --all-targets/, 'windows native process tests are preserved');
assert.match(featureSmoke, /enable-unsafe-swiftshader/, 'linux visual parity explicitly enables Chromium software WebGL');
assert.match(featureSmoke, /fs\.rmSync\(output/, 'visual parity cannot upload stale captures after a failed boot');
assert.match(featureSmoke, /FEATURE_SMOKE_OUTPUT/, 'local smoke validation can write outside the tracked visual evidence directory');
assert.match(yml,/actions\/setup-python@v5[\s\S]*Install authored rasteriser test dependencies[\s\S]*python -m venv \.paper-venv/,
  'portable rasteriser tests have isolated build-time Python even though no Python is shipped');
assert.match(yml,/'Scripts\/python\.exe' if os\.name == 'nt' else 'bin\/python'/,
  'rasteriser setup resolves the correct interpreter on Windows and POSIX');
assert.match(yml,/Pillow==12\.3\.0[\s\S]*numpy==2\.3\.5[\s\S]*PAPER_PYTHON=[\s\S]*CHUNK_SURFER_LETTERING_PYTHON=/,
  'the same pinned authored rasterisers serve paper and physical lettering');
assert.match(yml, /npm ci/, 'release installs the exact locked frontend dependency graph');
assert.match(yml, /release-preflight\.mjs/, 'release validates source versions against its tag');
assert.doesNotMatch(yml, /args: --config src-tauri\/tauri\.lens\.conf\.json/, 'release matrix does not add any lens configuration');
assert.doesNotMatch(yml, /macOS Intel|x86_64-apple-darwin/, 'unsupported macOS Intel package is not built');
// The GPU sidecar packaging: `pip install torch` from the default index is a
// CPU-only wheel on Windows, which shipped a sidecar that reported no GPU on
// every Windows machine, and even the CUDA index needs cu128 for RTX 50-series
// (Blackwell). These assertions guard the whole chain that fixes it.
const torchInstaller = fs.readFileSync('tools/chunk_surfer/diffusion_server/install_torch.py', 'utf8');
const lensRequirements = fs.readFileSync('tools/chunk_surfer/diffusion_server/requirements-local.txt', 'utf8');
const buildBundle = fs.readFileSync('tools/chunk_surfer/diffusion_server/build_bundle.py', 'utf8');
const gpuSmoke = fs.readFileSync('.github/workflows/lens-gpu-smoke.yml', 'utf8');

assert.match(torchInstaller, /whl\/cu128/, 'torch installer targets the Blackwell-capable cu128 wheel index');
assert.match(torchInstaller, /torch>=2\.7/, 'torch floor is new enough for RTX 50-series kernels');
assert.match(torchInstaller, /Darwin[\s\S]*install\(\[TORCH_SPEC/, 'macOS gets the default-index MPS wheel, not a CUDA index');
// A bare `torch` line in requirements would let the default-index CPU wheel
// reinstall over the CUDA one. It must be the installer's job alone.
assert.doesNotMatch(lensRequirements, /^torch(vision)?(\s|>|=|<|$)/m, 'requirements must not list torch; install_torch.py owns it');
assert.match(lensRequirements, /^compel==2\.0\.3$/m, 'Compel is pinned as a mandatory long-prompt runtime dependency');
assert.match(buildBundle, /cuda_build is None[\s\S]*CPU-only torch wheel/, 'the bundler refuses to freeze a CPU-only wheel for a CUDA target');
assert.match(buildBundle, /import compel[\s\S]*"--collect-all",\s+"compel"/, 'the bundler validates and freezes Compel into the one-file sidecar');
assert.match(buildBundle, /runtimeSourceSha256[\s\S]*binarySha256/, 'the bundler stamps the exact runtime source and sidecar bytes');
assert.doesNotMatch(yml, /Install GPU-correct PyTorch|lens-bundle-v2-cu128/,
  'release CI does not prepare model weights or GPU PyTorch');
assert.match(gpuSmoke, /install_torch\.py[\s\S]*requirements-local\.txt/, 'the GPU smoke also installs torch from the correct index first');
assert.match(pkg.scripts['lens:setup'], /install_torch\.py/, 'local lens setup installs GPU-correct torch too');

const readme = fs.readFileSync('README.md', 'utf8');
assert.match(readme, /Chunk Surfer itch\.io page/, 'README presents itch as the public beta download path');
assert.match(readme, /GitHub Releases remain available as a developer mirror/, 'README demotes GitHub split assets to mirror status');
assert.doesNotMatch(readme, /Download the Latest Beta[\s\S]*concatenate the parts/, 'README no longer makes split-part concatenation the primary user path');
console.log('release workflow contract tests ok');
