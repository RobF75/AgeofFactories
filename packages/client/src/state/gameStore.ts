import { create } from 'zustand';
import {
  FACTORY_TYPES,
  MACHINE_TYPES,
  MAX_WORKER_TIER,
  MEALS_TO_PROMOTE,
  createDefaultInnerLayout,
  createIdleHauler,
  createInitialInnerWorker,
  createInitialWorld,
  getTerrainAt,
  migrateWorld,
  stepWorld,
  type FactoryInstance,
  type Machine,
  type WorldState,
} from '@aof/shared';

export type View = { kind: 'world' } | { kind: 'factory'; factoryId: string };
export type BuildMode = { kind: 'none' } | { kind: 'place-factory'; typeId: string };

const DEMOLISH_TOTAL = 100;

interface GameState {
  world: WorldState | null;
  lastSavedAt: number | null;
  view: View;
  buildMode: BuildMode;
  selectedFactoryId: string | null;
  setWorld: (world: WorldState | null) => void;
  applyTick: () => void;
  markSaved: (ts: number) => void;
  setView: (view: View) => void;
  setBuildMode: (mode: BuildMode) => void;
  selectFactory: (id: string | null) => void;
  setDesiredWorkers: (factoryId: string, count: number) => void;
  placeFactory: (typeId: string, worldX: number, worldY: number) => string;
  hireWorker: () => boolean;
  fireWorker: () => boolean;
  beginDemolish: (factoryId: string) => void;
  cancelDemolish: (factoryId: string) => void;
  buildMachine: (factoryId: string, machineTypeId: string) => boolean;
  promoteInnerWorker: (factoryId: string) => boolean;
  resetWorld: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  world: null,
  lastSavedAt: null,
  view: { kind: 'world' },
  buildMode: { kind: 'none' },
  selectedFactoryId: null,
  setWorld: (world) =>
    set({
      world: world ? migrateWorld(world) : null,
      view: { kind: 'world' },
      buildMode: { kind: 'none' },
      selectedFactoryId: null,
    }),
  applyTick: () =>
    set((s) => {
      if (!s.world) return {};
      const next = stepWorld(s.world);
      if (
        s.selectedFactoryId &&
        !next.factories.some((f) => f.id === s.selectedFactoryId)
      ) {
        return { world: next, selectedFactoryId: null };
      }
      return { world: next };
    }),
  markSaved: (ts) => set({ lastSavedAt: ts }),
  setView: (view) => set({ view }),
  setBuildMode: (mode) => set({ buildMode: mode }),
  selectFactory: (id) => set({ selectedFactoryId: id }),
  setDesiredWorkers: (factoryId, count) =>
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) =>
                f.id === factoryId
                  ? { ...f, desiredWorkers: Math.max(0, Math.min(10, Math.floor(count))) }
                  : f,
              ),
            },
          }
        : {},
    ),
  placeFactory: (typeId, worldX, worldY) => {
    const id = crypto.randomUUID();
    const type = FACTORY_TYPES[typeId];
    if (!type) throw new Error(`unknown factory type: ${typeId}`);

    const state = get();
    const world = state.world;
    if (!world) throw new Error('no world loaded');

    const siteClearing: { x: number; y: number }[] = [];
    for (let dy = 0; dy < type.baseFootprint.h; dy++) {
      for (let dx = 0; dx < type.baseFootprint.w; dx++) {
        const tx = worldX + dx;
        const ty = worldY + dy;
        const isCleared = world.clearedTiles[`${tx},${ty}`] === true;
        if (!isCleared && getTerrainAt(world.seed, tx, ty) === 'tree') {
          siteClearing.push({ x: tx, y: ty });
        }
      }
    }

    const factory: FactoryInstance = {
      id,
      typeId,
      worldX,
      worldY,
      innerLayout: createDefaultInnerLayout(type),
      allocations: { production: 0.8, rd: 0.1, maintenance: 0.1 },
      wear: 0,
      activeResearchId: null,
      inputBuffers: {},
      outputBuffers: {},
      currentRecipeId: null,
      construction: { received: 0, complete: !type.constructionCost },
      desiredWorkers: type.id === 'farm' ? 0 : 1,
      foodBuffer: 0,
      siteClearing,
      demolish: null,
      machines: [],
    };
    set((s) => {
      if (!s.world) return {};
      const newWorkers = [...s.world.workers];
      if (type.id !== 'farm') {
        newWorkers.push(createInitialInnerWorker(id, factory));
      }
      return {
        world: {
          ...s.world,
          factories: [...s.world.factories, factory],
          workers: newWorkers,
        },
      };
    });
    return id;
  },
  hireWorker: () => {
    const state = get();
    if (!state.world) return false;
    const farmWithFood = state.world.factories.find(
      (f) => f.typeId === 'farm' && (f.outputBuffers['food'] ?? 0) >= 1,
    );
    if (!farmWithFood) return false;
    const spawnX = farmWithFood.worldX + 0.5;
    const spawnY = farmWithFood.worldY + 0.5;
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) =>
                f.id === farmWithFood.id
                  ? {
                      ...f,
                      outputBuffers: {
                        ...f.outputBuffers,
                        food: (f.outputBuffers['food'] ?? 0) - 1,
                      },
                    }
                  : f,
              ),
              workers: [...s.world.workers, createIdleHauler(spawnX, spawnY)],
            },
          }
        : {},
    );
    return true;
  },
  fireWorker: () => {
    const state = get();
    if (!state.world) return false;
    const idle = state.world.workers.find(
      (w) => w.role === 'hauler' && w.assignedFactoryId === null,
    );
    if (!idle) return false;
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              workers: s.world.workers.filter((w) => w.id !== idle.id),
            },
          }
        : {},
    );
    return true;
  },
  beginDemolish: (factoryId) =>
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) =>
                f.id === factoryId && !f.demolish
                  ? { ...f, demolish: { progress: 0, total: DEMOLISH_TOTAL } }
                  : f,
              ),
            },
          }
        : {},
    ),
  cancelDemolish: (factoryId) =>
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) =>
                f.id === factoryId ? { ...f, demolish: null } : f,
              ),
            },
          }
        : {},
    ),
  buildMachine: (factoryId, machineTypeId) => {
    const state = get();
    if (!state.world) return false;
    const factory = state.world.factories.find((f) => f.id === factoryId);
    if (!factory) return false;
    const type = MACHINE_TYPES[machineTypeId];
    if (!type) return false;
    if (
      factory.demolish ||
      !factory.construction.complete ||
      factory.siteClearing.length > 0
    ) {
      return false;
    }
    const hasCost = Object.entries(type.buildCost).every(
      ([item, amt]) => (factory.inputBuffers[item] ?? 0) >= amt,
    );
    if (!hasCost) return false;

    const newMachine: Machine = {
      id: crypto.randomUUID(),
      typeId: machineTypeId,
      status: 'building',
      buildProgress: 0,
      cycleProgress: 0,
    };
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) => {
                if (f.id !== factoryId) return f;
                const newInput = { ...f.inputBuffers };
                for (const [item, amt] of Object.entries(type.buildCost)) {
                  newInput[item] = Math.max(0, (newInput[item] ?? 0) - amt);
                }
                return {
                  ...f,
                  inputBuffers: newInput,
                  machines: [...f.machines, newMachine],
                };
              }),
            },
          }
        : {},
    );
    return true;
  },
  promoteInnerWorker: (factoryId) => {
    const state = get();
    if (!state.world) return false;
    const w = state.world.workers.find(
      (x) => x.role === 'inner' && x.assignedFactoryId === factoryId,
    );
    if (!w) return false;
    if (w.tier >= MAX_WORKER_TIER) return false;
    if (w.mealsEaten < MEALS_TO_PROMOTE) return false;
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              workers: s.world.workers.map((x) =>
                x.id === w.id ? { ...x, tier: x.tier + 1, mealsEaten: 0 } : x,
              ),
            },
          }
        : {},
    );
    return true;
  },
  resetWorld: () =>
    set({
      world: createInitialWorld(),
      view: { kind: 'world' },
      buildMode: { kind: 'none' },
      selectedFactoryId: null,
      lastSavedAt: null,
    }),
}));
