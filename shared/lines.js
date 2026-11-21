import { unitQuote } from './planner.js';
import { attemptsFromBatch, craftOutputs, materialOptions, requirements } from './crafting.js';
import { integer, MAX_CRAFTS, MAX_MARKET_FEE_BPS, netSaleValue } from './quantities.js';

const tiers = ['common', 'rare', 'epic', 'unique'];
// Only a distinct critical output of the preceding equipment tier can feed this slot.
export function previousCraftTier(target, recipes, items) {
  const tier = tiers.indexOf(items[target.itemId]?.grade);
  if (target.mechanism !== 'craft' || tier < 1) return null;
  for (const candidate of recipes) {
    if (candidate.mechanism !== 'craft' || candidate.profession !== target.profession ||
        candidate.category !== target.category || candidate.faction !== target.faction ||
        items[candidate.itemId]?.grade !== tiers[tier - 1] || !candidate.combo?.chance ||
        candidate.combo.itemId === candidate.itemId) continue;
    for (const [index, material] of target.materials.entries()) {
      const option = materialOptions(material).find(m => m.itemId === candidate.combo.itemId);
      if (option) return { recipe: candidate, index, quantity: option.quantity };
    }
  }
  return null;
}

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
    const previous = previousCraftTier(path[0], family, catalog.items)?.recipe;
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
  if (step.done) return step.done.combos;
  return recipe.combo ? step.combos ?? Math.floor(step.count * recipe.combo.chance / 100) : 0;
}

export function recipeSuggestions(recipe, catalog, faction, anchor) {
  const path = goldProgression(recipe, catalog);
  if (path) {
    const i = path.findIndex(step => step.recipeId === recipe.id);
    if (anchor) {
      path[i].count = anchor.count;
      for (let j = i - 1; j >= 0; j--) {
        const previous = catalog.byId[path[j].recipeId];
        const next = catalog.byId[path[j + 1].recipeId];
        const needed = path[j + 1].count * consumes(next, previous.combo.itemId);
        path[j].count = integer(Math.ceil(Math.ceil(needed / previous.combo.quantity) * 100 / previous.combo.chance), MAX_CRAFTS);
      }
      for (let j = i; j < path.length - 1; j++) {
        const from = catalog.byId[path[j].recipeId], to = catalog.byId[path[j + 1].recipeId];
        const step = j === i ? anchor : path[j];
        const outputs = step.done && !step.done.credit ? [] : craftOutputs(from, step.count, projectedCombos(step, from));
        path[j + 1].count = attemptsFromBatch(from, to, outputs);
      }
    }
    return { gold: true, before: path.slice(0, i), selected: path[i], after: path.slice(i + 1) };
  }
  const selected = { recipeId: recipe.id, count: anchor?.count ?? 1, combos: null };
  const batch = anchor && (anchor.done && !anchor.done.credit ? [] : craftOutputs(recipe, anchor.count, projectedCombos(anchor, recipe)));
  const before = [], after = [];
  const side = recipe.faction || faction;
  for (const other of catalog.recipes) {
    if (other.id === recipe.id || (side && side !== 'all' && other.faction && other.faction !== side)) continue;
    const normal = consumes(recipe, other.itemId);
    const combo = other.combo?.chance > 0 && consumes(recipe, other.combo.itemId);
    if (normal || combo) {
      const units = normal ? Math.ceil(normal * selected.count / other.yield) : Math.ceil(Math.ceil(combo * selected.count / other.combo.quantity) * 100 / other.combo.chance);
      before.push({ recipeId: other.id, count: integer(units, MAX_CRAFTS), combos: null });
    }
    if (consumes(other, recipe.itemId) || (recipe.combo && consumes(other, recipe.combo.itemId))) {
      after.push({ recipeId: other.id, count: batch ? attemptsFromBatch(recipe, other, batch) : 1, combos: null });
    }
  }
  return { gold: false, before, selected, after };
}

function add(map, id, amount) { map[id] = (map[id] || 0) + amount; }
const total = () => ({ value: 0n, quoted: 0, unpriced: 0 });
function lotValue(units, price) {
  if (!units) return 0n;
  return price == null ? null : BigInt(units) * BigInt(price);
}
function addValue(sum, value) {
  if (value == null) sum.unpriced++;
  else { sum.value += value; sum.quoted++; }
}

