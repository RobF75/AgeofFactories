import { FACTORY_TYPES } from '../data/factoryTypes.js';
import type { FactoryInstance } from '../types/factory.js';
import type { Worker } from '../types/worker.js';
import { MAX_ENERGY } from '../types/worker.js';
import type { WorldState } from '../types/world.js';
import {
  createDefaultInnerLayout,
  createInitialInnerWorker,
} from '../world/factoryLayout.js';

export function migrateWorld(world: WorldState): WorldState {
  let changed = false;

  const validWorkers: Worker[] = world.workers
    .filter((w): w is Worker => 'role' in w)
    .map((w) => {
      const taskHasNewShape =
        w.task && typeof w.task === 'object' && 'source' in w.task && 'itemType' in w.task;
      const energyValid =
        typeof w.energy === 'number' && w.energy > 100 && w.energy <= MAX_ENERGY;
      const wRaw = w as unknown as Record<string, unknown>;
      const mealsEaten = typeof wRaw['mealsEaten'] === 'number' ? (wRaw['mealsEaten'] as number) : 0;
      const tier = typeof w.tier === 'number' && w.tier >= 1 ? w.tier : 1;
      return {
        ...w,
        tier,
        carrying: typeof w.carrying === 'string' ? w.carrying : null,
        task: taskHasNewShape ? w.task : null,
        energy: energyValid ? w.energy : MAX_ENERGY,
        mealsEaten,
      };
    });
  if (validWorkers.length !== world.workers.length) changed = true;

  const factories: FactoryInstance[] = world.factories.map((f) => {
    let updated = f;
    const raw = updated as unknown as Record<string, unknown>;

    const type = FACTORY_TYPES[updated.typeId];
    const expectedH = type?.innerGrid.h;
    const expectedW = type?.innerGrid.w;
    const layoutDimsMatch =
      updated.innerLayout &&
      updated.innerLayout.length === expectedH &&
      updated.innerLayout[0]?.length === expectedW;
    if (type && (!updated.innerLayout || !layoutDimsMatch)) {
      updated = { ...updated, innerLayout: createDefaultInnerLayout(type) };
      changed = true;
    }
    if (!raw['construction']) {
      updated = { ...updated, construction: { received: 0, complete: true } };
      changed = true;
    }
    if (typeof raw['desiredWorkers'] !== 'number') {
      updated = { ...updated, desiredWorkers: 1 };
      changed = true;
    }
    if (typeof raw['foodBuffer'] !== 'number') {
      updated = { ...updated, foodBuffer: 5 };
      changed = true;
    }
    if (!Array.isArray(raw['siteClearing'])) {
      updated = { ...updated, siteClearing: [] };
      changed = true;
    }
    if (raw['demolish'] === undefined) {
      updated = { ...updated, demolish: null };
      changed = true;
    }
    if (!Array.isArray(raw['machines'])) {
      updated = { ...updated, machines: [] };
      changed = true;
    }
    return updated;
  });

  const innerByFactory = new Set<string>();
  for (const w of validWorkers) {
    if (!w.assignedFactoryId) continue;
    if (w.role === 'inner') innerByFactory.add(w.assignedFactoryId);
  }

  const workers = [...validWorkers];
  for (const f of factories) {
    if (f.typeId === 'farm') continue;
    if (innerByFactory.has(f.id)) continue;
    workers.push(createInitialInnerWorker(f.id, f));
    changed = true;
  }

  let clearedTiles = world.clearedTiles;
  if (!clearedTiles || typeof clearedTiles !== 'object') {
    clearedTiles = {};
    changed = true;
  }

  if (!changed) return world;
  return { ...world, factories, workers, clearedTiles };
}
