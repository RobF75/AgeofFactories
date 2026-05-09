export type WorkerRole = 'inner' | 'hauler';

export type WorkerPhase =
  | 'to-input'
  | 'at-input'
  | 'to-machine'
  | 'at-machine'
  | 'to-output'
  | 'at-output'
  | 'h-idle'
  | 'h-to-resource'
  | 'h-harvesting'
  | 'h-to-factory'
  | 'h-delivering'
  | 'h-going-to-farm'
  | 'h-eating-at-farm'
  | 'h-going-to-demolish'
  | 'h-demolishing';

export type WorkerTaskSource =
  | { kind: 'terrain'; x: number; y: number }
  | { kind: 'factory'; factoryId: string; x: number; y: number }
  | { kind: 'site-clearing'; x: number; y: number; targetFactoryId: string };

export interface WorkerTask {
  itemType: string;
  source: WorkerTaskSource;
}

export interface Worker {
  id: string;
  role: WorkerRole;
  tier: number;
  energy: number;
  carryCapacity: number;
  assignedFactoryId: string | null;
  position: { x: number; y: number };
  phase: WorkerPhase;
  phaseTicks: number;
  carrying: string | null;
  task: WorkerTask | null;
  mealsEaten: number;
}

export const MAX_ENERGY = 1200;
export const HUNGER_THRESHOLD = 300;
export const MEALS_TO_PROMOTE = 5;
export const MAX_WORKER_TIER = 2;
