import { useState } from 'react';
import {
  FACTORY_TYPES,
  MACHINE_TYPES,
  MAX_WORKER_TIER,
  MEALS_TO_PROMOTE,
  compatibleMachineTypes,
  countTreesInFootprint,
  foodForTier,
} from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';

const buttonStyle: React.CSSProperties = {
  padding: '0.4rem 0.8rem',
  background: '#2a3042',
  color: '#e6e6e6',
  border: '1px solid #3a4258',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
};

const stepperBtn: React.CSSProperties = {
  width: 28,
  height: 26,
  background: '#2a3042',
  color: '#e6e6e6',
  border: '1px solid #3a4258',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
};

export function FactoryInfoPanel() {
  const view = useGameStore((s) => s.view);
  const selectedFactoryId = useGameStore((s) => s.selectedFactoryId);
  const factory = useGameStore((s) =>
    selectedFactoryId
      ? (s.world?.factories.find((f) => f.id === selectedFactoryId) ?? null)
      : null,
  );
  const seed = useGameStore((s) => s.world?.seed ?? 0);
  const assignedHaulerCount = useGameStore((s) =>
    selectedFactoryId
      ? s.world?.workers.filter(
          (w) => w.role === 'hauler' && w.assignedFactoryId === selectedFactoryId,
        ).length ?? 0
      : 0,
  );
  const setView = useGameStore((s) => s.setView);
  const selectFactory = useGameStore((s) => s.selectFactory);
  const setDesiredWorkers = useGameStore((s) => s.setDesiredWorkers);
  const beginDemolish = useGameStore((s) => s.beginDemolish);
  const cancelDemolish = useGameStore((s) => s.cancelDemolish);
  const buildMachine = useGameStore((s) => s.buildMachine);
  const promoteInnerWorker = useGameStore((s) => s.promoteInnerWorker);
  const innerWorker = useGameStore((s) =>
    selectedFactoryId
      ? (s.world?.workers.find(
          (w) => w.role === 'inner' && w.assignedFactoryId === selectedFactoryId,
        ) ?? null)
      : null,
  );
  const [pickedMachineTypeId, setPickedMachineTypeId] = useState<string>('');

  if (view.kind !== 'world' || !factory) return null;
  const type = FACTORY_TYPES[factory.typeId];
  if (!type) return null;

  const isFarm = factory.typeId === 'farm';
  const isDemolishing = factory.demolish !== null;
  const isSiteClearing = factory.siteClearing.length > 0;
  const isConstructing = !factory.construction.complete && !isSiteClearing;
  const cost = type.constructionCost?.amount ?? 0;
  const received = factory.construction.received;
  const constructionPct = cost > 0 ? Math.round((received / cost) * 100) : 100;
  const totalTrees = countTreesInFootprint(
    seed,
    factory.worldX,
    factory.worldY,
    type.baseFootprint.w,
    type.baseFootprint.h,
  );
  const cleared = totalTrees - factory.siteClearing.length;
  const demolishPct = factory.demolish
    ? Math.round((factory.demolish.progress / factory.demolish.total) * 100)
    : 0;

  const inputItem = type.primaryInput?.item;
  const outputItem = type.primaryOutput?.item;
  const desired = factory.desiredWorkers ?? 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 11,
        width: 280,
        background: 'rgba(20, 25, 36, 0.95)',
        border: '1px solid #2c3344',
        borderRadius: 6,
        padding: 14,
        color: '#e6e6e6',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>{type.name}</h3>
        <button
          type="button"
          onClick={() => selectFactory(null)}
          aria-label="Close"
          style={{
            ...buttonStyle,
            padding: '0.15rem 0.45rem',
            fontSize: 12,
            background: 'transparent',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ color: '#7a8294', fontSize: 12, marginTop: 4 }}>
        ({factory.worldX}, {factory.worldY}) · footprint {type.baseFootprint.w}×
        {type.baseFootprint.h}
      </div>

      {isDemolishing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#ff7a7a', marginBottom: 4 }}>
            Demolishing — {demolishPct}%
          </div>
          <ProgressBar pct={demolishPct} color="#ff5555" />
          <div style={{ fontSize: 12, color: '#7a8294', marginTop: 4 }}>
            {factory.demolish?.progress ?? 0} / {factory.demolish?.total ?? 0}
          </div>
        </div>
      )}

      {!isDemolishing && isSiteClearing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#e09a4a', marginBottom: 4 }}>
            Clearing site — {cleared} / {totalTrees} trees cleared
          </div>
          <ProgressBar pct={totalTrees > 0 ? (cleared / totalTrees) * 100 : 0} color="#e09a4a" />
        </div>
      )}

      {!isDemolishing && !isSiteClearing && isConstructing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#e0c060', marginBottom: 4 }}>
            Under construction — {constructionPct}%
          </div>
          <ProgressBar pct={constructionPct} color="#e0c060" />
          <div style={{ fontSize: 12, color: '#7a8294', marginTop: 4 }}>
            {received} / {cost} {type.primaryInput?.item ?? 'units'} delivered
          </div>
        </div>
      )}

      {!isDemolishing && !isSiteClearing && !isConstructing && (
        <div
          style={{
            marginTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            fontSize: 13,
          }}
        >
          {inputItem && (
            <div>
              <span style={{ color: '#7a8294' }}>{inputItem} in: </span>
              <span style={{ color: '#a4d97a', fontWeight: 600 }}>
                {factory.inputBuffers[inputItem] ?? 0}
              </span>
            </div>
          )}
          {outputItem && (
            <div>
              <span style={{ color: '#7a8294' }}>{outputItem} out: </span>
              <span style={{ color: '#fff066', fontWeight: 600 }}>
                {factory.outputBuffers[outputItem] ?? 0}
              </span>
            </div>
          )}
          {!isFarm && (
            <div>
              <span style={{ color: '#7a8294' }}>
                food buffer ({foodForTier(innerWorker?.tier ?? 1)}):{' '}
              </span>
              <span
                style={{
                  color: factory.foodBuffer < 1 ? '#ff5555' : '#e0c060',
                  fontWeight: 600,
                }}
              >
                {factory.foodBuffer ?? 0}
              </span>
              {factory.foodBuffer < 1 && (
                <span style={{ color: '#ff5555', fontSize: 11, marginLeft: 6 }}>
                  inner worker hungry
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {!isFarm && !isDemolishing && innerWorker && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: '#7a8294', marginBottom: 4 }}>INNER WORKER</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              padding: '4px 6px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 3,
            }}
          >
            <span>tier {innerWorker.tier}</span>
            <span style={{ color: '#7a8294' }}>·</span>
            <span style={{ color: '#a4d97a' }}>
              {innerWorker.mealsEaten}/{MEALS_TO_PROMOTE} meals
            </span>
            <span style={{ color: '#7a8294', fontSize: 11 }}>
              (eats {foodForTier(innerWorker.tier)})
            </span>
            {innerWorker.tier < MAX_WORKER_TIER && (
              <button
                type="button"
                onClick={() => promoteInnerWorker(factory.id)}
                disabled={innerWorker.mealsEaten < MEALS_TO_PROMOTE}
                style={{
                  marginLeft: 'auto',
                  padding: '0.2rem 0.5rem',
                  background:
                    innerWorker.mealsEaten >= MEALS_TO_PROMOTE ? '#3a4a6a' : '#252830',
                  color:
                    innerWorker.mealsEaten >= MEALS_TO_PROMOTE ? '#e6e6e6' : '#5a6378',
                  border: `1px solid ${
                    innerWorker.mealsEaten >= MEALS_TO_PROMOTE ? '#5a6a8a' : '#3a4258'
                  }`,
                  borderRadius: 3,
                  cursor:
                    innerWorker.mealsEaten >= MEALS_TO_PROMOTE ? 'pointer' : 'not-allowed',
                  fontSize: 12,
                }}
                title={
                  innerWorker.mealsEaten >= MEALS_TO_PROMOTE
                    ? `Promote to tier ${innerWorker.tier + 1} (will eat ${foodForTier(innerWorker.tier + 1)})`
                    : `Needs ${MEALS_TO_PROMOTE - innerWorker.mealsEaten} more meals`
                }
              >
                Promote ↑
              </button>
            )}
          </div>
        </div>
      )}

      {!isFarm && !isDemolishing && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: '#7a8294', marginBottom: 4 }}>HAULERS ASSIGNED</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setDesiredWorkers(factory.id, desired - 1)}
              disabled={desired <= 0}
              style={{
                ...stepperBtn,
                opacity: desired <= 0 ? 0.4 : 1,
                cursor: desired <= 0 ? 'not-allowed' : 'pointer',
              }}
            >
              −
            </button>
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              {assignedHaulerCount} / {desired}
            </div>
            <button
              type="button"
              onClick={() => setDesiredWorkers(factory.id, desired + 1)}
              style={stepperBtn}
            >
              +
            </button>
          </div>
        </div>
      )}

      {isFarm && !isDemolishing && (
        <div style={{ marginTop: 12, fontSize: 11, color: '#5a6378' }}>
          Farms produce food on their own. Workers visit to eat when hungry.
        </div>
      )}

      {!isFarm && !isDemolishing && !isSiteClearing && !isConstructing && (
        <Workshop
          factoryId={factory.id}
          factoryTypeId={factory.typeId}
          machines={factory.machines}
          inputBuffers={factory.inputBuffers}
          pickedMachineTypeId={pickedMachineTypeId}
          setPickedMachineTypeId={setPickedMachineTypeId}
          buildMachine={buildMachine}
        />
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setView({ kind: 'factory', factoryId: factory.id })}
          style={{ ...buttonStyle, flex: 1 }}
          disabled={isDemolishing}
        >
          Enter factory →
        </button>
        {!isDemolishing ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Demolish ${type.name}? Workers will tear it down.`)) {
                beginDemolish(factory.id);
              }
            }}
            style={{
              ...buttonStyle,
              background: '#3a1a1a',
              color: '#ffb3b3',
              border: '1px solid #5a2a2a',
            }}
            title="Workers will tear it down. Takes time depending on hauler count."
          >
            Demolish
          </button>
        ) : (
          <button
            type="button"
            onClick={() => cancelDemolish(factory.id)}
            style={{
              ...buttonStyle,
              background: '#2a3042',
              color: '#e0c060',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Workshop({
  factoryId,
  factoryTypeId,
  machines,
  inputBuffers,
  pickedMachineTypeId,
  setPickedMachineTypeId,
  buildMachine,
}: {
  factoryId: string;
  factoryTypeId: string;
  machines: import('@aof/shared').Machine[];
  inputBuffers: Record<string, number>;
  pickedMachineTypeId: string;
  setPickedMachineTypeId: (id: string) => void;
  buildMachine: (factoryId: string, typeId: string) => boolean;
}) {
  const compatible = compatibleMachineTypes(factoryTypeId);
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
    <div style={{ marginTop: 14 }}>
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
          const stalled =
            !isBuilding && m.cycleProgress >= t.recipe.ticksPerCycle;
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
                  color: isBuilding
                    ? '#e0c060'
                    : stalled
                      ? '#ff7a7a'
                      : '#a4d97a',
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
            onClick={() => buildMachine(factoryId, effectivePicked)}
            disabled={!canBuild}
            title={
              canBuild
                ? `Costs ${Object.entries(pickedType.buildCost)
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
            Build
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#5a6378' }}>
          No compatible machine types yet.
        </div>
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
          → {Object.entries(pickedType.recipe.outputs)
            .map(([i, a]) => `${a} ${i}`)
            .join(', ')}{' '}
          per {Math.round(pickedType.recipe.ticksPerCycle / 20)}s
        </div>
      )}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        height: 6,
        background: '#1a1f2c',
        borderRadius: 3,
        overflow: 'hidden',
        border: '1px solid #2c3344',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.max(0, Math.min(100, pct))}%`,
          background: color,
          transition: 'width 0.2s linear',
        }}
      />
    </div>
  );
}
