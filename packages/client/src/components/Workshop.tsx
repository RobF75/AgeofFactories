import { useState } from 'react';
import { MACHINE_TYPES, compatibleMachineTypes, type Machine } from '@aof/shared';

export function Workshop({
  factoryTypeId,
  machines,
  inputBuffers,
  onStartPlacing,
}: {
  factoryTypeId: string;
  machines: Machine[];
  inputBuffers: Record<string, number>;
  onStartPlacing: (typeId: string) => void;
}) {
  const compatible = compatibleMachineTypes(factoryTypeId);
  const [pickedMachineTypeId, setPickedMachineTypeId] = useState<string>('');
  const effectivePicked =
    pickedMachineTypeId && compatible.some((c) => c.id === pickedMachineTypeId)
      ? pickedMachineTypeId
      : (compatible[0]?.id ?? '');
  const pickedType = effectivePicked ? (MACHINE_TYPES[effectivePicked] ?? null) : null;
  const canBuild =
    pickedType !== null &&
    Object.entries(pickedType.buildCost).every(
      ([item, amt]) => (inputBuffers[item] ?? 0) >= amt,
    );

  return (
    <div>
      <div style={{ fontSize: 12, color: '#7a8294', marginBottom: 4 }}>WORKSHOP</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {machines.length === 0 && (
          <div style={{ fontSize: 11, color: '#5a6378' }}>No machines yet.</div>
        )}
        {machines.map((m) => {
          const t = MACHINE_TYPES[m.typeId];
          if (!t) return null;
          const isBuilding = m.status === 'building';
          const pct = isBuilding
            ? Math.round((m.buildProgress / t.buildTicks) * 100)
            : Math.round((m.cycleProgress / t.recipe.ticksPerCycle) * 100);
          const stalled = !isBuilding && m.cycleProgress >= t.recipe.ticksPerCycle;
          return (
            <div
              key={m.id}
              style={{
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 6px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 3,
              }}
            >
              <span style={{ flex: 1 }}>{t.name}</span>
              <span
                style={{
                  color: isBuilding ? '#e0c060' : stalled ? '#ff7a7a' : '#a4d97a',
                  fontWeight: 600,
                }}
              >
                {isBuilding ? `building ${pct}%` : stalled ? 'stalled (no input)' : `${pct}%`}
              </span>
            </div>
          );
        })}
      </div>
      {pickedType ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            value={effectivePicked}
            onChange={(e) => setPickedMachineTypeId(e.target.value)}
            style={{
              flex: 1,
              padding: '0.35rem 0.5rem',
              background: '#1a1f2c',
              color: '#e6e6e6',
              border: '1px solid #2c3344',
              borderRadius: 4,
              fontSize: 13,
            }}
          >
            {compatible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onStartPlacing(effectivePicked)}
            disabled={!canBuild}
            title={
              canBuild
                ? `Pick a tile inside the factory. Costs ${Object.entries(pickedType.buildCost)
                    .map(([i, a]) => `${a} ${i}`)
                    .join(', ')}`
                : `Needs ${Object.entries(pickedType.buildCost)
                    .map(([i, a]) => `${a} ${i}`)
                    .join(', ')} in input buffer`
            }
            style={{
              padding: '0.4rem 0.7rem',
              background: canBuild ? '#2a4a6a' : '#252830',
              color: canBuild ? '#e6e6e6' : '#5a6378',
              border: `1px solid ${canBuild ? '#3a5a8a' : '#3a4258'}`,
              borderRadius: 4,
              cursor: canBuild ? 'pointer' : 'not-allowed',
              fontSize: 13,
            }}
          >
            Place…
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#5a6378' }}>No compatible machine types yet.</div>
      )}
      {pickedType && (
        <div style={{ fontSize: 11, color: '#7a8294', marginTop: 6 }}>
          Cost:{' '}
          {Object.entries(pickedType.buildCost)
            .map(([i, a]) => `${a} ${i}`)
            .join(', ')}{' '}
          · build {Math.round(pickedType.buildTicks / 20)}s ·{' '}
          {Object.entries(pickedType.recipe.inputs)
            .map(([i, a]) => `${a} ${i}`)
            .join(', ')}{' '}
          →{' '}
          {Object.entries(pickedType.recipe.outputs)
            .map(([i, a]) => `${a} ${i}`)
            .join(', ')}{' '}
          per {Math.round(pickedType.recipe.ticksPerCycle / 20)}s
        </div>
      )}
    </div>
  );
}
