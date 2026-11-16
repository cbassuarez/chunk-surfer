// Linux dev runs have no installed desktop entry, so GNOME (Wayland) cannot map
// the window's app ID "chunk-surfer" to an icon and shows a generic one.
// Installs a per-user entry and hicolor icons for the checkout's debug binary.
//   node scripts/linux-dev-desktop-entry.mjs           install / refresh
//   node scripts/linux-dev-desktop-entry.mjs --remove  uninstall
import {copyFile, mkdir, rm, writeFile, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import sharp from 'sharp';

if (process.platform !== 'linux') { console.error('Linux only.'); process.exit(1); }
const APP_ID = 'chunk-surfer'; // Wayland app_id / X11 WM_CLASS: the binary name.
const root = resolve(import.meta.dirname, '..');
const data = process.env.XDG_DATA_HOME || join(homedir(), '.local/share');
const entry = join(data, 'applications', `${APP_ID}.desktop`);
const icons = join(data, 'icons/hicolor');
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
const refresh = () => {
  spawnSync('update-desktop-database', [join(data, 'applications')], {stdio: 'ignore'});
  spawnSync('gtk-update-icon-cache', ['-f', '-t', icons], {stdio: 'ignore'});
};

if (process.argv.includes('--remove')) {
  await rm(entry, {force: true});
  for (const size of SIZES) await rm(join(icons, `${size}x${size}/apps/${APP_ID}.png`), {force: true});
  refresh();
  console.log('Removed the dev desktop entry and icons.');
  process.exit(0);
}

const master = join(root, 'src-tauri/icons/icon.png');
const available = new Set((await readdir(join(root, 'src-tauri/icons'))).filter(f => /^\d+x\d+\.png$/.test(f)));
for (const size of SIZES) {
  const dir = join(icons, `${size}x${size}/apps`); await mkdir(dir, {recursive: true});
  const target = join(dir, `${APP_ID}.png`), exact = `${size}x${size}.png`;
  // Prefer the per-size render; otherwise resample the 512 master.
  if (available.has(exact)) await copyFile(join(root, 'src-tauri/icons', exact), target);
  else await sharp(master).resize(size, size, {kernel: 'lanczos3'}).png().toFile(target);
}
await mkdir(join(data, 'applications'), {recursive: true});
await writeFile(entry, `[Desktop Entry]
Type=Application
Name=Chunk Surfer (dev)
Comment=Local checkout build
Exec=${join(root, 'src-tauri/target/debug/chunk-surfer')}
Icon=${APP_ID}
StartupWMClass=${APP_ID}
Categories=Game;
Terminal=false
`);
const check = spawnSync('desktop-file-validate', [entry], {encoding: 'utf8'});
if (check.error) console.warn('desktop-file-validate is not installed; skipped validation.');
else if (check.status !== 0 || check.stdout.trim()) { console.error(check.stdout || check.stderr); process.exit(1); }
refresh();
console.log(`Installed ${entry} and ${SIZES.length} hicolor icons. Restart the app (GNOME may need a log-out on first install).`);
