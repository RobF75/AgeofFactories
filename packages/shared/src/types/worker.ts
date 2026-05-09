export interface Worker {
  id: string;
  tier: number;
  energy: number;
  carryCapacity: number;
  assignedFactoryId: string | null;
  state: WorkerState;
  position: { x: number; y: number };
}

export type WorkerState =
  | { kind: 'idle' }
  | { kind: 'walking'; targetX: number; targetY: number }
  | { kind: 'working'; tileX: number; tileY: number }
  | { kind: 'eating'; farmId: string }
  | { kind: 'queueing'; farmId: string };
