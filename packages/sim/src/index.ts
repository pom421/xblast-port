// Pure simulation: no DOM, no Node/Bun API, no Math.random, no Date.now.
// Every client and the server must compute exactly the same state from the
// same inputs (lockstep), so only integers and the seeded RNG are allowed.

/** Bumped whenever a change makes the simulation diverge from earlier versions. */
export const SIM_VERSION = 0;
