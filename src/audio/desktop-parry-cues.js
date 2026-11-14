const towerPartials = [1, 1.51, 2.03, 2.41, 3.02];

function soundPartial(context, output, { type, from, to, level, seconds }) {
  const start = context.currentTime;
  const end = start + seconds;
  const voice = context.createOscillator();
  const envelope = context.createGain();
  voice.type = type;
  voice.frequency.setValueAtTime(from, start);
  voice.frequency.exponentialRampToValueAtTime(to, end);
  envelope.gain.setValueAtTime(.0001, start);
  envelope.gain.exponentialRampToValueAtTime(level, start + .019);
  envelope.gain.exponentialRampToValueAtTime(.0001, end);
  voice.connect(envelope).connect(output);
  voice.onended = () => { voice.disconnect(); envelope.disconnect(); };
  voice.start(start);
  voice.stop(end + .016);
}

// Main owns audio and schedules it with the same observable events that move
// the native object. Separate webviews never start their own transport.
export function playDesktopParryCue({ context, destination, theme, attackId, stage, playClip } = {}) {
  if (!context || !destination || context.state !== 'running' || theme === 'chapel') return;
  const audible = stage === 'open' || stage === 'hit' || stage === 'miss';
  if (!audible) return;
  if (theme === 'tower') {
    const fullPeal = attackId === 'cathedral:full-peal';
    if (stage === 'open' || stage === 'hit') {
      playClip?.(stage === 'open' ? 'rope-load-a' : 'iron-contact', {
        group: 'battle', gain: stage === 'open' ? .17 : .24, trimEnd: stage === 'open' ? .74 : .23,
      });
    }
    const base = fullPeal ? 198 : 143;
    const seconds = stage === 'miss' ? .96 : stage === 'hit' ? .14 : .28;
    const strength = stage === 'miss' ? .073 : stage === 'open' ? .038 : .019;
    towerPartials.forEach((ratio, index) => soundPartial(context, destination, {
      from: base * ratio, to: base * ratio * .995, seconds: seconds / (1 + index * .17),
      level: strength / (1 + index * .7), type: 'sine',
    }));
    return;
  }
  const base = theme === 'source-ii' ? 63 : theme === 'source-iii' ? 83 : 54;
  const movement = stage === 'open' ? 1.24 : stage === 'hit' ? 1.72 : .59;
  const seconds = stage === 'hit' ? .28 : stage === 'open' ? .53 : .64;
  for (const [ratio, level] of [[1, .072], [2.02, .028], [3.13, .013]]) {
    soundPartial(context, destination, {
      type: 'triangle', from: base * ratio, to: base * ratio * movement, seconds, level,
    });
  }
}
