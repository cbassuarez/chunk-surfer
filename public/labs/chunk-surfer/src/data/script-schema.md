# Dialogue script format

Prose lives here, never in engine code. Files are plain JS so you can use
template literals, comments, and trailing commas. Edit and refresh — no build.

```js
export const dialogue = {
  'usher.intro': {
    speaker: 'THE USHER',
    portrait: 'usher.neutral',      // src/render/portraits.js
    register: 'straight',           // straight | ironic | decay | exhausted
    if: '!metUsher',                // optional condition (see below)
    lines: [
      'you came in through the fog again.',
      { direction: 'the usher does not look up. the usher never looks up.' },
      { text: 'there is a "you" in this story.', if: 'sawTheDoor' },
    ],
    choices: [
      { text: 'ask who "you" is', goto: 'usher.who', set: ['askedWho'] },
      { text: 'say nothing', goto: 'usher.silence',
        aside: 'the game expected this' },   // shown only in `ironic` register
    ],
    set: ['metUsher'],              // applied when the node finishes
    clear: ['lost'],
    effects: ['fx:glitch'],         // see effect handlers in main.js
    goto: 'usher.after',            // used when there are no choices
  },
};
```

## Lines
- `'string'` or `{ text }` — spoken; typewritten at the player's text speed.
- `{ direction }` — a visible stage direction, rendered in a different colour.
  This is the Brechtian channel: the game narrating its own conventions.
- Any line may carry `if`.

## Registers
| register | behaviour |
|---|---|
| `straight` | plain |
| `ironic` | choices show their `aside` in the margin, critiquing themselves |
| `decay` | on each revisit one more line is struck through and not spoken; the portrait loses resolution |
| `exhausted` | (M5) the typewriter completes your choice before you pick it |

## Conditions (`if`)
`flag` · `!flag` · `keys>=3` · `a && b` · `a || b`.
Numbers compare with `> >= < <= == !=`.

## Effects
Strings dispatched to the effect handler:
`fx:glitch` `fx:shake` `fx:flash` · `battle:<id>` · `warp:<x>,<y>` ·
`lens:<preset>` · `give:<item>`

## Interpolation
`{steps}` `{minutes}` `{runs}` are substituted from real play data — the save
file is a diegetic object. "{steps} steps. mostly in circles."
