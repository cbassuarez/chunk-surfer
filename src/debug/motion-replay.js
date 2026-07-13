export function runMotionReplay({ input, motion, loopStep, events, frameDt = 1 / 60 }) {
  const outputs = [];
  for (const event of events) {
    if (event.type === 'keydown') input.keyDown(event);
    if (event.type === 'keyup') input.keyUp(event);
    if (event.type === 'blur') input.reset('replay-blur');
    if (event.type === 'focus') input.reset('replay-focus');
    const steps = event.steps || 1;
    for (let i = 0; i < steps; i += 1) {
      loopStep(frameDt);
      outputs.push({
        x: motion.pos?.x,
        z: motion.pos?.z,
        vx: motion.vel?.x,
        vz: motion.vel?.z,
        yaw: motion.targetYaw,
        held: [...input.held],
      });
      input.endFrame();
    }
  }
  return outputs;
}
