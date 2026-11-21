import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, RefreshCw, TrendingUp } from 'lucide-react';
import { isBound, saleRecipes } from '../shared/recipe-filter.js';
import { profitScenario } from '../shared/profit-scenario.js';
import { useRecipeList } from './recipe-filter.js';
import { RecipeFilterDialog, RecipeFilterFields } from './recipe-filters.jsx';
import { Professions } from './ui.jsx';
import { ProfitRecipe, RankColumns } from './profit-recipe.jsx';
import { MarketFeeField } from './lines.jsx';
import { PriceDialog } from './recipes.jsx';
import './profitability.css';

function useRanking(user, server, faction, feeBps, manual) {
  const body = JSON.stringify({ server, faction, feeBps, manual });
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
  const [profession, setProfession] = useState('all');
  const [category, setCategory] = useState('all');
  const [factionMode, setFactionMode] = useState('server');
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [sort, setSort] = useState('profit');
  const [kind, setKind] = useState('average');
  const [strategy, setStrategy] = useState('buy');
  const [limit, setLimit] = useState(20);
  const [missingLimit, setMissingLimit] = useState(20);
  const [priceId, setPriceId] = useState(null);
  const [showMissing, setShowMissing] = useState(false);
  const money = useMemo(() => new Intl.NumberFormat(locale.locale, { maximumFractionDigits: 2 }).format, [locale]);
  const percentage = useMemo(() => new Intl.NumberFormat(locale.locale, { style: 'percent', maximumFractionDigits: 2 }), [locale]);
  const percent = value => percentage.format(value / 100);
  const faction = factionMode === 'server' ? server.faction.toLowerCase() : factionMode;
  const { data, busy, error, refresh } = useRanking(account.user, server.id, faction, feeBps, workshop.state.prices[server.id]);
  const eligible = useMemo(() => {
    const recipes = saleRecipes(catalog, 'all').filter(r => {
      if (kind === 'combo') return r.combo?.chance > 0 && !isBound(catalog.items[r.combo.itemId]);
      if (kind === 'normal') return r.combo?.chance !== 100 && !isBound(catalog.items[r.itemId]);
      return true;
    });
    return { ...catalog, recipes };
  }, [catalog, kind]);
  const { counts, categories, allRecipes, filtered } = useRecipeList(eligible, language, faction, profession, category, query, true);
  const visible = new Set(filtered.map(recipe => recipe.id));
  const rows = [], incomplete = [];
  for (const row of [...(data?.rows || []), ...(data?.incomplete || [])]) {
    if (!visible.has(row.recipeId)) continue;
    const view = profitScenario(row, catalog.byId[row.recipeId], kind, strategy, feeBps);
    if (view) (view.profit == null ? incomplete : rows).push({ row, view });
  }
  rows.sort((a, b) => (b.view[sort] ?? -Infinity) - (a.view[sort] ?? -Infinity) ||
    b.view.profit - a.view.profit || a.row.recipeId.localeCompare(b.row.recipeId));
  const status = busy ? 'marketLoading' : error || (data?.status === 'ok' ? 'live' : data?.status === 'stale' ? 'stale' : 'offline');
  const stamp = data?.asOf && new Date(data.asOf).toLocaleString(locale.locale, { dateStyle: 'short', timeStyle: 'short' });
  function chooseProfession(key) { setProfession(key); setCategory('all'); setQuery(''); }
  function changeFaction(value) { setFactionMode(value); setCategory('all'); }
  function clearFilters() { setCategory('all'); setQuery(''); setFactionMode('server'); setKind('average'); }
  useEffect(() => { setLimit(20); setMissingLimit(20); setExpandedId(null); }, [profession, faction, category, query]);
  useEffect(() => { setLimit(20); setMissingLimit(20); }, [kind, strategy]);
  useEffect(() => { if (category !== 'all' && !categories.includes(category)) setCategory('all'); }, [category, categories]);
  useEffect(() => { if (query.trim()) setShowMissing(true); }, [query]);
  const filterProps = { categories, category, setCategory, language, t };
  const market = data?.market || { prices: {} };
  const stampFormat = useMemo(() => new Intl.DateTimeFormat(locale.locale, { dateStyle: 'short', timeStyle: 'short' }), [locale]);
  const quoteProps = { language, t, server, market, stamp: stampFormat.format, onPrice: setPriceId };
  function renderRow({ row, view }) {
    return <ProfitRecipe key={row.recipeId} {...{ row, view, catalog, quoteProps, money, percent, kind, strategy, feeBps, openRecipe }}
      showFaction={factionMode !== 'server'} expanded={row.recipeId === expandedId} onPrice={setPriceId}
      onToggle={id => setExpandedId(old => old === id ? null : id)}/>;
  }
  return <div className="rank-page">
    <Professions selected={profession} allCount={allRecipes.length} counts={counts} onSelect={chooseProfession} {...{ t, format }}/>
    <section className="panel profit-panel">
      <div className="profit-toolbar">
        <div className="profit-filters"><RecipeFilterFields {...filterProps} {...{ query, setQuery }} filteredFaction={factionMode !== 'server'} onFilters={() => setShowFilters(true)}/></div>
        <div className="mode-options" role="group" aria-label={t('sortRank')}>{['profit', 'margin'].map(key => <button key={key} aria-pressed={key === sort} onClick={() => { setSort(key); setLimit(20); }}>{t(key)}</button>)}</div>
      </div>
      <div className="rank-controls">
        <label>{t('product')}<select aria-label={t('product')} value={kind} onChange={e => setKind(e.target.value)}>
          <option value="average">{t('avgAttempt')}</option><option value="normal">{t('whenNormal')}</option><option value="combo">{t('whenCombo')}</option>
        </select></label>
        <label>{t('strategy')}<select aria-label={t('strategy')} value={strategy} onChange={e => setStrategy(e.target.value)}>
          <option value="buy">{t('buyInputs')}</option><option value="chain">{t('fromFirst')}</option>
        </select></label>
      </div>
      <MarketFeeField bps={feeBps} {...{ t, format }} onChange={bps => workshop.change({ type: 'marketFee', server: server.id, bps })}/>
      <div className="profit-heading"><TrendingUp size={19}/><h2>{t(kind === 'average' ? 'avgAttempt' : kind === 'normal' ? 'whenNormal' : 'whenCombo')}</h2>{data && <span className="count-badge">{format(rows.length)}</span>}</div>
      <div className="quote-foot rank-source"><span className={'quote-status ' + status}><Clock3 size={14}/>{t(status)}{stamp && ' · ' + stamp}</span><a href="https://aion2.exchange/api/docs" target="_blank" rel="noreferrer">Aion2 Exchange</a><button className="refresh-button" aria-label={t('refresh')} disabled={busy} onClick={refresh}><RefreshCw size={15}/></button></div>
      <details className="profit-method"><summary>{t('saleBreakdown')}</summary><p>{t('profitFormula')}</p></details>
      {rows.length > 0 && <div className="profit-list">
        <RankColumns {...{ t, kind }}/>
        {rows.slice(0, limit).map(renderRow)}
        {rows.length > limit && <button className="text-button" onClick={() => setLimit(n => n + 20)}>{t('showMore')}</button>}
      </div>}
      {!rows.length && <div className="empty-text" role="status">{t(busy ? 'marketLoading' : error || (incomplete.length ? 'missingPrices' : 'noResults'))}
        {!busy && !error && !incomplete.length && <button className="text-button" onClick={clearFilters}>{t('clearFilters')}</button>}</div>}
      {incomplete.length > 0 && <details className="incomplete-rank" open={showMissing} onToggle={e => setShowMissing(e.currentTarget.open)}><summary>{t('missingPrices')} <span className="count-badge">{format(incomplete.length)}</span></summary>
        {showMissing && <div><RankColumns {...{ t, kind }}/>{incomplete.slice(0, missingLimit).map(renderRow)}
          {incomplete.length > missingLimit && <button className="more-button" onClick={() => setMissingLimit(n => n + 20)}>{t('showMore')}</button>}</div>}
      </details>}
      {priceId && <PriceDialog key={priceId} row={{ itemId: priceId }} item={catalog.items[priceId]} {...{ server, language, workshop, t, format, market }} onClose={() => setPriceId(null)}/>}
      {showFilters && <RecipeFilterDialog {...filterProps} {...{ server, factionMode, clearFilters }} setFactionMode={changeFaction} onClose={() => setShowFilters(false)}/>}
    </section></div>;
}
