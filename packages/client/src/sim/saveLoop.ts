import type { WsClient } from '../net/ws.js';
import { useGameStore } from '../state/gameStore.js';

const SAVE_INTERVAL_MS = 30_000;

export function startSaveLoop(wsClient: WsClient): () => void {
  const intervalId = window.setInterval(() => {
    const world = useGameStore.getState().world;
    if (world) wsClient.saveState(world);
  }, SAVE_INTERVAL_MS);
  return () => window.clearInterval(intervalId);
}
