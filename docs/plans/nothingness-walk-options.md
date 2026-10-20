# The first nothingness: three ways to walk it

**Chosen: B, built 18 October 2026.** What shipped is recorded at the end of
`docs/plans/hanging-shore.md`. B's field stays paper; the four pieces are a
music stand, a radiator, a chair and a speaker cabinet.

18 October 2026. Rendered studies of all three, from the game's own renderer, are on the
canvas "Chunk Surfer — The First Nothingness". A research and design pass on the walk from the Scene Dock's FOH
door to Source proper (the Hanging Shore, `docs/plans/hanging-shore.md`). Seb:
"it's like 60s way too long, and nothing happens on the way." Three distinct
options follow, each covering length and duration, then atmosphere,
world-building and how much of the place answers back. None of them is built.

## Where it stands

- **Measured:** 374 m from the door to the lift deck, 77.9 s at the 4.8 m/s walk.
  Then the deck: up to 6 s to come down if it is up, 0.8 s to board, 6 s to rise
  4.2 m. Then about 12 m of cleft. Door to Source proper is roughly 90 s.
- **What the walk has now (as of today):** the door's white is the only reveal;
  the field is printed like everything else; 16 m out the Scene Dock is taken back
  over 9 s and HUSH is left standing where its door was; he follows. Footsteps,
  a fading room leak, the bank's metal return as you near it, the lift.
- **What is fixed whatever we pick:** HUSH behind you from the door, never
  closing in before the lift; the lift and the strata turn; reversible walking;
  no relocation of the body, no camera taken away.
- **What is pinned and would change:** `source-hanging-shore.spec` asserts the
  374 m and the 75–80 s. `SOURCE_HANGING_SHORE` places the bank, ledge and lift;
  everything in Source proper is placed relative to the bank, so moving the bank
  nearer moves nothing past it as long as Source proper's own origin moves with it.

## What the research says

**Empty time is not experienced as short.** The filled-duration illusion: an
interval broken into events is judged longer *in memory* than an empty one, but
the direction reverses while you are inside it and watching the clock (Wearden
& Ogden's review; the prospective/retrospective split). A player walking a void
with nothing to do is timing it prospectively, which is the worst case: it feels
long while it happens. Breaking it up with simple, regular events makes it feel
longer still in recall; complex events that take attention do not lengthen it,
and can shorten it. So "make it shorter" and "make something happen" are
separate levers, and the second one only helps if what happens asks for
attention rather than marking off intervals.

**Subtraction works when the emptiness is about something.** Fumito Ueda's
"design by subtraction" (Ico, Shadow of the Colossus) cuts everything that does
not serve one emotion; the long rides between colossi are read as the time the
hunt needs to sit with you, not as filler. The test is whether the emptiness has
a subject. Here it can: the walk is where the places visited so far turn out to
be small constructions inside a much larger absence.

**When the medium carries the length, length is fine.** The trolley ride into
the Zone in *Stalker* is 3 minutes 42 seconds across five shots; it reads as
short in distance and long in psychological time, and critics put that down to
the sound: ordinary clanking slowly turning into something else, Artemyev's
treatments stopping when the car stops. Kentucky Route Zero's river act takes
navigation away and runs on "river time"; even admirers note stretches where
nothing happens for a while. Both earn length through sound and through
removing agency. This walk keeps the player's agency, which pulls the other
way: The Chinese Room's *Everybody's Gone to the Rapture* was marked down for
its walking pace until people found the hidden sprint, and Fort Solis and
Paradise Lost drew the same complaint. Players accept long *rides*; they resent
long *walks* they cannot hurry.

**A landmark pulls the walk forward.** Disneyland's "weenie" (Cinderella's
castle as the beckoning hand), carried into level design by Scott Rogers: a
visible goal at altitude, lit, draws the body toward it and makes distance feel
purposeful. Journey does the same with its mountain. The bank already does
this; how early it reads, and how much of the walk it fills, sets how long the
walk feels.

**Something you can only sense through an instrument is very good at making
empty space dense.** Death Stranding's BTs are invisible; the Odradek's colour,
motion and sound encode distance and threat, and the player reads space through
the device. This game's equivalent instrument is the DA-1000.

**Sound gives empty space a shape.** R. Murray Schafer's terms are useful here:
a *keynote* (the constant background you stop noticing), *signals* (foreground
sounds that ask for attention) and *soundmarks* (the sound that belongs to one
place). The shore now has almost no keynote. That is the "nothing happens", as
much as the lack of objects.

**Empty transitional space is uncanny when it breaks how a place should work.**
Liminal-space writing (and Remedy's account of designing empty spaces for
Control) puts the dread in expectation failing, not in the emptiness itself:
corridors, stairwells and lobbies that do not do what they are for. A stretch of
nothing that behaves exactly like nothing is merely empty.

