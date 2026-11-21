import { materialOptions } from '../shared/crafting.js';
import { netSaleValue } from '../shared/quantities.js';

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

// Scale the reference batch until every predecessor supplies exactly the critical
// units consumed downstream. Normalise all money and quantities to one final attempt.
function tierBatches(recipe, parents) {
  const stages = [{ recipe, attempts: 100n, input: null }];
  let current = stages[0];
  while (parents.get(current.recipe.id)) {
    const link = parents.get(current.recipe.id);
    current.input = link.index;
    const required = current.attempts * BigInt(link.quantity);
    const perHundred = BigInt(link.recipe.combo.quantity * link.recipe.combo.chance);
    const scale = perHundred / gcd(perHundred, required);
    if (scale > 1n) for (const stage of stages) stage.attempts *= scale;
    current = { recipe: link.recipe, attempts: required * scale / perHundred * 100n, input: null };
    stages.unshift(current);
  }
  return stages;
}

export function tierProfit(target, parents, details, feeBps) {
  if (!parents.get(target.id)) return null;
  const stages = tierBatches(target, parents);
  const batch = Number(stages.at(-1).attempts);
  const perFinal = amount => Number(amount) / batch;
  const missing = new Set();
  const sideLots = new Map();
  let materials = 0n;
  for (const stage of stages) {
    const { recipe, attempts, input } = stage;
    const row = details.get(recipe.id);
    let stageCost = 0n;
    row.materials.forEach((material, index) => {
      if (index === input) return;
      if (material.price == null) {
        for (const option of materialOptions(recipe.materials[index])) missing.add(option.itemId);
        stageCost = null;
      } else if (stageCost != null) stageCost += attempts * BigInt(material.quantity) * BigInt(material.price);
    });
    stage.externalCost = stageCost == null ? null : perFinal(stageCost);
    if (stageCost != null) materials += stageCost;
    if (recipe.id === target.id) continue;
    const normal = row.outcomes[0];
    if (normal.bound || !normal.chance) continue;
    const units = attempts * BigInt(normal.chance * normal.quantity) / 100n;
    const prior = sideLots.get(normal.itemId);
    sideLots.set(normal.itemId, { itemId: normal.itemId, price: normal.price, units: units + (prior?.units ?? 0n) });
  }
  const cost = missing.size ? null : perFinal(materials);
  let sideNet = 0n;
  const byproducts = [...sideLots.values()].map(({ itemId, price, units }) => {
    const net = price == null ? null : netSaleValue(units * BigInt(price), feeBps);
    if (net != null) sideNet += net;
    return { itemId, quantity: perFinal(units), net: net == null ? null : perFinal(net) };
  });
  const byproductNet = byproducts.some(lot => lot.net == null) ? null : perFinal(sideNet);
  return { cost, byproductNet, byproducts, missingInputs: [...missing],
    steps: stages.map(s => ({ recipeId: s.recipe.id, attempts: perFinal(s.attempts), externalCost: s.externalCost })) };
}
