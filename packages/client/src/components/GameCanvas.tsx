import { useGameStore } from '../state/gameStore.js';
import { WorldView } from '../views/WorldView.js';
import { FactoryView } from '../views/FactoryView.js';

export function GameCanvas() {
  const view = useGameStore((s) => s.view);
  return view.kind === 'world' ? <WorldView /> : <FactoryView />;
}
