import { useEffect, useRef } from 'react';
import { FACTORY_TYPES } from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';
import { createFactoryPixi, type FactoryPixi } from '../pixi/factoryRenderer.js';

export function FactoryView() {
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const factoryId = view.kind === 'factory' ? view.factoryId : null;

  const factoryTypeId = useGameStore((s) =>
    factoryId ? (s.world?.factories.find((f) => f.id === factoryId)?.typeId ?? null) : null,
  );
  const type = factoryTypeId ? FACTORY_TYPES[factoryTypeId] : null;
  const inputItem = type?.primaryInput?.item ?? null;
  const outputItem = type?.primaryOutput?.item ?? null;

  const inputCount = useGameStore((s) =>
    factoryId && inputItem
      ? (s.world?.factories.find((f) => f.id === factoryId)?.inputBuffers[inputItem] ?? 0)
      : 0,
  );
  const outputCount = useGameStore((s) =>
    factoryId && outputItem
      ? (s.world?.factories.find((f) => f.id === factoryId)?.outputBuffers[outputItem] ?? 0)
      : 0,
  );
  const foodBuffer = useGameStore((s) =>
    factoryId ? (s.world?.factories.find((f) => f.id === factoryId)?.foodBuffer ?? 0) : 0,
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!factoryId) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let pixi: FactoryPixi | null = null;

    void createFactoryPixi(container, factoryId).then((p) => {
      if (cancelled) {
        p.destroy();
        return;
      }
      pixi = p;
    });

    return () => {
      cancelled = true;
      pixi?.destroy();
    };
  }, [factoryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView({ kind: 'world' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView]);

  if (!factoryTypeId) return null;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#181d28',
        position: 'relative',
        color: '#e6e6e6',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          borderBottom: '1px solid #2c3344',
        }}
      >
        <button
          type="button"
          onClick={() => setView({ kind: 'world' })}
          style={{
            padding: '0.4rem 0.8rem',
            background: '#2a3042',
            color: '#e6e6e6',
            border: '1px solid #3a4258',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          ← Back to world (Esc)
        </button>
        <h2 style={{ margin: 0, fontSize: 16 }}>{type?.name ?? factoryTypeId}</h2>
        {type && (
          <span style={{ color: '#7a8294', fontSize: 13 }}>
            Inner {type.innerGrid.w}×{type.innerGrid.h}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 13 }}>
          {inputItem && (
            <div>
              <span style={{ color: '#7a8294' }}>{inputItem} in: </span>
              <span style={{ color: '#a4d97a', fontWeight: 600 }}>{inputCount}</span>
            </div>
          )}
          {outputItem && (
            <div>
              <span style={{ color: '#7a8294' }}>{outputItem} out: </span>
              <span style={{ color: '#fff066', fontWeight: 600 }}>{outputCount}</span>
            </div>
          )}
          {factoryTypeId !== 'farm' && (
            <div>
              <span style={{ color: '#7a8294' }}>food: </span>
              <span style={{ color: foodBuffer < 1 ? '#ff5555' : '#e0c060', fontWeight: 600 }}>
                {foodBuffer}
              </span>
            </div>
          )}
        </div>
      </div>
      <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
    </div>
  );
}
