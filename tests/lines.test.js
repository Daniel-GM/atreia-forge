import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { backupOf, readBackup } from '../shared/backup.js';
import { goldProgression, lineEstimate, lineMarketItems } from '../shared/lines.js';
import { applyChange, craftOutputs, emptyWorkshop, indexCatalog, MAX_STOCK } from '../shared/planner.js';

const catalog = indexCatalog(JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url))));
const ruby = ['213016001', '213015001', '213014001', '213013001'];
const mace = ['111066001', '111065001', '111064001', '111063001'];
const state = emptyWorkshop();
const path = goldProgression(catalog.byId[ruby[0]], catalog);
const line = { id: randomUUID(), name: 'Colar de Rubi', steps: path.map(step => ({ ...step, id: randomUUID() })) };

test('all four necklace and weapon tiers resolve to their actual faction-specific chain', () => {
  for (const ids of [ruby, mace]) for (const id of ids) {
    const chain = goldProgression(catalog.byId[id], catalog);
    assert.deepEqual(chain.map(s => s.recipeId), ids);
    assert.deepEqual(chain.map(s => s.count), [64, 16, 4, 1]);
  }
  assert.equal(goldProgression(catalog.byId['315024003'], catalog), null);
});

test('each brilliant intermediate supplies the next step, surplus and target are valued separately', () => {
  const quotes = Object.fromEntries(lineMarketItems(line, catalog).map(row => [row.itemId, 2]));
  const owned = { ...state, stock: { '610730021': 100 } };
  const result = lineEstimate(line, catalog, owned, '1406', quotes);
  assert.deepEqual(result.stages.map(s => s.combos), [16, 4, 1, 0]);
  for (const [i, produced] of [16, 4, 1].entries()) {
    const row = result.rows.find(row => row.itemId === catalog.byId[ruby[i]].combo.itemId);
    assert.deepEqual([row.fromLine, row.fromStock, row.missing], [produced, 0, 0]);
  }
  assert.equal(result.inputs.value - result.cash.value, 64n * 2n);
  assert.equal(result.market.value, 2n);
  assert.deepEqual(result.retained.map(row => row.quantity), [48, 12, 3]);
  assert.equal(owned.stock['610730021'], 100);
  const edited = { ...line, steps: line.steps.map((s,i) => i ? s : { ...s, combos: 13 }) };
  const deficit = lineEstimate(edited, catalog, state, '1406', {});
  assert.equal(deficit.rows.find(row => row.itemId === catalog.byId[ruby[0]].combo.itemId).missing, 3);
  assert.ok(deficit.cash.unpriced > 0);
  assert.equal(deficit.market.unpriced, 1);
});

test('multiple independent steps share a single inventory balance', () => {
  const [step] = line.steps;
  const result = lineEstimate({ steps: [step, step] }, catalog, { ...state, stock: { '610730021': 70 } }, '1406', {});
  const row = result.rows.find(row => row.itemId === '610730021');
  assert.deepEqual([row.required, row.fromStock, row.missing], [128, 70, 58]);
});

test('craft credits observed combos in one transaction, permits skipping credit, and can be undone', () => {
  const r = catalog.byId[ruby[0]];
  const stock = Object.fromEntries(r.materials.map(m => [m.itemId, 4 * m.quantity]));
  const before = { ...state, stock };
  const action = { type: 'craft', recipeId: r.id, count: 4, combos: 1, credit: true, id: 'craft' };
  const after = applyChange(before, action, catalog);
  assert.deepEqual(after.stock, { [r.itemId]: 3, [r.combo.itemId]: 1 });
  assert.deepEqual(applyChange(after, { type: 'undo', receipt: 'craft' }, catalog).stock, stock);
  assert.deepEqual(applyChange(before, { ...action, credit: false }, catalog).stock, {});
  assert.throws(() => applyChange(before, { ...action, combos: 5 }, catalog), /actualCombos/);
  const used = { ...after, stock: { [r.itemId]: 3 } };
  assert.throws(() => applyChange(used, { type: 'undo', receipt: 'craft' }, catalog), /stockChanged/);
  assert.throws(() => applyChange({ ...before, stock: { ...stock, [r.itemId]: MAX_STOCK } }, action, catalog), /stockLimit/);
  assert.deepEqual(before.stock, stock);
  const same = catalog.recipes.find(r => r.combo && r.combo.itemId === r.itemId && r.combo.quantity !== r.yield);
  assert.deepEqual(craftOutputs(same, 4, 1), [{ itemId: same.itemId, quantity: 3 * same.yield + same.combo.quantity }]);
  const scale = catalog.byId['315024003'];
  assert.deepEqual(craftOutputs(scale, 21), [{ itemId: scale.itemId, quantity: 21 * scale.yield }]);
});

test('saved lines can be edited, reordered and safely restored from a portable backup', () => {
  const apply = (current, action) => applyChange(current, { ...action, lineId: line.id }, catalog);
  const created = apply(state, { type: 'lineCreate', name: line.name, steps: line.steps });
  const edited = apply(created, { type: 'lineCombos', stepId: line.steps[1].id, value: 6 });
  const moved = apply(edited, { type: 'lineMove', stepId: line.steps[1].id, direction: -1 });
  const reduced = apply(moved, { type: 'lineCount', stepId: line.steps[1].id, value: 2 });
  assert.equal(reduced.lines[line.id].steps[0].combos, 2);
  const file = JSON.parse(JSON.stringify(backupOf(reduced)));
  const imported = applyChange(state, { type: 'import', file }, catalog);
  assert.deepEqual(imported, reduced);
  assert.throws(() => readBackup({ ...file, workshop: { ...file.workshop, stock: { unknown: 9 } } }, catalog), /invalidBackup/);
  assert.deepEqual(apply(imported, { type: 'lineDelete' }).lines, {});
});
