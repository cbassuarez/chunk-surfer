# dataset/ — what the lens is going to learn

Put images in `roomtone/`. They are **gitignored**: they are somebody else's
photographs, and this repository is not where they go.

```
dataset/roomtone/0001.jpg
dataset/roomtone/0001.txt      # optional caption, short, describes the SUBJECT
dataset/roomtone/0002.jpg
...
```

Train locally:

```
.venv-local/bin/python train_lora.py
LENS_STYLE_LORA=./roomtone.safetensors ./run-local.sh
```

## The only rule that matters

**A LoRA learns the intersection of your images.** Everything the pictures have
in common gets folded into the trigger word; everything they differ in gets
ignored. So they must share exactly the thing you want and differ in everything
else. Thirty photographs of one corridor teach it *that corridor* — not the
register.

**Want:** empty institutional interiors. Water damage, stained plaster, peeling
paint, dust, boarded windows, dead fluorescent tubes, drained pools, stacked
chairs, wet concrete, condemned schools and hospitals and swimming baths.
Underexposed. Single-source or flash-lit. Grainy. The P.T. lie: a real room,
photographed badly, wrong in a way you cannot name.

**Avoid** — and this list is not fussiness, the model will paint every one of
these into your game for free:

- **People. Any. Ever.** This is the same rule as the negative prompt, and it is
  the most important line in this file. A cast introduced by a sampler is not a
  cast. One image with a figure at the end of a hallway is enough to teach the
  lens to put figures at the ends of hallways.
- Daylight, blue skies, windows blowing out to white.
- Saturated colour. Anything that reads as "urbex photography with a grade".
- Tidy renovated rooms; wide-angle real-estate interiors.
- Watermarks, borders, logos, text.

80–150 good images is plenty. 300 good ones beat 1000 mixed. **One bad image does
more damage than fifty good ones do good.**

## Captions

Short, and describe what **varies** — the subject — never what is **constant** —
the style. "drained swimming pool, tiled" is a good caption. "dark grimy
underexposed drained swimming pool, dread, film grain" is a bad one: it hands the
model an excuse to attribute the register to those words instead of folding it
into the trigger, and then the LoRA does nothing that the prompt was not already
doing.

No caption at all is fine, and often better. The trainer falls back to the bare
trigger word, and 10% of samples train on the trigger alone regardless — which is
what stops the style leaking into every prompt you ever write.

## Then

Put the trigger (`rmtn style`) at the **front** of each zone prompt in
`src/net/zone-prompts.js`, and re-sweep the knobs: a style LoRA changes where the
guidance cliff is, and the numbers in the README were measured without one.
