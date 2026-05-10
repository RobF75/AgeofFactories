import type { Machine } from './machine.js';

export interface FactoryType {
  id: string;
  name: string;
  baseFootprint: { w: number; h: number };
  innerGrid: { w: number; h: number };
  isCritical: boolean;
  primaryInput?: { item: string; from: 'terrain' | 'factory' };
  primaryOutput?: { item: string };
  /** Resources required to construct one instance, keyed by item type. */
  constructionCost?: { resources: Record<string, number> };
}

export interface FactoryConstruction {
  /** Construction materials delivered so far, keyed by item type. */
  delivered: Record<string, number>;
  complete: boolean;
}

export interface FactoryDemolish {
  progress: number;
  total: number;
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
  construction: FactoryConstruction;
  desiredWorkers: number;
  /** Food kept in this factory's pantry, keyed by item type (e.g. food/grain/bread). */
  foodInventory: Record<string, number>;
  siteClearing: { x: number; y: number }[];
  demolish: FactoryDemolish | null;
  machines: Machine[];
  /** 1 = base. Higher tiers unlock faster production / new recipes. */
  factoryTier: number;
  /**
   * If non-null, this factory is undergoing a tier upgrade. Haulers gather the
   * required materials, mirroring the initial construction flow.
   */
  pendingUpgrade: FactoryConstruction | null;
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
