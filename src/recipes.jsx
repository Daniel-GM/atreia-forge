import React, { useEffect, useRef, useState } from 'react';
import { Anvil, Bookmark, BookOpen, Check, ChevronDown, ChevronRight, CircleAlert, Clock3, ExternalLink, Hammer, Info, Layers3, ListFilter, ListPlus, PackageCheck, Pencil, RefreshCw, SearchX, SlidersHorizontal } from 'lucide-react';
import { craftOutputs, MAX_PRICE } from '../shared/planner.js';
import { attemptsFromBatch } from '../shared/crafting.js';
import { itemName } from './data.js';
import { categoryName, gradeName } from './i18n.js';
import { Coin, ItemIcon, Modal, NumberField, professionIcons, SearchField, Stepper } from './ui.jsx';

export function RecipeBrowser({ recipes, categories, category, setCategory, query, setQuery, selected, profession, select, onFilters, filteredFaction, catalog, language, t, format, inModal = false, clearFilters }) {
  const [limit, setLimit] = useState(60);
  const list = useRef(null);
  useEffect(() => { setLimit(60); if (list.current) list.current.scrollTop = 0; }, [query, category, profession, filteredFaction]);
  useEffect(() => {
    const row = list.current?.querySelector('[aria-current="true"]');
    if (!row || !list.current) return;
    const panel = list.current;
    if (row.offsetTop < panel.scrollTop || row.offsetTop + row.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = Math.max(0, row.offsetTop - panel.clientHeight / 2 + row.offsetHeight / 2);
  }, [selected?.id, inModal]);
  return <section className={'recipe-browser panel' + (inModal ? ' in-dialog' : '')} aria-label={t('recipes')}>
    <div className="browser-controls">
      {!inModal && <div className="panel-head"><h2><BookOpen size={18}/>{t('recipes')}</h2><span className="count-badge">{format(recipes.length)}</span></div>}
      <div className="search-row"><SearchField value={query} setValue={setQuery} label={t('searchRecipe')} t={t}/>
        <button className={'filter-button' + (filteredFaction ? ' applied' : '')} onClick={onFilters} aria-label={t('filter') + ' · ' + t('faction')}><SlidersHorizontal size={17}/></button>
      </div>
      <label className="category-select"><ListFilter size={15}/><select aria-label={t('category')} value={category} onChange={e => setCategory(e.target.value)}>
        <option value="all">{t('allCategories')}</option>
        {categories.map(key => <option value={key} key={key}>{categoryName(key, language)}</option>)}
      </select><ChevronDown size={14}/></label>
    </div>
    <div className="recipe-scroll" ref={list}>
      {recipes.slice(0, limit).map(recipe => {
        const item = catalog.items[recipe.itemId];
        return <button key={recipe.id} className={'recipe-row' + (selected?.id === recipe.id ? ' selected' : '')} aria-current={selected?.id === recipe.id ? 'true' : undefined} onClick={() => select(recipe)}>
          <ItemIcon item={item}/><span className="recipe-name"><strong>{itemName(item, language)}</strong><small>{recipe.mechanism === 'succession' ? t('succession') : t('level') + ' ' + format(recipe.level)}<i/>{categoryName(recipe.category, language)}{recipe.yield > 1 && ' ×' + format(recipe.yield)}{filteredFaction === 'all' && recipe.faction && ' · ' + t(recipe.faction)}</small></span>
          {(!selected || selected.id === recipe.id) && <ChevronRight size={15} className="selected-chevron"/>}
        </button>;
      })}
      {limit < recipes.length && <button className="more-button" onClick={() => setLimit(n => n + 60)}>{t('loadMore')}</button>}
      {!recipes.length && <div className="empty-state"><SearchX size={25}/><p>{t('noResults')}</p><button className="text-button" onClick={clearFilters}>{t('clearFilters')}</button></div>}
    </div>
  </section>;
}

export function RecipeTotal({ plan, loading, t, format, compact = false }) {
  const hasAmount = !plan.unpriced || plan.rows.some(row => row.missing > 0 && row.subtotal !== null);
  let label = plan.unpriced ? 'partial' : 'estimated';
  if (!hasAmount) label = loading ? 'marketLoading' : 'unknown';
  const hint = t(plan.unpriced ? 'unknownHint' : 'purchaseHint');
  const amount = hasAmount ? format(plan.total) : '—';
  if (compact) return <span className="saved-cost" title={hint}>
    <span className="saved-cost-label">{t(label)}</span>
    <span className="saved-cost-value">{hasAmount && <Coin/>}<span>{amount}{hasAmount && ' Kinah'}</span></span>
  </span>;
  return <div className="investment">
    <span className="investment-icon"><Coin large/></span>
    <div className="investment-copy"><strong>{t(label)}</strong><small>{hint}</small></div>
    <div className="investment-value" aria-live="polite" aria-atomic="true"><span>{amount}</span>{hasAmount && <small>Kinah</small>}</div>
  </div>;
}

export function RecipeDetail({ recipe, catalog, language, locale, t, format, count, setCount, plan, market, saved, embedded = false, onSave, onCraft, onLine, onPrice, onStock, onInfo, onAlternatives }) {
  const item = catalog.items[recipe.itemId];
  const Icon = professionIcons[recipe.profession] || Anvil;
  const date = market.asOf && new Date(market.asOf);
  const dateLabel = date && !Number.isNaN(+date) ? new Intl.DateTimeFormat(locale.locale, { dateStyle: 'short', timeStyle: 'short' }).format(date) : null;
  const status = market.status === 'ok' ? 'live' : market.status === 'stale' ? 'stale' : market.busy ? 'marketLoading' : 'offline';
  return <article className={'detail panel' + (embedded ? ' saved-detail' : '')} aria-label={t('details')}>
    {!embedded && <header className="detail-head">
      <ItemIcon item={item} large/>
      <div className="detail-identity"><div className="item-type">{categoryName(recipe.category, language)}</div>
        <h2>{itemName(item, language)}</h2>
        <div className="item-meta"><span><Icon size={14}/>{t(recipe.profession)}</span><i/><span>{recipe.mechanism === 'succession' ? t('succession') : t('level') + ' ' + format(recipe.level)}</span><i/><span className={'rarity grade-' + item.grade}>{gradeName(item.grade, language)}</span>{recipe.yield > 1 && <span>×{format(recipe.yield)}</span>}</div>
      </div>
      <button className="icon-button recipe-info" onClick={onInfo} aria-label={t('details')}><Info size={17}/></button>
    </header>}
    <div className="materials-block">
      <div className="materials-heading"><h3><Layers3 size={19}/>{t('materials')}{embedded && <button className="icon-button" onClick={onInfo} aria-label={t('details')}><Info size={15}/></button>}</h3>
        <div className="craft-quantity"><span>{t('crafts')}</span><Stepper count={count} setCount={setCount} t={t}/></div>
      </div>
      <div className="materials-table" role="table" aria-label={t('materials')}>
        <div className="mat-labels" role="row"><span role="columnheader">{t('material')}</span><span role="columnheader">{t('owned')}</span><span role="columnheader">{t('required')}</span><span role="columnheader">{t('subtotal')}</span></div>
        {plan.rows.map(row => {
          const material = catalog.items[row.itemId];
          const name = itemName(material, language);
          const availability = market.availability?.[row.itemId];
          return <div key={row.itemId} className="mat-row" role="row">
            <div className="mat-item" role="cell"><ItemIcon item={material}/>
              <div><strong>{name}</strong><button className="unit-price" onClick={() => onPrice(row)} aria-label={name + ' · ' + t('editPrice')}>
                {row.price != null ? <><Coin/>{format(row.price)} <span>{t('unit')}</span></> : <span>{t(availability === 'unlisted' ? 'noOffers' : 'unknown')}</span>}
                <Pencil size={11} aria-hidden="true"/>{row.manual && <span>· {t('manual')}</span>}
              </button>{row.options && <button className="alternative-link" onClick={() => onAlternatives(row.options)}>{t('alternatives')} ({row.options.length})</button>}</div>
            </div>
            <div className="mat-owned" role="cell"><span className="mobile-label">{t('owned')}</span><NumberField value={row.owned} onChange={value => onStock(row.itemId, value)} label={t('owned') + ' · ' + name}/></div>
            <div className="mat-required" role="cell"><span className="mobile-label">{t('required')}</span><span>{format(row.required)}</span>{row.owned > 0 && row.missing > 0 && <small className="short-amount">{t('missing')} {format(row.missing)}</small>}</div>
            <div className="mat-cost" role="cell" title={t('missing') + ' ' + format(row.missing)}>
              <span className="mobile-label">{t('subtotal')}</span>
              {row.subtotal == null ? <button onClick={() => onPrice(row)} className="unpriced">{t('unpriced')}</button>
                : <strong className={row.missing ? '' : 'covered'}>{row.missing ? <Coin/> : <Check size={13}/>} {format(row.subtotal)}</strong>}
            </div>
          </div>;
        })}
      </div>
      <RecipeTotal {...{ plan, t, format }} loading={market.busy}/>
      <div className="detail-actions">
        {!embedded && <button type="button" className={'button secondary' + (saved ? ' is-saved' : '')} onClick={onSave} aria-pressed={saved} title={saved ? t('removeSaved') : t('bookmark')}>
          {saved ? <Check size={17}/> : <Bookmark size={17}/>}<span>{t(saved ? 'bookmarked' : 'bookmark')}</span>
        </button>}
        <button type="button" className="button secondary" onClick={onLine}><ListPlus size={17}/><span>{t('addToLine')}</span></button>
        <button type="button" className="button primary" onClick={onCraft}><Hammer size={17}/><span>{t('craft')}</span></button>
      </div>
    </div>
    <footer className="quote-foot">
      <span className={'quote-status ' + status} title={t(status)}><Clock3 size={13}/><span>{t(status)}{dateLabel && ' · ' + dateLabel}</span></span>
      <a href={market.sourceUrl || 'https://aion2.exchange/api/docs'} target="_blank" rel="noreferrer">{market.source || 'Aion2 Exchange'}<ExternalLink size={11}/></a>
      <button onClick={market.refresh} disabled={market.busy} className="refresh-button" aria-label={t('refresh')} title={t('refresh')}><RefreshCw size={14} className={market.busy ? 'spinning' : ''}/></button>
    </footer>
  </article>;
}

export function PriceDialog({ row, item, server, language, workshop, market, t, format, onClose }) {
  const original = workshop.state.prices[server.id]?.[row.itemId];
  const [draft, setDraft] = useState(original ?? '');
  const hasQuote = Number.isFinite(market.prices[row.itemId]);
  const questUrl = 'https://questlog.gg/aion-2/' + language + '/auction-house/item/' + row.itemId + '?server=' + server.id;
  async function commit(value) {
    if (await workshop.change({ type: 'price', server: server.id, itemId: row.itemId, value })) onClose();
  }
  return <Modal title={itemName(item, language)} onClose={onClose} t={t}>
    <div className="price-summary"><ItemIcon item={item}/><div><small>{t('market')} · {server.name}</small><strong>{hasQuote ? format(market.prices[row.itemId]) + ' Kinah' : t(market.availability?.[row.itemId] === 'unlisted' ? 'noOffersText' : 'unknown')}</strong></div></div>
    <a className="source-link" href={questUrl} target="_blank" rel="noreferrer">{t('marketLink')}<ExternalLink size={14}/></a>
    <label className="form-label">{t('manual')} <span>· Kinah</span>
      <input className="form-input" type="number" inputMode="numeric" min="0" max={MAX_PRICE} step="1" value={draft} placeholder="0"
        onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (['-', '+', 'e', 'E', '.', ','].includes(event.key)) event.preventDefault(); }}/>
    </label>
    <p className="form-hint">{t('priceHint')}</p>
    <div className="modal-actions">{original != null && <button className="text-button" onClick={() => commit(null)}>{t('resetPrice')}</button>}
      <button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={draft === '' || !Number.isSafeInteger(Number(draft)) || +draft < 0 || +draft > MAX_PRICE} onClick={() => commit(Number(draft))}>{t('save')}</button></div>
  </Modal>;
}

