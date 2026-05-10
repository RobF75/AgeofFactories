/**
 * Central tuning module. All gameplay knobs live here so balance can be
 * adjusted in one place without hunting through sim/data files.
 *
 * 20 ticks ≈ 1 second of perceived game time (see step.ts cadence).
 */

export const BALANCE = {
  worker: {
    maxEnergy: 1200,
    hungerThreshold: 300,
    energyDecayPerTick: 1,
    mealsToPromote: 5,
    maxTier: 2,
    eatDurationTicks: 20,
  },
  movement: {
    innerSpeed: 0.15,
    outerSpeed: 0.1,
    atBayTicks: 5,
    atMachineTicks: 20,
    harvestTicks: 20,
    deliverTicks: 5,
  },
  /**
   * Movement speed multiplier per "last eaten" food. Anchored at food = 1.0;
   * higher-tier foods speed workers up. Future foods can scale beyond bread.
   */
  foodSpeed: {
    food: 1.0,
    grain: 1.2,
    bread: 1.6,
  } as Record<string, number>,
  factory: {
    foodThreshold: 3,
    initialFoodBuffer: 0,
    demolishTotal: 100,
  },
  farm: {
    /** Tier-1 farm: 1 grain per N ticks. Higher tiers scale via tierProductionMultiplier. */
    grainPeriodTicks: 200,
    /** Per-tier multiplier on production rate (1 = base, 2 = double, etc). */
    tierProductionMultiplier: { 1: 1, 2: 2, 3: 4 } as Record<number, number>,
  },
  machines: {
    /** Default number of stations (max productive workers) per machine. */
    defaultStations: 2,
  },
  /**
   * Yield per terrain tile. Tile depletes (1 unit per harvest) until it hits 0.
   * Adjust to make resources feel scarce vs abundant.
   */
  terrain: {
    foodPerTile: 5,
    woodPerTile: 20,
    stonePerTile: 200,
  },
  /**
   * Resources required to construct each factory type. Haulers gather these
   * before construction is considered complete. Sources:
   *  - `wood` — harvested from trees on terrain
   *  - `stone` — harvested from stone tiles on terrain (raw rock)
   *  - `stone-block` — refined output of a quarry (future tiers)
   */
  construction: {
    farm: { wood: 5 },
    'lumber-factory': { wood: 10 },
    'charcoal-burner': { wood: 15, stone: 5 },
    bakery: { wood: 20, stone: 5 },
    quarry: { wood: 10 },
  } as Record<string, Record<string, number>>,
  /**
   * Resources required to upgrade a factory from `factoryTier` N → N+1.
   * 20× scaling per level is the design target — early scaling is quick,
   * later upgrades are real efforts. Indexed by *target* tier.
   */
  farmUpgrade: {
    2: { wood: 10, stone: 5 },
    3: { wood: 200, stone: 100 },
    4: { wood: 4000, stone: 2000 },
  } as Record<number, Record<string, number>>,
} as const;

/**
 * Items harvestable directly from terrain. Maps an item type to the terrain
 * resource that produces it. Used by haulers when a factory's construction
 * (or future primary input) calls for one of these items.
 */
export const TERRAIN_HARVEST: Record<string, 'tree' | 'stone' | 'food'> = {
  wood: 'tree',
  stone: 'stone',
  food: 'food',
};

/** Default yield for a terrain resource type, used when a tile has no explicit yield override. */
export function defaultTileYield(resource: 'tree' | 'stone' | 'food'): number {
  switch (resource) {
    case 'tree':
      return BALANCE.terrain.woodPerTile;
    case 'stone':
      return BALANCE.terrain.stonePerTile;
    case 'food':
      return BALANCE.terrain.foodPerTile;
  }
}
