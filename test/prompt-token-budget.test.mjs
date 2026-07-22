import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { LOOK_PROFILES, LOOK_PROFILE_IDS } from '../src/render/look-profiles.js';
import { SURFACE_NAMES, SURFACE_PROMPT_DETAILS } from '../src/net/diffusion.js';
import {
  assembleSurfacePrompt, estimateClipTokens, PROMPT_TOKEN_BUDGET, SURFACE_SUFFIX,
} from '../src/net/prompt-budget.js';

// Mirrors surfacePrompt() in diffusion.js. If that assembly changes, this
// changes with it — the point is that the shipped string fits the window.
const assembled = (profileId, slot) => assembleSurfacePrompt({
  name: `seamless ${SURFACE_NAMES[slot]}`,
  detail: SURFACE_PROMPT_DETAILS[slot],
  style: LOOK_PROFILES[profileId].generation.prompt,
});

test('the estimator over-counts rather than under-counts', () => {
  assert.equal(estimateClipTokens(''), 2);
  // Long words cost more than one token, punctuation costs its own.
  assert.ok(estimateClipTokens('incomprehensibility') > estimateClipTokens('wall'));
  assert.ok(estimateClipTokens('a, b, c') > estimateClipTokens('a b c') - 1);
});

test('every shipped surface prompt fits the CLIP window with room to spare', () => {
  for (const profileId of LOOK_PROFILE_IDS) {
    for (let slot = 0; slot < SURFACE_NAMES.length; slot += 1) {
      const prompt = assembled(profileId, slot);
      const tokens = estimateClipTokens(prompt);
      assert.ok(tokens <= PROMPT_TOKEN_BUDGET,
        `${profileId} slot ${slot} is ~${tokens} tokens (budget ${PROMPT_TOKEN_BUDGET}): ${prompt}`);
      // The tail is the part CLIP drops first, and it is the part that keeps a
      // generated tile usable as a tiling albedo. It must be present.
      assert.ok(prompt.endsWith(SURFACE_SUFFIX), `${profileId} slot ${slot} lost its albedo tail`);
    }
  }
});

test('negatives and burst prompts also fit', () => {
  for (const profileId of LOOK_PROFILE_IDS) {
    const { negative, burst } = LOOK_PROFILES[profileId].generation;
    assert.ok(estimateClipTokens(negative) <= PROMPT_TOKEN_BUDGET, `${profileId} negative is too long`);
    if (burst) {
      assert.ok(estimateClipTokens(burst.prompt) <= PROMPT_TOKEN_BUDGET, `${profileId} burst prompt is too long`);
      assert.ok(estimateClipTokens(burst.negative) <= PROMPT_TOKEN_BUDGET, `${profileId} burst negative is too long`);
    }
  }
});

// The authoritative check, when a CLIP tokenizer happens to be installed. Skips
// silently everywhere else so the suite stays runnable without a GPU venv.
test('the real CLIP tokenizer agrees the prompts fit', (t) => {
  const script = `
import sys
try:
    from transformers import CLIPTokenizer
except Exception:
    sys.exit(3)
tok = CLIPTokenizer.from_pretrained("openai/clip-vit-large-patch14")
worst = 0
for line in sys.stdin.read().split("\\n"):
    if line:
        worst = max(worst, len(tok(line).input_ids))
print(worst)
`;
  const prompts = LOOK_PROFILE_IDS.flatMap((profileId) => (
    SURFACE_NAMES.map((_, slot) => assembled(profileId, slot))
  ));
  const result = spawnSync('python3', ['-c', script], { input: prompts.join('\n'), encoding: 'utf8' });
  if (result.error || result.status === 3 || result.status === null) {
    t.skip('transformers/CLIPTokenizer unavailable');
    return;
  }
  if (result.status !== 0) { t.skip(`tokenizer check unavailable: ${result.stderr?.slice(0, 120)}`); return; }
  const worst = Number(String(result.stdout).trim());
  assert.ok(worst > 0 && worst <= 77, `longest assembled prompt is ${worst} CLIP tokens`);
});
