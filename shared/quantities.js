export const MAX_STOCK = 999_999_999;
export const MAX_CRAFTS = 9_999;
export const MAX_PRICE = 99_999_999_999;
export const MAX_MARKET_FEE_BPS = 10_000;

export function validMarketFeeBps(bps) {
  return Number.isInteger(bps) && bps >= 0 && bps <= MAX_MARKET_FEE_BPS;
}

export function netSaleValue(gross, feeBps) {
  return gross * BigInt(MAX_MARKET_FEE_BPS - feeBps) / BigInt(MAX_MARKET_FEE_BPS);
}

// Store percentages as integer basis points. Accept either decimal separator.
export function parseMarketFee(text) {
  const input = String(text).normalize('NFKC').trim();
  if (!input) return 0;
  const value = input.replace(/\s*%$/, '').replace(',', '.');
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return validMarketFeeBps(bps) ? bps : null;
}

export function integer(value, maximum = MAX_STOCK, minimum = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.floor(number))) : minimum;
}
