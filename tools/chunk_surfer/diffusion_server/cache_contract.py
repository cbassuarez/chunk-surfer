"""Pure cache identity contract shared by the service and unit tests."""

from __future__ import annotations

import hashlib
import json

REQUEST_FIELDS = (
    "bankId", "slot", "frame", "prompt", "negative", "strength", "passes", "guidance",
    "seed", "size", "cacheSchema", "sourceAtlasSha256", "recipeSha256", "modelId",
    "depthScale", "depthSha256",
    # The second lens layer changes the picture, so it has to change the key.
    # Without this a dreamed bank would be written under the plain bank's name
    # and served back to a client that never asked for one.
    "dream",
)


def material_cache_key(*, work: dict, source_sha256: str, model_id: str,
                       resolution: int, weights_sha256: str | None,
                       service_revision: str, cache_schema: int) -> str:
    payload = {
        "schema": cache_schema,
        "rev": service_revision,
        "model": model_id,
        "size": resolution,
        "weights": weights_sha256,
        "request": {key: work.get(key) for key in REQUEST_FIELDS},
        "source": source_sha256,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(canonical).hexdigest()
