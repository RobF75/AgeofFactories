import { useGameStore } from '../state/gameStore.js';

const TICK_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;

export function startSimLoop(): () => void {
  let stopped = false;
  let last = performance.now();
  let acc = 0;

  const step = (now: number) => {
    if (stopped) return;
    acc += now - last;
    last = now;
    while (acc >= TICK_MS) {
      useGameStore.getState().applyTick();
      acc -= TICK_MS;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  return () => {
    stopped = true;
  };
}