export function CraftDialog({ recipe, catalog, plan, count, t, language, format, onConfirm, onClose, onStock, nextRecipe, stock, problem }) {
  const [credit, setCredit] = useState(true);
  const [combos, setCombos] = useState(0);
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const actual = Math.min(combos, count);
  const outputs = craftOutputs(recipe, count, actual);
  const nextCount = nextRecipe && credit ? attemptsFromBatch(recipe, nextRecipe, outputs) : null;
  async function submit() {
    if (submitted.current) return;
    submitted.current = true; setBusy(true);
    if (!await onConfirm({ credit, combos: actual })) { submitted.current = false; setBusy(false); }
  }
  return <Modal title={t('confirmCraft')} onClose={onClose} t={t}>
    <div className="craft-summary"><ItemIcon item={catalog.items[recipe.itemId]}/><strong>{itemName(catalog.items[recipe.itemId], language)}<small className="block form-hint">{t('attempts')} · {format(count)}</small></strong></div>
    <p className="form-hint">{t('craftHint')}</p>
    <ul className="confirm-materials">{plan.rows.map(row => {
      const name = itemName(catalog.items[row.itemId], language);
      return <li key={row.itemId}><span>{name}{onStock && <small className="batch-required">{t('required')} · {format(row.required)}</small>}</span><strong>
        {onStock ? <NumberField label={t('owned') + ' · ' + name} value={row.owned} onChange={v => onStock(row.itemId, v)}/> : format(row.owned)} <ChevronRight size={13}/> {format(Math.max(0, row.owned - row.required))}</strong>
        {row.missing > 0 && <small>{t('missing')} {format(row.missing)}</small>}
        {onStock && row.options?.length > 1 && <details className="batch-alternatives"><summary>{t('alternatives')}</summary>{row.options.filter(m => m.itemId !== row.itemId).map(m => <label key={m.itemId}>{itemName(catalog.items[m.itemId], language)}<NumberField label={itemName(catalog.items[m.itemId], language)} value={stock[m.itemId] || 0} onChange={v => onStock(m.itemId, v)}/></label>)}</details>}
      </li>;
    })}</ul>
    <div className={'notice' + (plan.ready ? ' ready' : '')}>{plan.ready ? <PackageCheck size={17}/> : <CircleAlert size={17}/>}<span>{t(plan.ready ? 'ready' : 'shortage')}</span></div>
    <div className="credit-box"><label className="credit-toggle"><input type="checkbox" checked={credit} onChange={e => setCredit(e.target.checked)}/><span>{t('resultStock')}</span></label>
      {(credit || onStock) && recipe.combo && <><label className="credit-count">{t('actualCombos')}<NumberField value={actual} maximum={count} onChange={setCombos} label={t('actualCombos')}/></label><p className="form-hint">{t('creditHint')}</p></>}
      {credit && <ul className="crafted-outputs">{outputs.map(({ itemId, quantity }) => <li key={itemId}><ItemIcon item={catalog.items[itemId]}/><span>{itemName(catalog.items[itemId], language)}</span><strong>+{format(quantity)}</strong></li>)}</ul>}
    </div>
    {nextCount != null && <div className="next-batch" aria-live="polite"><ChevronRight size={16}/><span><small>{t('nextStep')}</small>{itemName(catalog.items[nextRecipe.itemId], language)}</span><strong>{format(nextCount)} ×</strong></div>}
    {problem && <p role="alert" className="form-error">{t(problem)}</p>}
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!plan.ready || busy} onClick={submit}><Hammer size={16}/>{t('confirm')}</button></div>
  </Modal>;
}