// Match the first later recipe that takes this exact output. At the end of a
// known equipment chain, preview the next tier without adding it to the plan.
export function lineSaleTargets(line, catalog) {
  const recipes = line.steps.map(step => catalog.byId[step.recipeId]);
  const included = new Set(recipes.map(r => r.id));
  const consumers = new Map();
  const targets = Array(recipes.length).fill(null);
  for (let i = recipes.length - 1; i >= 0; i--) {
    const recipe = recipes[i];
    const saleId = recipe.combo?.itemId ?? recipe.itemId;
    const index = consumers.get(saleId);
    if (index != null) {
      targets[i] = { index, recipe: recipes[index] };
    } else if (saleId !== recipe.itemId) {
      const path = goldProgression(recipe, catalog);
      const next = path && path[path.findIndex(s => s.recipeId === recipe.id) + 1];
      if (next && !included.has(next.recipeId)) targets[i] = { index: null, recipe: catalog.byId[next.recipeId] };
    }
    for (const m of recipe.materials) for (const option of materialOptions(m)) consumers.set(option.itemId, i);
  }
  return targets;
}

function fullValue(lots, field = 'value') {
  let value = 0n;
  for (const lot of lots) {
    if (lot[field] == null) return null;
    value += lot[field];
  }
  return value;
}

function compareSale(stage, target, stages, stock, priceLot, saleLot) {
  const saleId = stage.recipe.combo?.itemId ?? stage.recipe.itemId;
  const quantity = stage.outputs.find(row => row.itemId === saleId)?.quantity ?? 0;
  const now = saleLot(saleId, quantity);
  if (!target) return { now, next: null };

  const planned = target.index == null ? null : stages[target.index];
  const recipe = target.recipe;
  const count = planned?.step.count ?? attemptsFromBatch(stage.recipe, recipe, stage.outputs);
  const outputs = planned?.outputs ?? craftOutputs(recipe, count, projectedCombos({ count }, recipe));
  const needs = planned?.needs ?? (count ? requirements(recipe, count, { ...stock, [saleId]: Math.max(quantity, stock[saleId] ?? 0) }) : []);
  const required = needs.find(row => row.itemId === saleId)?.required ?? 0;
  const used = Math.min(quantity, required);
  const extra = [];
  for (const row of needs) {
    const units = row.required - (row.itemId === saleId ? used : 0);
    if (units > 0) extra.push(priceLot(row.itemId, units));
  }
  const products = outputs.map(out => saleLot(out.itemId, out.quantity));
  const extraCost = fullValue(extra);
  const forgone = priceLot(saleId, used);
  const leftover = saleLot(saleId, quantity - used);
  const revenue = fullValue(products);
  const netRevenue = fullValue(products, 'net');
  const saleFee = fullValue(products, 'fee');
  // Compare whole alternatives. Charging a fee on the consumed portion separately
  // would sometimes lose a Kinah when the rest of the same lot can still be sold.
  const forgoneNet = used === 0 ? 0n : now.net == null ? null : now.net - leftover.net;
  const cost = extraCost != null && forgoneNet != null ? extraCost + forgoneNet : null;
  const netReturn = netRevenue != null && leftover.net != null && extraCost != null ? netRevenue + leftover.net - extraCost : null;
  const difference = used > 0 && now.net != null && netReturn != null ? netReturn - now.net : null;
  return { now, next: { recipe, index: target.index, recorded: !!planned?.step.done, count, used, forgone, forgoneNet, leftover,
    extra, extraCost, cost, products, revenue, saleFee, netRevenue, netReturn, difference } };
}

