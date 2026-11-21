import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { profitScenario } from '../shared/profit-scenario.js';
import { matchesRecipeName } from '../src/recipe-filter.js';
import { checkAccess } from '../server/access.js';
import { handleMarket } from '../server/market.js';
import { marketItemIds, rankCrafts, saleRecipes } from '../server/profitability.js';
import { projectId } from '../shared/firebase-project.js';

const items = Object.fromEntries(['normal', 'bright', 'ore', 'ingot', 'bound'].map(id =>
  [id, { names: { en: id === 'bound' ? 'Charm (Bound)' : id } }]));
const recipe = { id: 'r', mechanism: 'craft', faction: 'elyos', itemId: 'normal', yield: 2,
  combo: { itemId: 'bright', chance: 25, quantity: 1 },
  materials: [{ itemId: 'ore', quantity: 3, alternatives: [{ itemId: 'ingot', quantity: 2 }] }] };
const quotes = { normal: 100, bright: 200, ore: 30, ingot: 25 };

const game = JSON.parse(readFileSync(new URL('../public/data/catalog.json', import.meta.url)));
const maces = game.recipes.filter(r => r.category === 'mace' && r.faction === 'elyos' && r.mechanism === 'craft');
const target = maces.find(r => r.id === '111064001');
const maceQuotes = Object.fromEntries(marketItemIds(maces).map(id => [id, 1]));
Object.assign(maceQuotes, { '110740013': 11111060, '110730013': 19800000, '110740012': 3499000,
  '610530008': 315000, '610620015': 80000, '610610015': 79000, '110760023': 10, '110750015': 100 });

test('market keeps the server, lowest listed unit price and capture together, with no historical sale fallback', async t => {
  const captured = new Date().toISOString();
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(new URL(url).searchParams.get('server'), '11406');
    return Response.json({ total: 2, items: [
      { item_key: 110730013, listed: true, listings: 5, price: 19800000, captured_at: captured, sold_avg_price: 123 },
      { item_key: 110740013, listed: false, listings: 0, price: null, last_price: 11111060 },
    ] });
  });
  const result = await (await handleMarket(new Request('http://localhost/api/market?server=1406&items=110730013,110740013,110740012'))).json();
  assert.deepEqual(result.prices, { '110730013': 19800000, '110740013': null, '110740012': null });
  assert.deepEqual(result.listings, { '110730013': 5, '110740013': 0, '110740012': null });
  assert.deepEqual(result.availability, { '110730013': 'listed', '110740013': 'unlisted', '110740012': 'unknown' });
  assert.equal(result.captures['110730013'], captured);
});

test('Ariel mace screenshot: each sale at full price and the probability-weighted average are different scenarios', () => {
  const row = rankCrafts(maces, game.items, maceQuotes, {}, 1000).rows.find(r => r.recipeId === target.id);
  for (const [kind, gross, net, profit] of [
    ['normal', 11111060, 9999954, 3969954], ['combo', 19800000, 17820000, 11790000],
    ['average', 13283295, 11954965.5, 5924965.5],
  ]) {
    const v = profitScenario(row, target, kind, 'buy', 1000);
    assert.equal(v.cost, 6030000);
    assert.deepEqual([v.gross, v.net, v.profit, v.missing], [gross, net, profit, []]);
  }
  const chain = profitScenario(row, target, 'average', 'chain', 1000);
  assert.deepEqual(row.chain.steps.map(s => s.attempts), [16, 4, 1]);
  assert.equal(chain.cost, 16 * 10 + 4 * 14 + 2531000);
  assert.deepEqual(row.chain.steps.map(s => s.externalCost), [160, 56, 2531000]);
  assert.equal(chain.net, row.net);
  assert.equal(chain.profit, chain.net - chain.cost);
  const extras = profitScenario(row, target, 'average', 'chain', 1000, true);
  assert.deepEqual(row.chain.byproducts.map(s => s.quantity), [12, 3]);
  assert.equal(extras.profit - chain.profit, 378);
  assert.ok(matchesRecipeName(target, game.items, 'pt', 'brilhante do perito', 'both'));
  assert.ok(matchesRecipeName(target, game.items, 'pt', 'maca de orichalcum do perito', 'combo'));
  assert.ok(!matchesRecipeName(target, game.items, 'pt', 'brilhante', 'normal'));
});

