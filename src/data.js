import { useEffect, useState } from 'react';
import { indexCatalog } from '../shared/planner.js';

export async function loadData() {
  const get = async path => {
    const response = await fetch('/data/' + path);
    if (!response.ok) throw new Error('loadError');
    return response.json();
  };
  const [raw, markets, snapshot] = await Promise.all([get('catalog.json'), get('markets.json'), get('market-1406.json').catch(() => null)]);
  return { catalog: indexCatalog(raw), servers: markets.servers, snapshot };
}

export function itemName(item, language) {
  const base = language.split('-')[0];
  return item?.names?.[language] || item?.names?.[base] || (base === 'zh' && (item?.names?.['zh-TW'] || item?.names?.['zh-Hant'])) || item?.names?.en || item?.id || '';
}

export function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

const settingsKey = 'atreia-forge.preferences.v1';
export function readSettings() {
  try { return JSON.parse(localStorage.getItem(settingsKey)) || {}; }
  catch { return {}; }
}
export function writeSettings(value) {
  try { localStorage.setItem(settingsKey, JSON.stringify({ ...readSettings(), ...value })); }
  catch { /* Preferences remain active for this visit. */ }
}

const recentMarkets = new Map();
export function useMarket(server, materials, snapshot) {
  const ids = [...new Set(materials.flatMap(row => [row.itemId, ...(row.alternatives || []).map(option => option.itemId)]))].sort().join(',');
  const key = server + '/' + ids;
  const [result, setResult] = useState(null);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(value => value + 1);
  const fallback = recentMarkets.get(key) || (snapshot?.server === server ? snapshot : null);
  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    async function update() {
      const cached = recentMarkets.get(key) || (snapshot?.server === server ? snapshot : null);
      setResult({ key, data: cached, busy: true });
      try {
        const keys = ids.split(',');
        const chunks = [];
        for (let i = 0; i < keys.length; i += 100) chunks.push(keys.slice(i, i + 100));
        const groups = await Promise.all(chunks.map(async group => {
          try {
            const params = new URLSearchParams({ server, items: group.join(',') });
            const response = await fetch('/api/market?' + params, { signal: controller.signal, cache: 'no-cache' });
            if (!response.ok) throw new Error('offline');
            const part = await response.json();
            if (part.server !== server || !part.prices) throw new Error('offline');
            return part;
          } catch {
            const subset = field => Object.fromEntries(group.map(id => [id, cached?.[field]?.[id] ?? null]));
            return { server, status: cached?.fetchedAt ? 'stale' : 'unavailable', asOf: cached?.asOf, fetchedAt: cached?.fetchedAt,
              prices: subset('prices'), availability: subset('availability'), captures: subset('captures') };
          }
        }));
        const oldest = field => groups.map(group => group[field]).filter(Boolean).sort()[0] || null;
        const merge = field => Object.assign({}, ...groups.map(group => group[field]));
        const data = { ...groups[0], asOf: oldest('asOf'), fetchedAt: oldest('fetchedAt'),
          status: groups.every(g => g.status === 'unavailable') ? 'unavailable' : groups.every(g => g.status === 'ok') ? 'ok' : 'stale',
          prices: merge('prices'), availability: merge('availability'), captures: merge('captures') };
        if (!controller.signal.aborted) {
          recentMarkets.set(key, data);
          setResult({ key, data, busy: false });
        }
      } catch {
        if (!controller.signal.aborted) setResult({ key, data: { ...cached, status: cached?.fetchedAt ? 'stale' : 'unavailable' }, busy: false });
      }
    }
    update();
    const timer = setInterval(() => { if (!document.hidden) update(); }, 5 * 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [server, key, ids, snapshot, tick]);
  const view = result?.key === key ? result : { data: fallback, busy: !!ids };
  return { ...view.data, prices: view.data?.prices || {}, busy: view.busy, refresh };
}
