import catalog from '../public/data/catalog.json' with { type: 'json' };
import markets from '../public/data/markets.json' with { type: 'json' };
import { checkAccess } from '../server/access.js';
import { handleMarket } from '../server/market.js';
import { marketItemIds, rankCrafts, saleRecipes } from '../server/profitability.js';
import { MAX_PRICE, validMarketFeeBps } from '../shared/quantities.js';

async function requestBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let text = req.body?.toString() || '';
  if (!text) for await (const chunk of req) {
    text += chunk;
    if (text.length > 32768) throw new Error('request_size');
  }
  return JSON.parse(text);
}

export default async function profitability(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const reply = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, { error: 'method' }); }
  const access = await checkAccess(req.headers.authorization);
  if (access !== 200) return reply(access, { error: access === 503 ? 'unavailable' : 'access' });
  let body;
  try { body = await requestBody(req); } catch { return reply(400, { error: 'invalid_request' }); }
  const server = markets.servers.find(entry => entry.id === body?.server);
  const manual = body?.manual ?? {};
  if (!server || !validMarketFeeBps(body.feeBps) || typeof manual !== 'object' || Array.isArray(manual) ||
    Object.entries(manual).some(([id, value]) => !Object.hasOwn(catalog.items, id) ||
      !Number.isSafeInteger(value) || value < 0 || value > MAX_PRICE)) return reply(400, { error: 'invalid_request' });
  const recipes = saleRecipes(catalog, server.faction.toLowerCase());
  const ids = marketItemIds(recipes);
  const requests = [];
  for (let i = 0; i < ids.length; i += 100) {
    const params = new URLSearchParams({ server: server.id, items: ids.slice(i, i + 100).join(',') });
    requests.push(handleMarket(new Request('http://localhost/api/market?' + params)).then(r => r.json()));
  }
  const batches = await Promise.all(requests);
  const quotes = Object.assign({}, ...batches.map(batch => batch.prices));
  const result = rankCrafts(recipes, catalog.items, quotes, manual, body.feeBps);
  return reply(200, { ...result, server: server.id, feeBps: body.feeBps,
    status: batches.every(b => b.status === 'ok') ? 'ok' : batches.every(b => b.status === 'unavailable') ? 'unavailable' : 'stale',
    asOf: batches.map(b => b.asOf).filter(Boolean).sort()[0] ?? null });
}
