import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, ChevronDown, CirclePlus, Clock3, ExternalLink, Gem, Layers3, ListPlus, ListTree, Pencil, Plus, RefreshCw, ScrollText, ShoppingBasket, Trash2 } from 'lucide-react';
import { goldProgression, lineEstimate, lineMarketItems } from '../shared/lines.js';
import { MAX_CRAFTS } from '../shared/planner.js';
import { fold, itemName, useMarket } from './data.js';
import { categoryName, gradeName } from './i18n.js';
import { PriceDialog } from './recipes.jsx';
import { Coin, ItemIcon, Modal, NumberField, SearchField } from './ui.jsx';

const withIds = steps => steps.map(step => ({ ...step, id: crypto.randomUUID() }));
const empty = { steps: [] };
function Sequence({ steps, catalog, language, format }) {
  return <ol className="sequence">{steps.map(({ recipeId, count }) => {
    const item = catalog.items[catalog.byId[recipeId].itemId];
    return <li key={recipeId} title={itemName(item, language)}><ItemIcon item={item}/><span>×{format(count)}</span></li>;
  })}</ol>;
}

export function AddToLineDialog({ recipe, count, catalog, workshop, selectedId, onSelect, onClose, t, language, format }) {
  const path = useMemo(() => goldProgression(recipe, catalog), [recipe, catalog]);
  const [usePath, setPath] = useState(false);
  const entries = Object.values(workshop.state.lines);
  const [destination, setDestination] = useState(workshop.state.lines[selectedId] ? selectedId : '');
  const [editedName, editName] = useState(null);
  const steps = usePath && path ? path : [{ recipeId: recipe.id, count, combos: null }];
  const target = catalog.byId[steps.at(-1).recipeId];
  const name = editedName ?? itemName(catalog.items[target.itemId], language);
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const lineId = destination || crypto.randomUUID();
    const ok = await workshop.change({ type: destination ? 'lineAppend' : 'lineCreate', lineId, name, steps: withIds(steps) });
    if (ok) onSelect(lineId); else setBusy(false);
  }
  return <Modal title={t('addToLine')} t={t} onClose={onClose}>
    {entries.length > 0 && <label className="form-label">{t('line')}<select className="form-input" value={destination} onChange={e => setDestination(e.target.value)}><option value="">{t('newLine')}</option>{entries.map(line => <option key={line.id} value={line.id}>{line.name}</option>)}</select></label>}
    {path && <div className="mode-options"><button aria-pressed={!usePath} onClick={() => setPath(false)}><ScrollText size={16}/>{t('singleRecipe')}</button><button aria-pressed={usePath} onClick={() => setPath(true)}><ListTree size={16}/>{t('goldPath')}</button></div>}
    <Sequence steps={steps} catalog={catalog} language={language} format={format}/>
    {!destination && <label className="form-label">{t('lineName')}<input className="form-input" value={name} maxLength={120} onChange={e => editName(e.target.value)}/></label>}
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={busy || (!destination && !name.trim())} onClick={add}><ListPlus size={16}/>{t('addToLine')}</button></div>
  </Modal>;
}

function RecipePicker({ recipes, catalog, language, t, onPick, onClose, format }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);
  const list = recipes.filter(r => fold(itemName(catalog.items[r.itemId], language) + ' ' + t(r.profession) + ' ' + categoryName(r.category, language)).includes(fold(query)));
  return <Modal title={t('chooseRecipe')} onClose={onClose} t={t}>
    <SearchField value={query} setValue={v => { setQuery(v); setLimit(40); }} label={t('searchRecipe')} t={t}/>
    <div className="plan-picker">{list.slice(0, limit).map(r => <button className="recipe-row" key={r.id} onClick={() => onPick(r)}>
      <ItemIcon item={catalog.items[r.itemId]}/><span className="recipe-name"><strong>{itemName(catalog.items[r.itemId], language)}</strong><small>{t(r.profession)} · {t('level')} {format(r.level)}{r.faction && ' · ' + t(r.faction)}</small></span><Plus size={15}/>
    </button>)}{!list.length && <p className="empty-text">{t('noResults')}</p>}
    {list.length > limit && <button className="more-button" onClick={() => setLimit(limit + 40)}>{t('loadMore')}</button>}</div>
  </Modal>;
}

