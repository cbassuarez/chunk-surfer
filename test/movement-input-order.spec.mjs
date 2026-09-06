import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { InputManager } from '../src/input/input-manager.js';

const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('the input manager refuses a key another handler already claimed', () => {
  // This rule is correct and is the reason the ordering below matters.
  const input = new InputManager();
  input.keyDown({ code: 'KeyW', defaultPrevented: true });
  assert.equal(input.held.has('KeyW'), false, 'a defaultPrevented press is not recorded');
  input.keyDown({ code: 'KeyW' });
  assert.equal(input.held.has('KeyW'), true, 'an unclaimed press is');
});

test('onKey records a movement key BEFORE it prevents its default', () => {
  // THE BUG THIS EXISTS TO CATCH. Both movement branches called
  // `e.preventDefault()` and then, when worldCanTrackMotion was false, fell back
  // to `motionInput.keyDown(e)` — which the manager ignores, because by then the
  // event was defaultPrevented by US one line earlier. The key was never held,
  // and the player pressed forward and did not move.
  const onKey = main.slice(main.indexOf('function onKey(e){'), main.indexOf('function onKeyUp('));
  assert.ok(onKey.length > 0, 'found onKey');

  // In every branch that has a fallback keyDown, the fallback must come first.
  const fallback = /if\(!worldCanTrackMotion\) motionInput\.keyDown\(e\);/g;
  let match;
  let seen = 0;
  while ((match = fallback.exec(onKey))) {
    seen += 1;
    // The nearest preventDefault before this fallback must not be inside the
    // same branch — practically: the 200 characters before it must be free of
    // a bare `e.preventDefault();` statement.
    const before = onKey.slice(Math.max(0, match.index - 200), match.index);
    const lastBranch = before.lastIndexOf('if(');
    const window = lastBranch >= 0 ? before.slice(lastBranch) : before;
    assert.equal(/e\.preventDefault\(\);/.test(window), false,
      `fallback #${seen} is preceded by preventDefault in the same branch`);
  }
  assert.ok(seen >= 2, `both movement branches keep their fallback (found ${seen})`);
});
