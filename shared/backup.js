import { checkedLine } from './line-state.js';
import { MAX_CRAFTS, MAX_PRICE, MAX_STOCK } from './quantities.js';

export function backupOf({ stock, saved, prices, lines = {} }) {
  return { format: 'atreia-forge', version: 1, workshop: { stock, saved, prices, lines } };
}

function entries(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('invalidBackup');
  return Object.entries(object);
}

function numbers(map, allowed, min, max) {
  const checked = {};
  for (const [key, value] of entries(map)) {
    if (!Object.hasOwn(allowed, key) || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('invalidBackup');
    checked[key] = value;
  }
  return checked;
}

export function readBackup(file, catalog) {
  try {
    if (file?.format !== 'atreia-forge' || file.version !== 1) throw new Error();
    const { stock, saved, prices, lines = {} } = file.workshop;
    const clean = { stock: numbers(stock, catalog.items, 0, MAX_STOCK), saved: numbers(saved, catalog.byId, 1, MAX_CRAFTS), prices: {}, lines: {} };
    for (const [server, map] of entries(prices)) {
      if (!/^\d{1,8}$/.test(server)) throw new Error();
      clean.prices[server] = numbers(map, catalog.items, 0, MAX_PRICE);
    }
    for (const [id, line] of entries(lines)) {
      if (line.id !== id) throw new Error();
      clean.lines[id] = checkedLine(line, catalog);
    }
    return clean;
  } catch { throw new Error('invalidBackup'); }
}

export function mergeBackup(state, file, catalog) {
  const incoming = readBackup(file, catalog);
  const prices = { ...state.prices };
  for (const [server, map] of Object.entries(incoming.prices)) prices[server] = { ...prices[server], ...map };
  return { stock: { ...state.stock, ...incoming.stock }, saved: { ...state.saved, ...incoming.saved }, lines: { ...state.lines, ...incoming.lines }, prices, lastCraft: null };
}
