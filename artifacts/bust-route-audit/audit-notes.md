# Current bust-route evidence

The current stable5297 audit contains 13 raw native renderer captures and 17 local checks: 14 pass, three hall-related checks fail, and the browser records no JavaScript or GL errors. Production files and shaders were unchanged. Chrome is closed.

The hall failures describe one inaccessible handoff. The exit was never reached, so the subsequent E press cannot establish a separate exit-handler defect. The final tower crossing uses a diagnostic approach and proves that local threshold mechanism; it is not a natural recovery from the broken hall.

## What the fresh run establishes

- Bell passage: actual D/A movement changes position from (0,-4184) to (13,-4184), then back to (2,-4184), with phase `bells` retained. Architecture, ring, service corridor, and tower threshold are real current captures.
- Seed4417: 17 tower-field doors, two keys, and a lock-in door. Actual E opens each key, actual W starts each crossing, and both keys become durably erased. `towerKeyAnswers` records both IDs and the tower route door becomes `unlocked:true`. No audio listening was performed.
- Actual lock-in walking advances progress to .28591398 after the first held movement segment, subsequently completes, and sets `station.lockIn.seen`. The active land becomes `school-hall`.
- Broken school-hall handoff: after that natural transition the body is (-7,-4631) cells, while the hall door is (50,-3711.6). The37 submitted hall props occupy z=-1883..-1854.6m; the body's z is -2315.5m. The frame contains rain and a ground/torch patch, rather than the school hall. The initial actual W movement remains at (-7,-4631). A bounded attempt toward the exit only walks in the wrong bell-space area and stops at (-7,-4336); it cannot reach the hall.
- The lock-in door `source-tower-door-2` has `wrong:true`. Main's existing released-crossing cleanup invokes `putBackWrong`, consistent with the observed body relocation. This is an inference from the live snapshot plus source, additional to the separately audited stale hall coordinates/bell-boundary clamp.
- After a diagnostic approach to the already unlocked tower door, actual W enters the real belfry: phase `completed`, finale route `tower`, stage `cathedral`, physical belfry coordinates x18,y72.5, eight bells, alarm1. Combat and defeat/retry were not played.

## Representative images

| Beat | Exact file | Evidence status |
|---|---|---|
| Optional bust in unravelling | `/Users/seb/chunk-surfer/artifacts/source-unravelling/after/bust.png` | October11 pre-room-memory build; full head visible. Fresh current01-bust crop cuts the head, so use the older image with its date. |
| Bell architecture | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/02-bell-architecture.png` | Current; close large bell/frame composition. |
| Bell ring | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/03-bell-ring.png` | Current; sparse, dark physical ring. |
| Service door field | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/04-service-door-field.png` | Current; physical doors, rails, and rain. |
| Locked tower threshold | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/05-tower-locked.png` | Current; before the key crossings. |
| First key crossing | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/06-key-1-crossing.png` | Current actual E/W; shader world6, not proof of a walkable hall. |
| Lock-in world | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/08-lock-in-world.png` | Current actual E/W; separate shader school-hall picture and visible distant way out. |
| Natural hall handoff failure | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/09-school-hall-natural-entry.png` | Current; hall state active but its geometry is far from the body. |
| Unlocked tower threshold | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/11-tower-unlocked-threshold.png` | Current diagnostic approach after the hall failure; hall-active state suppresses normal field props, so this frame is contaminated by that bug. |
| Real belfry arrival | `/Users/seb/chunk-surfer/artifacts/bust-route-audit/current/12-belfry-arrival.png` | Current actual W crossing, torch on. |

## Prior evidence and remaining gaps

`artifacts/source-room-memories/live.json` is the current first-lift→grey-door proof:30 captures,99/99 checks, no GL errors, including actual fake touch and real E/W crossing into `horizon`. It ends at the telephone-walk entrance.

`artifacts/source-unravelling/after/live.json` (October11 20:12) verifies the continuous street/splat overlap, monotonic attained loss, retained loss on retreat, actual lateral movement and waiting, standing decay, paused clock, optional bust presence, and actual default continuation into chapel outskirts. Its depth comparisons use diagnostic warps and it predates the latest room-memory build; it is not a complete telephone route playthrough.

`artifacts/source-route/live/report.json` (September12) verifies real bust dialogue acceptance and held walking along the revealed path into bells, plus Source-contact warning/combat entry. Those captures are older than the current route and rendering changes; they are useful historical evidence, not current acceptance.

The full intended hall→tape→broadcast→ash→hall detour, boy/recordist exchange, ordered bell errand, playable tape reward, reward-dependent cathedral advantage, hall save/reload, and complete combat/retry remain unverified by this audit. Only `school-hall` is currently present in the runtime land registry; the four other T4 stages must not be inferred from the separate shader glimpses behind ordinary field doors. Listening, native-window acceptance, and an earned end-to-end playthrough were not tested.
