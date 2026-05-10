import { BALANCE, TERRAIN_HARVEST, defaultTileYield } from '../data/balance.js';
import { FACTORY_TYPES } from '../data/factoryTypes.js';
import { acceptedFoodsForTier, foodForTier, isFoodItem, isPromotionFood } from '../data/foodTiers.js';
import { MACHINE_TYPES, machineStations } from '../data/machineTypes.js';
import type { FactoryInstance, FactoryType } from '../types/factory.js';
import type { Worker } from '../types/worker.js';
import { HUNGER_THRESHOLD, MAX_ENERGY } from '../types/worker.js';
import type { WorldState } from '../types/world.js';
import { bayWorldPos, findBay } from '../world/factoryLayout.js';
import {
  WORLD_GRID_TILES,
  findNearestFactorySource,
  findNearestFoodSource,
  findNearestTerrainResource,
  getTerrainAt,
} from '../world/terrain.js';

const { innerSpeed: INNER_SPEED, outerSpeed: OUTER_SPEED, atBayTicks: AT_BAY_TICKS, atMachineTicks: AT_MACHINE_TICKS, harvestTicks: HARVEST_TICKS, deliverTicks: DELIVER_TICKS } = BALANCE.movement;

/** Speed multiplier from a worker's last meal. Defaults to food (1.0) if never fed. */
function speedMultiplier(w: Worker): number {
  return BALANCE.foodSpeed[w.lastEaten ?? 'food'] ?? 1;
}
const { eatDurationTicks: EAT_DURATION_TICKS, energyDecayPerTick: ENERGY_DECAY_PER_TICK } = BALANCE.worker;
const FARM_GRAIN_PERIOD = BALANCE.farm.grainPeriodTicks;
const FACTORY_FOOD_THRESHOLD = BALANCE.factory.foodThreshold;

interface Vec2 {
  x: number;
  y: number;
}

interface FactoryDelta {
  factoryId: string;
  input?: Record<string, number>;
  output?: Record<string, number>;
  /** Construction material delivered, keyed by item type. */
  constructionDelivered?: Record<string, number>;
  /** Upgrade material delivered (factory.pendingUpgrade), keyed by item type. */
  upgradeDelivered?: Record<string, number>;
  /** Per-item delta to add (positive) or subtract (negative) from the factory's food pantry. */
  foodInventoryDelta?: Record<string, number>;
  /** Site-clearing tile (yield set to 0 when tile is cleared for building). */
  siteClearedTile?: { x: number; y: number };
  /** Tile harvested from terrain (yield decremented by 1). */
  terrainHarvested?: { x: number; y: number };
  demolishProgress?: number;
}

/** Returns construction items still needed (required - delivered > 0), in declaration order. */
function constructionShortfall(
  factory: FactoryInstance,
  factoryType: FactoryType | undefined,
): { item: string; remaining: number }[] {
  if (factory.construction.complete) return [];
  const required = factoryType?.constructionCost?.resources;
  if (!required) return [];
  const out: { item: string; remaining: number }[] = [];
  for (const [item, amt] of Object.entries(required)) {
    const got = factory.construction.delivered[item] ?? 0;
    if (got < amt) out.push({ item, remaining: amt - got });
  }
  return out;
}

function isConstructionMaterialNeeded(
  factory: FactoryInstance,
  factoryType: FactoryType | undefined,
  item: string,
): boolean {
  if (factory.construction.complete) return false;
  const required = factoryType?.constructionCost?.resources?.[item] ?? 0;
  if (required <= 0) return false;
  const got = factory.construction.delivered[item] ?? 0;
  return got < required;
}

/** Required resources for the upgrade currently in progress (by target tier). */
function upgradeRequired(factory: FactoryInstance): Record<string, number> {
  if (!factory.pendingUpgrade || factory.pendingUpgrade.complete) return {};
  // Only farms have upgrade definitions in Phase 2a.
  if (factory.typeId !== 'farm') return {};
  const targetTier = factory.factoryTier + 1;
  return BALANCE.farmUpgrade[targetTier] ?? {};
}

function upgradeShortfall(factory: FactoryInstance): { item: string; remaining: number }[] {
  if (!factory.pendingUpgrade || factory.pendingUpgrade.complete) return [];
  const required = upgradeRequired(factory);
  const out: { item: string; remaining: number }[] = [];
  for (const [item, amt] of Object.entries(required)) {
    const got = factory.pendingUpgrade.delivered[item] ?? 0;
    if (got < amt) out.push({ item, remaining: amt - got });
  }
  return out;
}

function isUpgradeMaterialNeeded(factory: FactoryInstance, item: string): boolean {
  if (!factory.pendingUpgrade || factory.pendingUpgrade.complete) return false;
  const required = upgradeRequired(factory)[item] ?? 0;
  if (required <= 0) return false;
  const got = factory.pendingUpgrade.delivered[item] ?? 0;
  return got < required;
}

interface WorkerStepResult {
  worker: Worker;
  deltas: FactoryDelta[];
}

