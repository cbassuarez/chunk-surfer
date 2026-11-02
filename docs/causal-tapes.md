# Causal tape storage and ownership

`CausalTapeV1` is separate from the profile and ordinary story save. The profile keeps only a small compatibility descriptor plus THE HUSH terminal-reading progress. Prior-player recording concepts use `playerShadow`, `shadowFrames`, `shadowPlayback`, `causalTape`, and `causalAnchors` in identifiers and documentation.

The browser build stores the latest finalized tape, one draft, and one THE HUSH session in the dedicated `chunk-surfer-causal-v1` IndexedDB database. The desktop build stores versioned envelopes under the application-data `causal/` directory: `latest.json`, draft and sealed-draft files, and `session.json`. Desktop writes retain a previous-file recovery copy.

Export All Data includes the latest finalized tape and THE HUSH session. Delete All User Data removes finalized tapes, drafts, recovery copies, and sessions with the profile and saves. A future desktop cloud-sync implementation must sync `causal/latest.json` with its profile descriptor as one logical item, validate schema, topology, and checksum after download, and never merge frames from different tapes. Drafts and active sessions are device-local unless the sync system can provide atomic replacement and conflict invalidation.

No microphone stream or recorded audio buffer is accepted by this contract. Tapes contain semantic event identifiers, resolved presentation parameters, movement/look frames, and ordered state changes only.

Capture drafts now retain ordered events, observed anchors, the current pose
tail, presentation boundaries, elapsed simulation time and the committed pose
segment count. They checkpoint every five captured seconds and immediately
after an observed anchor. A normal application reload hydrates only the draft
whose run, topology and initial difficulty match. Actual input arriving during
hydration is buffered and replayed in order; elapsed wall time while the
application was absent is not recorded. Legacy drafts without this checkpoint
cannot recover events they never stored, and no replacement milestones are
invented for them.

One recorder-owned storage queue survives New Game, while per-night capture
sessions remain separate. Finalization reserves that night's whole seal and
promotion transaction before the next night can replace the shared draft.
Only committed segment counts are hydrated, so an interrupted append cannot
introduce duplicate or future movement. A sealed, eligible old return can earn
`ACH_SECOND_TRACK` and its derived `ACH_COMPLETE_ARCHIVE` after a newer run has
started; this never edits the newer run's ledger or eligibility.

The focused regression is `test/causal-return-races.spec.mjs`. Its supplied
capture and profile states are storage/progression fixtures, not normal-play
achievement witnesses. Normal reload retains the last completed checkpoint;
the ordinary save and causal draft are separate files, so a forced process or
power loss can still interrupt their last writes. Native storage timing and
uninterrupted earned-play acceptance remain separate validation work.

Topology `conservatory-night:v3` requires `spaceId` on every frame and anchor,
and observed causes appropriate to the completed route:

| Completed route | Required observed causes |
| --- | --- |
| Every route | Service threshold and B3 first slate |
| Full Source routes | Base causes plus practice-wing displacement, first reference and Source threshold |
| Chapel family: sacrifice, helped, inversion, drugged, surfaced | Full Source causes plus chapel contact |
| Tower or Contact family, including Source rest | Full Source causes |
| Century-stay sacrifice variant | Base causes; no unvisited Source or chapel causes |

Every route also requires the genuinely captured `run.finished` event whose
summary ID, run ID, ending ID and ending variant match the sealed tape. The
recorder receives this event from the existing production progression feed;
sealing never creates a substitute event. The route contract derives from
known endings and variants rather than a caller-supplied list. Optional
second-recording combat and legacy bell-row causes remain replayable if they
were observed, and do not become requirements for another branch. The three
injury ceiling remains unchanged.

Source frames use the recorded seed and state stream through a read-only
`CausalSpaceAdapter`; spatial matches require both locus and `spaceId`.
`test/causal-route-qualification.spec.mjs` covers the nine ending IDs, both
special variants, absent/foreign required causes, terminal ownership,
caller-list tampering and legacy rejection. Its supplied states prove the
contract and event/storage path, not ordinary route completion.

Earlier topology files may remain on disk for recovery history, but they cannot start THE HUSH. Invalidation never removes `ACH_SECOND_TRACK`. The title reports `SOURCE TAPE INCOMPATIBLE — FILE A NEW RETURN`, and sessions bound to a replaced or incompatible tape are discarded.
