import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock3, Pencil, RefreshCw, TrendingUp } from 'lucide-react';
import { fold, itemName } from './data.js';
import { Coin, ItemIcon, professions, SearchField } from './ui.jsx';
import { MarketFeeField } from './lines.jsx';
import { PriceDialog } from './recipes.jsx';
import './profitability.css';

function useRanking(user, server, feeBps, manual) {
  const body = JSON.stringify({ server, feeBps, manual });
  const [result, setResult] = useState(null);
  const [tick, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function update() {
      setResult(old => ({ body, busy: true, data: old?.body === body ? old.data : null }));
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/profitability', { method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body });
        if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'accessDenied' : 'offline');
        const data = await response.json();
        if (!controller.signal.aborted) setResult({ body, data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ body, error: error.message === 'accessDenied' ? 'accessDenied' : 'offline' });
      }
    }
    const delay = setTimeout(update, 250);
    const timer = setInterval(() => { if (!document.hidden) update(); }, 300000);
    return () => { clearTimeout(delay); clearInterval(timer); controller.abort(); };
  }, [body, user, tick]);
  return { ...(result?.body === body ? result : { busy: true }), refresh: () => refresh(n => n + 1) };
}

export function Profitability({ catalog, workshop, account, server, language, locale, t, format, openRecipe }) {
  const feeBps = workshop.state.marketFees?.[server.id] || 0;
  const { data, busy, error, refresh } = useRanking(account.user, server.id, feeBps, workshop.state.prices[server.id]);
  const [profession, setProfession] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('profit');
  const [limit, setLimit] = useState(20);
  const [priceId, setPriceId] = useState(null);
  const money = useMemo(() => new Intl.NumberFormat(locale.locale, { maximumFractionDigits: 2 }), [locale]);
  const percentage = useMemo(() => new Intl.NumberFormat(locale.locale, { style: 'percent', maximumFractionDigits: 2 }), [locale]);
  const name = itemId => itemName(catalog.items[itemId], language);
  const matches = row => {
    const recipe = catalog.byId[row.recipeId];
    return (profession === 'all' || recipe.profession === profession) && fold(name(recipe.itemId)).includes(fold(query));
  };
  const rows = (data?.rows || []).filter(matches);
  if (sort === 'margin') rows.sort((a, b) => (b.margin ?? -Infinity) - (a.margin ?? -Infinity) || b.profit - a.profit);
  const incomplete = (data?.incomplete || []).filter(matches);
  const status = busy ? 'marketLoading' : error || (data?.status === 'ok' ? 'live' : data?.status === 'stale' ? 'stale' : 'offline');
  const stamp = data?.asOf && new Date(data.asOf).toLocaleString(locale.locale, { dateStyle: 'short', timeStyle: 'short' });
  const amount = value => <><Coin/>{money.format(value)}</>;
  return <section className="panel profit-panel">
    <MarketFeeField bps={feeBps} {...{ t, format }} onChange={bps => workshop.change({ type: 'marketFee', server: server.id, bps })}/>
    <div className="profit-toolbar">
      <SearchField value={query} setValue={v => { setQuery(v); setLimit(20); }} label={t('searchRecipe')} t={t}/>
      <label className="form-label">{t('professions')}<select className="form-input" value={profession} onChange={e => { setProfession(e.target.value); setLimit(20); }}><option value="all">{t('all')}</option>{professions.map(p => <option key={p} value={p}>{t(p)}</option>)}</select></label>
      <div className="mode-options" role="group" aria-label={t('sortRank')}>{['profit', 'margin'].map(key => <button key={key} aria-pressed={key === sort} onClick={() => { setSort(key); setLimit(20); }}>{t(key)}</button>)}</div>
    </div>
    <div className="profit-heading"><TrendingUp size={19}/><h2>Kinah · {t('perAttempt')}</h2>{data && <span className="count-badge">{format(rows.length)}</span>}</div>
    <p className="profit-method">{t('profitFormula')}</p>
    {rows.length > 0 && <div className="profit-list">
      <div className="profit-columns" aria-hidden="true">{['product', 'craftCost', 'grossSale', 'netSale', 'profit', 'margin'].map(k => <span key={k}>{t(k)}</span>)}</div>
      {rows.slice(0, limit).map(row => {
        const recipe = catalog.byId[row.recipeId], item = catalog.items[recipe.itemId];
        const tone = row.profit > 0 ? 'positive' : row.profit < 0 ? 'negative' : '';
        return <article className="profit-row" key={recipe.id}>
          <button className="profit-item" onClick={() => openRecipe(recipe)}><ItemIcon item={item}/><span><strong>{name(item.id)}</strong><small>{t(recipe.profession)} · {t('level')} {format(recipe.level)}</small></span><ChevronRight size={14}/></button>
          {[['craftCost', row.cost], ['grossSale', row.gross], ['netSale', row.net], ['profit', row.profit], ['margin', row.margin]].map(([key, value]) =>
            <div key={key} className={'profit-value ' + (key === 'profit' || key === 'margin' ? tone : '')}><small>{t(key)}</small>
              <b>{key === 'margin' ? value == null ? '—' : percentage.format(value / 100) : amount(value)}</b></div>)}
        </article>;
      })}
      {rows.length > limit && <button className="text-button" onClick={() => setLimit(n => n + 20)}>{t('showMore')}</button>}
    </div>}
    {!rows.length && <p className="empty-text" role="status">{t(busy ? 'marketLoading' : error || (incomplete.length ? 'missingPrices' : 'noResults'))}</p>}
    {incomplete.length > 0 && <details className="incomplete-rank"><summary>{t('missingPrices')} <span className="count-badge">{format(incomplete.length)}</span></summary>
      <div>{incomplete.map(row => <section key={row.recipeId}><strong>{name(catalog.byId[row.recipeId].itemId)}</strong><div>{row.missing.map(id => <button className="text-button" key={id} onClick={() => setPriceId(id)}>{name(id)}<Pencil size={11}/></button>)}</div></section>)}</div>
    </details>}
    <footer className="quote-foot"><span className={'quote-status ' + status}><Clock3 size={14}/>{t(status)}{stamp && ' · ' + stamp}</span><a href="https://aion2.exchange/api/docs" target="_blank" rel="noreferrer">Aion2 Exchange</a><button className="refresh-button" aria-label={t('refresh')} disabled={busy} onClick={refresh}><RefreshCw size={15}/></button></footer>
    {priceId && <PriceDialog key={priceId} row={{ itemId: priceId }} item={catalog.items[priceId]} {...{ server, language, workshop, t, format }} market={{ prices: {} }} onClose={() => setPriceId(null)}/>}
  </section>;
}
