#!/usr/bin/env bash
set -euo pipefail
node --test test/visual-polish-contract.test.mjs 2>&1 | tee wave-3b-visual-polish.tap
