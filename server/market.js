import markets from "../public/data/markets.json" with { type: "json" };
import arielSnapshot from "../public/data/market-1406.json" with { type: "json" };

const exchangeServers = new Map(markets.servers.map(({ id, exchangeId }) => [id, exchangeId]));
const source = "Aion2 Exchange";
const cacheLifetime = 5 * 60_000;
const staleAfter = 3 * 60 * 60_000;
const maxCacheEntries = 4_000;
const quotes = new Map();
const pending = new Map();
let requestVersion = 0;
const savedArielQuotes = new Map(Object.entries(arielSnapshot.prices).map(([id, price]) => [
  arielSnapshot.server + "/" + id,
  { price, capturedAt: arielSnapshot.captures[id], availability: arielSnapshot.availability[id], fetchedAt: arielSnapshot.fetchedAt },
]));

function json(body, status = 200, cache = "no-store", headers = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": cache, ...headers } });
}

function unknown(fetchedAt = null) {
  return { price: null, capturedAt: null, availability: "unknown", fetchedAt };
}

function latestQuote(server, id) {
  const key = server + "/" + id;
  return quotes.get(key) ?? savedArielQuotes.get(key) ?? unknown();
}

function remember(key, row) {
  quotes.delete(key);
  quotes.set(key, row);
  if (savedArielQuotes.has(key)) savedArielQuotes.set(key, row);
  if (quotes.size > maxCacheEntries) quotes.delete(quotes.keys().next().value);
}

function parseQuote(row, fetchedAt) {
  if (row.listed === false || row.listings === 0) {
    return { price: null, capturedAt: null, availability: "unlisted", listings: 0, fetchedAt };
  }
  const timestamp = Date.parse(row.captured_at);
  if (row.listed !== true || !(row.listings > 0) || !Number.isFinite(row.price)
    || row.price <= 0 || row.price > Number.MAX_SAFE_INTEGER || !Number.isFinite(timestamp)) {
    return unknown(fetchedAt);
  }
  return { price: row.price, capturedAt: new Date(timestamp).toISOString(), availability: "listed", listings: row.listings, fetchedAt };
}

async function refresh(url, server, ids) {
  const version = ++requestVersion;
  const upstream = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!upstream.ok) throw new Error("Market temporarily unavailable");
  const data = await upstream.json();
  if (!Array.isArray(data?.items) || !Number.isInteger(data.total) || data.items.length !== data.total) {
    throw new Error("Incomplete market response");
  }
  const fetchedAt = new Date().toISOString();
  const byId = new Map(data.items.map(row => [String(row.item_key), parseQuote(row, fetchedAt)]));
  for (const id of ids) {
    const next = byId.get(id) ?? unknown(fetchedAt);
    const key = server + "/" + id;
    const previous = latestQuote(server, id);
    // A slow, older request must never restore an offer removed by a newer one.
    if (previous.version > version) continue;
    if (next.capturedAt && previous.capturedAt && next.capturedAt < previous.capturedAt) continue;
    next.version = version;
    remember(key, next);
  }
}

/** GET /api/market?server=<game-server-id>&items=<comma-separated-game-item-ids> */
export async function handleMarket(request) {
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405, "no-store", { Allow: "GET" });
  const query = new URL(request.url).searchParams;
  const server = query.get("server") ?? "1406";
  const exchangeId = exchangeServers.get(server);
  if (!exchangeId) return json({ error: "unknown_server" }, 400);

  const input = (query.get("items") ?? "").split(",");
  if (input.length > 100 || input.some(id => !/^[1-9]\d{0,11}$/.test(id))) {
    return json({ error: "invalid_items" }, 400);
  }
  const ids = [...new Set(input)].sort();
  const upstream = new URL("https://aion2.exchange/api/items");
  upstream.search = new URLSearchParams({ server: String(exchangeId), keys: ids.join(","), limit: String(ids.length) });
  const sourceUrl = upstream.href;
  let failed = false;
  const now = Date.now();
  if (ids.some(id => {
    const row = quotes.get(server + "/" + id);
    return !row || Date.parse(row.fetchedAt) <= now - cacheLifetime;
  })) {
    let work = pending.get(sourceUrl);
    if (!work) {
      work = refresh(sourceUrl, server, ids).finally(() => pending.delete(sourceUrl));
      pending.set(sourceUrl, work);
    }
    try {
      await work;
    } catch {
      failed = true;
    }
  }

  const prices = {}, captures = {}, availability = {}, listings = {};
  let asOf = null, fetchedAt = null;
  for (const id of ids) {
    const row = latestQuote(server, id);
    prices[id] = row.price;
    availability[id] = row.availability;
    listings[id] = row.listings ?? null;
    captures[id] = row.capturedAt;
    if (row.capturedAt && (!asOf || row.capturedAt < asOf)) asOf = row.capturedAt;
    if (row.fetchedAt && (!fetchedAt || row.fetchedAt < fetchedAt)) fetchedAt = row.fetchedAt;
  }
  let status = "ok";
  if (failed || (asOf && Date.parse(asOf) < now - staleAfter)) status = fetchedAt ? "stale" : "unavailable";
  const cache = failed ? "public, max-age=15" : "public, max-age=60, s-maxage=300";
  return json({ server, source, sourceUrl, status, asOf, fetchedAt, prices, captures, availability, listings }, 200, cache);
}
