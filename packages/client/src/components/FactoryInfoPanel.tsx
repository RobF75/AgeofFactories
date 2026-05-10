import {
  BALANCE,
  FACTORY_TYPES,
  MAX_WORKER_TIER,
  MEALS_TO_PROMOTE,
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
  const promoteInnerWorker = useGameStore((s) => s.promoteInnerWorker);
  const beginFarmUpgrade = useGameStore((s) => s.beginFarmUpgrade);
  const cancelFarmUpgrade = useGameStore((s) => s.cancelFarmUpgrade);
  const innerWorker = useGameStore((s) =>
    selectedFactoryId
      ? (s.world?.workers.find(
          (w) => w.role === 'inner' && w.assignedFactoryId === selectedFactoryId,
        ) ?? null)
      : null,
  );
  if (view.kind !== 'world' || !factory) return null;
  const type = FACTORY_TYPES[factory.typeId];
  if (!type) return null;

  const isFarm = factory.typeId === 'farm';
  const isDemolishing = factory.demolish !== null;
  const isSiteClearing = factory.siteClearing.length > 0;
  const isConstructing = !factory.construction.complete && !isSiteClearing;
  const constructionRequired = type.constructionCost?.resources ?? {};
  const constructionDelivered = factory.construction.delivered;
  let totalReq = 0;
  let totalGot = 0;
  for (const [item, amt] of Object.entries(constructionRequired)) {
    totalReq += amt;
    totalGot += Math.min(amt, constructionDelivered[item] ?? 0);
  }
  const constructionPct = totalReq > 0 ? Math.round((totalGot / totalReq) * 100) : 100;
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
          <div style={{ fontSize: 12, color: '#7a8294', marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {Object.entries(constructionRequired).map(([item, amt]) => {
              const got = Math.min(amt, constructionDelivered[item] ?? 0);
              const done = got >= amt;
              return (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item}</span>
                  <span style={{ color: done ? '#a4d97a' : '#e0c060' }}>
                    {got} / {amt}
                  </span>
                </div>
              );
            })}
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
          {!isFarm && (() => {
            const inv = factory.foodInventory ?? {};
            const total = Object.values(inv).reduce((s, v) => s + v, 0);
            const breakdown = Object.entries(inv)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${v} ${k}`)
              .join(', ');
            return (
              <div>
                <span style={{ color: '#7a8294' }}>food pantry: </span>
                <span
                  style={{
                    color: total < 1 ? '#ff5555' : '#e0c060',
                    fontWeight: 600,
                  }}
                >
                  {total}
                </span>
                {breakdown && (
                  <span style={{ color: '#7a8294', fontSize: 11, marginLeft: 6 }}>
                    ({breakdown})
                  </span>
                )}
                {total < 1 && (
                  <span style={{ color: '#ff5555', fontSize: 11, marginLeft: 6 }}>
                    inner worker hungry
                  </span>
                )}
              </div>
            );
          })()}
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
            {innerWorker.tier < MAX_WORKER_TIER ? (
              <span style={{ color: '#a4d97a' }}>
                {innerWorker.nextTierMealsEaten}/{MEALS_TO_PROMOTE}{' '}
                {foodForTier(innerWorker.tier + 1)}
              </span>
            ) : (
              <span style={{ color: '#7a8294' }}>{innerWorker.mealsEaten} meals (max tier)</span>
            )}
            {innerWorker.tier < MAX_WORKER_TIER && (
              <button
                type="button"
                onClick={() => promoteInnerWorker(factory.id)}
                disabled={innerWorker.nextTierMealsEaten < MEALS_TO_PROMOTE}
                style={{
                  marginLeft: 'auto',
                  padding: '0.2rem 0.5rem',
                  background:
                    innerWorker.nextTierMealsEaten >= MEALS_TO_PROMOTE ? '#3a4a6a' : '#252830',
                  color:
                    innerWorker.nextTierMealsEaten >= MEALS_TO_PROMOTE ? '#e6e6e6' : '#5a6378',
                  border: `1px solid ${
                    innerWorker.nextTierMealsEaten >= MEALS_TO_PROMOTE ? '#5a6a8a' : '#3a4258'
                  }`,
                  borderRadius: 3,
                  cursor:
                    innerWorker.nextTierMealsEaten >= MEALS_TO_PROMOTE ? 'pointer' : 'not-allowed',
                  fontSize: 12,
                }}
                title={
                  innerWorker.nextTierMealsEaten >= MEALS_TO_PROMOTE
                    ? `Promote to tier ${innerWorker.tier + 1}`
                    : `Needs ${MEALS_TO_PROMOTE - innerWorker.nextTierMealsEaten} more ${foodForTier(innerWorker.tier + 1)}`
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
          Farms produce grain on their own. Higher tiers produce faster.
        </div>
      )}

      {isFarm && !isDemolishing && !isSiteClearing && !isConstructing && (
        <FarmUpgradePanel
          factoryId={factory.id}
          factoryTier={factory.factoryTier}
          pendingUpgrade={factory.pendingUpgrade}
          onBegin={() => beginFarmUpgrade(factory.id)}
          onCancel={() => cancelFarmUpgrade(factory.id)}
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

function FarmUpgradePanel({
  factoryId,
  factoryTier,
  pendingUpgrade,
  onBegin,
  onCancel,
}: {
  factoryId: string;
  factoryTier: number;
  pendingUpgrade: import('@aof/shared').FactoryConstruction | null;
  onBegin: () => void;
  onCancel: () => void;
}) {
  void factoryId;
  const targetTier = factoryTier + 1;
  const cost = BALANCE.farmUpgrade[targetTier];
  if (pendingUpgrade && cost) {
    const totalReq = Object.values(cost).reduce((s, v) => s + v, 0);
    const totalGot = Object.entries(cost).reduce(
      (s, [k, amt]) => s + Math.min(amt, pendingUpgrade.delivered[k] ?? 0),
      0,
    );
    const pct = totalReq > 0 ? Math.round((totalGot / totalReq) * 100) : 100;
    return (
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: '#e0c060', marginBottom: 4 }}>
          Upgrading to tier {targetTier} — {pct}%
        </div>
        <ProgressBar pct={pct} color="#e0c060" />
        <div
          style={{
            fontSize: 12,
            color: '#7a8294',
            marginTop: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {Object.entries(cost).map(([item, amt]) => {
            const got = Math.min(amt, pendingUpgrade.delivered[item] ?? 0);
            const done = got >= amt;
            return (
              <div key={item} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{item}</span>
                <span style={{ color: done ? '#a4d97a' : '#e0c060' }}>
                  {got} / {amt}
                </span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            marginTop: 6,
            padding: '0.3rem 0.6rem',
            background: '#2a3042',
            color: '#e0c060',
            border: '1px solid #3a4258',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          Cancel upgrade
        </button>
      </div>
    );
  }
  if (!cost) {
    return (
      <div style={{ marginTop: 12, fontSize: 11, color: '#5a6378' }}>
        Tier {factoryTier} (max).
      </div>
    );
  }
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, color: '#7a8294', marginBottom: 4 }}>UPGRADE</div>
      <button
        type="button"
        onClick={onBegin}
        style={{
          width: '100%',
          padding: '0.4rem 0.7rem',
          background: '#2a4a6a',
          color: '#e6e6e6',
          border: '1px solid #3a5a8a',
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 13,
        }}
        title={`Tier ${factoryTier} → ${targetTier}: ${Object.entries(cost)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ')}`}
      >
        Upgrade to tier {targetTier}
      </button>
      <div style={{ fontSize: 11, color: '#7a8294', marginTop: 4 }}>
        Cost:{' '}
        {Object.entries(cost)
          .map(([k, v]) => `${v} ${k}`)
          .join(', ')}
      </div>
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
