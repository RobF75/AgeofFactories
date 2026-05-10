import { acceptedFoodsForTier, totalFoodByItem } from '@aof/shared';
import { useGameStore } from '../state/gameStore.js';

/** Items that can sustain a tier-1 hauler (used for the hire-cost gate). */
const SUSTENANCE_ITEMS = ['grain', 'food'];

export function WorkersPanel() {
  const view = useGameStore((s) => s.view);
  const factories = useGameStore((s) => s.world?.factories);
  const workers = useGameStore((s) => s.world?.workers);
  const hireWorker = useGameStore((s) => s.hireWorker);
  const fireWorker = useGameStore((s) => s.fireWorker);

  if (view.kind !== 'world' || !factories || !workers) return null;

  // Show stock for every food item across all tiers, deduped, in priority order.
  const allFoodItems = new Set<string>();
  for (let t = 1; t <= 3; t++) {
    for (const item of acceptedFoodsForTier(t)) allFoodItems.add(item);
  }
  const foodByItem: Record<string, number> = {};
  for (const item of allFoodItems) {
    foodByItem[item] = totalFoodByItem(factories, item);
  }
  const sustenanceAvailable = SUSTENANCE_ITEMS.some((i) => (foodByItem[i] ?? 0) >= 1);
  const haulers = workers.filter((w) => w.role === 'hauler');
  const total = haulers.length;
  const idle = haulers.filter((w) => w.assignedFactoryId === null).length;
  const working = total - idle;
  const canHire = sustenanceAvailable;
  const canFire = idle >= 1;

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
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
        WORKERS
      </div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: '#7a8294' }}>total: </span>
        <span style={{ fontWeight: 600 }}>{total}</span>
        <span style={{ color: '#7a8294' }}> · working: </span>
        <span style={{ fontWeight: 600, color: '#a4d97a' }}>{working}</span>
        <span style={{ color: '#7a8294' }}> · idle: </span>
        <span style={{ fontWeight: 600, color: '#fff066' }}>{idle}</span>
      </div>
      <div style={{ fontSize: 13, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {Object.entries(foodByItem).map(([item, count]) => (
          <div key={item}>
            <span style={{ color: '#7a8294' }}>{item} in stock: </span>
            <span style={{ fontWeight: 600, color: '#e0c060' }}>{count}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={() => hireWorker()}
          disabled={!canHire}
          title={canHire ? 'Hires a hauler at the farm. Costs 1 food.' : 'No food available'}
          style={{
            flex: 1,
            padding: '0.45rem 0.6rem',
            background: canHire ? '#2a4a6a' : '#252830',
            color: canHire ? '#e6e6e6' : '#5a6378',
            border: `1px solid ${canHire ? '#3a5a8a' : '#3a4258'}`,
            borderRadius: 4,
            cursor: canHire ? 'pointer' : 'not-allowed',
            fontSize: 13,
          }}
        >
          Hire (1 grain/food)
        </button>
        <button
          type="button"
          onClick={() => fireWorker()}
          disabled={!canFire}
          title={
            canFire
              ? 'Removes one idle hauler from the pool.'
              : 'No idle workers — lower a factory’s desired count first'
          }
          style={{
            flex: 1,
            padding: '0.45rem 0.6rem',
            background: canFire ? '#4a2a2a' : '#252830',
            color: canFire ? '#ffb3b3' : '#5a6378',
            border: `1px solid ${canFire ? '#6a3a3a' : '#3a4258'}`,
            borderRadius: 4,
            cursor: canFire ? 'pointer' : 'not-allowed',
            fontSize: 13,
          }}
        >
          Fire idle
        </button>
      </div>
    </div>
  );
}
