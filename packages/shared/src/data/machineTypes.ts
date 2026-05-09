import type { MachineType } from '../types/machine.js';

export const MACHINE_TYPES: Record<string, MachineType> = {
  'saw-mill': {
    id: 'saw-mill',
    name: 'Saw Mill',
    era: 'stone',
    recipe: { inputs: { wood: 1 }, outputs: { log: 1 }, ticksPerCycle: 100 },
    buildCost: { wood: 3 },
    buildTicks: 200,
    acceptableInFactoryIds: ['lumber-factory'],
  },
  kiln: {
    id: 'kiln',
    name: 'Kiln',
    era: 'stone',
    recipe: { inputs: { log: 1 }, outputs: { charcoal: 1 }, ticksPerCycle: 100 },
    buildCost: { log: 3 },
    buildTicks: 300,
    acceptableInFactoryIds: ['charcoal-burner'],
  },
  'industrial-kiln': {
    id: 'industrial-kiln',
    name: 'Industrial Kiln',
    era: 'bronze',
    recipe: { inputs: { log: 1 }, outputs: { charcoal: 2 }, ticksPerCycle: 100 },
    buildCost: { log: 8 },
    buildTicks: 400,
    acceptableInFactoryIds: ['charcoal-burner'],
    requiredWorkerTier: 2,
  },
  'bread-oven': {
    id: 'bread-oven',
    name: 'Bread Oven',
    era: 'stone',
    recipe: { inputs: { food: 1 }, outputs: { bread: 1 }, ticksPerCycle: 100 },
    buildCost: { food: 3 },
    buildTicks: 200,
    acceptableInFactoryIds: ['bakery'],
  },
};

export function compatibleMachineTypes(factoryTypeId: string): MachineType[] {
  return Object.values(MACHINE_TYPES).filter(
    (m) => !m.acceptableInFactoryIds || m.acceptableInFactoryIds.includes(factoryTypeId),
  );
}

export function getMachineType(id: string): MachineType | null {
  return MACHINE_TYPES[id] ?? null;
}