function moveTowards(pos: Vec2, target: Vec2, step: number): { pos: Vec2; reached: boolean } {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= step) return { pos: { x: target.x, y: target.y }, reached: true };
  return {
    pos: { x: pos.x + (dx / dist) * step, y: pos.y + (dy / dist) * step },
    reached: false,
  };
}

const tileCenter = (t: Vec2): Vec2 => ({ x: t.x + 0.5, y: t.y + 0.5 });

function factoryDockPos(factory: FactoryInstance, side: 'W' | 'E'): Vec2 {
  const type = FACTORY_TYPES[factory.typeId];
  if (!type) return { x: factory.worldX + 0.5, y: factory.worldY + 0.5 };
  const bay = findBay(factory.innerLayout, side);
  if (!bay) {
    return {
      x: factory.worldX + type.baseFootprint.w / 2,
      y: factory.worldY + type.baseFootprint.h / 2,
    };
  }
  return bayWorldPos(factory, type, bay.x, bay.y);
}

function nearestSiteTile(
  tiles: readonly { x: number; y: number }[],
  fromX: number,
  fromY: number,
): { x: number; y: number } | null {
  let best: { x: number; y: number; d2: number } | null = null;
  for (const t of tiles) {
    const dx = t.x - fromX;
    const dy = t.y - fromY;
    const d2 = dx * dx + dy * dy;
    if (!best || d2 < best.d2) best = { x: t.x, y: t.y, d2 };
  }
  return best ? { x: best.x, y: best.y } : null;
}

function isOperational(factory: FactoryInstance): boolean {
  return (
    !factory.demolish &&
    factory.construction.complete &&
    (!factory.siteClearing || factory.siteClearing.length === 0)
  );
}

function stepInnerWorker(w: Worker, factory: FactoryInstance): WorkerStepResult {
  if (!isOperational(factory)) return { worker: w, deltas: [] };

  const factoryType = FACTORY_TYPES[factory.typeId];
  const inputItem = factoryType?.primaryInput?.item ?? null;
  const outputItem = factoryType?.primaryOutput?.item ?? null;

  const inputBay = findBay(factory.innerLayout, 'W');
  const outputBay = findBay(factory.innerLayout, 'E');
  if (!inputBay || !outputBay) return { worker: w, deltas: [] };

  const decayed = { ...w, energy: Math.max(0, w.energy - ENERGY_DECAY_PER_TICK) };

  if (decayed.energy < HUNGER_THRESHOLD) {
    // Pick the highest-priority food the pantry has at least 1 of.
    const priority = acceptedFoodsForTier(decayed.tier);
    const eatable = priority.find((item) => (factory.foodInventory[item] ?? 0) >= 1);
    if (eatable) {
      const promoted = isPromotionFood(decayed.tier, eatable);
      return {
        worker: {
          ...decayed,
          energy: MAX_ENERGY,
          mealsEaten: decayed.mealsEaten + 1,
          nextTierMealsEaten: promoted
            ? decayed.nextTierMealsEaten + 1
            : decayed.nextTierMealsEaten,
        },
        deltas: [{ factoryId: factory.id, foodInventoryDelta: { [eatable]: -1 } }],
      };
    }
  }

  if (decayed.energy === 0) {
    return { worker: decayed, deltas: [] };
  }

  // Pick a target machine (first operational one); used for visual movement.
  const operationalMachines = factory.machines.filter((m) => m.status === 'operational');
  const currentTarget = decayed.targetMachineId
    ? operationalMachines.find((m) => m.id === decayed.targetMachineId)
    : null;
  const targetMachine = currentTarget ?? operationalMachines[0] ?? null;

  switch (decayed.phase) {
    case 'to-input': {
      const r = moveTowards(decayed.position, tileCenter(inputBay), INNER_SPEED);
      if (r.reached) {
        return {
          worker: {
            ...decayed,
            position: r.pos,
            phase: 'at-input',
            phaseTicks: AT_BAY_TICKS,
            targetMachineId: null,
          },
          deltas: [],
        };
      }
      return { worker: { ...decayed, position: r.pos }, deltas: [] };
    }
    case 'at-input': {
      if (decayed.phaseTicks > 0) {
        return { worker: { ...decayed, phaseTicks: decayed.phaseTicks - 1 }, deltas: [] };
      }
      // Wait for at least one operational machine before walking.
      if (!targetMachine) {
        return { worker: { ...decayed, phaseTicks: AT_BAY_TICKS }, deltas: [] };
      }
      return {
        worker: {
          ...decayed,
          phase: 'to-machine',
          carrying: inputItem,
          targetMachineId: targetMachine.id,
        },
        deltas: [],
      };
    }
    case 'to-machine': {
      if (!targetMachine) {
        return { worker: { ...decayed, phase: 'to-input', targetMachineId: null }, deltas: [] };
      }
      const target = tileCenter({ x: targetMachine.innerX, y: targetMachine.innerY });
      const r = moveTowards(decayed.position, target, INNER_SPEED);
      if (r.reached) {
        return {
          worker: {
            ...decayed,
            position: r.pos,
            phase: 'at-machine',
            phaseTicks: AT_MACHINE_TICKS,
          },
          deltas: [],
        };
      }
      return { worker: { ...decayed, position: r.pos }, deltas: [] };
    }
    case 'at-machine': {
      if (decayed.phaseTicks > 0) {
        return { worker: { ...decayed, phaseTicks: decayed.phaseTicks - 1 }, deltas: [] };
      }
      return { worker: { ...decayed, phase: 'to-output', carrying: outputItem }, deltas: [] };
    }
    case 'to-output': {
      const r = moveTowards(decayed.position, tileCenter(outputBay), INNER_SPEED);
      if (r.reached) {
        return {
          worker: {
            ...decayed,
            position: r.pos,
            phase: 'at-output',
            phaseTicks: AT_BAY_TICKS,
            carrying: null,
          },
          deltas: [],
        };
      }
      return { worker: { ...decayed, position: r.pos }, deltas: [] };
    }
    case 'at-output': {
      if (decayed.phaseTicks > 0) {
        return { worker: { ...decayed, phaseTicks: decayed.phaseTicks - 1 }, deltas: [] };
      }
      return { worker: { ...decayed, phase: 'to-input' }, deltas: [] };
    }
    default:
      return { worker: decayed, deltas: [] };
  }
}

