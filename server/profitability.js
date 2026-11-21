import { craftOutputs, materialOptions } from '../shared/crafting.js';
import { netSaleValue } from '../shared/quantities.js';

// A batch of 100 represents each whole-percent combo chance in the catalogue exactly.
const attempts = 100;
const isBound = item => /\(Bound\)$/i.test(item?.names?.en || '');

export function saleRecipes(catalog, faction) {
  return catalog.recipes.filter(recipe => recipe.mechanism === 'craft' &&
    (!recipe.faction || recipe.faction === faction) &&
    (!isBound(catalog.items[recipe.itemId]) || (recipe.combo && !isBound(catalog.items[recipe.combo.itemId]))));
}

export function marketItemIds(recipes) {
  const ids = new Set();
  for (const recipe of recipes) {
    ids.add(recipe.itemId);
    if (recipe.combo) ids.add(recipe.combo.itemId);
    for (const material of recipe.materials) for (const option of materialOptions(material)) ids.add(option.itemId);
  }
  return [...ids].sort();
}

export function rankCrafts(recipes, items, quotes, manual, feeBps) {
  const rows = [], incomplete = [];
  const price = id => Number.isSafeInteger(quotes[id]) && quotes[id] >= 0 ? quotes[id] : manual[id] ?? null;
  for (const recipe of recipes) {
    let cost = 0n, gross = 0n, net = 0n;
    const missing = new Set();
    for (const material of recipe.materials) {
      let cheapest = null;
      const options = materialOptions(material);
      for (const { itemId, quantity } of options) {
        const unit = price(itemId);
        if (unit == null) continue;
        const amount = BigInt(unit) * BigInt(quantity);
        if (cheapest == null || amount < cheapest) cheapest = amount;
      }
      if (cheapest == null) for (const option of options) missing.add(option.itemId);
      else cost += cheapest * BigInt(attempts);
    }
    for (const { itemId, quantity } of craftOutputs(recipe, attempts, recipe.combo?.chance ?? 0)) {
      if (isBound(items[itemId])) continue;
      const unit = price(itemId);
      if (unit == null) { missing.add(itemId); continue; }
      const sale = BigInt(unit) * BigInt(quantity);
      gross += sale;
      net += netSaleValue(sale, feeBps);
    }
    if (missing.size) { incomplete.push({ recipeId: recipe.id, missing: [...missing] }); continue; }
    const profit = net - cost;
    // Values are comparable means per attempt. Calculate totals and fees on integer Kinah first.
    const mean = amount => Number(amount) / attempts;
    rows.push({ recipeId: recipe.id, cost: mean(cost), gross: mean(gross), net: mean(net),
      profit: mean(profit), margin: net === 0n ? null : Number(profit) / Number(net) * 100 });
  }
  rows.sort((a, b) => b.profit - a.profit || a.recipeId.localeCompare(b.recipeId));
  return { rows, incomplete };
}
