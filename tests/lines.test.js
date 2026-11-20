import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { backupOf, readBackup } from '../shared/backup.js';
import { goldProgression, lineEstimate, lineMarketItems, recipeSuggestions } from '../shared/lines.js';
import { attemptsFromBatch } from '../shared/crafting.js';
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

const starter = catalog.byId[ruby[0]];
const second = catalog.byId[ruby[1]];
const brilliant = starter.combo.itemId;
function executing(steps = line.steps) {
  const stock = Object.fromEntries(starter.materials.map(m => [m.itemId, m.quantity * 128]));
  stock[brilliant] = 2;
  return { ...state, stock, lines: { [line.id]: { ...line, steps } } };
}
const firstCraft = { type: 'craft', id: 'first-batch', lineId: line.id, stepId: line.steps[0].id, recipeId: starter.id, count: 64, combos: 13, credit: true };
const stagesOf = workshop => workshop.lines[line.id].steps;

test('recording a stage carries only the observed batch, accounts for spent inputs and blocks a duplicate', () => {
  const start = executing();
  const after = applyChange(start, firstCraft, catalog);
  assert.deepEqual(stagesOf(after).map(s => s.count), [64, 13, 4, 1]);
  assert.deepEqual([after.stock[starter.itemId], after.stock[brilliant]], [51, 15]);
  assert.deepEqual(stagesOf(after)[0].done.used, after.lastCraft.used);
  const plan = lineEstimate(after.lines[line.id], catalog, after, '1406');
  assert.equal(plan.stages[0].combos, 13);
  assert.deepEqual(plan.stages[1].carried, [brilliant]);
  const input = plan.rows.find(row => row.itemId === starter.materials[0].itemId);
  assert.deepEqual([input.required, input.fromStock, input.missing], [64, 64, 0]);
  const supply = plan.rows.find(row => row.itemId === brilliant);
  assert.deepEqual([supply.required, supply.fromLine, supply.fromStock, supply.missing], [13, 13, 0, 0]);
  assert.throws(() => applyChange(after, firstCraft, catalog), /lineChanged/);
  assert.throws(() => applyChange(start, { ...firstCraft, combos: 65 }, catalog), /actualCombos/);
  assert.throws(() => applyChange({ ...start, stock: {} }, firstCraft, catalog), /stockChanged/);
  assert.deepEqual(applyChange(JSON.parse(JSON.stringify(after)), { type: 'undo', receipt: firstCraft.id }, catalog), start);
  assert.deepEqual(readBackup(backupOf(after), catalog).lines, after.lines);
  const restarted = applyChange(after, { type: 'lineRestart', lineId: line.id }, catalog);
  assert.equal(restarted.lastCraft, null);
  assert.ok(stagesOf(restarted).every(step => !step.done));
  assert.deepEqual(restarted.stock, after.stock);
});

test('zero combos, skipped credit and unrelated stages do not create imaginary attempts', () => {
  const unrelated = { ...line.steps[0], id: randomUUID(), recipeId: mace[0], count: 8 };
  const customNext = { ...line.steps[1], combos: 6 };
  const start = executing([line.steps[0], unrelated, customNext, ...line.steps.slice(2)]);
  const zero = applyChange(start, { ...firstCraft, combos: 0 }, catalog);
  assert.deepEqual(stagesOf(zero).map(s => s.count), [64, 8, 0, 4, 1]);
  assert.equal(stagesOf(zero)[2].combos, 0);
  assert.equal(zero.stock[brilliant], 2);
  assert.deepEqual(applyChange(zero, { type: 'undo', receipt: firstCraft.id }, catalog), start);
  const manual = applyChange(zero, { type: 'lineCount', lineId: line.id, stepId: customNext.id, value: 7 }, catalog);
  const undone = applyChange(manual, { type: 'undo', receipt: firstCraft.id }, catalog);
  assert.equal(stagesOf(undone)[2].count, 7);
  assert.deepEqual(undone.stock, start.stock);
  const skipped = applyChange(start, { ...firstCraft, credit: false }, catalog);
  assert.equal(stagesOf(skipped)[0].done.combos, 13);
  assert.equal(stagesOf(skipped)[2].count, 16);
  assert.equal(skipped.stock[brilliant], 2);
});

