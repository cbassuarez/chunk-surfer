# Causal tape storage and ownership

`CausalTapeV1` is separate from the profile and ordinary story save. The profile keeps only a small compatibility descriptor plus THE HUSH terminal-reading progress. Prior-player recording concepts use `playerShadow`, `shadowFrames`, `shadowPlayback`, `causalTape`, and `causalAnchors` in identifiers and documentation.

The browser build stores the latest finalized tape, one draft, and one THE HUSH session in the dedicated `chunk-surfer-causal-v1` IndexedDB database. The desktop build stores versioned envelopes under the application-data `causal/` directory: `latest.json`, draft and sealed-draft files, and `session.json`. Desktop writes retain a previous-file recovery copy.

Export All Data includes the latest finalized tape and THE HUSH session. Delete All User Data removes finalized tapes, drafts, recovery copies, and sessions with the profile and saves. A future desktop cloud-sync implementation must sync `causal/latest.json` with its profile descriptor as one logical item, validate schema, topology, and checksum after download, and never merge frames from different tapes. Drafts and active sessions are device-local unless the sync system can provide atomic replacement and conflict invalidation.

No microphone stream or recorded audio buffer is accepted by this contract. Tapes contain semantic event identifiers, resolved presentation parameters, movement/look frames, and ordered state changes only.

Topology `conservatory-night:v2` requires `spaceId` on every frame and anchor plus the eight authored spine causes: service threshold, B3 first slate, second recording, first complete reference, practice-wing displacement, Source threshold, bell row, and chapel contact. Source frames use the recorded seed and state stream through a read-only `CausalSpaceAdapter`; spatial matches require both locus and `spaceId`.

Earlier topology files may remain on disk for recovery history, but they cannot start THE HUSH. Invalidation never removes `ACH_SECOND_TRACK`. The title reports `SOURCE TAPE INCOMPATIBLE — FILE A NEW RETURN`, and sessions bound to a replaced or incompatible tape are discarded.
