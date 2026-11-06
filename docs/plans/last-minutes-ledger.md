# Collapse ledger

Stage 9 of `last-minutes.md`, run 2026-11-05. It tests lines by what they rule out, not
by what they fit. Each cell cites a line that keeps that mechanism alive. An empty cell
isn't a failure: not every component has to carry every mechanism.

## What was read

- **All 2,156 unique lines in `content/narrative`, plus 226 from the newer sources**
  (`memory-field`, `meaning-lines`, `DEAD_DOOR_LINES`, `whose-life`, `tower-warning`, the
  prologue), were screened by machine for ground-truth and causal language.
- **172 lines matched, and those were read by hand.**
- **Not read line by line:** the other roughly 2,200. A line that collapses a reading
  without using any screened word would have got past this. A person should do a straight
  read-through before release.
- **Not covered:** in-world papers and JS-only copy, except for a grep for "the Surfer /
  HUSH is/was".

## Lines changed

| Where | Was | Now | What it had ruled out |
|---|---|---|---|
| `conservatory.bent_rig` `solder.line.1` | "a joint a dead man left grey" | "the last man left grey" | Alan alive, which `surfaced` needs. Also the last man being him |
| `ending.sacrifice` `said.nothing` | "a dead man's four takes" | "the last man's four takes" | The same |
| `ending.inversion-start` `line.5` | "The only clock in this building that was ever real" | "that ever meant it" | Every other clock being a real clock, so a literal clean run |
| `battles.js`, `chapel-surfer` readings | "The Surfer was trained, not born supernatural." and two others | "You read him as trained, not born to it." and so on | Stated as fact. They are one choice among four in a fight, so they now read as his choice |

## Left alone, and why

| Line | Why it stays |
|---|---|
| `ending.contact-lost`: "Perhaps a man is dying somewhere ordinary... Perhaps there is no somewhere ordinary left... The recording cannot distinguish them." | This is the model for the whole game. It names the ground truth only as one of two |
| `ending.sacrifice`: "The seal was always a building coming down on a recordist" | It speaks inside its own ending, and endings are interpretations. **Your call:** "always" is the strongest claim left in the script |
| `ending.helped`: "It was real, and it was kind, and it was not enough" | The doctrine rules the guard's intervention human. `ending.helped` also offers "Or nothing at all, and he is a man who makes people a hot drink" |
| `ending.drugged`: "It could mean a man was drugged. It could mean a man was frightened..." | It holds both openly |
| `order.line.3`: "makes your entire rent payment this month" | A reason, not the reason. `post_door` offers others ("I want to hear that natatorium", "Nobody's expecting me till Thursday") |
| The other readings in `battles.js` ("The piano was never there.", "The music is a file.") | Each is one of several the player picks between under pressure. **Your call** whether they should all move to "you read it as" |

## Ledger

Mechanisms are columns. Rule 2 applies: nothing here appears in the game as an explanation.

| | His mind, in the van | Something in the building | Institution and people | Recording and signal | Him: memory, guilt |
|---|---|---|---|---|---|
| **Surfer** | "and yet i can't even remember my face" (`battle.chapel` round-5) | "my deal was always the conservatoire for your soul" (round-4) | "You came. Christ. They actually sent someone tonight." The guard's words, repeated (round-1, `cold_open` line.7-2) | "Correct the deviation. Again." (round-3) | "and yet i can't even remember your face" (round-5) |
| **HUSH** | "Your body remembers being watched more quickly than you remember who watched." (`hush` frame.memory) | "The room changes pressure behind your teeth." (opener.pressure) | | "Plastic settles. Metal contracts." (frame.equipment) | "Tired. Over-caffeinated. Listening too hard. Pick one." (frame.fatigue) |
| **Coffee** | "the empty cup is in the holder" (`ending.drugged` line.3), and now the cup on the dash in the first drive | | "There's coffee if you want it. I made too much." (`cold_open` line.8) | | "held on to the last thing anybody gave him" (`tape.cup` line.3) |
| **Guard** | "I would remember your van either way." (`torch.him.why`) | "He has been on this gate for years." (`epilogue.drugged`) | "He put something in a hot drink... a man on a gate with a hotplate" (`epilogue.helped`) | | "Or nothing at all, and he is a man who makes people a hot drink" (`ending.helped`) |
| **Doors** | "It isn't locked." "The handle's fine." (`DEAD_DOOR_LINES`) | "The chapel's own pair... Stone jambs and an arch that were never part of the chapel" (`door-field`) | "The account remains open." (`cold_open` order.last.open) | | "If only you could reach them." (`door-field` dock-door) |
| **Moon** | "It's gone red. That's dust." (`meaning-lines`) | "It hasn't moved all night." (`meaning-lines`) | | | "Good moon." (`meaning-lines`) |
| **The last man** (new row) | "You worked in here for a long time, and then one day you did not come back." (`whose-life`, b3-chair) | "it can simply carry on using him" (`ending.sacrifice`) | "His van was in the yard when I locked the gate, and gone by the time I opened it Friday." (`cold_open` guard.last.out) | "It had a very good take of my face." (`ending.surfaced`) | "Your job is clipped over your own unfinished leaving." (`whose-life`, clipboard) |

**Gaps worth filling:** the moon has no institutional or recording reading, and the coffee
has nothing supernatural. HUSH has no human face, by doctrine, and that one should stay
empty.

**New risk this stage added:** `whose-life` makes him claim a great deal late in the run.
Its one safeguard is that the narrator is unreliable by then. If strangers read those lines
as "so he was the last recordist all along", the check on the Surfer in Stage 10 will show
it, and the thresholds should go up.
