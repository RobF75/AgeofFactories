import type { MachineType } from '../types/machine.js';
import { BALANCE } from './balance.js';

/** Default station count, applied when a MachineType doesn't override. */
export function machineStations(type: MachineType): number {
  return type.stations ?? BALANCE.machines.defaultStations;
}

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
    name: 'Bread Oven (legacy)',
    era: 'stone',
    recipe: { inputs: { food: 1 }, outputs: { bread: 1 }, ticksPerCycle: 100 },
    buildCost: { food: 3 },
    buildTicks: 200,
    acceptableInFactoryIds: ['bakery'],
  },
  millstone: {
    id: 'millstone',
    name: 'Millstone',
    era: 'stone',
    recipe: { inputs: { grain: 1 }, outputs: { flour: 1 }, ticksPerCycle: 120 },
    buildCost: { stone: 5 },
    buildTicks: 200,
    acceptableInFactoryIds: ['bakery'],
  },
  'simple-oven': {
    id: 'simple-oven',
    name: 'Simple Oven',
    era: 'stone',
    recipe: { inputs: { flour: 1, charcoal: 1 }, outputs: { bread: 1 }, ticksPerCycle: 150 },
    buildCost: { stone: 5 },
    buildTicks: 250,
    acceptableInFactoryIds: ['bakery'],
  },
  'stone-cutter': {
    id: 'stone-cutter',
    name: 'Stone Cutter',
    era: 'stone',
    recipe: { inputs: { stone: 1 }, outputs: { 'stone-block': 1 }, ticksPerCycle: 120 },
    buildCost: { wood: 3 },
    buildTicks: 200,
    acceptableInFactoryIds: ['quarry'],
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

const DEFAULT_MACHINE_BY_FACTORY: Record<string, string> = {
  'lumber-factory': 'saw-mill',
  'charcoal-burner': 'kiln',
  bakery: 'millstone',
  quarry: 'stone-cutter',
};

export function defaultMachineTypeFor(factoryTypeId: string): string | null {
  return DEFAULT_MACHINE_BY_FACTORY[factoryTypeId] ?? null;
}
