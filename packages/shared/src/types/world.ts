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
  clearedTiles: Record<string, true>;
}

export interface ChunkData {
  cx: number;
  cy: number;
  modifiedTiles: Record<string, TileOverride>;
}

export interface TileOverride {
  buildingId?: string;
}