export function lineEstimate(line, catalog, workshop, server, quotes = {}, targets = lineSaleTargets(line, catalog)) {
  const marketFeeBps = integer(workshop.marketFees?.[server], MAX_MARKET_FEE_BPS);
  function priceLot(itemId, quantity) {
    const quote = unitQuote(itemId, workshop, server, quotes);
    return { itemId, quantity, ...quote, value: lotValue(quantity, quote.price) };
  }
  function saleLot(itemId, quantity) {
    const lot = priceLot(itemId, quantity);
    // The estimate settles one lot per item in whole Kinah, rounding proceeds down.
    const net = lot.value == null ? null : netSaleValue(lot.value, marketFeeBps);
    return { ...lot, net, fee: net == null ? null : lot.value - net };
  }
  const owned = { ...workshop.stock };
  const made = {};
  const materials = new Map();
  const creditedIds = new Set();
  const stages = line.steps.map(step => {
    const recipe = catalog.byId[step.recipeId];
    const combos = projectedCombos(step, recipe);
    return { step, recipe, combos, outputs: craftOutputs(recipe, step.count, combos), needs: step.done?.used ?? [], carried: [] };
  });
  function account({ itemId, required }, alreadySpent) {
    const fromLine = Math.min(made[itemId] || 0, required);
    const external = required - fromLine;
    const fromStock = alreadySpent ? external : Math.min(owned[itemId] || 0, external);
    const missing = external - fromStock;
    made[itemId] = (made[itemId] || 0) - fromLine;
    if (!alreadySpent) owned[itemId] = (owned[itemId] || 0) - fromStock;
    const row = materials.get(itemId) || { itemId, required: 0, fromLine: 0, fromStock: 0, missing: 0, ...unitQuote(itemId, workshop, server, quotes) };
    row.required += required;
    row.fromLine += fromLine;
    row.fromStock += fromStock;
    row.missing += missing;
    materials.set(itemId, row);
  }
  // Reconstruct actual material costs in execution order, even if the player
  // later reorders the line. These movements are already in the global stock.
  const completed = stages.filter(s => s.step.done).sort((a, b) => a.step.done.order - b.step.done.order);
  for (const { step, recipe, outputs } of completed) {
    for (const need of step.done.used) account(need, true);
    if (!step.done.credit) continue;
    creditedIds.add(recipe.itemId);
    if (recipe.combo) creditedIds.add(recipe.combo.itemId);
    for (const out of outputs) add(made, out.itemId, out.quantity);
  }
  for (const id of Object.keys(made)) {
    made[id] = Math.min(made[id], owned[id] || 0);
    owned[id] = (owned[id] || 0) - made[id];
  }
  for (const stage of stages) {
    if (stage.step.done) continue;
    const { step, recipe, outputs } = stage;
    stage.carried = [...new Set(recipe.materials.flatMap(materialOptions).map(m => m.itemId).filter(id => creditedIds.has(id)))];
    if (!step.count) continue;
    const available = { ...owned };
    for (const [id, qty] of Object.entries(made)) add(available, id, qty);
    stage.needs = requirements(recipe, step.count, available);
    for (const need of stage.needs) account(need, false);
    for (const out of outputs) add(made, out.itemId, out.quantity);
  }
  const cash = total(), inputs = total(), market = total();
  for (const row of materials.values()) {
    if (row.missing) addValue(cash, lotValue(row.missing, row.price));
    const external = row.missing + row.fromStock;
    if (external) addValue(inputs, lotValue(external, row.price));
  }
  const final = (stages.at(-1)?.outputs || []).map(output => {
    const lot = saleLot(output.itemId, output.quantity);
    addValue(market, lot.net);
    return lot;
  });
  for (const { itemId, quantity } of final) made[itemId] = Math.max(0, (made[itemId] || 0) - quantity);
  const producedIds = new Set(stages.flatMap(stage => stage.outputs.map(output => output.itemId)));
  const retained = [...producedIds].filter(itemId => made[itemId] > 0).map(itemId =>
    ({ itemId, quantity: made[itemId], ...unitQuote(itemId, workshop, server, quotes) }));
  for (const [i, stage] of stages.entries()) stage.sale = compareSale(stage, targets[i], stages, workshop.stock, priceLot, saleLot);
  return { stages, rows: [...materials.values()], cash, inputs, market, marketFeeBps, final, retained };
}

export function lineMarketItems(line, catalog, targets = lineSaleTargets(line, catalog)) {
  const ids = new Set();
  const recipes = new Set(line.steps.map(s => catalog.byId[s.recipeId]));
  for (const target of targets) if (target) recipes.add(target.recipe);
  for (const recipe of recipes) {
    for (const m of recipe.materials) {
      ids.add(m.itemId);
      for (const alt of m.alternatives || []) ids.add(alt.itemId);
    }
    ids.add(recipe.itemId);
    if (recipe.combo) ids.add(recipe.combo.itemId);
  }
  return [...ids].map(itemId => ({ itemId }));
}
