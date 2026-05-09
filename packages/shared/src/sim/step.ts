import { FACTORY_TYPES } from '../data/factoryTypes.js';
import { foodForTier } from '../data/foodTiers.js';
import { MACHINE_TYPES } from '../data/machineTypes.js';
import type { FactoryInstance } from '../types/factory.js';
import type { Worker } from '../types/worker.js';
import { HUNGER_THRESHOLD, MAX_ENERGY } from '../types/worker.js';
import type { WorldState } from '../types/world.js';
import { bayWorldPos, findBay, findMachine } from '../world/factoryLayout.js';
import {
  WORLD_GRID_TILES,
  findNearestFactorySource,
  findNearestFoodSource,
  findNearestTree,
} from '../world/terrain.js';

const INNER_SPEED = 0.15;
const OUTER_SPEED = 0.1;
const AT_BAY_TICKS = 5;
const AT_MACHINE_TICKS = 20;
const HARVEST_TICKS = 20;
const DELIVER_TICKS = 5;
const EAT_DURATION_TICKS = 20;
const ENERGY_DECAY_PER_TICK = 1;
const FARM_PRODUCTION_PERIOD = 100;
const FACTORY_FOOD_THRESHOLD = 3;

interface Vec2 {
  x: number;
  y: number;
}

interface FactoryDelta {
  factoryId: string;
  input?: Record<string, number>;
  output?: Record<string, number>;
  construction?: number;
  foodBuffer?: number;
  siteClearedTile?: { x: number; y: number };
  demolishProgress?: number;
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
  const inputItem = factoryType?.primaryInput?.item;
  const outputItem = factoryType?.primaryOutput?.item;
  if (!inputItem || !outputItem) return { worker: w, deltas: [] };

  const inputBay = findBay(factory.innerLayout, 'W');
  const outputBay = findBay(factory.innerLayout, 'E');
  const machine = findMachine(factory.innerLayout);
  if (!inputBay || !outputBay || !machine) return { worker: w, deltas: [] };

  const decayed = { ...w, energy: Math.max(0, w.energy - ENERGY_DECAY_PER_TICK) };

  if (decayed.energy < HUNGER_THRESHOLD && (factory.foodBuffer ?? 0) >= 1) {
    return {
      worker: { ...decayed, energy: MAX_ENERGY, mealsEaten: decayed.mealsEaten + 1 },
      deltas: [{ factoryId: factory.id, foodBuffer: -1 }],
    };
  }

  if (decayed.energy === 0) {
    return { worker: decayed, deltas: [] };
  }

