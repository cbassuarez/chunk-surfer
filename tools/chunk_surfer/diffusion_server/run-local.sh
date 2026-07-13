#!/bin/sh
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PY="$HERE/.venv-local/bin/python"

if [ ! -x "$PY" ]; then
  echo "local lens environment missing" >&2
  echo "run: python3.12 -m venv $HERE/.venv-local" >&2
  echo "then: $HERE/.venv-local/bin/pip install -r $HERE/requirements-local.txt" >&2
  exit 1
fi

export LENS_HOST=127.0.0.1
export LENS_PORT="${LENS_PORT:-8000}"
export LENS_MODEL="${LENS_MODEL:-sd15-hyper4}"
export LENS_SIZE="${LENS_SIZE:-256}"
# ControlNet is the expensive half on this Mac. Opt back in explicitly when
# testing geometry fidelity: LENS_DEPTH=1 npm run lens:local
export LENS_DEPTH="${LENS_DEPTH:-0}"
export PYTORCH_ENABLE_MPS_FALLBACK=1

echo "chunk-surfer local lens · $LENS_MODEL · ${LENS_SIZE}px · depth=$LENS_DEPTH · ws://$LENS_HOST:$LENS_PORT"
exec "$PY" "$HERE/server.py"