/**
 * Tries to find a source (terrain or factory) for any item in the given
 * shortfall list, in order. Returns a WorkerStepResult with the worker
 * dispatched to that source, or null if nothing is currently fetchable.
 */
function tryFetchByShortfall(
  w: Worker,
  factory: FactoryInstance,
  shortfall: { item: string; remaining: number }[],
  world: WorldState,
): WorkerStepResult | null {
  for (const { item } of shortfall) {
    const terrainKind = TERRAIN_HARVEST[item];
    if (terrainKind) {
      const tile = findNearestTerrainResource(
        world.seed,
        terrainKind,
        Math.floor(w.position.x),
        Math.floor(w.position.y),
        WORLD_GRID_TILES,
        WORLD_GRID_TILES,
        world.tileResources,
      );
      if (tile) {
        return {
          worker: {
            ...w,
            phase: 'h-to-resource',
            task: {
              itemType: item,
              source: { kind: 'terrain', x: tile.x, y: tile.y },
            },
          },
          deltas: [],
        };
      }
      continue;
    }
    const src = findNearestFactorySource(
      world.factories,
      w.position.x,
      w.position.y,
      item,
      factory.id,
    );
    if (src) {
      return {
        worker: {
          ...w,
          phase: 'h-to-resource',
          task: {
            itemType: item,
            source: { kind: 'factory', factoryId: src.factoryId, x: src.x, y: src.y },
          },
        },
        deltas: [],
      };
    }
  }
  return null;
}

function tryRedirectToFarm(w: Worker, world: WorldState): Worker | null {
  if (w.energy >= HUNGER_THRESHOLD) return null;
  if (w.phase === 'h-going-to-farm' || w.phase === 'h-eating-at-farm') return null;
  if (w.phase === 'h-going-to-demolish' || w.phase === 'h-demolishing') return null;
  const item = foodForTier(w.tier);
  const farm = findNearestFoodSource(world.factories, w.position.x, w.position.y, item);
  if (!farm) return null;
  return {
    ...w,
    phase: 'h-going-to-farm',
    task: {
      itemType: item,
      source: { kind: 'factory', factoryId: farm.factoryId, x: farm.x, y: farm.y },
    },
  };
}

