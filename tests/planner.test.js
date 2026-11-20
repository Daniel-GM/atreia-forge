import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyChange, emptyWorkshop, estimate, indexCatalog, MAX_STOCK } from '../shared/planner.js';
import { locales, regionName } from '../src/i18n.js';

const data = indexCatalog(JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url))));
const mace = data.byId[data.defaultRecipeId];
const [ingot, stone, od] = mace.materials.map(row => row.itemId);
const prices = { [ingot]: 6899, [stone]: 1259, [od]: 6318 };
const stock = { [ingot]: 7, [stone]: 10, [od]: 4 };
const workspace = () => ({ ...emptyWorkshop(), stock: { ...stock } });
const craft = { type: 'craft', recipeId: mace.id, id: 'receipt', count: 2 };

test('server regions have a full localized name for every language and market', () => {
  const markets = JSON.parse(readFileSync(new URL('../public/data/markets.json', import.meta.url)));
  const codes = [...new Set(markets.servers.map(s => s.region))].sort();
  assert.deepEqual(codes.map(code => regionName(code, 'pt')), ['Ásia', 'Europa', 'América Latina', 'América do Norte (Leste)', 'América do Norte (Oeste)']);
  for (const { code: language } of locales) {
    const names = codes.map(code => regionName(code, language));
    assert.equal(new Set(names).size, codes.length);
    assert.ok(names.every(name => name && !codes.includes(name)));
  }
  assert.equal(regionName('NAW', 'en-nc'), 'North America West');
});

test('cost uses the missing quantity and never credits excess stock', () => {
  assert.equal(estimate(mace, 1, emptyWorkshop(), '1406', prices).total, 39628n);
  const plan = estimate(mace, 3, workspace(), '1406', prices);
  assert.deepEqual(plan.rows.map(row => row.missing), [2, 5, 2]);
  assert.equal(plan.total, 32729n);
  assert.equal(estimate(mace, 1, workspace(), '1406', {}).total, 0n);
  assert.equal(estimate(mace, 1, workspace(), '1406', {}).unpriced, 0);
});

test('unknown quotes stay unknown and a manual price belongs to a server', () => {
  const state = applyChange(emptyWorkshop(), { type: 'price', itemId: ingot, server: '1406', value: 2000 }, data);
  assert.equal(estimate(mace, 1, state, '1406', {}).unpriced, 2);
  assert.equal(estimate(mace, 1, state, '1406', {}).total, 6000n);
  assert.equal(estimate(mace, 1, state, '1405', {}).unpriced, 3);
  assert.equal(estimate(mace, 1, state, '1406', prices).total, 39628n);
});

test('deduction validates all ingredients, preserves other inventory and undoes once', () => {
  const start = workspace();
  const next = applyChange(start, craft, data);
  assert.deepEqual(next.stock, { [ingot]: 1 });
  assert.deepEqual(start.stock, stock);
  assert.throws(() => applyChange(next, craft, data), /stockChanged/);
  const bought = applyChange(next, { type: 'stock', itemId: ingot, value: 2 }, data);
  const restored = applyChange(bought, { type: 'undo', receipt: 'receipt' }, data);
  assert.deepEqual(restored.stock, { ...stock, [ingot]: 8 });
  assert.throws(() => applyChange(restored, { type: 'undo', receipt: 'receipt' }, data), /stockChanged/);
});

test('stock limits and saved attempts survive independent recipe changes', () => {
  const zero = applyChange(workspace(), { type: 'stock', itemId: ingot, value: -8 }, data);
  assert.equal(zero.stock[ingot] ?? 0, 0);
  const max = applyChange(zero, { type: 'stock', itemId: stone, value: MAX_STOCK + 1 }, data);
  assert.equal(max.stock[stone], MAX_STOCK);
  const saved = applyChange(max, { type: 'save', recipeId: mace.id, count: 3 }, data);
  assert.equal(saved.saved[mace.id], 3);
  assert.deepEqual(applyChange(saved, { type: 'save', recipeId: mace.id, count: null }, data).saved, {});
});

test('alternative materials can be mixed across attempts and the receipt reflects actual consumption', () => {
  const recipe = data.recipes.find(r => r.materials.some(m => m.alternatives));
  const choice = recipe.materials.find(m => m.alternatives);
  const substitute = choice.alternatives[0];
  const state = emptyWorkshop();
  for (const m of recipe.materials) state.stock[m.itemId] = m.quantity * (m === choice ? 1 : 2);
  state.stock[substitute.itemId] = substitute.quantity;
  assert.equal(estimate(recipe, 2, state, '1406', {}).ready, true);
  const next = applyChange(state, { ...craft, recipeId: recipe.id }, data);
  assert.deepEqual(next.stock, {});
  assert.deepEqual(applyChange(next, { type: 'undo', receipt: 'receipt' }, data).stock, state.stock);
});

test('catalog includes the screenshot recipe and a name for every supported language', () => {
  assert.equal(mace.level, 3);
  assert.deepEqual(mace.materials.map(row => row.quantity), [3, 5, 2]);
  assert.equal(data.items[mace.itemId].names.pt, 'Maça de Orichalcum');
  assert.equal(new Set(data.recipes.map(r => r.profession)).size, 5);
  assert.equal(locales.length, 11);
  for (const item of Object.values(data.items)) {
    for (const { code } of locales) assert.ok(item.names[code], item.id + '/' + code);
  }
});
