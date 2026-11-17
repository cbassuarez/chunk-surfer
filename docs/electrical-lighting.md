# Ordinary electrical light

Ordinary fittings resolve a normalized supply envelope and a lamp response in
`src/game/electrical-lighting.js`. Emergency red and the disconnected Hall
chandelier keep their existing directors. Breaker ownership still comes from
the saved conservatory power state.

`src/data/electrical-fixtures.js` assigns physical fittings a lamp technology:

- `fluorescent`: sharp extinction, hot restart after short cuts, and seeded,
  irregular full-strength strike attempts after longer interruptions.
- `led`: regulated output, 60 ms hold-up, and a 160 ms restart with separate
  dropout/recovery thresholds.
- `incandescent`: voltage-sensitive brightness and warmth, with only a short
  filament rise/afterglow. No generic smoothing is applied to other lamps.

Optional `fault: 'contact'` interrupts that fitting's input. `fault: 'ballast'`
interrupts its optical output while the supply remains live. Bursts use unequal
23–173 ms cuts, unequal returns, and long quiet intervals. They are seeded by
run, fitting and time window, not randomized per frame. `quiet: [low, high]`
sets the interval between bouts. A profile can also specify `style: '...a-z...'`
and `hz` (default 10); `a` is dark and `m` is nominal.

The authored supply phases are S/P-01 and S/P-04 on A, S/P-02 and S/P-05 on B,
and S/P-03 on C. `electrical.phase` can override a fitting's assignment. This
is separate from the existing narrative `light.phase` field. Independent and
maintained sources do not inherit these building supply disturbances.

Automatic atmosphere schedules occasional circuit sags/swells and rare temporary
phase losses or upstream recloser sequences. It never creates permanent
lockout, changes saved breaker positions, or advances gameplay. Explicit scene
faults support `contact`, `sag`, `swell`, `outage`, `phase-loss`, `neutral` and
`recloser`. A recloser accepts `intervals`, `closedSeconds` and `lockout`.

For a developer review in the running building:

```js
window.__probe.electricalLightingReview([
  {type: 'phase-loss', phase: 'B', delay: 2, duration: 3},
]);
window.__probe.electricalLightingReview([
  {type: 'recloser', delay: 2, intervals: [.85, 2.7], lockout: true},
]);
window.__probe.electricalLightingReview([]); // Clear directed faults.
```

These stage temporary presentation state; they do not restore a dead gameplay
circuit. A fixture still needs its real breaker on. Reduced/off flash settings
present steady ordinary light while preserving that breaker gate.

Supply and lamp timelines are compiled from event edges and sampled by absolute
seconds. Scrubbing, changing frame rate, or querying adjacent rooms cannot change
the event history. Bounded caches retain recent fixture windows. The resolver
returns the same power/color for illumination and emissive material, including
fittings outside the active lighting slot budget.
