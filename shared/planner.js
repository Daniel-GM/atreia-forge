import { integer, MAX_CRAFTS, MAX_PRICE, MAX_STOCK } from './quantities.js';
import { editLines } from './line-state.js';
import { mergeBackup } from './backup.js';
export { integer, MAX_CRAFTS, MAX_PRICE, MAX_STOCK };

export function emptyWorkshop() {
  return { stock: {}, saved: {}, prices: {}, lines: {}, lastCraft: null };
}

export function indexCatalog(catalog) {
  return { ...catalog, byId: Object.fromEntries(catalog.recipes.map(recipe => [recipe.id, recipe])) };
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
    const options = [{ itemId: material.itemId, quantity: material.quantity }, ...material.alternatives];
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

export function unitQuote(itemId, workshop, server, prices) {
  const quote = prices[itemId];
  if (Number.isSafeInteger(quote) && quote >= 0) return { price: quote, manual: false };
  const manual = workshop.prices[server]?.[itemId];
  return { price: manual ?? null, manual: manual != null };
}

export function craftOutputs(recipe, count, combos = 0) {
  if (!Number.isInteger(combos) || combos < 0 || combos > count || (combos && !recipe.combo)) throw new Error('actualCombos');
  const outputs = new Map();
  if (count > combos) outputs.set(recipe.itemId, (count - combos) * recipe.yield);
  if (combos) {
    const { itemId, quantity } = recipe.combo;
    outputs.set(itemId, (outputs.get(itemId) || 0) + combos * quantity);
  }
  return [...outputs].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function estimate(recipe, crafts, workshop, server, prices = {}) {
  let total = 0n;
  let unpriced = 0;
  const rows = requirements(recipe, crafts, workshop.stock).map(({ itemId, required, options }) => {
    const owned = workshop.stock[itemId] || 0;
    const missing = Math.max(0, required - owned);
    const { price, manual } = unitQuote(itemId, workshop, server, prices);
    const subtotal = missing === 0 ? 0n : price == null ? null : BigInt(price) * BigInt(missing);
    if (subtotal == null) unpriced += 1;
    else total += subtotal;
    return { itemId, required, owned, missing, price, subtotal, options, manual };
  });
  return { rows, total, unpriced, ready: rows.every(row => row.missing === 0) };
}

function setEntry(map, key, value) {
  const next = { ...map };
  if (value == null) delete next[key];
  else next[key] = value;
  return next;
}

export function applyChange(state, action, catalog) {
  const { type, itemId, recipeId } = action;
  if (type.startsWith('line')) return { ...state, lines: editLines(state.lines, action, catalog) };
  if (type === 'import') return mergeBackup(state, action.file, catalog);
  if (type === 'stock' || type === 'price') {
    if (!Object.hasOwn(catalog.items, itemId)) throw new Error('item');
    if (type === 'stock') {
      return { ...state, stock: setEntry(state.stock, itemId, integer(action.value) || null) };
    }
    if (!/^\d{1,8}$/.test(action.server)) throw new Error('server');
    const prices = setEntry(state.prices[action.server] || {}, itemId, action.value == null ? null : integer(action.value, MAX_PRICE));
    return { ...state, prices: setEntry(state.prices, action.server, Object.keys(prices).length ? prices : null) };
  }
  if (type === 'undo') {
    const last = state.lastCraft;
    if (!last || action.receipt !== last.receipt) throw new Error('stockChanged');
    const stock = { ...state.stock };
    for (const { itemId, quantity } of last.produced || []) {
      if ((stock[itemId] || 0) < quantity) throw new Error('stockChanged');
      stock[itemId] -= quantity;
      if (!stock[itemId]) delete stock[itemId];
    }
    for (const { itemId, required } of last.used) {
      const restored = (stock[itemId] || 0) + required;
      if (restored > MAX_STOCK) throw new Error('stockChanged');
      stock[itemId] = restored;
    }
    return { ...state, stock, lastCraft: null };
  }
  if (!Object.hasOwn(catalog.byId, recipeId)) throw new Error('item');
  const count = integer(action.count, MAX_CRAFTS, 1);
  if (type === 'save') {
    return { ...state, saved: setEntry(state.saved, recipeId, action.count == null ? null : count) };
  }
  if (type !== 'craft') throw new Error('item');
  const used = requirements(catalog.byId[recipeId], count, state.stock).map(({ itemId, required }) => ({ itemId, required }));
  const stock = { ...state.stock };
  for (const { itemId, required } of used) {
    if ((stock[itemId] || 0) < required) throw new Error('stockChanged');
    stock[itemId] -= required;
    if (!stock[itemId]) delete stock[itemId];
  }
  const produced = action.credit ? craftOutputs(catalog.byId[recipeId], count, action.combos ?? 0) : [];
  for (const { itemId, quantity } of produced) {
    const next = (stock[itemId] || 0) + quantity;
    if (next > MAX_STOCK) throw new Error('stockLimit');
    stock[itemId] = next;
  }
  return { ...state, stock, lastCraft: { receipt: action.id, recipeId, count, used, produced } };
}
