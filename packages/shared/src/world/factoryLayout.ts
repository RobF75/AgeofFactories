import { defaultMachineTypeFor, MACHINE_TYPES } from '../data/machineTypes.js';
import type { FactoryInstance, FactoryType, InnerTile } from '../types/factory.js';
import type { Machine } from '../types/machine.js';
import type { Worker } from '../types/worker.js';
import { MAX_ENERGY } from '../types/worker.js';

export function createDefaultInnerLayout(type: FactoryType): InnerTile[][] {
  const { w, h } = type.innerGrid;
  const layout: InnerTile[][] = [];
  for (let y = 0; y < h; y++) {
    const row: InnerTile[] = [];
    for (let x = 0; x < w; x++) {
      row.push({ kind: 'empty' });
    }
    layout.push(row);
  }
  if (type.id === 'farm') return layout;

  const midY = Math.floor(h / 2);
  const midRow = layout[midY];
  if (midRow) {
    midRow[0] = { kind: 'bay', bayType: 'hand', side: 'W' };
    midRow[w - 1] = { kind: 'bay', bayType: 'hand', side: 'E' };
  }
  return layout;
}

export function createDefaultMachine(type: FactoryType): Machine | null {
  const machineTypeId = defaultMachineTypeFor(type.id);
  if (!machineTypeId || !MACHINE_TYPES[machineTypeId]) return null;
  return {
    id: crypto.randomUUID(),
    typeId: machineTypeId,
    status: 'operational',
    buildProgress: MACHINE_TYPES[machineTypeId].buildTicks,
    cycleProgress: 0,
    innerX: Math.floor(type.innerGrid.w / 2),
    innerY: Math.floor(type.innerGrid.h / 2),
  };
}

export function findBay(
  layout: InnerTile[][],
  side: 'N' | 'E' | 'S' | 'W',
): { x: number; y: number } | null {
  for (let y = 0; y < layout.length; y++) {
    const row = layout[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (tile && tile.kind === 'bay' && tile.side === side) return { x, y };
    }
  }
  return null;
}

/** Legacy lookup used by older code paths. New code iterates `factory.machines`. */
export function findMachine(layout: InnerTile[][]): { x: number; y: number } | null {
  for (let y = 0; y < layout.length; y++) {
    const row = layout[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const tile = row[x];
      if (tile && tile.kind === 'machine') return { x, y };
    }
  }
  return null;
}

export function bayWorldPos(
  factory: FactoryInstance,
  type: FactoryType,
  innerX: number,
  innerY: number,
): { x: number; y: number } {
  return {
    x: factory.worldX + ((innerX + 0.5) / type.innerGrid.w) * type.baseFootprint.w,
    y: factory.worldY + ((innerY + 0.5) / type.innerGrid.h) * type.baseFootprint.h,
  };
}

export function isPerimeterTile(x: number, y: number, gridW: number, gridH: number): boolean {
  return x === 0 || x === gridW - 1 || y === 0 || y === gridH - 1;
}

export function createInitialInnerWorker(factoryId: string, factory: FactoryInstance): Worker {
  const inputBay = findBay(factory.innerLayout, 'W');
  const startPos = inputBay ? { x: inputBay.x + 0.5, y: inputBay.y + 0.5 } : { x: 0.5, y: 0.5 };
  return {
    id: crypto.randomUUID(),
    role: 'inner',
    tier: 1,
    energy: MAX_ENERGY,
    carryCapacity: 1,
    assignedFactoryId: factoryId,
    position: startPos,
    phase: 'at-input',
    phaseTicks: 0,
    carrying: null,
    task: null,
    mealsEaten: 0,
    nextTierMealsEaten: 0,
    lastEaten: null,
    targetMachineId: null,
  };
}

export function createIdleHauler(spawnX: number, spawnY: number): Worker {
  return {
    id: crypto.randomUUID(),
    role: 'hauler',
    tier: 1,
    energy: MAX_ENERGY,
    carryCapacity: 1,
    assignedFactoryId: null,
    position: { x: spawnX, y: spawnY },
    phase: 'h-idle',
    phaseTicks: 0,
    carrying: null,
    task: null,
    mealsEaten: 0,
    nextTierMealsEaten: 0,
    lastEaten: null,
    targetMachineId: null,
  };
}
