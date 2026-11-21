import { craftOutcomes, materialOptions } from '../shared/crafting.js';
import { resolveQuote } from '../shared/planner.js';
import { netSaleValue } from '../shared/quantities.js';
import { isBound } from '../shared/recipe-filter.js';
export { saleRecipes } from '../shared/recipe-filter.js';

// A batch of 100 represents each whole-percent combo chance in the catalogue exactly.
const attempts = 100;
const mean = batch => batch == null ? null : Number(batch) / attempts;

export function marketItemIds(recipes) {
  const ids = new Set();
  for (const recipe of recipes) {
    ids.add(recipe.itemId);
    if (recipe.combo) ids.add(recipe.combo.itemId);
    for (const material of recipe.materials) for (const option of materialOptions(material)) ids.add(option.itemId);
  }
  return [...ids].sort();
}

function priceMaterials(recipe, quote, missing) {
  let cost = 0n;
  const materials = recipe.materials.map(material => {
    const options = materialOptions(material);
    let selected = null;
    for (const option of options) {
      const unit = quote(option.itemId);
      if (unit.price == null) continue;
      const subtotal = BigInt(option.quantity) * BigInt(unit.price);
      if (!selected || subtotal < selected.subtotal) selected = { ...option, ...unit, subtotal };
    }
    if (!selected) {
      for (const option of options) missing.add(option.itemId);
      cost = null;
      return { ...options[0], price: null, manual: false, subtotal: null };
    }
    if (cost != null) cost += selected.subtotal;
    return { ...selected, subtotal: Number(selected.subtotal), alternative: options.length > 1 };
  });
  return { materials, cost };
}

function priceOutcomes(recipe, items, quote, feeBps, missing) {
  const lots = new Map();
  let complete = true;
  const outcomes = craftOutcomes(recipe, attempts, recipe.combo?.chance ?? 0).map(({ kind, itemId, quantity, occurrences }) => {
    const bound = isBound(items[itemId]);
    const unit = bound ? { price: null, manual: false } : quote(itemId);
    const sale = unit.price == null ? null : BigInt(quantity) * BigInt(unit.price);
    let weighted = 0n;
    if (occurrences && !bound) {
      if (sale == null) {
        complete = false;
        missing.add(itemId);
        weighted = null;
      } else {
        weighted = sale * BigInt(occurrences);
        lots.set(itemId, (lots.get(itemId) || 0n) + weighted);
      }
    }
    return { kind, itemId, quantity, chance: occurrences, ...unit, bound,
      sale: sale == null ? null : Number(sale), expectedGross: mean(weighted) };
  });
  if (!complete) return { outcomes, gross: null, net: null };
  let gross = 0n, net = 0n;
  // Different outcomes can yield the same item. The market fee rounds once per sale lot.
  for (const lot of lots.values()) { gross += lot; net += netSaleValue(lot, feeBps); }
  return { outcomes, gross, net };
}

export function rankCrafts(recipes, items, quotes, manual, feeBps) {
  const rows = [], incomplete = [];
  const quote = id => resolveQuote(quotes[id], manual[id]);
  for (const recipe of recipes) {
    const missing = new Set();
    const { materials, cost } = priceMaterials(recipe, quote, missing);
    const { outcomes, gross, net } = priceOutcomes(recipe, items, quote, feeBps, missing);
    const profit = cost == null || net == null ? null : net - cost * BigInt(attempts);
    const row = { recipeId: recipe.id, materials, outcomes, cost: cost == null ? null : Number(cost),
      gross: mean(gross), net: mean(net), fee: net == null ? null : mean(gross - net), profit: mean(profit),
      margin: profit == null || net === 0n ? null : Number(profit) / Number(net) * 100 };
    if (missing.size) incomplete.push({ ...row, missing: [...missing] });
    else rows.push(row);
  }
  rows.sort((a, b) => b.profit - a.profit || a.recipeId.localeCompare(b.recipeId));
  return { rows, incomplete };
}
