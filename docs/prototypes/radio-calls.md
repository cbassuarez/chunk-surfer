# Radio calls

Incoming story calls offer a 24-second answer window during gameplay. A short
carrier scratch/hiss repeats every 4.2 seconds, and the existing control rail
shows ANSWER RADIO. V or the bound controller radio button accepts the call.
Picking up a deployed set only picks it up; it does not answer automatically.

Incoming calls do not open scenes, stop movement, or block a room take. Accepted
calls use the existing instrument panel, glass, item portrait and illuminated
buttons. The accepted conversation still owns its readable choices and pause
behavior. The separate hand-drawn radio presentation has been removed.

An unanswered call expires without dialogue, story choices, or equipment-failure
outcomes. It cannot replay after pickup or reload. Lowering an answered call
retires the remainder; a technical presentation failure can retry.

After a miss, 90 seconds of active traversal can offer Martin's worried check-in.
Answering another call or making an outgoing call cancels the unoffered reminder.
The concern call can be offered only once per run. Pause and unavailable input
do not consume an offered answer window; saved calls retain the remaining time.

- **Do Not Disturb:** let the concern call expire unanswered.
- **Radio Silence:** finish a run without answering, transmitting, deploying the
  radio, or using it in combat. Carrying it and inspecting the bag do not count.

Usage lives in the run ledger and survives saves. Runs begun before tracking was
introduced cannot establish Radio Silence eligibility from missing history.

Validation:

```
node --test test/radio-*.spec.mjs test/progression-pure.spec.mjs test/hud-field-deck.spec.mjs
GAME_URL=http://127.0.0.1:5214 node tools/chunk_surfer/verify-radio-inbound.mjs
```

The browser check uses the production bundle, a disposable run, shortened timer
fixtures and a simulated controller. The completion hook verifies achievement
persistence; it does not claim an earned full playthrough or native hardware QA.