test('registering the next stage consumes the actual Brilliants once, even after reordering', () => {
  const start = executing();
  for (const m of second.materials) if (m.itemId !== brilliant) start.stock[m.itemId] = m.quantity * 13;
  const after = applyChange(start, firstCraft, catalog);
  const next = applyChange(after, { ...firstCraft, id: 'second-batch', stepId: line.steps[1].id, recipeId: second.id, count: 13, combos: 3 }, catalog);
  assert.deepEqual([next.stock[brilliant], next.stock[second.itemId], next.stock[second.combo.itemId]], [2, 10, 3]);
  assert.equal(stagesOf(next)[2].count, 3);
  const reordered = applyChange(next, { type: 'lineMove', lineId: line.id, stepId: line.steps[1].id, direction: -1 }, catalog);
  const plan = lineEstimate(reordered.lines[line.id], catalog, reordered, '1406');
  for (const [id, qty] of [[brilliant, 13], [second.combo.itemId, 3]]) {
    const row = plan.rows.find(x => x.itemId === id);
    assert.deepEqual([row.fromLine, row.missing], [qty, 0]);
  }
});

test('the picker suggests preceding and following tiers and inserts missing tiers around the selected stage', () => {
  const forward = recipeSuggestions(starter, catalog, 'elyos');
  const backward = recipeSuggestions(catalog.byId[ruby.at(-1)], catalog, 'elyos');
  assert.deepEqual(forward.after.map(s => s.recipeId), ruby.slice(1));
  assert.deepEqual(backward.before.map(s => s.recipeId), ruby.slice(0, -1));
  const done = stagesOf(applyChange(executing(), firstCraft, catalog))[0];
  assert.equal(recipeSuggestions(starter, catalog, 'elyos', done).after[0].count, 13);
  const anchor = { ...line.steps[3], count: 2 };
  const others = line.steps.slice(0, 2).map(s => ({ ...s, id: randomUUID(), recipeId: mace[0] }));
  const start = executing([others[0], line.steps[1], anchor, others[1]]);
  const drafts = [...backward.before, backward.selected].map(s => ({ ...s, id: randomUUID() }));
  const action = { type: 'lineInsert', lineId: line.id, anchorId: anchor.id, recipeId: anchor.recipeId, steps: drafts };
  const inserted = applyChange(start, action, catalog);
  assert.deepEqual(stagesOf(inserted).map(s => s.recipeId), [mace[0], ...ruby, mace[0]]);
  assert.equal(stagesOf(inserted)[4].count, 2);
  assert.deepEqual(applyChange(inserted, action, catalog), inserted);
});

test('batch sizing supports ordinary yields, alternate ingredients and repeated consumption of one item', () => {
  const source = { itemId: '1', combo: { itemId: '2' } };
  const target = { materials: [{ itemId: '2', quantity: 1 }, { itemId: '3', quantity: 1, alternatives: [{ itemId: '2', quantity: 2 }, { itemId: '1', quantity: 3 }] }, { itemId: '4', quantity: 5 }] };
  assert.equal(attemptsFromBatch(source, target, [{ itemId: '2', quantity: 8 }, { itemId: '1', quantity: 6 }]), 4);
  assert.equal(attemptsFromBatch(source, target, []), 0);
  assert.equal(attemptsFromBatch(source, { materials: [{ itemId: '4', quantity: 2 }] }, []), null);
});

const salePrices = {
  ...Object.fromEntries(lineMarketItems(line, catalog).map(({ itemId }) => [itemId, 10])),
  [brilliant]: 100, [second.itemId]: 300, [second.combo.itemId]: 500,
};

test('continuing compares both next-tier outputs with the materials and the forgone Brilliant sale', () => {
  const stocked = { ...state, stock: Object.fromEntries(second.materials.map(m => [m.itemId, 999])) };
  const sale = lineEstimate(line, catalog, stocked, '1406', salePrices).stages[0].sale;
  assert.deepEqual([sale.now.quantity, sale.now.value, sale.next.used], [16, 1600n, 16]);
  assert.deepEqual(sale.next.products.map(p => [p.quantity, p.value]), [[12, 3600n], [4, 2000n]]);
  assert.deepEqual([sale.next.extraCost, sale.next.cost, sale.next.revenue, sale.next.difference], [1600n, 3200n, 5600n, 2400n]);
  for (const [price, difference] of [[250, 0n], [300, -800n]]) {
    assert.equal(lineEstimate(line, catalog, stocked, '1406', { ...salePrices, [brilliant]: price }).stages[0].sale.next.difference, difference);
  }
});

