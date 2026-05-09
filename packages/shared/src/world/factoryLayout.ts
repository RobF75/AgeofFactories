import type { FactoryInstance, FactoryType, InnerTile } from '../types/factory.js';
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
  const midX = Math.floor(w / 2);
  const midRow = layout[midY];
  if (midRow) {
    midRow[0] = { kind: 'bay', bayType: 'hand', side: 'W' };
    midRow[midX] = { kind: 'machine', machineId: 'log-mill', recipeId: 'firewood' };
    midRow[w - 1] = { kind: 'bay', bayType: 'hand', side: 'E' };
  }
  return layout;
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

/**
 * Map a bay's inner-grid coordinate to its outer-world coordinate.
 * The factory's inner grid is `innerGrid.w x innerGrid.h` tiles spanning
 * a `baseFootprint.w x baseFootprint.h` outer area.
 */
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
  };
}