test('a missing intermediate blocks buying it only, and unquoted leftovers are optional', () => {
  const prices = { ...maceQuotes };
  delete prices['110740012']; delete prices['110750015']; delete prices[target.itemId];
  const all = rankCrafts(maces, game.items, prices, {}, 1000);
  const row = all.incomplete.find(r => r.recipeId === target.id);
  assert.deepEqual(profitScenario(row, target, 'combo', 'buy', 1000).missing, ['110740012']);
  const linked = profitScenario(row, target, 'combo', 'chain', 1000);
  assert.deepEqual(linked.missing, []);
  assert.equal(linked.profit, 17820000 - linked.cost);
  assert.deepEqual(profitScenario(row, target, 'average', 'chain', 1000).missing, [target.itemId]);
  const withSales = profitScenario(row, target, 'combo', 'chain', 1000, true);
  assert.deepEqual(withSales.missing, ['110750015']);
  assert.equal(withSales.profit, null);
  const gold = all.incomplete.concat(all.rows).find(r => r.recipeId === '111063001');
  assert.deepEqual(gold.chain.steps.map(s => s.attempts), [64, 16, 4, 1]);
  assert.deepEqual(gold.chain.byproducts.map(s => s.quantity), [48, 12, 3]);
  assert.ok(!all.rows.concat(all.incomplete).find(r => r.recipeId === '111066001').chain);
});

test('multi-unit and fractional expected production uses whole batches and follows same-faction item IDs', () => {
  const base = { ...recipe, id: 'base', itemId: 'baseItem', profession: 'p', category: 'equipment', yield: 1,
    combo: { itemId: 'ingredient', quantity: 2, chance: 30 }, materials: [{ itemId: 'ore', quantity: 1 }] };
  const top = { ...base, id: 'top', itemId: 'topItem', yield: 2, combo: null, materials: [{ itemId: 'ingredient', quantity: 1 }] };
  const other = { ...base, id: 'other', faction: 'asmodian' };
  const itemMap = { baseItem: { grade: 'common' }, ingredient: { grade: 'rare' }, topItem: { grade: 'rare' }, ore: {} };
  const all = rankCrafts([other, base, top], itemMap, { topItem: 20, ore: 3, baseItem: 10 }, {}, 1000);
  const row = all.incomplete.find(r => r.recipeId === 'top');
  assert.deepEqual(row.chain.steps, [{ recipeId: 'base', attempts: 5/3, externalCost: 5 }, { recipeId: 'top', attempts: 1, externalCost: 0 }]);
  assert.equal(row.chain.cost, 5);
  assert.equal(row.chain.byproductNet, 10.5);
  assert.equal(profitScenario(row, top, 'normal', 'chain', 1000).profit, 31);
  assert.equal(profitScenario(row, top, 'combo', 'chain', 1000), null);
});

test('profitability values regular and brilliant outputs, the cheapest equivalent input and both sale fees', () => {
  const result = rankCrafts([recipe], items, quotes, { normal: 10000 }, 1000);
  assert.deepEqual(result.incomplete, []);
  const { materials, outcomes, ...totals } = result.rows[0];
  assert.deepEqual(totals, { recipeId: 'r', cost: 50, gross: 200, net: 180, fee: 20, profit: 130, margin: 130 / 180 * 100 });
  assert.deepEqual(materials, [{ itemId: 'ingot', quantity: 2, price: 25, manual: false, subtotal: 50, alternative: true }]);
  assert.deepEqual(outcomes, [
    { kind: 'normal', itemId: 'normal', chance: 75, quantity: 2, price: 100, manual: false, bound: false, sale: 200, expectedGross: 150 },
    { kind: 'combo', itemId: 'bright', chance: 25, quantity: 1, price: 200, manual: false, bound: false, sale: 200, expectedGross: 50 },
  ]);
  const atFullFee = rankCrafts([recipe], items, quotes, {}, 10000).rows[0];
  assert.equal(atFullFee.profit, -50);
  assert.equal(atFullFee.margin, null);
});

