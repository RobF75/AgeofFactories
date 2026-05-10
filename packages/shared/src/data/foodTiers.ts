/**
 * Items that count as "food" for an inner worker of a given tier.
 * Listed in priority order: highest preference first.
 *
 * Tier-1 worker prefers tier-2 food (bread) for promotion credit, but will
 * fall back to tier-1 sustenance (grain or terrain food) to stay alive.
 *
 * Tier-2 worker only eats bread (no higher tier yet).
 */
export const TIER_FOOD_PRIORITY: Record<number, string[]> = {
  1: ['bread', 'grain', 'food'],
  2: ['bread'],
};

/**
 * The food item required to *promote* a worker from tier N to tier N+1.
 * Eating this counts toward `nextTierMealsEaten`.
 */
export const PROMOTION_FOOD: Record<number, string> = {
  1: 'bread',
};

/** Items that satisfy a worker's hunger at all (any item in any tier list). */
const ALL_FOOD_ITEMS = new Set<string>([
  'food',
  'grain',
  'bread',
]);

/** Back-compat: returns the *primary* food for a tier (used as a label). */
export function foodForTier(tier: number): string {
  const list = TIER_FOOD_PRIORITY[tier];
  return list?.[0] ?? 'food';
}

/** Items the given worker will eat, in preference order. */
export function acceptedFoodsForTier(tier: number): string[] {
  return TIER_FOOD_PRIORITY[tier] ?? ['food'];
}

/** True if eating this item counts as promotion progress for `tier` worker. */
export function isPromotionFood(tier: number, item: string): boolean {
  return PROMOTION_FOOD[tier] === item;
}

export function isFoodItem(item: string): boolean {
  return ALL_FOOD_ITEMS.has(item);
}
