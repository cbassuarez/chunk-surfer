#!/usr/bin/env node

import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Inspect *shipped package trees*, never the repository. Keeping local SD
// weights and Python environments is intentional, including on CI for its
// separate lens-gpu-smoke workflow.
const MODEL_FILE = /\.(?:safetensors|ckpt|pt|pth|onnx|onnx_data|gguf)$/i;
const MODEL_BINARY = /^(?:diffusion_)?pytorch_model(?:-\d+-of-\d+)?\.bin$/i;
const LENS_BINARY = /^chunk-lens(?:-[^/]*)?(?:\.exe)?$/i;
const LENS_RESOURCE = /^lens(?:-resources)?$/i;
const PYTHON_RUNTIME = /^(?:python(?:[\d.]+)?(?:\.exe|\.dll|\.framework|\.zip)?|libpython[\d.]+(?:\.so(?:\.[\d.]+)?|\.dylib))$/i;
const MODEL_RUNTIME = /^(?:lib)?(?:torch(?:_cpu|_cuda|_python|_global_deps)?|c10(?:_cuda)?|cudnn[^/]*|cublas[^/]*)(?:\.so(?:\.[\d.]+)?|\.dylib|\.dll)$/i;
const RUNTIME_DIRECTORY = /^(?:\.venv|venv|site-packages|torch|torchvision|torchaudio|diffusers|transformers|huggingface_hub|diffusion_server|python[\d.]+|Python\.framework)$/i;

function forbiddenName(name, directory = false) {
  return LENS_BINARY.test(name) || LENS_RESOURCE.test(name) ||
    (directory ? RUNTIME_DIRECTORY.test(name) :
      MODEL_FILE.test(name) || MODEL_BINARY.test(name) || PYTHON_RUNTIME.test(name) || MODEL_RUNTIME.test(name));
}

export function findForbiddenLensFiles(root) {
  const found = [];
  if (!existsSync(root) || !lstatSync(root).isDirectory()) throw new Error(`No package directory: ${root}`);
  const boundary = realpathSync(root);
  const walk = (dir, parts = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name))) {
      const relativeParts = [...parts, entry.name];
      const relative = relativeParts.join('/');
      if (entry.isSymbolicLink()) {
        // macOS framework Versions/Current links and Linux library links are
        // valid within the delivered package. Never traverse host paths, and
        // never let an innocuous alias hide a forbidden runtime or weight.
        const target = path.resolve(dir, readlinkSync(path.join(dir, entry.name)));
        let resolved;
        try { resolved = realpathSync(target); }
        catch { found.push(relative + ' (unresolved symlink)'); continue; }
        const targetRelative = path.relative(boundary, resolved);
        if (targetRelative === '..' || targetRelative.startsWith('..' + path.sep) || path.isAbsolute(targetRelative)) {
          found.push(relative + ' (external symlink)');
          continue;
        }
        if (forbiddenName(entry.name, true) || forbiddenName(entry.name) ||
            targetRelative.split(path.sep).some((name) => forbiddenName(name, true) || forbiddenName(name))) found.push(relative);
        // Every internal canonical target is visited by the ordinary tree
        // walk. Not following aliases also makes ancestor/cyclic links safe.
        continue;
      }
      if (entry.isDirectory()) {
        if (forbiddenName(entry.name, true)) {
          found.push(relative + '/');
          continue;
        }
        walk(path.join(dir, entry.name), relativeParts);
      } else if (forbiddenName(entry.name)) found.push(relative);
    }
  };
  walk(boundary);
  return found;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const directories = process.argv.slice(2);
  if (!directories.length) {
    console.error('Usage: npm run lean:verify -- <extracted-package-directory> [...]');
    process.exit(2);
  }
  let rejected = false;
  for (const dir of directories) {
    const forbidden = findForbiddenLensFiles(dir);
    if (forbidden.length) {
      rejected = true;
      console.error(`INVALID lean bundle ${dir}: ${forbidden.join(', ')}`);
    } else console.log(`Lean bundle verified: ${dir}`);
  }
  if (rejected) process.exitCode = 1;
}
