import { useEffect } from 'react';
import { FACTORY_TYPES } from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';

export function BuildMenu() {
  const view = useGameStore((s) => s.view);
  const buildMode = useGameStore((s) => s.buildMode);
  const setBuildMode = useGameStore((s) => s.setBuildMode);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBuildMode({ kind: 'none' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setBuildMode]);

  if (view.kind !== 'world') return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        background: 'rgba(20, 25, 36, 0.92)',
        border: '1px solid #2c3344',
        borderRadius: 6,
        padding: 12,
        minWidth: 200,
        color: '#e6e6e6',
      }}
    >
      <div style={{ fontSize: 12, color: '#7a8294', marginBottom: 8, letterSpacing: 0.5 }}>
        BUILD
      </div>
      {Object.values(FACTORY_TYPES).map((t) => {
        const active = buildMode.kind === 'place-factory' && buildMode.typeId === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              setBuildMode(active ? { kind: 'none' } : { kind: 'place-factory', typeId: t.id })
            }
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '0.4rem 0.6rem',
              background: active ? '#3a4a6a' : '#2a3042',
              color: '#e6e6e6',
              border: `1px solid ${active ? '#5a6a8a' : '#3a4258'}`,
              borderRadius: 4,
              cursor: 'pointer',
              marginBottom: 4,
            }}
          >
            {t.name}{' '}
            <span style={{ color: '#7a8294', fontSize: 11 }}>
              {t.baseFootprint.w}×{t.baseFootprint.h}
            </span>
          </button>
        );
      })}
      {buildMode.kind === 'place-factory' && (
        <p style={{ fontSize: 12, color: '#7a8294', margin: '8px 0 0' }}>
          Click a tile to place. Esc to cancel.
        </p>
      )}
    </div>
  );
}
