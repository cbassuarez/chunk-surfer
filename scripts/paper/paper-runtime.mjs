// Shared resolution for the paper toolchain's interpreters, without assuming
// any shell or operating-system layout. A repo-local .paper-venv is preferred
// (bin/ on POSIX, Scripts/ on Windows) so building paper never installs into
// anybody's global environment; the platform default python comes after that.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function paperVenvPython(root, platform = process.platform) {
  const candidates = platform === 'win32'
    ? [path.join(root, '.paper-venv', 'Scripts', 'python.exe')]
    : [path.join(root, '.paper-venv', 'bin', 'python')];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

export function paperPython(root, { env = process.env, platform = process.platform } = {}) {
  return env.PAPER_PYTHON || paperVenvPython(root, platform) || (platform === 'win32' ? 'python' : 'python3');
}

// `command -v` needs a shell on POSIX; Windows has its own where.exe. Either
// answer is only yes/no, and neither asks for a shell the build lacks.
export function commandExists(cmd, { platform = process.platform } = {}) {
  if (platform === 'win32') return spawnSync('where', [cmd], { stdio: 'ignore', shell: true }).status === 0;
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}