**Being watched by something that only moves under conditions.** SCP-173 and the
Weeping Angels make the observation rule the whole mechanic; SCP – Containment
Breach adds forced blinking so the rule cannot simply be satisfied. HUSH already
has his rules (late, never closing, yielding before the lift). Any option can
lean on them; none needs a new one.

## Option A — The threshold (short: about 20 seconds)

**Length and duration.** The lift deck moves in to about 100 m from the door:
21 s at the walk, about 30 s door to Source proper including the deck. The bank
reads from the doorway, so the walk has a goal from its first step. The room is
taken back at 16 m (3 s out); HUSH has come through by about 10 s, and the bank
fills the frame by 15 s. The walk becomes one beat: you leave, the room goes and
he is there, you reach the deck.

**Atmosphere.** Subtraction, done on purpose. One keynote, very low: the shore's
own air, a dry pressure in the ears that is there from the door and gone in the
cleft, so the void has a sound you stop noticing rather than none. The room's
leak is the only signal and goes with the room. The lift's mechanism is the
soundmark. The field prints as flat paper, as now; the bank is the only printed
mass in view.

**World-building.** None added. The meaning is the reveal itself: the room you
were in was a box standing in nothing, and it is gone.

**What answers back.** Only HUSH (yielding as he does now) and the torch on real
surfaces. Nothing to inspect.

**Cost.** Small. Move the bank, ledge and lift in `SOURCE_HANGING_SHORE`, update
the shore spec's pinned distance and time, check the take-back distance still
lands before the bank reads. Source proper is placed from the bank and does not
move relative to it.

**Risk.** The HUSH reveal, the bank and the deck arrive close together and may
crowd each other. The lift ride (about 7 s standing) becomes a quarter of the
whole sequence. If "nothing happens" was the real complaint, short only treats
the symptom.

## Option B — What the building leaves (medium: about 35 seconds)

**Length and duration.** Deck at about 170 m: 35 s walking, about 45 s door to
Source proper. Three or four things from the building stand in the void on and
off the line to the bank, about 40 m apart, so one is always coming into reach
and none of them falls on a regular beat.

**Atmosphere.** The things are pieces of the remembered building, printed in the
same dither, at their real size, standing on nothing: a music stand from the
practice floor, a radiator, a stretch of corridor skirting with a light switch,
a single seat from the hall. Each carries its room as a soundmark: its room tone,
very close, audible only inside a few metres, panned to where it stands, gone
once you pass. The field around them stays paper: a grain halo was rendered
and dropped, because the game's print draws a contour wherever the field's tone
crosses paper, and the halo read as a cloud. Keynote as in A.

**World-building.** This is the plan's stated idea made visible: the places so
far are local constructions inside a much larger absence, and out here their
pieces have come loose. Shown, not said (no lines, no paper to read). Pieces
already passed are gone when you look back; only HUSH and the bank stay.

**What answers back.** The torch prints them fully, and without it they are a
sparse grain. Walking up to one brings its room up around you for a moment.
Turning away and back, the one behind you has gone. HUSH walks past them and
does not look at them. Nothing to pick up, nothing gated.

**Cost.** Moderate. Bank to 170 m; a short authored list of pieces (positions,
mesh from the existing prop pack, a sound bed each from the existing room tones);
shore render already draws props through the shared pass; the take-back logic
reused to remove passed pieces when unobserved.

**Risk.** Done badly it becomes a museum walk: objects on plinths at intervals.
Keep them few, off-axis, at irregular spacing, and do not let them be inspected.

## Option C — The night played back (about 30 seconds, and the recorder hears it)

**Length and duration.** Deck at about 145 m: 30 s walking, about 40 s door to
Source proper. The walk is a stretch of tape: where you stand is a time, the way
the horizon score already works ("position IS time"). Walking toward the bank
rewinds the night you have recorded, at speed; arriving, the tape is at its
head, before your first take. Standing still stops the tape. Walking back plays
it forward.

**Atmosphere.** To the ear, the walk is nearly silent: the shore's air,
footsteps. To the DA-1000 it is full. The meter moves out here when there is
nothing to hear, and with the monitor up you hear your own takes from tonight
running backward, laid along the walk where you are, close and dry, thinning to
hiss as you near the bank. Without the monitor you hear only a trace of it at
the edge of hearing, enough to make you open the recorder. The field's grain
follows the meter: when the tape has sound in it, the paper stipples; when it
is silent, it is plain.

**World-building.** Source is what the recording was compressed from; this walk
is the recording going back to its source. It makes the recorder the only thing
that can perceive the place, the way the Odradek is the only thing that sees a
BT. HUSH is quiet to the ear and audible on the monitor: his footsteps are on
the tape, in time with his walk behind you.