test('per-item integer fee rounding, same-item combos and partial quotes remain consistent', () => {
  const same = { ...recipe, combo: { ...recipe.combo, itemId: 'normal' } };
  const missing = rankCrafts([recipe], items, { ore: 20 }, { normal: 1 }, 625);
  assert.deepEqual(missing.rows, []);
  const partial = missing.incomplete[0];
  assert.deepEqual(partial.missing, ['bright']);
  assert.equal(partial.cost, 60);
  assert.equal(partial.outcomes[0].manual, true);
  assert.equal(partial.outcomes[0].expectedGross, 1.5);
  assert.equal(partial.outcomes[1].expectedGross, null);
  assert.equal(partial.fee, null);
  assert.equal(partial.profit, null);
  const { rows } = rankCrafts([same], items, { normal: 1 }, { ingot: 0 }, 625);
  assert.equal(rows[0].net, 1.64); // floor(175 × .9375) / 100
  assert.deepEqual(rows[0].outcomes.map(o => [o.itemId, o.quantity, o.chance, o.expectedGross]),
    [['normal', 2, 75, 1.5], ['normal', 1, 25, 0.25]]);
  assert.equal(rows[0].fee, 0.11);
  assert.equal(rows[0].cost, 0);
  assert.equal(rows[0].materials[0].manual, true);
  assert.deepEqual(marketItemIds([recipe]), ['bright', 'ingot', 'normal', 'ore']);
});

test('only faction crafts with a saleable outcome qualify and bound by-products earn no revenue', () => {
  const bound = { ...recipe, itemId: 'bound' };
  const recipes = [bound, { ...bound, combo: null }, { ...recipe, faction: 'asmodian' }, { ...recipe, mechanism: 'succession' }];
  assert.deepEqual(saleRecipes({ recipes, items }, 'elyos'), [bound]);
  assert.deepEqual(saleRecipes({ recipes, items }, 'all'), [bound, recipes[2]]);
  assert.deepEqual(saleRecipes({ recipes, items }, 'asmodian'), [recipes[2]]);
  const [row] = rankCrafts([bound], items, quotes, { bound: 9999 }, 0).rows;
  assert.equal(row.gross, 50);
  assert.equal(row.outcomes[0].bound, true);
  assert.equal(row.outcomes[0].price, null);
  assert.equal(row.outcomes[0].expectedGross, 0);
});

test('a craft without a combo has one 100% outcome and unquoted alternatives keep the cost unknown', () => {
  const noCombo = { ...recipe, combo: null, materials: [...recipe.materials, { itemId: 'bound', quantity: 2 }] };
  const partial = rankCrafts([noCombo], items, { normal: 10, bound: 3 }, {}, 500).incomplete[0];
  assert.deepEqual(partial.missing, ['ore', 'ingot']);
  assert.deepEqual(partial.materials.map(m => m.subtotal), [null, 6]);
  assert.equal(partial.cost, null);
  assert.equal(partial.profit, null);
  assert.equal(partial.net, 19);
  assert.equal(partial.outcomes.length, 1);
  assert.equal(partial.outcomes[0].chance, 100);
  assert.equal(partial.outcomes[0].expectedGross, 20);
  for (const chance of [0, 100]) {
    const certain = { ...recipe, combo: { ...recipe.combo, chance } };
    const sale = chance === 0 ? { normal: 70 } : { bright: 240 };
    const [row] = rankCrafts([certain], items, { ...sale, ingot: 10 }, {}, 0).rows;
    assert.equal(row.profit, chance === 0 ? 120 : 220);
    assert.equal(row.outcomes.find(o => o.chance === 0).expectedGross, 0);
  }
});

const claims = { aud: projectId, iss: 'https://securetoken.google.com/' + projectId,
  email: 'Member@example.test', email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const bearer = data => 'Bearer a.' + Buffer.from(JSON.stringify(data)).toString('base64url') + '.b';
test('private ranking requires a verified Google identity, its own live member document and server authorization', async () => {
  const never = () => { throw new Error('unexpected request'); };
  for (const header of [null, 'Bearer malformed', bearer({ ...claims, email_verified: false }),
    bearer({ ...claims, aud: 'other' }), bearer({ ...claims, firebase: { sign_in_provider: 'password' } })]) {
    assert.equal(await checkAccess(header, never), 401);
  }
  const header = bearer(claims);
  for (const [status, expected] of [[401, 401], [403, 403], [404, 403], [500, 503]]) {
    assert.equal(await checkAccess(header, () => new Response(null, { status })), expected);
  }
  for (const enabled of [true, false]) {
    const allowed = await checkAccess(header, (url, options) => {
      assert.ok(url.endsWith('/members/member%40example.test'));
      assert.equal(options.headers.Authorization, header);
      return Response.json({ fields: { enabled: { booleanValue: enabled } } });
    });
    assert.equal(allowed, enabled ? 200 : 403);
  }
});