function stepHauler(w: Worker, world: WorldState): WorkerStepResult {
  if (w.phase === 'h-going-to-farm') {
    const task = w.task;
    if (!task || task.source.kind !== 'factory') {
      return { worker: { ...w, phase: 'h-idle', task: null }, deltas: [] };
    }
    const target: Vec2 = { x: task.source.x + 0.5, y: task.source.y + 0.5 };
    const r = moveTowards(w.position, target, OUTER_SPEED);
    if (r.reached) {
      return {
        worker: { ...w, position: r.pos, phase: 'h-eating-at-farm', phaseTicks: EAT_DURATION_TICKS },
        deltas: [],
      };
    }
    return { worker: { ...w, position: r.pos }, deltas: [] };
  }
  if (w.phase === 'h-eating-at-farm') {
    if (w.phaseTicks > 0) {
      return { worker: { ...w, phaseTicks: w.phaseTicks - 1 }, deltas: [] };
    }
    const task = w.task;
    if (!task || task.source.kind !== 'factory') {
      return {
        worker: {
          ...w,
          energy: MAX_ENERGY,
          phase: 'h-idle',
          task: null,
          mealsEaten: w.mealsEaten + 1,
        },
        deltas: [],
      };
    }
    const farmId = task.source.factoryId;
    const farm = world.factories.find((f) => f.id === farmId);
    const item = task.itemType;
    if (!farm || (farm.outputBuffers[item] ?? 0) < 1) {
      return { worker: { ...w, phase: 'h-idle', task: null }, deltas: [] };
    }
    return {
      worker: {
        ...w,
        energy: MAX_ENERGY,
        phase: 'h-idle',
        task: null,
        mealsEaten: w.mealsEaten + 1,
      },
      deltas: [{ factoryId: farmId, output: { [item]: -1 } }],
    };
  }

  const redirected = tryRedirectToFarm(w, world);
  if (redirected) return { worker: redirected, deltas: [] };

  if (!w.assignedFactoryId) return { worker: w, deltas: [] };

  const factory = world.factories.find((f) => f.id === w.assignedFactoryId);
  if (!factory) {
    return { worker: { ...w, assignedFactoryId: null, phase: 'h-idle', task: null }, deltas: [] };
  }

  const factoryType = FACTORY_TYPES[factory.typeId];
  const factoryCenter: Vec2 = {
    x: factory.worldX + (factoryType?.baseFootprint.w ?? 1) / 2,
    y: factory.worldY + (factoryType?.baseFootprint.h ?? 1) / 2,
  };

  // Demolition phases
  if (w.phase === 'h-going-to-demolish') {
    if (!factory.demolish) {
      return { worker: { ...w, phase: 'h-idle', task: null }, deltas: [] };
    }
    const r = moveTowards(w.position, factoryCenter, OUTER_SPEED);
    if (r.reached) {
      return {
        worker: { ...w, position: r.pos, phase: 'h-demolishing', task: null },
        deltas: [],
      };
    }
    return { worker: { ...w, position: r.pos }, deltas: [] };
  }
  if (w.phase === 'h-demolishing') {
    if (!factory.demolish) {
      return { worker: { ...w, phase: 'h-idle', task: null }, deltas: [] };
    }
    return { worker: w, deltas: [{ factoryId: factory.id, demolishProgress: 1 }] };
  }

  switch (w.phase) {
    case 'h-idle': {
      // Demolition tops priority
      if (factory.demolish) {
        return {
          worker: { ...w, phase: 'h-going-to-demolish', task: null },
          deltas: [],
        };
      }

      // Then site clearing (just clears the tile; doesn't fund construction)
      if (factory.siteClearing && factory.siteClearing.length > 0) {
        const tile = nearestSiteTile(factory.siteClearing, w.position.x, w.position.y);
        if (tile) {
          return {
            worker: {
              ...w,
              phase: 'h-to-resource',
              task: {
                itemType: 'wood',
                source: { kind: 'site-clearing', x: tile.x, y: tile.y, targetFactoryId: factory.id },
              },
            },
            deltas: [],
          };
        }
      }

      // Construction has highest priority — until complete, we only fetch
      // construction materials.
      if (!factory.construction.complete) {
        const shortfall = constructionShortfall(factory, factoryType);
        const fetched = tryFetchByShortfall(w, factory, shortfall, world);
        if (fetched) return fetched;
        return { worker: w, deltas: [] };
      }

      // Upgrade materials — opportunistic. If we can fetch one, do so; else
      // fall through to food / primary input so production continues.
      if (factory.pendingUpgrade && !factory.pendingUpgrade.complete) {
        const fetched = tryFetchByShortfall(w, factory, upgradeShortfall(factory), world);
        if (fetched) return fetched;
      }

      // Then food (only once operational). Hauler picks the highest-tier food
      // available (so workers can earn promotion credit), falling back to lower
      // tiers, finally to terrain forage as last-resort.
      const totalFood = Object.values(factory.foodInventory ?? {}).reduce(
        (s, v) => s + v,
        0,
      );
      const wantsFood =
        factory.typeId !== 'farm' &&
        isOperational(factory) &&
        totalFood < FACTORY_FOOD_THRESHOLD;
      if (wantsFood) {
        const innerWorker = world.workers.find(
          (iw) => iw.role === 'inner' && iw.assignedFactoryId === factory.id,
        );
        const tier = innerWorker?.tier ?? 1;
        const foodPriority = acceptedFoodsForTier(tier);
        for (const item of foodPriority) {
          const src = findNearestFoodSource(world.factories, w.position.x, w.position.y, item);
          if (src && src.factoryId !== factory.id) {
            return {
              worker: {
                ...w,
                phase: 'h-to-resource',
                task: {
                  itemType: item,
                  source: { kind: 'factory', factoryId: src.factoryId, x: src.x, y: src.y },
                },
              },
              deltas: [],
            };
          }
          // Fallback: terrain food (only the literal 'food' item is on terrain).
          const terrainKind = TERRAIN_HARVEST[item];
          if (terrainKind) {
            const tile = findNearestTerrainResource(
              world.seed,
              terrainKind,
              Math.floor(w.position.x),
              Math.floor(w.position.y),
              WORLD_GRID_TILES,
              WORLD_GRID_TILES,
              world.tileResources,
            );
            if (tile) {
              return {
                worker: {
                  ...w,
                  phase: 'h-to-resource',
                  task: {
                    itemType: item,
                    source: { kind: 'terrain', x: tile.x, y: tile.y },
                  },
                },
                deltas: [],
              };
            }
          }
        }
      }

      // Then primary input (factory is operational)
      const primaryInput = factoryType?.primaryInput;
      if (!primaryInput) return { worker: w, deltas: [] };

      if (primaryInput.from === 'terrain') {
        const terrainKind = TERRAIN_HARVEST[primaryInput.item];
        if (!terrainKind) return { worker: w, deltas: [] };
        const tile = findNearestTerrainResource(
          world.seed,
          terrainKind,
          Math.floor(w.position.x),
          Math.floor(w.position.y),
          WORLD_GRID_TILES,
          WORLD_GRID_TILES,
          world.tileResources,
        );
        if (!tile) return { worker: w, deltas: [] };
        return {
          worker: {
            ...w,
            phase: 'h-to-resource',
            task: {
              itemType: primaryInput.item,
              source: { kind: 'terrain', x: tile.x, y: tile.y },
            },
          },
          deltas: [],
        };
      }
      const src = findNearestFactorySource(
        world.factories,
        w.position.x,
        w.position.y,
        primaryInput.item,
        factory.id,
      );
      if (!src) return { worker: w, deltas: [] };
      return {
        worker: {
          ...w,
          phase: 'h-to-resource',
          task: {
            itemType: primaryInput.item,
            source: { kind: 'factory', factoryId: src.factoryId, x: src.x, y: src.y },
          },
        },
        deltas: [],
      };
    }
    case 'h-to-resource': {
      const task = w.task;
      if (!task) return { worker: { ...w, phase: 'h-idle' }, deltas: [] };
      let target: Vec2;
      if (task.source.kind === 'factory') {
        const fId = task.source.factoryId;
        const sourceFactory = world.factories.find((f) => f.id === fId);
        if (!sourceFactory || (sourceFactory.outputBuffers[task.itemType] ?? 0) < 1) {
          return { worker: { ...w, task: null, phase: 'h-idle' }, deltas: [] };
        }
        target = factoryDockPos(sourceFactory, 'E');
      } else if (task.source.kind === 'site-clearing') {
        const stillNeeded = factory.siteClearing.some(
          (t) => t.x === task.source.x && t.y === task.source.y,
        );
        if (!stillNeeded) {
          return { worker: { ...w, task: null, phase: 'h-idle' }, deltas: [] };
        }
        target = { x: task.source.x + 0.5, y: task.source.y + 0.5 };
      } else {
        target = { x: task.source.x + 0.5, y: task.source.y + 0.5 };
      }
      const r = moveTowards(w.position, target, OUTER_SPEED);
      if (r.reached) {
        return {
          worker: { ...w, position: r.pos, phase: 'h-harvesting', phaseTicks: HARVEST_TICKS },
          deltas: [],
        };
      }
      return { worker: { ...w, position: r.pos }, deltas: [] };
    }
    case 'h-harvesting': {
      if (w.phaseTicks > 0) {
        return { worker: { ...w, phaseTicks: w.phaseTicks - 1 }, deltas: [] };
      }
      const task = w.task;
      if (!task) return { worker: { ...w, phase: 'h-idle' }, deltas: [] };

      if (task.source.kind === 'site-clearing') {
        return {
          worker: { ...w, task: null, phase: 'h-idle' },
          deltas: [
            {
              factoryId: task.source.targetFactoryId,
              siteClearedTile: { x: task.source.x, y: task.source.y },
            },
          ],
        };
      }

      const item = task.itemType;
      const deltas: FactoryDelta[] = [];
      if (task.source.kind === 'factory') {
        const fId = task.source.factoryId;
        const sourceFactory = world.factories.find((f) => f.id === fId);
        if (!sourceFactory || (sourceFactory.outputBuffers[item] ?? 0) < 1) {
          return { worker: { ...w, task: null, phase: 'h-idle' }, deltas: [] };
        }
        deltas.push({ factoryId: fId, output: { [item]: -1 } });
      } else if (task.source.kind === 'terrain') {
        // Decrement the terrain tile's yield by 1 (deplete on harvest).
        deltas.push({
          factoryId: factory.id,
          terrainHarvested: { x: task.source.x, y: task.source.y },
        });
      }
      return {
        worker: { ...w, carrying: item, phase: 'h-to-factory' },
        deltas,
      };
    }
    case 'h-to-factory': {
      const dock = factoryDockPos(factory, 'W');
      const r = moveTowards(w.position, dock, OUTER_SPEED);
      if (r.reached) {
        return {
          worker: { ...w, position: r.pos, phase: 'h-delivering', phaseTicks: DELIVER_TICKS },
          deltas: [],
        };
      }
      return { worker: { ...w, position: r.pos }, deltas: [] };
    }
    case 'h-delivering': {
      if (w.phaseTicks > 0) {
        return { worker: { ...w, phaseTicks: w.phaseTicks - 1 }, deltas: [] };
      }
      const carriedItem = w.carrying ?? factoryType?.primaryInput?.item ?? '';
      let delivery: FactoryDelta;
      if (isConstructionMaterialNeeded(factory, factoryType, carriedItem)) {
        delivery = {
          factoryId: factory.id,
          constructionDelivered: { [carriedItem]: 1 },
        };
      } else if (isUpgradeMaterialNeeded(factory, carriedItem)) {
        delivery = {
          factoryId: factory.id,
          upgradeDelivered: { [carriedItem]: 1 },
        };
      } else if (isFoodItem(carriedItem)) {
        delivery = { factoryId: factory.id, foodInventoryDelta: { [carriedItem]: 1 } };
      } else {
        delivery = { factoryId: factory.id, input: { [carriedItem]: 1 } };
      }
      return {
        worker: { ...w, carrying: null, task: null, phase: 'h-idle' },
        deltas: [delivery],
      };
    }
    default:
      return { worker: { ...w, phase: 'h-idle' }, deltas: [] };
  }
}