**What answers back.** The tape (your position), the meter and the grain
(the tape's level), HUSH on the monitor. Stopping to listen costs nothing: the
tape waits. No objectives.

**Cost.** The largest. Bank to 145 m; a shore-specific playback of the take
store, reversed and time-mapped to distance (the horizon score's granular
player is the precedent); a fallback for a night with few or no takes (the
building's own recorded beds, run the same way); meter and monitor wiring in
the shore; the grain term driven by level.

**Risk.** Content varies with the player's night; a player who never opens the
recorder gets option A with a faint hiss. The reversed takes must not read as a
gimmick: keep them short, broken and low, never a clean rewind.

## Comparison

| | A threshold | B what the building leaves | C played back |
| --- | --- | --- | --- |
| Walk / door to Source proper | about 21 s / 30 s | about 35 s / 45 s | about 30 s / 40 s |
| What fills it | the reveal, the bank | pieces of the building, their rooms | your night, through the recorder |
| Printed field | flat paper | flat paper | hatches with the tape's level |
| Answers back | HUSH | torch, approach, unseen removal | position, meter, monitor, HUSH's steps |
| New authored content | none | 3–4 pieces, their soundmarks | playback mapping, fallback bed |
| Cost | small | moderate | large |

## Recommendation

C, if the walk is meant to be about the instrument; it makes the nothingness
dense only for someone who listens, which is this game's verb, and it gives the
place a meaning without a line of text. A is the safe choice and could ship
first: whichever option follows, the bank has to come in from 374 m, and A's
numbers are the floor for that move. B is the most legible to someone who never
opens the recorder.

## Sources

- Filled-duration illusion, prospective/retrospective reversal: [Wearden & Ogden, review (LJMU)](https://researchonline.ljmu.ac.uk/id/eprint/14949/); [PMC: empty and filled intervals](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9198236/); [SAGE: time illusion](https://sk.sagepub.com/ency/edvol/embed/time/chpt/time-illusion)
- Ueda, design by subtraction (secondary): [Blake Crosley](https://blakecrosley.com/es/blog/design-philosophy-fumito-ueda)
- Journey, feelings first and removing tasks: [Game Developer, Designing Journey](https://gamedeveloper.com/audio/video-designing-a-new-emotional-experience-in-i-journey-i-); [Giant Bomb preview](https://giantbomb.com/posts/climbing-mountains-of-beautiful-sand-in-journey)
- Stalker's trolley ride and its sound: [Offscreen, Totaro](https://offscreen.com/view/the-passion-of-the-zone-part-2); [JRFM](https://austria-forum.org/web-books/en/jrfm01de2020isds/000045)
- Kentucky Route Zero's river: [Haywire](https://haywiremag.com/columns/opened-world-kentucky-route-zero-act-iv/); [Kill Screen](https://www.killscreen.com/play-kentucky-route-zero-now-late/); [Nintendo World Report](https://www.nintendoworldreport.com/review/52747)
- Walking-sim pace complaints: [Game Informer on Rapture's sprint](https://gameinformer.com/b/news/archive/2015/08/11/the-chinese-room-explains-how-a-simple-ui-change-can-mess-up-reviews); [Kill Screen](https://killscreen.com/breaking-walking-simulator-features-run-button); [Fort Solis review](https://www.thesixthaxis.com/?p=442831); [Edge via PressReader](https://www.pressreader.com/australia/edge/20210422/283472144081268)
- The weenie: [Scott Rogers' GDC talk via Boing Boing](https://boingboing.net/2009/03/27/gamedesign-lessons-f.html/amp); [The Weenie](https://disneyblog.com/blog/the-weenie-walt-disneys-most-important-design-idea/)
- Death Stranding's scanner: [Wikipedia](https://en.wikipedia.org/wiki/Death_Stranding); [Shacknews](https://www.shacknews.com/article/114845/how-to-use-the-odradek-in-death-stranding)
- Schafer's keynote, signal, soundmark: [Open University](https://www.open.edu/openlearn/history-the-arts/introducing-music-research/content-section-7); [Soundscape](https://en.wikipedia.org/wiki/Soundscape)
- Liminal space: [Wikipedia](https://en.wikipedia.org/wiki/Liminal_space_(aesthetic)); [Remedy on empty spaces (summary)](https://feedbagel.com/post/control-resonants-creative-director-knows-why-youre-so-scared-of-backrooms)
- Observation-bound threats: [SCP-173](https://en.wikipedia.org/wiki/SCP-173); [Felix on Containment Breach](https://felixonline.co.uk/articles/2012-6-14-scp-173-personnel-kia-survivors-left-gruesomely-by-)
- Descent sound in Silent Hill 2: [Kill Screen](https://www.killscreen.com/basements-basement/)
