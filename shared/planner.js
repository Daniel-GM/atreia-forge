import { integer, MAX_CRAFTS, MAX_PRICE, MAX_STOCK } from './quantities.js';
import { completeStep, editLines, undoStep } from './line-state.js';
import { craftOutputs, requirements } from './crafting.js';
import { mergeBackup } from './backup.js';
export { craftOutputs, requirements, integer, MAX_CRAFTS, MAX_PRICE, MAX_STOCK };

export function emptyWorkshop() {
  return { stock: {}, saved: {}, prices: {}, lines: {}, lastCraft: null };
}

export function indexCatalog(catalog) {
  return { ...catalog, byId: Object.fromEntries(catalog.recipes.map(recipe => [recipe.id, recipe])) };
}

export function unitQuote(itemId, workshop, server, prices) {
  const quote = prices[itemId];
  if (Number.isSafeInteger(quote) && quote >= 0) return { price: quote, manual: false };
  const manual = workshop.prices[server]?.[itemId];
  return { price: manual ?? null, manual: manual != null };
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
  if (type.startsWith('line')) {
    const lines = editLines(state.lines, action, catalog);
    const restarted = type === 'lineRestart' && state.lastCraft?.lineId === action.lineId;
    return { ...state, lines, lastCraft: restarted ? null : state.lastCraft };
  }
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
    return { ...state, stock, lines: undoStep(state.lines, last), lastCraft: null };
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
  const results = craftOutputs(catalog.byId[recipeId], count, action.combos ?? 0);
  const produced = action.credit ? results : [];
  for (const { itemId, quantity } of produced) {
    const next = (stock[itemId] || 0) + quantity;
    if (next > MAX_STOCK) throw new Error('stockLimit');
    stock[itemId] = next;
  }
  const lastCraft = { receipt: action.id, recipeId, count, used, produced };
  if (action.lineId != null || action.stepId != null) {
    const { lines, followUp } = completeStep(state.lines, action, catalog, used, produced);
    return { ...state, stock, lines, lastCraft: { ...lastCraft, lineId: action.lineId, stepId: action.stepId, followUp } };
  }
  return { ...state, stock, lastCraft };
}