function dispatchHaulers(world: WorldState): WorldState {
  const assignments = new Map<string, string | null>();
  for (const w of world.workers) assignments.set(w.id, w.assignedFactoryId);

  const idleQueue: string[] = [];
  for (const w of world.workers) {
    if (w.role === 'hauler' && w.assignedFactoryId === null) {
      idleQueue.push(w.id);
    }
  }

  for (const f of world.factories) {
    if (f.typeId === 'farm') continue;
    if (f.demolish) continue; // demolishing factories keep their assigned haulers, no new
    const desired = f.desiredWorkers ?? 1;
    const currentIds: string[] = [];
    for (const w of world.workers) {
      if (w.role === 'hauler' && assignments.get(w.id) === f.id) {
        currentIds.push(w.id);
      }
    }
    let diff = desired - currentIds.length;
    while (diff > 0 && idleQueue.length > 0) {
      const id = idleQueue.shift();
      if (!id) break;
      assignments.set(id, f.id);
      diff--;
    }
    while (diff < 0 && currentIds.length > 0) {
      const id = currentIds.pop();
      if (!id) break;
      assignments.set(id, null);
      idleQueue.push(id);
      diff++;
    }
  }

  let changed = false;
  const newWorkers = world.workers.map((w) => {
    const next = assignments.get(w.id);
    const targetAssigned = next === undefined ? null : next;
    if (targetAssigned === w.assignedFactoryId) return w;
    changed = true;
    const eating = w.phase === 'h-going-to-farm' || w.phase === 'h-eating-at-farm';
    if (eating) return { ...w, assignedFactoryId: targetAssigned };
    return { ...w, assignedFactoryId: targetAssigned, phase: 'h-idle' as const, task: null };
  });

  return changed ? { ...world, workers: newWorkers } : world;
}

