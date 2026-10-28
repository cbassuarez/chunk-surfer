#!/usr/bin/env bash
set -u
mkdir -p wave-3a-logs
fail=0
for file in \
  test/outskirts-render.spec.mjs \
  test/opening-bed-handoff-contract.test.mjs \
  test/shut-door-answer.spec.mjs \
  test/visual-polish-contract.test.mjs \
  test/chunk-surf-visual.spec.mjs \
  test/paper-pigment.spec.mjs; do
  name=${file#test/}
  echo "=== $name ==="
  if node --test --test-reporter=tap "$file" > "wave-3a-logs/$name.tap" 2>&1; then
    grep -E '^# (tests|pass|fail|cancelled|skipped) ' "wave-3a-logs/$name.tap" | tail -5
  else
    fail=$((fail+1))
    grep -E '^not ok |^# (tests|pass|fail|cancelled|skipped) |^# (Error|AssertionError|ReferenceError)' "wave-3a-logs/$name.tap" | tail -20
  fi
done
printf '\nFiles still failing: %d\n' "$fail"
exit "$((fail>0))"
