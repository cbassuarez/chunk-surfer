# chunk-surfer acceptance tests

Headless Chrome (puppeteer-core, driving the local `/Applications/Google Chrome.app`)
against `npm run dev`. Silence, noise and dread are invisible, so these assert on
**numbers**, not screenshots.

    npm run dev                       # localhost:5173
    npm i -D puppeteer-core           # once
    node tools/chunk_surfer/tests/m3a.mjs

| file | asserts |
|---|---|
| `m3a.mjs` | walking the building is silent (0 voices) · the monitor opens only while recording, 4 voices · a take accrues in quiet and spoils on noise · injury raises the noise floor · JUST SURF still plays all 24 voices |
| `verbs.mjs` | bare `f`/`r` (no modifier) · movement in all directions · moving or lighting mid-take spoils it rather than locking input |
| `pres.mjs` | **the presence targets the cell where noise was made, not the player** · silence makes it lose the target · one touch = one injury, never death |
| `stabs.mjs` | no stab in the quiet opening however safe you feel · TRUE stabs precede FALSE ones · threat suppresses stabs · cooldown is a hard floor · `reduceDread` silences them · pages set a waypoint |
| `flicker.mjs` | adjacent-frame pixel delta with the camera still (regression: 1.54 → 0.36) |
| `fps.mjs` | lens throughput standing and moving (target 8–12fps) |
| `floorplan.mjs` | **pure Node.** heights round-trip into the texture the shader samples · rooms are never mutable · every stair riser is climbable by a body · bricked vs locked doors refuse you differently · the building is walkable spawn → chapel → back. `--map` prints reachability, which is how you find a silently impassable building |
| `mutate.mjs` | **pure Node.** the three disciplines, hammered over hundreds of forced mutations: rooms (and their walls) never move · spawn ↔ chapel connectivity survives every change · nothing changes in your lit view cone, at arm's reach, or where you made noise |

Three of these encode rules that are easy to erode and expensive to relearn:
the presence must hunt **sound**, a stab must never be **random**, and the
building's **rooms must never move** (only its corridors may).

`floorplan.mjs` needs no dev server: it compiles the ASCII maps and asks the
same functions collision asks. The shader reads a texture built from that exact
array, so "does the drawn wall match the solid wall" is not a question the
engine can get wrong.
