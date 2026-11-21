import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAccess } from '../server/access.js';
import { marketItemIds, rankCrafts, saleRecipes } from '../server/profitability.js';
import { projectId } from '../shared/firebase-project.js';

const items = Object.fromEntries(['normal', 'bright', 'ore', 'ingot', 'bound'].map(id =>
  [id, { names: { en: id === 'bound' ? 'Charm (Bound)' : id } }]));
const recipe = { id: 'r', mechanism: 'craft', faction: 'elyos', itemId: 'normal', yield: 2,
  combo: { itemId: 'bright', chance: 25, quantity: 1 },
  materials: [{ itemId: 'ore', quantity: 3, alternatives: [{ itemId: 'ingot', quantity: 2 }] }] };
const quotes = { normal: 100, bright: 200, ore: 30, ingot: 25 };

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
