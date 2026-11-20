import { craftOutputs, requirements, unitQuote } from './planner.js';

const tiers = ['common', 'rare', 'epic', 'unique'];
function consumes(recipe, itemId) {
  for (const material of recipe.materials) {
    if (material.itemId === itemId) return material.quantity;
    const alternative = material.alternatives?.find(option => option.itemId === itemId);
    if (alternative) return alternative.quantity;
  }
  return 0;
}

// Follow exact game item IDs. Normal and brilliant equipment have different IDs.
export function goldProgression(selected, catalog) {
  if (!selected || selected.mechanism !== 'craft') return null;
  const tier = r => tiers.indexOf(catalog.items[r.itemId]?.grade);
  const position = tier(selected);
  if (position < 0) return null;
  const family = catalog.recipes.filter(r => r.mechanism === 'craft' && r.profession === selected.profession && r.category === selected.category && r.faction === selected.faction);
  const path = [selected];
  for (let i = position - 1; i >= 0; i--) {
    const previous = family.find(r => tier(r) === i && r.combo?.chance > 0 && consumes(path[0], r.combo.itemId));
    if (!previous) return null;
    path.unshift(previous);
  }
  for (let i = position + 1; i < tiers.length; i++) {
    const combo = path.at(-1).combo;
    const next = combo && family.find(r => tier(r) === i && consumes(r, combo.itemId));
    if (!next) return null;
    path.push(next);
  }
  const steps = path.map(r => ({ recipeId: r.id, count: 1, combos: null }));
  for (let i = steps.length - 2; i >= 0; i--) {
    const combo = path[i].combo;
    const needed = steps[i + 1].count * consumes(path[i + 1], combo.itemId);
    steps[i].count = Math.ceil(Math.ceil(needed / combo.quantity) * 100 / combo.chance);
  }
  return steps;
}

export function projectedCombos(step, recipe) {
  return recipe.combo ? step.combos ?? Math.floor(step.count * recipe.combo.chance / 100) : 0;
}

function add(map, id, amount) { map[id] = (map[id] || 0) + amount; }
const total = () => ({ value: 0n, quoted: 0, unpriced: 0 });
function addCost(sum, units, price) {
  if (!units) return;
  if (price == null) sum.unpriced++;
  else { sum.value += BigInt(units) * BigInt(price); sum.quoted++; }
}

export function lineEstimate(line, catalog, workshop, server, quotes = {}) {
  const owned = { ...workshop.stock };
  const made = {};
  const materials = new Map();
  const stages = [];
  for (const step of line.steps) {
    const recipe = catalog.byId[step.recipeId];
    const available = { ...owned };
    for (const [id, qty] of Object.entries(made)) add(available, id, qty);
    const needs = requirements(recipe, step.count, available);
    for (const { itemId, required } of needs) {
      const fromLine = Math.min(made[itemId] || 0, required);
      const fromStock = Math.min(owned[itemId] || 0, required - fromLine);
      const missing = required - fromLine - fromStock;
      made[itemId] = (made[itemId] || 0) - fromLine;
      owned[itemId] = (owned[itemId] || 0) - fromStock;
      const row = materials.get(itemId) || { itemId, required: 0, fromLine: 0, fromStock: 0, missing: 0, ...unitQuote(itemId, workshop, server, quotes) };
      row.required += required;
      row.fromLine += fromLine;
      row.fromStock += fromStock;
      row.missing += missing;
      materials.set(itemId, row);
    }
    const combos = projectedCombos(step, recipe);
    const outputs = craftOutputs(recipe, step.count, combos);
    for (const { itemId, quantity } of outputs) add(made, itemId, quantity);
    stages.push({ step, recipe, combos, outputs });
  }
  const cash = total(), inputs = total(), market = total();
  for (const row of materials.values()) {
    addCost(cash, row.missing, row.price);
    addCost(inputs, row.missing + row.fromStock, row.price);
  }
  const final = (stages.at(-1)?.outputs || []).map(output => {
    const quote = unitQuote(output.itemId, workshop, server, quotes);
    addCost(market, output.quantity, quote.price);
    return { ...output, ...quote };
  });
  for (const { itemId, quantity } of final) made[itemId] -= quantity;
  const producedIds = new Set(stages.flatMap(stage => stage.outputs.map(output => output.itemId)));
  const retained = [...producedIds].filter(itemId => made[itemId] > 0).map(itemId =>
    ({ itemId, quantity: made[itemId], ...unitQuote(itemId, workshop, server, quotes) }));
  return { stages, rows: [...materials.values()], cash, inputs, market, final, retained };
}

export function lineMarketItems(line, catalog) {
  const ids = new Set();
  for (const { recipeId } of line.steps) {
    const recipe = catalog.byId[recipeId];
    for (const m of recipe.materials) {
      ids.add(m.itemId);
      for (const alt of m.alternatives || []) ids.add(alt.itemId);
    }
    ids.add(recipe.itemId);
    if (recipe.combo) ids.add(recipe.combo.itemId);
  }
  return [...ids].map(itemId => ({ itemId }));
}
