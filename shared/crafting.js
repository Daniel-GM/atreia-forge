import { integer, MAX_CRAFTS } from './quantities.js';

export function materialOptions(material) {
  return [{ itemId: material.itemId, quantity: material.quantity }, ...(material.alternatives || [])];
}

export function requirements(recipe, crafts, stock = {}) {
  const count = integer(crafts, MAX_CRAFTS, 1);
  const amounts = new Map();
  const available = { ...stock };
  function allocate(itemId, quantity, options) {
    const row = amounts.get(itemId) || { itemId, required: 0 };
    row.required += quantity;
    if (options) row.options = options;
    amounts.set(itemId, row);
    available[itemId] = Math.max(0, (available[itemId] || 0) - quantity);
  }
  // Reserve compulsory ingredients first so one unit cannot serve two requirements.
  for (const material of recipe.materials) {
    if (!material.alternatives?.length) allocate(material.itemId, material.quantity * count);
  }
  for (const material of recipe.materials.filter(m => m.alternatives?.length)) {
    const options = materialOptions(material);
    let remaining = count;
    for (const option of options) {
      const lots = Math.min(remaining, Math.floor((available[option.itemId] || 0) / option.quantity));
      if (lots) allocate(option.itemId, option.quantity * lots, options);
      remaining -= lots;
    }
    if (remaining) allocate(material.itemId, material.quantity * remaining, options);
  }
  return [...amounts.values()];
}

export function craftOutcomes(recipe, count, combos = 0) {
  if (!Number.isInteger(combos) || combos < 0 || combos > count || (combos && !recipe.combo)) throw new Error('actualCombos');
  const outcomes = [{ kind: 'normal', itemId: recipe.itemId, quantity: recipe.yield, occurrences: count - combos }];
  if (recipe.combo) outcomes.push({ kind: 'combo', itemId: recipe.combo.itemId, quantity: recipe.combo.quantity, occurrences: combos });
  return outcomes;
}

export function craftOutputs(recipe, count, combos = 0) {
  const outputs = new Map();
  for (const { itemId, quantity, occurrences } of craftOutcomes(recipe, count, combos)) {
    if (occurrences) outputs.set(itemId, (outputs.get(itemId) || 0) + occurrences * quantity);
  }
  return [...outputs].map(([itemId, quantity]) => ({ itemId, quantity }));
}

// Count the attempts supported by the previous batch alone. Other materials are
// still checked against the full inventory when the player confirms the next batch.
export function attemptsFromBatch(source, target, produced) {
  const linkedIds = new Set([source.itemId, source.combo?.itemId]);
  const materials = target.materials.filter(m => materialOptions(m).some(option => linkedIds.has(option.itemId)));
  if (!materials.length) return null;
  if (!produced.length) return 0;
  const stock = Object.fromEntries(produced.map(row => [row.itemId, row.quantity]));
  let low = 0, high = MAX_CRAFTS;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const fits = requirements({ materials }, mid, stock).every(row => (stock[row.itemId] || 0) >= row.required);
    if (fits) low = mid;
    else high = mid - 1;
  }
  return low;
}
