// CLIP's context is 77 tokens including the start/end markers. The server now
// carries compel, which chunks past that limit — but a prompt that needs
// chunking is a prompt whose tail the model weighs least, and the tail is where
// our tiling instructions live. So the client still writes to a budget: this
// module assembles surface prompts and estimates their cost before they leave.
//
// The estimate deliberately runs high. It is a guard rail, not a tokenizer:
// over-counting costs a few words of prompt, under-counting costs a silently
// truncated instruction and a texture that no longer tiles.

export const PROMPT_TOKEN_BUDGET = 66;

// BPE splits long and unusual words into several tokens; short common words are
// one. Seven characters per token is pessimistic for English prose, which is
// what we want. Punctuation and hyphens each buy their own token.
export function estimateClipTokens(text) {
  const value = String(text || '').trim();
  if (!value) return 2; // <|startoftext|> <|endoftext|>
  let tokens = 2;
  for (const word of value.split(/\s+/)) {
    const bare = word.replace(/[^A-Za-z0-9]/g, '');
    tokens += 1 + Math.max(0, Math.ceil((bare.length - 7) / 4));
    tokens += (word.match(/[,.;:()\-/]/g) || []).length;
  }
  return tokens;
}

export function withinBudget(text, budget = PROMPT_TOKEN_BUDGET) {
  return estimateClipTokens(text) <= budget;
}

// The tail that makes a generated image usable as a tiling albedo. Compressed
// from four clauses to three phrases: every word here has to survive.
export const SURFACE_SUFFIX = 'seamless tile, flat albedo texture, even light';

export function assembleSurfacePrompt({ name, detail, style, suffix = SURFACE_SUFFIX }) {
  // Order is load-bearing. CLIP weighs the front of the sequence most, so the
  // material noun leads, its own detail follows, and the profile's mood sits
  // ahead of the technical tail.
  return [name, detail, style, suffix].filter(Boolean).join(', ');
}
