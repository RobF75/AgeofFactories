export type Era = 'stone' | 'bronze' | 'iron' | 'steam' | 'electric' | 'oil' | 'transistor';

export interface TechNode {
  id: string;
  name: string;
  era: Era;
  prerequisiteTechIds: string[];
  prerequisiteFactoryTypeIds: string[];
  inputCost: Record<string, number>;
  workCost: number;
  unlocks: TechUnlocks;
}

export interface TechUnlocks {
  recipeIds?: string[];
  machineIds?: string[];
  factoryTypeIds?: string[];
  transportIds?: string[];
}

export interface TechProgress {
  completedTechIds: string[];
  inProgress: { techId: string; workDone: number } | null;
  currentEra: Era;
}
