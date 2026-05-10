import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FACTORY_TYPES, MACHINE_TYPES, machineStations } from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';
import { createFactoryPixi, type FactoryPixi } from '../pixi/factoryRenderer.js';
import { Workshop } from '../components/Workshop.js';

export function FactoryView() {
  const view = useGameStore((s) => s.view);
  const setView = useGameStore((s) => s.setView);
  const factoryEditMode = useGameStore((s) => s.factoryEditMode);
  const setFactoryEditMode = useGameStore((s) => s.setFactoryEditMode);
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
  const foodBuffer = useGameStore((s) => {
    if (!factoryId) return 0;
    const f = s.world?.factories.find((f) => f.id === factoryId);
    if (!f) return 0;
    return Object.values(f.foodInventory ?? {}).reduce((sum, v) => sum + v, 0);
  });
  const factory = useGameStore((s) =>
    factoryId ? (s.world?.factories.find((f) => f.id === factoryId) ?? null) : null,
  );
  const isOperational =
    factory !== null &&
    !factory.demolish &&
    factory.construction.complete &&
    factory.siteClearing.length === 0;

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
      if (e.key !== 'Escape') return;
      if (useGameStore.getState().factoryEditMode.kind !== 'none') {
        setFactoryEditMode({ kind: 'none' });
      } else {
        setView({ kind: 'world' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setView, setFactoryEditMode]);

  if (!factoryTypeId) return null;
  const isEditingInput =
    factoryEditMode.kind === 'move-bay' && factoryEditMode.side === 'W';
  const isEditingOutput =
    factoryEditMode.kind === 'move-bay' && factoryEditMode.side === 'E';
  const isPlacingMachine = factoryEditMode.kind === 'place-machine';
  const placingType = isPlacingMachine
    ? MACHINE_TYPES[factoryEditMode.machineTypeId]
    : null;

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
            Inner {type.innerGrid.w}×{type.innerGrid.h} (10:1)
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

      {factoryTypeId !== 'farm' && (
        <div
          style={{
            padding: '6px 16px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            borderBottom: '1px solid #2c3344',
            background: 'rgba(255,255,255,0.02)',
            fontSize: 13,
          }}
        >
          <span style={{ color: '#7a8294', fontSize: 12, marginRight: 4 }}>EDIT</span>
          <button
            type="button"
            onClick={() =>
              setFactoryEditMode(
                isEditingInput ? { kind: 'none' } : { kind: 'move-bay', side: 'W' },
              )
            }
            style={{
              padding: '0.3rem 0.65rem',
              background: isEditingInput ? '#3a5a8a' : '#2a3042',
              color: '#e6e6e6',
              border: `1px solid ${isEditingInput ? '#5a7aaa' : '#3a4258'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {isEditingInput ? '✓ Click a perimeter tile' : 'Move input bay (blue)'}
          </button>
          <button
            type="button"
            onClick={() =>
              setFactoryEditMode(
                isEditingOutput ? { kind: 'none' } : { kind: 'move-bay', side: 'E' },
              )
            }
            style={{
              padding: '0.3rem 0.65rem',
              background: isEditingOutput ? '#8a5a3a' : '#2a3042',
              color: '#e6e6e6',
              border: `1px solid ${isEditingOutput ? '#aa7a5a' : '#3a4258'}`,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {isEditingOutput ? '✓ Click a perimeter tile' : 'Move output bay (orange)'}
          </button>
          {isPlacingMachine && placingType && (
            <span
              style={{
                padding: '0.3rem 0.65rem',
                background: '#3a6a4a',
                color: '#e6e6e6',
                border: '1px solid #5aaa6a',
                borderRadius: 4,
                fontSize: 13,
              }}
            >
              ✓ Placing {placingType.name} — click an interior tile
            </span>
          )}
          {factoryEditMode.kind !== 'none' && (
            <span style={{ color: '#7a8294', fontSize: 11, marginLeft: 8 }}>
              Esc to cancel.
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={containerRef} style={{ flex: 1, position: 'relative' }} />
        {factoryTypeId !== 'farm' && factory && isOperational && (
          <div
            style={{
              width: 300,
              borderLeft: '1px solid #2c3344',
              background: 'rgba(20, 25, 36, 0.85)',
              padding: 14,
              overflowY: 'auto',
              color: '#e6e6e6',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <WorkersPanel factoryId={factory.id} />
            <Workshop
              factoryTypeId={factory.typeId}
              machines={factory.machines}
              inputBuffers={factory.inputBuffers}
              onStartPlacing={(typeId) =>
                setFactoryEditMode({ kind: 'place-machine', machineTypeId: typeId })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

function WorkersPanel({ factoryId }: { factoryId: string }) {
  const factory = useGameStore((s) =>
    s.world?.factories.find((f) => f.id === factoryId) ?? null,
  );
  // useShallow caches the filtered array so the snapshot is stable across
  // re-reads in the same render — without it, .filter() returns a fresh array
  // every getSnapshot call and React's useSyncExternalStore loops infinitely.
  const innerWorkers = useGameStore(
    useShallow((s) =>
      s.world?.workers.filter(
        (w) => w.role === 'inner' && w.assignedFactoryId === factoryId,
      ) ?? [],
    ),
  );
  const farmFood = useGameStore((s) =>
    (s.world?.factories ?? []).reduce(
      (sum, f) =>
        f.typeId === 'farm'
          ? sum + (f.outputBuffers['grain'] ?? 0) + (f.outputBuffers['food'] ?? 0)
          : sum,
      0,
    ),
  );
  const addInnerWorker = useGameStore((s) => s.addInnerWorker);
  const removeInnerWorker = useGameStore((s) => s.removeInnerWorker);

  if (!factory) return null;
  const operationalMachines = factory.machines.filter((m) => m.status === 'operational');
  const totalStations = operationalMachines.reduce((sum, m) => {
    const t = MACHINE_TYPES[m.typeId];
    return sum + (t ? machineStations(t) : 0);
  }, 0);
  const current = innerWorkers.length;
  const canAdd = current < totalStations && farmFood >= 1 && operationalMachines.length > 0;
  const canRemove = current > 1;

  // Per-machine occupancy
  const loadByMachine = new Map<string, number>();
  for (const m of operationalMachines) loadByMachine.set(m.id, 0);
  for (const w of innerWorkers) {
    if (w.targetMachineId && loadByMachine.has(w.targetMachineId)) {
      loadByMachine.set(w.targetMachineId, (loadByMachine.get(w.targetMachineId) ?? 0) + 1);
    }
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: '#7a8294', marginBottom: 4 }}>WORKERS</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => removeInnerWorker(factoryId)}
          disabled={!canRemove}
          title={canRemove ? 'Fire latest worker' : 'At least one worker required'}
          style={stepperBtn(canRemove)}
        >
          −
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
          {current} / {totalStations}
        </div>
        <button
          type="button"
          onClick={() => addInnerWorker(factoryId)}
          disabled={!canAdd}
          title={
            current >= totalStations
              ? 'All stations occupied'
              : farmFood < 1
                ? 'No food at any farm to hire'
                : 'Hire (consumes 1 food)'
          }
          style={stepperBtn(canAdd)}
        >
          +
        </button>
      </div>
      {operationalMachines.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
          {operationalMachines.map((m) => {
            const t = MACHINE_TYPES[m.typeId];
            if (!t) return null;
            const stations = machineStations(t);
            const load = loadByMachine.get(m.id) ?? 0;
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '2px 6px',
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 3,
                }}
              >
                <span>{t.name}</span>
                <span style={{ color: load >= stations ? '#a4d97a' : '#7a8294' }}>
                  {load} / {stations}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function stepperBtn(enabled: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 26,
    background: enabled ? '#2a3042' : '#1a1f2c',
    color: enabled ? '#e6e6e6' : '#5a6378',
    border: `1px solid ${enabled ? '#3a4258' : '#2c3344'}`,
    borderRadius: 4,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: 14,
    lineHeight: 1,
  };
}
