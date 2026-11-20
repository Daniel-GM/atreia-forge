import { handleMarket } from '../server/market.js';

export default async function market(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const result = await handleMarket(new Request(url, { method: req.method }));
  res.writeHead(result.status, Object.fromEntries(result.headers));
  res.end(await result.text());
}