export function stepWorld(world: WorldState): WorldState {
  const dispatched = dispatchHaulers(world);
  const newTick = dispatched.tick + 1;

  const newWorkers: Worker[] = [];
  const factoryDeltas = new Map<
    string,
    {
      input: Record<string, number>;
      output: Record<string, number>;
      constructionDelivered: Record<string, number>;
      upgradeDelivered: Record<string, number>;
      foodInventoryDelta: Record<string, number>;
      siteClearedTiles: { x: number; y: number }[];
      demolishProgress: number;
    }
  >();
  /** Tiles harvested this tick — each one decrements the tile's yield by 1. */
  const harvestedTiles: { x: number; y: number }[] = [];
  /** Tiles cleared this tick (site-clearing) — yield set to 0. */
  const fullyDepletedTiles: { x: number; y: number }[] = [];

  const aggregate = (delta: FactoryDelta) => {
    const existing =
      factoryDeltas.get(delta.factoryId) ??
      {
        input: {},
        output: {},
        constructionDelivered: {},
        upgradeDelivered: {},
        foodInventoryDelta: {},
        siteClearedTiles: [],
        demolishProgress: 0,
      };
    if (delta.input) {
      for (const [k, v] of Object.entries(delta.input)) {
        existing.input[k] = (existing.input[k] ?? 0) + v;
      }
    }
    if (delta.output) {
      for (const [k, v] of Object.entries(delta.output)) {
        existing.output[k] = (existing.output[k] ?? 0) + v;
      }
    }
    if (delta.constructionDelivered) {
      for (const [k, v] of Object.entries(delta.constructionDelivered)) {
        existing.constructionDelivered[k] = (existing.constructionDelivered[k] ?? 0) + v;
      }
    }
    if (delta.upgradeDelivered) {
      for (const [k, v] of Object.entries(delta.upgradeDelivered)) {
        existing.upgradeDelivered[k] = (existing.upgradeDelivered[k] ?? 0) + v;
      }
    }
    if (delta.foodInventoryDelta) {
      for (const [k, v] of Object.entries(delta.foodInventoryDelta)) {
        existing.foodInventoryDelta[k] = (existing.foodInventoryDelta[k] ?? 0) + v;
      }
    }
    if (delta.siteClearedTile) {
      existing.siteClearedTiles.push(delta.siteClearedTile);
      fullyDepletedTiles.push(delta.siteClearedTile);
    }
    if (delta.terrainHarvested) harvestedTiles.push(delta.terrainHarvested);
    if (delta.demolishProgress) existing.demolishProgress += delta.demolishProgress;
    factoryDeltas.set(delta.factoryId, existing);
  };

  for (const w of dispatched.workers) {
    let updated = w;
    if (updated.role === 'hauler') {
      updated = { ...updated, energy: Math.max(0, updated.energy - ENERGY_DECAY_PER_TICK) };
    }

    let result: WorkerStepResult;
    if (updated.role === 'inner') {
      if (!updated.assignedFactoryId) {
        newWorkers.push(updated);
        continue;
      }
      const factory = dispatched.factories.find((f) => f.id === updated.assignedFactoryId);
      if (!factory) {
        newWorkers.push(updated);
        continue;
      }
      result = stepInnerWorker(updated, factory);
    } else {
      result = stepHauler(updated, dispatched);
    }
    newWorkers.push(result.worker);
    for (const d of result.deltas) aggregate(d);
  }

  // Farms produce grain on a per-tier cadence. Tier-1: every FARM_GRAIN_PERIOD
  // ticks; higher tiers fire faster via tierProductionMultiplier.
  for (const f of dispatched.factories) {
    if (f.typeId !== 'farm') continue;
    if (!f.construction.complete) continue;
    if (f.demolish || f.siteClearing.length > 0) continue;
    const mult = BALANCE.farm.tierProductionMultiplier[f.factoryTier] ?? 1;
    const period = Math.max(1, Math.floor(FARM_GRAIN_PERIOD / mult));
    if (newTick % period === 0) {
      aggregate({ factoryId: f.id, output: { grain: 1 } });
    }
  }

  const removedFactoryIds = new Set<string>();

  const factoriesAfterDelta = dispatched.factories.map((f) => {
    const delta = factoryDeltas.get(f.id);
    if (!delta) return f;
    const newInput = { ...f.inputBuffers };
    const newOutput = { ...f.outputBuffers };
    for (const [k, v] of Object.entries(delta.input)) {
      newInput[k] = Math.max(0, (newInput[k] ?? 0) + v);
    }
    for (const [k, v] of Object.entries(delta.output)) {
      newOutput[k] = Math.max(0, (newOutput[k] ?? 0) + v);
    }
    let construction = f.construction;
    if (!construction.complete && Object.keys(delta.constructionDelivered).length > 0) {
      const required = FACTORY_TYPES[f.typeId]?.constructionCost?.resources ?? {};
      const newDelivered = { ...construction.delivered };
      for (const [item, amt] of Object.entries(delta.constructionDelivered)) {
        const cap = required[item] ?? 0;
        if (cap <= 0) continue;
        newDelivered[item] = Math.min(cap, (newDelivered[item] ?? 0) + amt);
      }
      const isComplete = Object.entries(required).every(
        ([item, amt]) => (newDelivered[item] ?? 0) >= amt,
      );
      construction = { delivered: newDelivered, complete: isComplete };
    }
    let pendingUpgrade = f.pendingUpgrade;
    let factoryTier = f.factoryTier;
    if (
      pendingUpgrade &&
      !pendingUpgrade.complete &&
      Object.keys(delta.upgradeDelivered).length > 0
    ) {
      const required = (f.typeId === 'farm' ? BALANCE.farmUpgrade[factoryTier + 1] : null) ?? {};
      const newDelivered = { ...pendingUpgrade.delivered };
      for (const [item, amt] of Object.entries(delta.upgradeDelivered)) {
        const cap = required[item] ?? 0;
        if (cap <= 0) continue;
        newDelivered[item] = Math.min(cap, (newDelivered[item] ?? 0) + amt);
      }
      const isComplete = Object.entries(required).every(
        ([item, amt]) => (newDelivered[item] ?? 0) >= amt,
      );
      if (isComplete) {
        // Upgrade applies — bump tier, clear pending state.
        factoryTier = factoryTier + 1;
        pendingUpgrade = null;
      } else {
        pendingUpgrade = { delivered: newDelivered, complete: false };
      }
    }
    let foodInventory = f.foodInventory ?? {};
    if (Object.keys(delta.foodInventoryDelta).length > 0) {
      foodInventory = { ...foodInventory };
      for (const [k, v] of Object.entries(delta.foodInventoryDelta)) {
        foodInventory[k] = Math.max(0, (foodInventory[k] ?? 0) + v);
      }
    }

    let siteClearing = f.siteClearing ?? [];
    if (delta.siteClearedTiles.length > 0) {
      const cleared = new Set(delta.siteClearedTiles.map((c) => `${c.x},${c.y}`));
      siteClearing = siteClearing.filter((t) => !cleared.has(`${t.x},${t.y}`));
    }

    let demolish = f.demolish;
    if (delta.demolishProgress > 0 && demolish) {
      const newProgress = demolish.progress + delta.demolishProgress;
      if (newProgress >= demolish.total) {
        removedFactoryIds.add(f.id);
        demolish = { ...demolish, progress: demolish.total };
      } else {
        demolish = { ...demolish, progress: newProgress };
      }
    }

    return {
      ...f,
      inputBuffers: newInput,
      outputBuffers: newOutput,
      construction,
      foodInventory,
      siteClearing,
      demolish,
      pendingUpgrade,
      factoryTier,
    };
  });

  const factoriesAfterMachines = factoriesAfterDelta.map((f) => {
    if (removedFactoryIds.has(f.id) || !f.machines || f.machines.length === 0) return f;
    if (f.demolish || !f.construction.complete || f.siteClearing.length > 0) {
      return f;
    }
    let inputBuffers = f.inputBuffers;
    let outputBuffers = f.outputBuffers;
    let bufferDirty = false;

    const newMachines = f.machines.map((m) => {
      const type = MACHINE_TYPES[m.typeId];
      if (!type) return m;

      if (m.status === 'building') {
        const newProgress = m.buildProgress + 1;
        if (newProgress >= type.buildTicks) {
          return {
            ...m,
            status: 'operational' as const,
            buildProgress: type.buildTicks,
            cycleProgress: 0,
          };
        }
        return { ...m, buildProgress: newProgress };
      }

      const recipe = type.recipe;
      const requiredTier = type.requiredWorkerTier ?? 1;
      // Count qualified workers assigned to this specific machine.
      const stations = machineStations(type);
      let qualifiedWorkers = 0;
      for (const w of newWorkers) {
        if (w.role !== 'inner') continue;
        if (w.assignedFactoryId !== f.id) continue;
        if (w.targetMachineId !== m.id) continue;
        if (w.energy <= 0) continue;
        if (w.tier < requiredTier) continue;
        qualifiedWorkers++;
      }
      const throughput = Math.min(stations, qualifiedWorkers);
      if (throughput <= 0) {
        // No qualified worker — stall machine
        return { ...m, cycleProgress: Math.min(m.cycleProgress, recipe.ticksPerCycle) };
      }

      const nextCycle = m.cycleProgress + throughput;
      if (nextCycle < recipe.ticksPerCycle) {
        return { ...m, cycleProgress: nextCycle };
      }
      const hasAll = Object.entries(recipe.inputs).every(
        ([item, amt]) => (inputBuffers[item] ?? 0) >= amt,
      );
      if (!hasAll) {
        return { ...m, cycleProgress: recipe.ticksPerCycle };
      }
      if (!bufferDirty) {
        inputBuffers = { ...inputBuffers };
        outputBuffers = { ...outputBuffers };
        bufferDirty = true;
      }
      for (const [item, amt] of Object.entries(recipe.inputs)) {
        inputBuffers[item] = Math.max(0, (inputBuffers[item] ?? 0) - amt);
      }
      for (const [item, amt] of Object.entries(recipe.outputs)) {
        outputBuffers[item] = (outputBuffers[item] ?? 0) + amt;
      }
      return { ...m, cycleProgress: 0 };
    });

    let machinesChanged = false;
    for (let i = 0; i < newMachines.length; i++) {
      if (newMachines[i] !== f.machines[i]) {
        machinesChanged = true;
        break;
      }
    }
    if (!bufferDirty && !machinesChanged) return f;
    return { ...f, machines: newMachines, inputBuffers, outputBuffers };
  });

  const survivingFactories = factoriesAfterMachines.filter((f) => !removedFactoryIds.has(f.id));

  const finalWorkers: Worker[] =
    removedFactoryIds.size === 0
      ? newWorkers
      : newWorkers
          .filter(
            (w) => !(w.role === 'inner' && w.assignedFactoryId && removedFactoryIds.has(w.assignedFactoryId)),
          )
          .map((w) => {
            if (w.role !== 'hauler' || !w.assignedFactoryId) return w;
            if (!removedFactoryIds.has(w.assignedFactoryId)) return w;
            return { ...w, assignedFactoryId: null, phase: 'h-idle' as const, task: null, carrying: null };
          });

  // Apply terrain harvest decrements + site-clearing depletions to tileResources.
  let newTileResources: Record<string, number> = dispatched.tileResources;
  if (harvestedTiles.length > 0 || fullyDepletedTiles.length > 0) {
    newTileResources = { ...dispatched.tileResources };
    for (const t of harvestedTiles) {
      const key = `${t.x},${t.y}`;
      const existing = newTileResources[key];
      if (existing !== undefined) {
        newTileResources[key] = Math.max(0, existing - 1);
      } else {
        const terr = getTerrainAt(dispatched.seed, t.x, t.y);
        const def = terr ? defaultTileYield(terr) : 0;
        newTileResources[key] = Math.max(0, def - 1);
      }
    }
    for (const t of fullyDepletedTiles) {
      newTileResources[`${t.x},${t.y}`] = 0;
    }
  }

  return {
    ...dispatched,
    tick: newTick,
    workers: finalWorkers,
    factories: survivingFactories,
    tileResources: newTileResources,
  };
}
