# chunk-surfer acceptance tests

Headless Chrome (puppeteer-core, driving the local `/Applications/Google Chrome.app`)
against `npm run dev`. Silence, noise and dread are invisible, so these assert on
**numbers**, not screenshots.

    npm run dev                       # localhost:5173
    node tools/chunk_surfer/tests/m3a.mjs

`puppeteer-core` is a devDependency, so a clean `npm i` is enough. (It once was
not, and four suites quietly stopped being runnable.)

| file | asserts |
|---|---|
| `m3a.mjs` | walking the building is silent (0 voices) · the monitor opens only while recording, 4 voices · a take accrues in quiet and spoils on noise · injury raises the noise floor · JUST SURF still plays all 24 voices |
| `verbs.mjs` | bare `f`/`r` (no modifier) · movement in all directions · moving or lighting mid-take spoils it rather than locking input |
| `pres.mjs` | **the presence targets the cell where noise was made, not the player** · silence makes it lose the target · one touch = one injury, never death |
| `stabs.mjs` | no stab in the quiet opening however safe you feel · TRUE stabs precede FALSE ones · threat suppresses stabs · cooldown is a hard floor · `reduceDread` silences them · pages set a waypoint |
| `prologue.mjs` | the cold open never advances by itself and has no `[esc]` · a `me` line is **offered** before it is spoken, even when there is one thing to say · the booth trunk you took decides which question the door asks you · the tutorial never takes a key away · the level check is a real take that costs nothing to spoil, and does not summon the presence |
| `thoughts.mjs` | `[r]` in studio B3 opens the first-take tree once, and rolling actually rolls · **the building does not wait**: the presence keeps closing while a thought tree is open (`blocksWorld: false`) · shaking the dead radio emits noise at the cell you stand in and pins it in the heard map |
| `m4.mjs` | the reader does not freeze the world but does stop your feet · the work order raises the client once and the second transmission kills the radio · a dead radio squelches, and the squelch is noise **at the cell you stand in**, and it spoils takes, and `reduceDread` silences it · **the tape contains what you did not hear**: the guest is a voice the monitor never passed, sealed once, identical on every replay · playback is silent in the room |
| `flicker.mjs` | adjacent-frame pixel delta with the camera still (regression: 1.54 → 0.36) |
| `fps.mjs` | lens throughput standing and moving (target 8–12fps) |
| `floorplan.mjs` | **pure Node.** heights round-trip into the texture the shader samples · rooms are never mutable · every stair riser is climbable by a body · bricked vs locked doors refuse you differently · the building is walkable spawn → chapel → back. `--map` prints reachability, which is how you find a silently impassable building |
| `mutate.mjs` | **pure Node.** the three disciplines, hammered over hundreds of forced mutations: rooms (and their walls) never move · spawn ↔ chapel connectivity survives every change · nothing changes in your lit view cone, at arm's reach, or where you made noise |

Four of these encode rules that are easy to erode and expensive to relearn: the
presence must hunt **sound**, a stab must never be **random**, the building's
**rooms must never move** (only its corridors may), and the recorder must never
lie about the room — it heard something, which is a different and worse claim
than being unreliable.

`m3a`, `verbs`, `pres` and `stabs` pin `?plan=testbed`. They test mechanism, and
mechanism should not break when a wall moves in the conservatory. `m4.mjs` runs
in the real building, because its subject is the content.

Flags a suite may need: `?skiptut=1` skips the cold open and the tutorial;
`?nothink=1` disarms the thought trees, which block input while they are open;
`?sam=0` uses the local formant fallback instead of fetching SAM from a CDN.

**Movement is sampled from held keys once a frame.** `keyboard.press()` sends a
keydown and keyup back to back, and a press that lands between two frames is
never seen — five presses walked two cells. To walk, hold the key down (see
`walkKey` in `prologue.mjs`). Keystrokes that are handled on the *event* (`f`,
`r`, `e`, `b`, `space`) are fine to press.

`floorplan.mjs` needs no dev server: it compiles the ASCII maps and asks the
same functions collision asks. The shader reads a texture built from that exact
array, so "does the drawn wall match the solid wall" is not a question the
engine can get wrong. It also checks that every one of the previous recordist's
pages lies somewhere a body can reach, which is the failure the building will
introduce silently the next time someone edits a wall.
