export interface Recipe {
  id: string;
  name: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  ticksPerCycle: number;
  machineId: string;
  minWorkerTier: number;
  fuel?: { itemId: string; amountPerCycle: number };
}
