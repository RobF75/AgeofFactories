import { useGameStore } from '../state/gameStore.js';

export function TickOverlay() {
  const tick = useGameStore((s) => s.world?.tick);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        zIndex: 10,
        color: '#7a8294',
        fontSize: 11,
        background: 'rgba(20, 25, 36, 0.5)',
        padding: '3px 6px',
        borderRadius: 4,
        pointerEvents: 'none',
        fontFamily: 'monospace',
      }}
    >
      tick {tick ?? '—'}
    </div>
  );
}
