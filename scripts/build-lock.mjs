#!/usr/bin/env node

// Serialise the builds that write and then read back the Vite `dist` tree.
//
// `vite build` empties `dist` and re-copies the whole asset tree. Tauri's
// `generate_context!` macro embeds that same tree when the native crate
// compiles. When two builds overlap, the second build can delete a file after
// the first build's embedder has listed it but before it reads it, and the
// first build dies with:
//
//   failed to read asset at .../dist/assets/....glb
//   because No such file or directory (os error 2)
//
// This wrapper gives the whole pipeline one mutex: a wrapped `tauri build`
// holds the lock across both its frontend build and its cargo compile, so a
// concurrent `npm run build` waits instead of wiping the tree out from under
// the embedder.
//
// Usage: node scripts/build-lock.mjs wrap -- <command> [args...]
//
// Re-entrancy: a wrapped build exports CHUNK_SURFER_BUILD_LOCKED=1 to its
// children, so `tauri build` (whose beforeBuildCommand runs `npm run build`,
// itself wrapped) does not deadlock. The outer wrapper owns the lock and
// releases it when the whole child tree has exited.
//
// The lock is `<repo>/.chunk-surfer-build.lock` holding the owner pid and the
// acquisition time. A lock whose owner process is gone, or that has been held
// for more than two hours, is treated as stale and taken over.

import { closeSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

const LOCK_ENV = 'CHUNK_SURFER_BUILD_LOCKED';
const STALE_MS = 2 * 60 * 60 * 1000;
const GIVE_UP_MS = 60 * 60 * 1000;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(repoRoot, '.chunk-surfer-build.lock');

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readLock() {
  try {
    const entry = JSON.parse(readFileSync(lockPath, 'utf8'));
    return Number.isInteger(entry.pid) && Number.isFinite(entry.startedAt) ? entry : null;
  } catch {
    return null;
  }
}

function takeStaleLock() {
  const entry = readLock();
  if (!entry) return;
  if (pidAlive(entry.pid) && Date.now() - entry.startedAt < STALE_MS) return;
  console.warn(
    `build-lock: ${lockPath} is stale (owner pid ${entry.pid} ${
      pidAlive(entry.pid) ? 'still alive but' : 'is gone,'
    } held since ${new Date(entry.startedAt).toLocaleTimeString()}); taking it over`,
  );
  rmSync(lockPath, { force: true });
}

let ownsLock = false;
function acquire() {
  if (process.env[LOCK_ENV]) return; // an outer wrapper owns the lock
  const deadline = Date.now() + GIVE_UP_MS;
  let lastNotice = 0;
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeFileSync(
        fd,
        JSON.stringify({ pid: process.pid, startedAt: Date.now(), command: process.argv.slice(3).join(' ') }),
      );
      closeSync(fd);
      ownsLock = true;
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (!readLock()) {
      // The owner just created the file and has not written it yet.
      sleep(250);
      continue;
    }
    takeStaleLock();
    if (Date.now() - lastNotice > 15000) {
      const entry = readLock();
      console.warn(
        `build-lock: another build is running (pid ${entry?.pid}, started ${
          entry ? new Date(entry.startedAt).toLocaleTimeString() : '?'
        }); waiting…`,
      );
      lastNotice = Date.now();
    }
    if (Date.now() > deadline) {
      console.error(
        `build-lock: gave up after waiting ${GIVE_UP_MS / 60000} minutes. If pid ${
          readLock()?.pid
        } is really gone, delete ${lockPath} and retry.`,
      );
      process.exit(1);
    }
    sleep(1000);
  }
}

let released = false;
function release() {
  if (released || !ownsLock) return;
  released = true;
  const entry = readLock();
  if (entry && entry.pid === process.pid) rmSync(lockPath, { force: true });
}

function waitChild(child) {
  return new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

async function wrap() {
  const [command, ...args] = process.argv.slice(3);
  if (!command) {
    console.error('Usage: node scripts/build-lock.mjs wrap -- <command> [args...]');
    process.exit(2);
  }
  acquire();
  process.env[LOCK_ENV] = '1';
  process.on('exit', release);

  let child = null;
  const forward = (signal) => {
    try {
      child?.kill(signal);
    } catch {
      // the child already exited
    }
  };
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);

  // Windows npm scripts expose tauri.cmd/npm.cmd, which spawn cannot resolve
  // without a shell; cmd.exe handles them. All wrapped args are simple enough
  // for cmd quoting.
  child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });
  let outcome = await waitChild(child);
  if (outcome.error) {
    if ((outcome.error.code === 'ENOENT' || outcome.error.code === 'EINVAL') && command === 'tauri') {
      // Fall back to the CLI's JavaScript entry point.
      child = spawn(
        process.execPath,
        [path.join(repoRoot, 'node_modules/@tauri-apps/cli/tauri.js'), ...args],
        { stdio: 'inherit', env: process.env },
      );
      outcome = await waitChild(child);
    } else {
      console.error(`build-lock: cannot run ${command}: ${outcome.error.message}`);
      release();
      process.exit(127);
    }
  }
  release();
  if (outcome.error) process.exit(127);
  if (outcome.signal) {
    process.removeAllListeners(outcome.signal);
    process.kill(process.pid, outcome.signal);
    return;
  }
  process.exit(outcome.code ?? 1);
}

if (process.argv[2] === 'wrap') await wrap();
else {
  console.error('Usage: node scripts/build-lock.mjs wrap -- <command> [args...]');
  process.exit(2);
}