  switch (decayed.phase) {
    case 'to-input': {
      const r = moveTowards(decayed.position, tileCenter(inputBay), INNER_SPEED);
      if (r.reached) {
        return {
          worker: { ...decayed, position: r.pos, phase: 'at-input', phaseTicks: AT_BAY_TICKS },
          deltas: [],
        };
      }
      return { worker: { ...decayed, position: r.pos }, deltas: [] };
    }
    case 'at-input': {
      if (decayed.phaseTicks > 0) {
        return { worker: { ...decayed, phaseTicks: decayed.phaseTicks - 1 }, deltas: [] };
      }
      const available = (factory.inputBuffers[inputItem] ?? 0) >= 1;
      if (!available) {
        return { worker: { ...decayed, phaseTicks: AT_BAY_TICKS }, deltas: [] };
      }
      return {
        worker: { ...decayed, phase: 'to-machine', carrying: inputItem },
        deltas: [{ factoryId: factory.id, input: { [inputItem]: -1 } }],
      };
    }
    case 'to-machine': {
      const r = moveTowards(decayed.position, tileCenter(machine), INNER_SPEED);
      if (r.reached) {
        return {
          worker: { ...decayed, position: r.pos, phase: 'at-machine', phaseTicks: AT_MACHINE_TICKS },
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
          deltas: [{ factoryId: factory.id, output: { [outputItem]: 1 } }],
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
  const factoryCenter: Vec2 = { x: factory.worldX + 0.5, y: factory.worldY + 0.5 };

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

      // Then site clearing
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

      // Then food (only if operational)
      const wantsFood =
        factory.typeId !== 'farm' &&
        isOperational(factory) &&
        (factory.foodBuffer ?? 0) < FACTORY_FOOD_THRESHOLD;
      if (wantsFood) {
        const innerWorker = world.workers.find(
          (iw) => iw.role === 'inner' && iw.assignedFactoryId === factory.id,
        );
        const foodItem = foodForTier(innerWorker?.tier ?? 1);
        const src = findNearestFoodSource(world.factories, w.position.x, w.position.y, foodItem);
        if (src && src.factoryId !== factory.id) {
          return {
            worker: {
              ...w,
              phase: 'h-to-resource',
              task: {
                itemType: foodItem,
                source: { kind: 'factory', factoryId: src.factoryId, x: src.x, y: src.y },
              },
            },
            deltas: [],
          };
        }
      }

      // Then primary input (operational or construction)
      const primaryInput = factoryType?.primaryInput;
      if (!primaryInput) return { worker: w, deltas: [] };

      if (primaryInput.from === 'terrain') {
        const tree = findNearestTree(
          world.seed,
          Math.floor(w.position.x),
          Math.floor(w.position.y),
          WORLD_GRID_TILES,
          WORLD_GRID_TILES,
          world.clearedTiles,
        );
        if (!tree) return { worker: w, deltas: [] };
        return {
          worker: {
            ...w,
            phase: 'h-to-resource',
            task: {
              itemType: primaryInput.item,
              source: { kind: 'terrain', x: tree.x, y: tree.y },
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
              construction: 1,
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
      }
      return {
        worker: { ...w, carrying: item, phase: 'h-to-factory' },
        deltas,
      };
    }
    case 'h-to-factory': {
      const r = moveTowards(w.position, factoryCenter, OUTER_SPEED);
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
      const isFoodDelivery =
        w.task?.itemType !== undefined
          ? w.task.itemType === foodForTier(1) || w.task.itemType === foodForTier(2)
          : carriedItem === 'food' || carriedItem === 'bread';
      let delivery: FactoryDelta;
      if (isFoodDelivery) {
        delivery = { factoryId: factory.id, foodBuffer: 1 };
      } else if (!factory.construction.complete) {
        delivery = { factoryId: factory.id, construction: 1 };
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
      construction: number;
      foodBuffer: number;
      clearedTiles: { x: number; y: number }[];
      demolishProgress: number;
    }
  >();

  const aggregate = (delta: FactoryDelta) => {
    const existing =
      factoryDeltas.get(delta.factoryId) ??
      {
        input: {},
        output: {},
        construction: 0,
        foodBuffer: 0,
        clearedTiles: [],
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
    if (delta.construction) existing.construction += delta.construction;
    if (delta.foodBuffer) existing.foodBuffer += delta.foodBuffer;
    if (delta.siteClearedTile) existing.clearedTiles.push(delta.siteClearedTile);
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

  if (newTick % FARM_PRODUCTION_PERIOD === 0) {
    for (const f of dispatched.factories) {
      if (f.typeId === 'farm') {
        aggregate({ factoryId: f.id, output: { food: 1 } });
      }
    }
  }

  const removedFactoryIds = new Set<string>();
  const newlyClearedTiles: { x: number; y: number }[] = [];

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
    if (delta.construction > 0 && !construction.complete) {
      const cost = FACTORY_TYPES[f.typeId]?.constructionCost?.amount ?? 0;
      const received = construction.received + delta.construction;
      construction = {
        received: Math.min(received, cost),
        complete: received >= cost,
      };
    }
    let foodBuffer = f.foodBuffer ?? 0;
    if (delta.foodBuffer) foodBuffer = Math.max(0, foodBuffer + delta.foodBuffer);

    let siteClearing = f.siteClearing ?? [];
    if (delta.clearedTiles.length > 0) {
      for (const c of delta.clearedTiles) newlyClearedTiles.push(c);
      const cleared = new Set(delta.clearedTiles.map((c) => `${c.x},${c.y}`));
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
      foodBuffer,
      siteClearing,
      demolish,
    };
  });

  const innerTierByFactory = new Map<string, number>();
  for (const w of newWorkers) {
    if (w.role === 'inner' && w.assignedFactoryId) {
      innerTierByFactory.set(w.assignedFactoryId, w.tier);
    }
  }

  const factoriesAfterMachines = factoriesAfterDelta.map((f) => {
    if (removedFactoryIds.has(f.id) || !f.machines || f.machines.length === 0) return f;
    if (f.demolish || !f.construction.complete || f.siteClearing.length > 0) {
      return f;
    }
    const innerTier = innerTierByFactory.get(f.id) ?? 1;
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
      if (innerTier < requiredTier) {
        // Worker tier insufficient — stall machine
        return { ...m, cycleProgress: Math.min(m.cycleProgress, recipe.ticksPerCycle) };
      }

      const nextCycle = m.cycleProgress + 1;
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

  const newClearedTiles =
    newlyClearedTiles.length === 0
      ? dispatched.clearedTiles
      : {
          ...dispatched.clearedTiles,
          ...Object.fromEntries(newlyClearedTiles.map((c) => [`${c.x},${c.y}`, true as const])),
        };

  return {
    ...dispatched,
    tick: newTick,
    workers: finalWorkers,
    factories: survivingFactories,
    clearedTiles: newClearedTiles,
  };
}
