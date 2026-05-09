import type { FactoryType } from '../types/factory.js';

/** Inner-grid scale factor: 1 outer tile = N inner tiles per side. */
export const INNER_TILES_PER_OUTER = 10;

function inner(footprint: { w: number; h: number }): { w: number; h: number } {
  return { w: footprint.w * INNER_TILES_PER_OUTER, h: footprint.h * INNER_TILES_PER_OUTER };
}

export const FACTORY_TYPES: Record<string, FactoryType> = {
  farm: {
    id: 'farm',
    name: 'Farm',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: true,
    primaryOutput: { item: 'food' },
  },
  'lumber-factory': {
    id: 'lumber-factory',
    name: 'Lumber Factory',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: true,
    primaryInput: { item: 'wood', from: 'terrain' },
    primaryOutput: { item: 'log' },
    constructionCost: { amount: 5 },
  },
  'charcoal-burner': {
    id: 'charcoal-burner',
    name: 'Charcoal Burner',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: false,
    primaryInput: { item: 'log', from: 'factory' },
    primaryOutput: { item: 'charcoal' },
    constructionCost: { amount: 5 },
  },
  bakery: {
    id: 'bakery',
    name: 'Bakery',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: false,
    primaryInput: { item: 'food', from: 'factory' },
    primaryOutput: { item: 'bread' },
    constructionCost: { amount: 5 },
  },
};

export function getFactoryType(id: string): FactoryType | null {
  return FACTORY_TYPES[id] ?? null;
}