function Amount({ sum, format, t }) {
  if (sum.unpriced && !sum.quoted) return <span className="amount-unknown">{t('unpriced')}</span>;
  return <><b><Coin/>{format(sum.value)}</b>{sum.unpriced > 0 && <em>{t('partialCost')}</em>}</>;
}

function ResultList({ entries, catalog, language, t, format, onPrice }) {
  return <ul className="line-products">{entries.map(row => {
    const item = catalog.items[row.itemId];
    return <li key={row.itemId}><ItemIcon item={item}/><div><strong>{itemName(item, language)}</strong><small>{gradeName(item.grade, language)} · ×{format(row.quantity)}</small></div>
      <button className="quote-edit" title={t('referencePrice')} onClick={() => onPrice(row.itemId)}>{row.price == null ? t('unpriced') : <><Coin/>{format(row.price)}</>}<Pencil size={11}/></button></li>;
  })}</ul>;
}

export function Lines({ catalog, workshop, lineId, onSelect, language, locale, server, snapshot, t, format }) {
  const entries = Object.values(workshop.state.lines);
  const line = workshop.state.lines[lineId] || entries[0];
  const [dialog, setDialog] = useState('');
  const [name, setName] = useState('');
  const [priceId, setPriceId] = useState('');
  const [busy, setBusy] = useState(false);
  const recipes = useMemo(() => catalog.recipes.filter(r => !r.faction || r.faction === server.faction.toLowerCase()), [server, catalog]);
  const example = useMemo(() => {
    const ruby = recipes.find(r => r.profession === 'handicrafting' && r.category === 'necklace' && catalog.items[r.itemId].grade === 'common' && r.mechanism === 'craft');
    return goldProgression(ruby, catalog);
  }, [recipes, catalog]);
  const ids = useMemo(() => lineMarketItems(line || empty, catalog), [line, catalog]);
  const market = useMarket(server.id, ids, snapshot);
  const plan = useMemo(() => lineEstimate(line || empty, catalog, workshop.state, server.id, market.prices), [line, catalog, workshop.state, server.id, market.prices]);
  const close = () => setDialog('');
  const price = id => { setPriceId(id); setDialog('price'); };
  function edit(type, step, extra) { return workshop.change({ type, lineId: line.id, stepId: step.id, ...extra }); }
  function startName(kind) { setName(kind === 'rename' ? line.name : ''); setDialog(kind); }
  async function create(title, steps) {
    setBusy(true);
    const id = crypto.randomUUID();
    const ok = await workshop.change({ type: 'lineCreate', lineId: id, name: title, steps: withIds(steps) });
    setBusy(false);
    if (ok) { onSelect(id); close(); }
    return ok;
  }
  async function addExample() {
    const last = catalog.byId[example.at(-1).recipeId];
    await create(itemName(catalog.items[last.itemId], language), example);
  }
  async function saveName(e) {
    e.preventDefault();
    if (dialog === 'new') { if (await create(name, [])) setDialog('pick'); }
    else if (await workshop.change({ type: 'lineRename', lineId: line.id, name })) close();
  }
  let status = market.busy ? 'marketLoading' : market.status === 'ok' ? 'live' : market.status === 'stale' ? 'stale' : 'offline';
  const time = market.asOf && new Intl.DateTimeFormat(locale.locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(market.asOf));
  return <div className="line-page">
    {!line ? <section className="panel line-empty">
      <span className="big-symbol"><ListTree size={28}/></span><h2>{t('noLines')}</h2>
      {example && <Sequence steps={example} catalog={catalog} language={language} format={format}/>}
      <div className="empty-actions">{example && <button className="button primary" disabled={busy} onClick={addExample}><Gem size={16}/>{t('rubyExample')}</button>}<button className="button secondary" onClick={() => startName('new')}><Plus size={16}/>{t('newLine')}</button></div>
    </section> : <>
      <div className="line-toolbar"><label><ListTree size={18}/><select aria-label={t('activeLine')} value={line.id} onChange={e => onSelect(e.target.value)}>{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><ChevronDown size={15}/></label>
        <button className="icon-button" title={t('rename')} aria-label={t('rename')} onClick={() => startName('rename')}><Pencil size={16}/></button>
        <button className="icon-button" title={t('deleteLine')} aria-label={t('deleteLine')} onClick={() => setDialog('delete')}><Trash2 size={16}/></button>
        <button className="button secondary" onClick={() => startName('new')}><Plus size={15}/>{t('newLine')}</button></div>
      <div className="line-layout"><section className="panel stage-panel"><div className="line-heading"><h2><Layers3 size={19}/>{t('stages')} <span className="count-badge">{format(line.steps.length)}</span></h2><button className="text-button" onClick={() => setDialog('pick')}><Plus size={15}/>{t('addRecipe')}</button></div>
        {plan.stages.length ? <><p className="line-hint">{t('projectionHint')}</p><ol className="stages">{plan.stages.map(({ step, recipe, combos, outputs }, i) => {
          const item = catalog.items[recipe.itemId];
          const title = itemName(item, language);
          return <li key={step.id}><div className="stage-rail"><i className={'tier-dot grade-' + item.grade}/></div><div className="stage-card">
            <div className="stage-item"><ItemIcon item={item}/><div><small>{t('step')} {format(i + 1)} · {gradeName(item.grade, language)}</small><strong>{title}</strong></div></div>
            <label className="stage-count">{t('attempts')}<NumberField minimum={1} maximum={MAX_CRAFTS} value={step.count} label={t('attempts') + ' · ' + title} onChange={value => edit('lineCount', step, { value })}/></label>
            <details className="stage-more"><summary>{recipe.combo ? t('plannedCombos') + ' · ' + format(combos) + ' (' + format(recipe.combo.chance) + '%)' : t('outputs')}<ChevronDown size={13}/></summary>
              {recipe.combo && <div className="combo-control"><NumberField maximum={step.count} value={combos} label={t('plannedCombos') + ' · ' + title} onChange={value => edit('lineCombos', step, { value })}/><button className="text-button" disabled={step.combos == null} onClick={() => edit('lineCombos', step, { value: null })}>{t('autoCombos')}</button></div>}
              {outputs.map(out => <small key={out.itemId}>{format(out.quantity)} × {itemName(catalog.items[out.itemId], language)}</small>)}
            </details><div className="stage-tools">{[[ArrowUp, 'moveUp', -1, i === 0], [ArrowDown, 'moveDown', 1, i === line.steps.length - 1]].map(([Icon, key, direction, disabled]) =>
              <button key={key} className="icon-button" title={t(key)} aria-label={t(key) + ' · ' + title} disabled={disabled} onClick={() => edit('lineMove', step, { direction })}><Icon size={14}/></button>)}
              <button className="icon-button" title={t('removeStep')} aria-label={t('removeStep') + ' · ' + title} onClick={() => edit('lineRemove', step)}><Trash2 size={14}/></button></div>
          </div></li>;
        })}</ol></> : <div className="empty-state"><CirclePlus size={25}/><p>{t('noSteps')}</p></div>}
      </section>
      {plan.stages.length > 0 && <section className="panel comparison"><div className="line-heading"><h2><Gem size={19}/>{t('buyVsCraft')}</h2></div>
        <div className="compare-metrics">{[[plan.cash,'cashCost','toBuy'],[plan.inputs,'inputValue','externalInputs'],[plan.market,'finalMarket','targetBatch']].map(([sum,label,hint]) => <div className="metric" key={label}><span>{t(label)}<small>{t(hint)}</small></span><div><Amount sum={sum} format={format} t={t}/></div></div>)}</div>
        <ResultList entries={plan.final} {...{ catalog, language, t, format }} onPrice={price}/>
        {!!plan.retained.length && <details className="retained"><summary>{t('retainedProducts')} <ChevronDown size={13}/></summary><ResultList entries={plan.retained} {...{ catalog, language, t, format }} onPrice={price}/></details>}
        <footer className="quote-foot"><span className={'quote-status ' + status}><Clock3 size={13}/>{t(status)}{time && ' · ' + time}</span><a href="https://aion2.exchange/api/docs" target="_blank" rel="noreferrer">Aion2 Exchange <ExternalLink size={11}/></a><button className="refresh-button" onClick={market.refresh} disabled={market.busy} aria-label={t('refresh')}><RefreshCw size={14}/></button></footer>
      </section>}</div>
      {plan.rows.length > 0 && <section className="panel line-shopping"><div className="line-heading"><h2><ShoppingBasket size={19}/>{t('shopping')}</h2></div>
        <div className="shopping-labels"><span>{t('material')}</span>{['fromLine','owned','toBuy','subtotal'].map(k => <span key={k}>{t(k)}</span>)}</div>
        {plan.rows.map(row => {
          const item = catalog.items[row.itemId];
          return <div className="shopping-row" key={row.itemId}><div className="shopping-name"><ItemIcon item={item}/><span><strong>{itemName(item, language)}</strong><button className="unit-price" onClick={() => price(row.itemId)}>{row.price == null ? t('unpriced') : <><Coin/>{format(row.price)} {t('unit')}</>} <Pencil size={11}/></button></span></div>
            {[[row.fromLine,'fromLine'],[row.fromStock,'owned'],[row.missing,'toBuy']].map(([qty,key]) => <div key={key} className={'shopping-qty ' + key}><small>{t(key)}</small>{format(qty)}</div>)}
            <div className="shopping-qty cost"><small>{t('subtotal')}</small>{!row.missing ? '0' : row.price == null ? '—' : format(BigInt(row.price) * BigInt(row.missing))}</div></div>;
        })}</section>}
    </>}
    {['new','rename'].includes(dialog) && <Modal title={t(dialog === 'new' ? 'newLine' : 'rename')} t={t} onClose={close}><form onSubmit={saveName}><label className="form-label">{t('lineName')}<input className="form-input" value={name} maxLength={120} onChange={e => setName(e.target.value)} required/></label><div className="modal-actions"><button className="button secondary" type="button" onClick={close}>{t('cancel')}</button><button className="button primary" type="submit" disabled={!name.trim() || busy}>{t(dialog === 'new' ? 'create' : 'save')}<ArrowRight size={15}/></button></div></form></Modal>}
    {dialog === 'delete' && line && <Modal title={t('deleteQuestion')} t={t} onClose={close}><p>{line.name}</p><div className="modal-actions"><button className="button secondary" onClick={close}>{t('cancel')}</button><button className="button danger" onClick={async () => { if (await workshop.change({ type: 'lineDelete', lineId: line.id })) { onSelect(entries.find(e => e.id !== line.id)?.id || ''); close(); } }}>{t('deleteLine')}</button></div></Modal>}
    {dialog === 'pick' && line && <RecipePicker {...{ recipes, catalog, language, format, t }} onClose={close} onPick={async r => {
      if (await workshop.change({ type: 'lineAppend', lineId: line.id, steps: withIds([{ recipeId: r.id, count: 1, combos: null }]) })) close();
    }}/>}
    {dialog === 'price' && <PriceDialog row={{ itemId: priceId }} item={catalog.items[priceId]} {...{ market, server, language, workshop, t, format }} onClose={close}/>}
  </div>;
}