test('surplus Brilliants cancel between options and extra Brilliants are valued even when already owned', () => {
  const configured = { steps: line.steps.map((s, i) => i === 1 ? { ...s, count: 12 } : s) };
  const { now, next } = lineEstimate(configured, catalog, state, '1406', salePrices).stages[0].sale;
  assert.deepEqual([now.quantity - next.used, next.used, next.extraCost, next.revenue], [4, 12, 1200n, 4200n]);
  assert.equal(next.difference, next.revenue + 400n - next.extraCost - now.value);
  const short = { steps: line.steps.map((s, i) => i ? s : { ...s, combos: 3 }) };
  const extra = lineEstimate(short, catalog, { ...state, stock: { [brilliant]: 13 } }, '1406', salePrices).stages[0].sale.next;
  assert.deepEqual([extra.used, extra.extra.find(r => r.itemId === brilliant).quantity, extra.extraCost, extra.difference], [3, 13, 2900n, 2400n]);
  const recorded = applyChange(executing(), firstCraft, catalog);
  const actual = lineEstimate(recorded.lines[line.id], catalog, recorded, '1406', salePrices).stages[0].sale;
  assert.deepEqual([actual.now.quantity, actual.next.count, actual.next.difference], [13, 13, 1900n]);
});

test('missing quotes suppress the verdict, while zero prices, zero units and manual prices keep their meanings', () => {
  for (const id of [brilliant, second.itemId, second.combo.itemId, second.materials[1].itemId]) {
    const quotes = { ...salePrices };
    delete quotes[id];
    const ws = { ...state, prices: { '1406': { [id]: 0 } } };
    assert.equal(lineEstimate(line, catalog, ws, '1306', quotes).stages[0].sale.next.difference, null);
    assert.equal(typeof lineEstimate(line, catalog, ws, '1406', quotes).stages[0].sale.next.difference, 'bigint');
  }
  const none = { steps: line.steps.map((s, i) => i === 0 ? { ...s, combos: 0 } : s) };
  const sale = lineEstimate(none, catalog, state, '1406', salePrices).stages[0].sale;
  assert.equal(sale.now.value, 0n);
  assert.equal(sale.next.difference, null);
  const noNextCombos = { steps: line.steps.map((s, i) => i === 1 ? { ...s, combos: 0 } : s) };
  assert.equal(lineEstimate(noNextCombos, catalog, state, '1406', { ...salePrices, [second.combo.itemId]: null }).stages[0].sale.next.difference, 1600n);
  const noAttempts = { steps: line.steps.map((s, i) => i === 1 ? { ...s, count: 0 } : s) };
  assert.equal(lineEstimate(noAttempts, catalog, state, '1406', salePrices).stages[0].sale.next.difference, null);
});

test('previewing the gold guard tier fetches its prices without adding it to the plan or shopping list', () => {
  const chain = goldProgression(catalog.byId['111083001'], catalog);
  const partial = { steps: chain.slice(0, 3) };
  const result = lineEstimate(partial, catalog, state, '1406');
  const preview = result.stages[2].sale;
  assert.equal(result.stages.length, 3);
  assert.deepEqual([preview.now.quantity, preview.next.index, preview.next.recipe.id, preview.next.count], [1, null, '111083001', 1]);
  const gold = catalog.byId['111083001'];
  const ids = lineMarketItems(partial, catalog).map(row => row.itemId);
  for (const id of [gold.itemId, gold.combo.itemId, ...gold.materials.map(m => m.itemId)]) assert.ok(ids.includes(id));
  assert.ok(!result.rows.some(r => r.itemId === gold.materials.at(-1).itemId));
  const full = lineEstimate({ steps: chain }, catalog, state, '1406');
  assert.equal(full.stages[2].sale.next.index, 3);
  assert.equal(full.stages[3].sale.next, null);
  const mixed = { steps: [line.steps[0], { ...line.steps[0], recipeId: mace[0] }, line.steps[1]] };
  assert.equal(lineEstimate(mixed, catalog, state, '1406').stages[0].sale.next.index, 2);
});

test('same-item combo yields and actual alternative allocations are priced in the correct units', () => {
  const a = { id: 'a', itemId: '101', yield: 2, materials: [{ itemId: '301', quantity: 1 }], combo: { itemId: '101', quantity: 3, chance: 25 } };
  const b = { id: 'b', itemId: '102', yield: 2, materials: [{ itemId: '302', quantity: 1, alternatives: [{ itemId: '101', quantity: 2 }] }, { itemId: '303', quantity: 2 }] };
  const cat = indexCatalog({ items: {}, recipes: [a, b] });
  const draft = { steps: [{ recipeId: 'a', count: 4 }, { recipeId: 'b', count: 3 }] };
  const quotes = { 101: 100, 102: 150, 303: 10 };
  const sale = lineEstimate(draft, cat, state, '1406', quotes).stages[0].sale;
  assert.deepEqual([sale.now.quantity, sale.next.used, sale.next.extraCost, sale.next.revenue, sale.next.difference], [9, 6, 60n, 900n, 240n]);
  const usedPrimary = lineEstimate(draft, cat, { ...state, stock: { 302: 3 } }, '1406', quotes).stages[0].sale;
  assert.equal(usedPrimary.next.used, 0);
  assert.equal(usedPrimary.next.difference, null);
});
