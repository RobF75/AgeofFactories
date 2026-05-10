import { create } from 'zustand';
import {
  BALANCE,
  FACTORY_TYPES,
  MACHINE_TYPES,
  MAX_WORKER_TIER,
  MEALS_TO_PROMOTE,
  createDefaultInnerLayout,
  createDefaultMachine,
  createIdleHauler,
  createInitialInnerWorker,
  createInitialWorld,
  getTerrainAt,
  isPerimeterTile,
  machineStations,
  migrateWorld,
  stepWorld,
  type FactoryInstance,
  type InnerTile,
  type Machine,
  type WorldState,
} from '@aof/shared';

export type View = { kind: 'world' } | { kind: 'factory'; factoryId: string };
export type BuildMode = { kind: 'none' } | { kind: 'place-factory'; typeId: string };
export type FactoryEditMode =
  | { kind: 'none' }
  | { kind: 'move-bay'; side: 'W' | 'E' }
  | { kind: 'place-machine'; machineTypeId: string };

const DEMOLISH_TOTAL = 100;

interface GameState {
  world: WorldState | null;
  lastSavedAt: number | null;
  view: View;
  buildMode: BuildMode;
  selectedFactoryId: string | null;
  factoryEditMode: FactoryEditMode;
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
  /** Adds an inner worker to the factory. Cost: 1 food from any farm. Capped by total stations. */
  addInnerWorker: (factoryId: string) => boolean;
  /** Removes the most recently hired inner worker from the factory. Always leaves at least one. */
  removeInnerWorker: (factoryId: string) => boolean;
  beginDemolish: (factoryId: string) => void;
  cancelDemolish: (factoryId: string) => void;
  buildMachine: (
    factoryId: string,
    machineTypeId: string,
    innerX: number,
    innerY: number,
  ) => boolean;
  promoteInnerWorker: (factoryId: string) => boolean;
  /** Begins a tier upgrade. Haulers will gather the listed materials over time. */
  beginFarmUpgrade: (factoryId: string) => boolean;
  cancelFarmUpgrade: (factoryId: string) => boolean;
  setFactoryEditMode: (mode: FactoryEditMode) => void;
  moveBay: (factoryId: string, side: 'W' | 'E', innerX: number, innerY: number) => boolean;
  resetWorld: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  world: null,
  lastSavedAt: null,
  view: { kind: 'world' },
  buildMode: { kind: 'none' },
  selectedFactoryId: null,
  factoryEditMode: { kind: 'none' },
  setWorld: (world) =>
    set({
      world: world ? migrateWorld(world) : null,
      view: { kind: 'world' },
      buildMode: { kind: 'none' },
      selectedFactoryId: null,
      factoryEditMode: { kind: 'none' },
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
  setView: (view) => set({ view, factoryEditMode: { kind: 'none' } }),
  setFactoryEditMode: (mode) => set({ factoryEditMode: mode }),
  moveBay: (factoryId, side, innerX, innerY) => {
    const state = get();
    if (!state.world) return false;
    const factory = state.world.factories.find((f) => f.id === factoryId);
    if (!factory) return false;
    const type = FACTORY_TYPES[factory.typeId];
    if (!type) return false;
    if (!isPerimeterTile(innerX, innerY, type.innerGrid.w, type.innerGrid.h)) return false;
    const targetTile = factory.innerLayout[innerY]?.[innerX];
    if (!targetTile) return false;
    if (targetTile.kind !== 'empty' && !(targetTile.kind === 'bay' && targetTile.side === side)) {
      return false;
    }
    const newLayout: InnerTile[][] = factory.innerLayout.map((row) => row.slice());
    for (let y = 0; y < newLayout.length; y++) {
      const row = newLayout[y];
      if (!row) continue;
      for (let x = 0; x < row.length; x++) {
        const t = row[x];
        if (t && t.kind === 'bay' && t.side === side) {
          row[x] = { kind: 'empty' };
        }
      }
    }
    const newRow = newLayout[innerY];
    if (newRow) {
      newRow[innerX] = { kind: 'bay', bayType: 'hand', side };
    }
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) =>
                f.id === factoryId ? { ...f, innerLayout: newLayout } : f,
              ),
            },
            factoryEditMode: { kind: 'none' },
          }
        : {},
    );
    return true;
  },
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
        const remaining = world.tileResources[`${tx},${ty}`];
        const isCleared = remaining !== undefined && remaining <= 0;
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
      construction: { delivered: {}, complete: !type.constructionCost },
      desiredWorkers: type.id === 'farm' ? 0 : 1,
      foodInventory: {},
      siteClearing,
      demolish: null,
      machines: [],
      factoryTier: 1,
      pendingUpgrade: null,
    };
    if (type.id !== 'farm') {
      const defaultMachine = createDefaultMachine(type);
      if (defaultMachine) {
        // Default machine is operational once construction completes; for new factories
        // construction is incomplete, so we still add it (it just sits idle until then).
        factory.machines = [defaultMachine];
      }
    }
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
    // A new hauler costs 1 unit of any sustenance item from any farm.
    const sustenanceItems = ['grain', 'food'];
    let chosenItem: string | null = null;
    const farmWithFood = state.world.factories.find((f) => {
      if (f.typeId !== 'farm') return false;
      for (const item of sustenanceItems) {
        if ((f.outputBuffers[item] ?? 0) >= 1) {
          chosenItem = item;
          return true;
        }
      }
      return false;
    });
    if (!farmWithFood || !chosenItem) return false;
    const spawnX = farmWithFood.worldX + 0.5;
    const spawnY = farmWithFood.worldY + 0.5;
    const consumedItem: string = chosenItem;
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
                        [consumedItem]: (f.outputBuffers[consumedItem] ?? 0) - 1,
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
  addInnerWorker: (factoryId) => {
    const state = get();
    if (!state.world) return false;
    const factory = state.world.factories.find((f) => f.id === factoryId);
    if (!factory) return false;
    if (factory.demolish || !factory.construction.complete || factory.siteClearing.length > 0) {
      return false;
    }
    // Cap by total stations across operational machines.
    const operationalMachines = factory.machines.filter((m) => m.status === 'operational');
    const totalStations = operationalMachines.reduce((sum, m) => {
      const t = MACHINE_TYPES[m.typeId];
      return sum + (t ? machineStations(t) : 0);
    }, 0);
    const currentInner = state.world.workers.filter(
      (w) => w.role === 'inner' && w.assignedFactoryId === factoryId,
    ).length;
    if (currentInner >= totalStations) return false;
    if (operationalMachines.length === 0) return false;
    const sustenanceItems = ['grain', 'food'];
    let chosenItem: string | null = null;
    const farmWithFood = state.world.factories.find((f) => {
      if (f.typeId !== 'farm') return false;
      for (const item of sustenanceItems) {
        if ((f.outputBuffers[item] ?? 0) >= 1) {
          chosenItem = item;
          return true;
        }
      }
      return false;
    });
    if (!farmWithFood || !chosenItem) return false;
    const consumedItem: string = chosenItem;
    // Pick least-loaded machine.
    const loadByMachine = new Map<string, number>();
    for (const m of operationalMachines) loadByMachine.set(m.id, 0);
    for (const w of state.world.workers) {
      if (w.role !== 'inner' || w.assignedFactoryId !== factoryId || !w.targetMachineId) continue;
      if (loadByMachine.has(w.targetMachineId)) {
        loadByMachine.set(w.targetMachineId, (loadByMachine.get(w.targetMachineId) ?? 0) + 1);
      }
    }
    const firstMachine = operationalMachines[0];
    if (!firstMachine) return false;
    let leastMachineId = firstMachine.id;
    let leastLoad = loadByMachine.get(leastMachineId) ?? 0;
    for (const m of operationalMachines) {
      const load = loadByMachine.get(m.id) ?? 0;
      if (load < leastLoad) {
        leastLoad = load;
        leastMachineId = m.id;
      }
    }
    const newWorker = {
      ...createInitialInnerWorker(factoryId, factory),
      targetMachineId: leastMachineId,
    };
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
                        [consumedItem]: (f.outputBuffers[consumedItem] ?? 0) - 1,
                      },
                    }
                  : f,
              ),
              workers: [...s.world.workers, newWorker],
            },
          }
        : {},
    );
    return true;
  },
  removeInnerWorker: (factoryId) => {
    const state = get();
    if (!state.world) return false;
    const inner = state.world.workers.filter(
      (w) => w.role === 'inner' && w.assignedFactoryId === factoryId,
    );
    if (inner.length <= 1) return false; // always keep at least one
    const removed = inner[inner.length - 1];
    if (!removed) return false;
    const removedId = removed.id;
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              workers: s.world.workers.filter((w) => w.id !== removedId),
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
  buildMachine: (factoryId, machineTypeId, innerX, innerY) => {
    const state = get();
    if (!state.world) return false;
    const factory = state.world.factories.find((f) => f.id === factoryId);
    if (!factory) return false;
    const type = MACHINE_TYPES[machineTypeId];
    if (!type) return false;
    const factoryType = FACTORY_TYPES[factory.typeId];
    if (!factoryType) return false;
    if (
      factory.demolish ||
      !factory.construction.complete ||
      factory.siteClearing.length > 0
    ) {
      return false;
    }
    if (
      innerX < 0 ||
      innerY < 0 ||
      innerX >= factoryType.innerGrid.w ||
      innerY >= factoryType.innerGrid.h
    ) {
      return false;
    }
    if (isPerimeterTile(innerX, innerY, factoryType.innerGrid.w, factoryType.innerGrid.h)) {
      return false;
    }
    if (factory.machines.some((m) => m.innerX === innerX && m.innerY === innerY)) {
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
      innerX,
      innerY,
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
            factoryEditMode: { kind: 'none' },
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
    if (w.nextTierMealsEaten < MEALS_TO_PROMOTE) return false;
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              workers: s.world.workers.map((x) =>
                x.id === w.id
                  ? { ...x, tier: x.tier + 1, mealsEaten: 0, nextTierMealsEaten: 0 }
                  : x,
              ),
            },
          }
        : {},
    );
    return true;
  },
  beginFarmUpgrade: (factoryId) => {
    const state = get();
    if (!state.world) return false;
    const factory = state.world.factories.find((f) => f.id === factoryId);
    if (!factory) return false;
    if (factory.typeId !== 'farm') return false;
    if (!factory.construction.complete || factory.demolish || factory.siteClearing.length > 0) {
      return false;
    }
    if (factory.pendingUpgrade) return false;
    const targetTier = factory.factoryTier + 1;
    const cost = BALANCE.farmUpgrade[targetTier];
    if (!cost) return false;
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) =>
                f.id === factoryId
                  ? { ...f, pendingUpgrade: { delivered: {}, complete: false } }
                  : f,
              ),
            },
          }
        : {},
    );
    return true;
  },
  cancelFarmUpgrade: (factoryId) => {
    set((s) =>
      s.world
        ? {
            world: {
              ...s.world,
              factories: s.world.factories.map((f) =>
                f.id === factoryId ? { ...f, pendingUpgrade: null } : f,
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
