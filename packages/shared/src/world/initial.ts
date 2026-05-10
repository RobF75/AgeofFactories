import type { WorldState } from '../types/world.js';

export function createInitialWorld(): WorldState {
  return {
    seed: Math.floor(Math.random() * 0xffffffff),
    tick: 0,
    factories: [],
    workers: [],
    tech: {
      completedTechIds: [],
      inProgress: null,
      currentEra: 'stone',
    },
    modifiedChunks: [],
    tileResources: {},
  };
}
