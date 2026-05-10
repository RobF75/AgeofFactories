import type { FactoryType } from '../types/factory.js';
import { BALANCE } from './balance.js';

/** Inner-grid scale factor: 1 outer tile = N inner tiles per side. */
export const INNER_TILES_PER_OUTER = 10;

function inner(footprint: { w: number; h: number }): { w: number; h: number } {
  return { w: footprint.w * INNER_TILES_PER_OUTER, h: footprint.h * INNER_TILES_PER_OUTER };
}

function cost(typeId: string): { constructionCost: { resources: Record<string, number> } } | object {
  const r = BALANCE.construction[typeId];
  return r ? { constructionCost: { resources: r } } : {};
}

export const FACTORY_TYPES: Record<string, FactoryType> = {
  farm: {
    id: 'farm',
    name: 'Farm',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: true,
    primaryOutput: { item: 'grain' },
    ...cost('farm'),
  },
  'lumber-factory': {
    id: 'lumber-factory',
    name: 'Lumber Factory',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: true,
    primaryInput: { item: 'wood', from: 'terrain' },
    primaryOutput: { item: 'log' },
    ...cost('lumber-factory'),
  },
  'charcoal-burner': {
    id: 'charcoal-burner',
    name: 'Charcoal Burner',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: false,
    primaryInput: { item: 'log', from: 'factory' },
    primaryOutput: { item: 'charcoal' },
    ...cost('charcoal-burner'),
  },
  bakery: {
    id: 'bakery',
    name: 'Bakery',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: false,
    primaryInput: { item: 'grain', from: 'factory' },
    primaryOutput: { item: 'flour' },
    ...cost('bakery'),
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    baseFootprint: { w: 2, h: 2 },
    innerGrid: inner({ w: 2, h: 2 }),
    isCritical: false,
    primaryInput: { item: 'stone', from: 'terrain' },
    primaryOutput: { item: 'stone-block' },
    ...cost('quarry'),
  },
};

export function getFactoryType(id: string): FactoryType | null {
  return FACTORY_TYPES[id] ?? null;
}
