export const TIER_FOOD: Record<number, string> = {
  1: 'food',
  2: 'bread',
};

export function foodForTier(tier: number): string {
  return TIER_FOOD[tier] ?? 'food';
}

export function isFoodItem(item: string): boolean {
  return Object.values(TIER_FOOD).includes(item);
}
