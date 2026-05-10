import type { FactoryInstance } from './factory.js';
import type { Worker } from './worker.js';
import type { TechProgress } from './tech.js';

export interface WorldState {
  seed: number;
  tick: number;
  factories: FactoryInstance[];
  workers: Worker[];
  tech: TechProgress;
  modifiedChunks: ChunkData[];
  /**
   * Per-tile remaining yield, keyed by `${x},${y}`. A tile not in this map
   * has its full default yield. A tile with value 0 is depleted (treated as
   * cleared — no rendering, no harvest).
   */
  tileResources: Record<string, number>;
}

export interface ChunkData {
  cx: number;
  cy: number;
  modifiedTiles: Record<string, TileOverride>;
}

export interface TileOverride {
  buildingId?: string;
}
