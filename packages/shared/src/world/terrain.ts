import type { FactoryInstance } from '../types/factory.js';
import type { WorldState } from '../types/world.js';

export type TerrainResource = 'tree' | 'stone' | null;

export const WORLD_GRID_TILES = 40;

function hash(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0xffffffff;
}

export function getTerrainAt(seed: number, x: number, y: number): TerrainResource {
  const v = hash(seed, x, y);
  if (v < 0.08) return 'tree';
  if (v < 0.1) return 'stone';
  return null;
}

export function effectiveTerrainAt(world: WorldState, x: number, y: number): TerrainResource {
  if (world.clearedTiles?.[`${x},${y}`]) return null;
  return getTerrainAt(world.seed, x, y);
}

export function findNearestTree(
  seed: number,
  fromX: number,
  fromY: number,
  gridW: number,
  gridH: number,
  cleared?: Record<string, true>,
): { x: number; y: number } | null {
  let nearest: { x: number; y: number; d2: number } | null = null;
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (getTerrainAt(seed, x, y) !== 'tree') continue;
      if (cleared && cleared[`${x},${y}`]) continue;
      const dx = x - fromX;
      const dy = y - fromY;
      const d2 = dx * dx + dy * dy;
      if (!nearest || d2 < nearest.d2) {
        nearest = { x, y, d2 };
      }
    }
  }
  return nearest ? { x: nearest.x, y: nearest.y } : null;
}

export function findNearestFactorySource(
  factories: readonly FactoryInstance[],
  fromX: number,
  fromY: number,
  itemType: string,
  excludeFactoryId: string,
): { factoryId: string; x: number; y: number } | null {
  let nearest: { factoryId: string; x: number; y: number; d2: number } | null = null;
  for (const f of factories) {
    if (f.id === excludeFactoryId) continue;
    if ((f.outputBuffers[itemType] ?? 0) < 1) continue;
    const dx = f.worldX - fromX;
    const dy = f.worldY - fromY;
    const d2 = dx * dx + dy * dy;
    if (!nearest || d2 < nearest.d2) {
      nearest = { factoryId: f.id, x: f.worldX, y: f.worldY, d2 };
    }
  }
  return nearest ? { factoryId: nearest.factoryId, x: nearest.x, y: nearest.y } : null;
}

export function findNearestFoodSource(
  factories: readonly FactoryInstance[],
  fromX: number,
  fromY: number,
  itemType: string,
): { factoryId: string; x: number; y: number } | null {
  let nearest: { factoryId: string; x: number; y: number; d2: number } | null = null;
  for (const f of factories) {
    if ((f.outputBuffers[itemType] ?? 0) < 1) continue;
    const dx = f.worldX - fromX;
    const dy = f.worldY - fromY;
    const d2 = dx * dx + dy * dy;
    if (!nearest || d2 < nearest.d2) {
      nearest = { factoryId: f.id, x: f.worldX, y: f.worldY, d2 };
    }
  }
  return nearest ? { factoryId: nearest.factoryId, x: nearest.x, y: nearest.y } : null;
}

/** Back-compat alias. */
export function findNearestFarmWithFood(
  factories: readonly FactoryInstance[],
  fromX: number,
  fromY: number,
): { factoryId: string; x: number; y: number } | null {
  return findNearestFoodSource(factories, fromX, fromY, 'food');
}

export function totalFoodByItem(
  factories: readonly FactoryInstance[],
  item: string,
): number {
  let total = 0;
  for (const f of factories) {
    total += f.outputBuffers[item] ?? 0;
  }
  return total;
}

/** Back-compat: total tier-1 food (food). */
export function totalFood(factories: readonly FactoryInstance[]): number {
  return totalFoodByItem(factories, 'food');
}

export function countTreesInFootprint(
  seed: number,
  worldX: number,
  worldY: number,
  w: number,
  h: number,
): number {
  let count = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      if (getTerrainAt(seed, worldX + dx, worldY + dy) === 'tree') count++;
    }
  }
  return count;
}
