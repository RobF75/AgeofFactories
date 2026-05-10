import { defaultTileYield } from '../data/balance.js';
import type { FactoryInstance } from '../types/factory.js';
import type { WorldState } from '../types/world.js';

export type TerrainResource = 'tree' | 'stone' | 'food' | null;

export const WORLD_GRID_TILES = 40;

function hash(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 0xffffffff;
}

export function getTerrainAt(seed: number, x: number, y: number): TerrainResource {
  const v = hash(seed, x, y);
  // Food tiles are sparse (~1%) — emergency fallback foraging.
  if (v < 0.01) return 'food';
  if (v < 0.09) return 'tree';
  if (v < 0.11) return 'stone';
  return null;
}

/**
 * Yield remaining at a tile. Returns the per-tile default if no override is
 * stored. Returns 0 for tiles that have been fully harvested.
 */
export function tileYieldAt(world: WorldState, x: number, y: number): number {
  const key = `${x},${y}`;
  const override = world.tileResources?.[key];
  if (override !== undefined) return override;
  const t = getTerrainAt(world.seed, x, y);
  if (!t) return 0;
  return defaultTileYield(t);
}

export function effectiveTerrainAt(world: WorldState, x: number, y: number): TerrainResource {
  if (tileYieldAt(world, x, y) <= 0) return null;
  return getTerrainAt(world.seed, x, y);
}

/**
 * Finds the nearest non-depleted terrain tile of a given resource. Skips tiles
 * with 0 yield remaining (i.e. fully harvested).
 */
export function findNearestTerrainResource(
  seed: number,
  resource: Exclude<TerrainResource, null>,
  fromX: number,
  fromY: number,
  gridW: number,
  gridH: number,
  tileResources?: Record<string, number>,
): { x: number; y: number } | null {
  let nearest: { x: number; y: number; d2: number } | null = null;
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (getTerrainAt(seed, x, y) !== resource) continue;
      const override = tileResources?.[`${x},${y}`];
      if (override !== undefined && override <= 0) continue;
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

/** Back-compat: trees only. */
export function findNearestTree(
  seed: number,
  fromX: number,
  fromY: number,
  gridW: number,
  gridH: number,
  tileResources?: Record<string, number>,
): { x: number; y: number } | null {
  return findNearestTerrainResource(seed, 'tree', fromX, fromY, gridW, gridH, tileResources);
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
  tileResources?: Record<string, number>,
): number {
  let count = 0;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const x = worldX + dx;
      const y = worldY + dy;
      if (getTerrainAt(seed, x, y) !== 'tree') continue;
      const override = tileResources?.[`${x},${y}`];
      if (override !== undefined && override <= 0) continue;
      count++;
    }
  }
  return count;
}
