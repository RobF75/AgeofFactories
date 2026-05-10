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
  /** Total meals (any food). Sustains worker across promotion. */
  mealsEaten: number;
  /** Meals of the next-tier promotion food eaten since last promotion. Only this counter unlocks promotion. */
  nextTierMealsEaten: number;
  /** The most recent food this worker ate. Drives speed multiplier (BALANCE.foodSpeed). */
  lastEaten: string | null;
  targetMachineId: string | null;
}

import { BALANCE } from '../data/balance.js';

export const MAX_ENERGY = BALANCE.worker.maxEnergy;
export const HUNGER_THRESHOLD = BALANCE.worker.hungerThreshold;
export const MEALS_TO_PROMOTE = BALANCE.worker.mealsToPromote;
export const MAX_WORKER_TIER = BALANCE.worker.maxTier;
