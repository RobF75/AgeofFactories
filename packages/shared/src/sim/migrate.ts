import { FACTORY_TYPES } from '../data/factoryTypes.js';
import type { FactoryInstance } from '../types/factory.js';
import type { Worker } from '../types/worker.js';
import { MAX_ENERGY } from '../types/worker.js';
import type { WorldState } from '../types/world.js';
import {
  createDefaultInnerLayout,
  createDefaultMachine,
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
      const nextTierMealsEaten =
        typeof wRaw['nextTierMealsEaten'] === 'number' ? (wRaw['nextTierMealsEaten'] as number) : 0;
      const lastEaten =
        typeof wRaw['lastEaten'] === 'string' ? (wRaw['lastEaten'] as string) : null;
      const tier = typeof w.tier === 'number' && w.tier >= 1 ? w.tier : 1;
      const targetMachineId =
        typeof wRaw['targetMachineId'] === 'string' ? (wRaw['targetMachineId'] as string) : null;
      return {
        ...w,
        tier,
        carrying: typeof w.carrying === 'string' ? w.carrying : null,
        task: taskHasNewShape ? w.task : null,
        energy: energyValid ? w.energy : MAX_ENERGY,
        mealsEaten,
        nextTierMealsEaten,
        lastEaten,
        targetMachineId,
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
    const rawConstruction = raw['construction'] as
      | { delivered?: Record<string, number>; received?: number; complete?: boolean }
      | undefined;
    if (!rawConstruction) {
      // No construction state at all — assume legacy save where factories were complete.
      updated = { ...updated, construction: { delivered: {}, complete: true } };
      changed = true;
    } else if (!rawConstruction.delivered) {
      // Legacy `{ received, complete }` shape. If it was complete, keep it complete; if
      // partial, reset to zero deliveries and let workers re-supply under the new schema.
      updated = {
        ...updated,
        construction: { delivered: {}, complete: rawConstruction.complete === true },
      };
      changed = true;
    }
    if (typeof raw['desiredWorkers'] !== 'number') {
      updated = { ...updated, desiredWorkers: 1 };
      changed = true;
    }
    // Migrate legacy `foodBuffer: number` → `foodInventory: { food: N }`.
    if (
      !raw['foodInventory'] ||
      typeof raw['foodInventory'] !== 'object'
    ) {
      const legacyBuffer = typeof raw['foodBuffer'] === 'number' ? (raw['foodBuffer'] as number) : 0;
      updated = {
        ...updated,
        foodInventory: legacyBuffer > 0 ? { food: legacyBuffer } : {},
      };
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
    if (typeof raw['factoryTier'] !== 'number') {
      updated = { ...updated, factoryTier: 1 };
      changed = true;
    }
    if (raw['pendingUpgrade'] === undefined) {
      updated = { ...updated, pendingUpgrade: null };
      changed = true;
    }
    // Normalize machine entries: ensure innerX/Y exist
    if (Array.isArray(updated.machines)) {
      const fixedMachines = updated.machines.map((m) => {
        const mr = m as unknown as Record<string, unknown>;
        if (typeof mr['innerX'] === 'number' && typeof mr['innerY'] === 'number') return m;
        const innerX = type ? Math.floor(type.innerGrid.w / 2) : 1;
        const innerY = type ? Math.floor(type.innerGrid.h / 2) : 1;
        return { ...m, innerX, innerY };
      });
      if (fixedMachines.some((m, i) => m !== updated.machines[i])) {
        updated = { ...updated, machines: fixedMachines };
        changed = true;
      }
    }
    // Spawn default machine if non-farm and no machines
    if (
      type &&
      type.id !== 'farm' &&
      updated.machines.length === 0 &&
      updated.construction.complete
    ) {
      const machine = createDefaultMachine(type);
      if (machine) {
        updated = { ...updated, machines: [machine] };
        changed = true;
      }
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

  // Migrate clearedTiles (binary boolean) → tileResources (numeric remaining yield).
  // A previously-cleared tile becomes a 0-yield depleted tile.
  const worldRaw = world as unknown as Record<string, unknown>;
  let tileResources = (worldRaw['tileResources'] ?? undefined) as
    | Record<string, number>
    | undefined;
  if (!tileResources || typeof tileResources !== 'object') {
    const legacyCleared = worldRaw['clearedTiles'] as Record<string, true> | undefined;
    if (legacyCleared && typeof legacyCleared === 'object') {
      tileResources = {};
      for (const k of Object.keys(legacyCleared)) tileResources[k] = 0;
    } else {
      tileResources = {};
    }
    changed = true;
  }

  if (!changed) return world;
  return { ...world, factories, workers, tileResources };
}
