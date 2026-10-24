// NUKE ALL SD INSTANCES, for the browser build (the God menu's LOOK STACK ›
// Stable diffusion). A page cannot end processes, so the dev server does it on
// the page's behalf. It ends every copy of this game's lens: the dev lens server
// from any checkout (tools/chunk_surfer/diffusion_server) and every chunk-lens
// sidecar, whichever build left it running. Each keeps a diffusion model
// resident, which is exactly what a no-SD baseline must not include, and that
// includes a lens another agent started from this repo. A diffusion server that
// is not this game's is reported, never touched. `?dry=1` only reports.
//
// Dev only (`apply: 'serve'`), POST only, and it demands a custom header, so a
// cross-origin page would need a CORS preflight the dev server will not grant.
// The desktop shell has the same rule in src-tauri/src/lens_service.rs.
import { execFileSync } from 'node:child_process';

const OUR_LENS_SERVER = /chunk_surfer\/diffusion_server\/server\.py/;
const ANY_LENS_SERVER = /diffusion_server\/server\.py/;
const SIDECAR = /(^|\/)chunk-lens(\s|$)/;

export function lensProcesses({ ps = () => execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }) } = {}) {
  const found = { ours: [], foreign: [] };
  for (const line of ps().split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) continue;
    const pid = Number(match[1]), command = match[2];
    if (pid === process.pid || !ANY_LENS_SERVER.test(command) && !SIDECAR.test(command)) continue;
    const ours = SIDECAR.test(command) || OUR_LENS_SERVER.test(command);
    (ours ? found.ours : found.foreign).push({ pid, path: command.slice(0, 240) });
  }
  return found;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

export async function nukeLensProcesses({ graceMs = 1500, ps } = {}) {
  const { ours, foreign } = lensProcesses(ps ? { ps } : {});
  const killed = [];
  for (const entry of ours) {
    try { process.kill(entry.pid, 'SIGTERM'); killed.push(entry); } catch { /* already gone */ }
  }
  if (killed.length) await new Promise((resolve) => setTimeout(resolve, graceMs));
  for (const entry of killed) if (alive(entry.pid)) { try { process.kill(entry.pid, 'SIGKILL'); entry.forced = true; } catch { /* gone */ } }
  return { stoppedManaged: false, killed, foreign };
}

export function lensDevControl() {
  return {
    name: 'chunk-lens-dev-control',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__chunk/lens/nuke', async (req, res) => {
        const origin = req.headers.origin;
        let sameOrigin = !origin;
        if (origin) { try { sameOrigin = new URL(origin).host === req.headers.host; } catch { sameOrigin = false; } }
        if (req.method !== 'POST' || req.headers['x-chunk-dev-control'] !== '1' || !sameOrigin) {
          res.statusCode = 403; res.end('forbidden'); return;
        }
        res.setHeader('content-type', 'application/json');
        const dry = new URL(req.url || '/', 'http://dev').searchParams.has('dry');
        try {
          if (dry) { const { ours, foreign } = lensProcesses(); res.end(JSON.stringify({ dry: true, running: ours, killed: [], foreign })); }
          else res.end(JSON.stringify(await nukeLensProcesses()));
        }
        catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error?.message || error), killed: [], foreign: [] })); }
      });
    },
  };
}
