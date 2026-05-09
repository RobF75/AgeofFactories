export interface FactoryType {
  id: string;
  name: string;
  baseFootprint: { w: number; h: number };
  innerGrid: { w: number; h: number };
  isCritical: boolean;
}

export interface FactoryInstance {
  id: string;
  typeId: string;
  worldX: number;
  worldY: number;
  innerLayout: InnerTile[][];
  allocations: Allocations;
  wear: number;
  activeResearchId: string | null;
  inputBuffers: Record<string, number>;
  outputBuffers: Record<string, number>;
  currentRecipeId: string | null;
}

export interface Allocations {
  production: number;
  rd: number;
  maintenance: number;
}

export type InnerTile =
  | { kind: 'empty' }
  | { kind: 'machine'; machineId: string; recipeId: string | null }
  | { kind: 'belt'; direction: 'N' | 'E' | 'S' | 'W' }
  | { kind: 'storage'; itemId: string | null }
  | { kind: 'bay'; bayType: BayType; side: 'N' | 'E' | 'S' | 'W' };

export type BayType = 'hand' | 'wheelbarrow' | 'cart' | 'truck' | 'rail' | 'container';
