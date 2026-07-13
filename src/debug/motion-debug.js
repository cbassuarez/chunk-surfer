export function createMotionDebug({ input, loop, getMotion, getWorld }) {
  return {
    status() {
      return {
        input: input?.debugState?.() || null,
        loop: typeof loop === 'function' ? loop() : loop?.debugState?.() || null,
        motion: typeof getMotion === 'function' ? getMotion() : getMotion || null,
        world: typeof getWorld === 'function' ? getWorld() : getWorld || null,
      };
    },
  };
}
