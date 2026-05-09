export type MachineStatus = 'building' | 'operational';

export interface Machine {
  id: string;
  typeId: string;
  status: MachineStatus;
  buildProgress: number;
  cycleProgress: number;
}

export interface MachineRecipe {
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  ticksPerCycle: number;
}

export interface MachineType {
  id: string;
  name: string;
  era: string;
  recipe: MachineRecipe;
  buildCost: Record<string, number>;
  buildTicks: number;
  acceptableInFactoryIds?: string[];
  requiredWorkerTier?: number;
}
