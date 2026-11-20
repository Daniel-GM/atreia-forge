export const MAX_STOCK = 999_999_999;
export const MAX_CRAFTS = 9_999;
export const MAX_PRICE = 99_999_999_999;

export function integer(value, maximum = MAX_STOCK, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.floor(number))) : minimum;
}
