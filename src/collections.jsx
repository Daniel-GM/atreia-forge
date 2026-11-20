import React, { useMemo, useState } from 'react';
import { Archive, Bookmark, BookmarkMinus, ChevronDown, PackageOpen } from 'lucide-react';
import { fold, itemName } from './data.js';
import { ItemIcon, NumberField, SearchField } from './ui.jsx';

export function Inventory({ catalog, workshop, language, t, format }) {
  const [query, setQuery] = useState('');
  const [onlyOwned, setOwned] = useState(false);
  const [limit, setLimit] = useState(40);
  const ids = useMemo(() => {
    return Object.keys(catalog.items).sort((a, b) => itemName(catalog.items[a], language).localeCompare(itemName(catalog.items[b], language), language.split('-')[0]));
  }, [catalog, language]);
  const ownedCount = ids.filter(id => workshop.state.stock[id] > 0).length;
  const filtered = ids.filter(id => (!onlyOwned || workshop.state.stock[id]) && fold(itemName(catalog.items[id], language)).includes(fold(query)));
  return <section className="panel collection-panel">
    <div className="collection-head"><h2><Archive size={20}/>{t('inventoryItems')} <span className="count-badge">{format(ids.length)}</span></h2>
      <SearchField value={query} setValue={value => { setQuery(value); setLimit(40); }} label={t('searchItem')} t={t}/></div>
    <div className="tab-strip"><button aria-pressed={!onlyOwned} onClick={() => { setOwned(false); setLimit(40); }}>{t('allItems')}</button><button aria-pressed={onlyOwned} onClick={() => { setOwned(true); setLimit(40); }}>{t('available')} <span>{format(ownedCount)}</span></button></div>
    <div className="inventory-labels"><span>{t('inventoryItems')}</span><span>{t('owned')}</span></div>
    <div className="inventory-list">
      {filtered.slice(0, limit).map(id => { const item = catalog.items[id]; const name = itemName(item, language);
        return <div className="inventory-row" key={id}><ItemIcon item={item}/><strong>{name}</strong><NumberField label={t('owned') + ' · ' + name} value={workshop.state.stock[id] || 0} onChange={value => workshop.change({ type: 'stock', itemId: id, value })}/></div>;
      })}
    </div>
    {filtered.length > limit && <button className="more-button" onClick={() => setLimit(n => n + 40)}>{t('loadMore')}</button>}
    {!filtered.length && <div className="empty-state"><PackageOpen size={34}/><h3>{t('noResults')}</h3><button className="text-button" onClick={() => { setQuery(''); setOwned(false); }}>{t('clearFilters')}</button></div>}
  </section>;
}

export function SavedRecipes({ catalog, workshop, language, t, format, onExpand, expandedId, detail, go }) {
  const list = Object.entries(workshop.state.saved).map(([id, count]) => ({ recipe: catalog.byId[id], count })).filter(entry => entry.recipe);
  return <section className="panel collection-panel">
    <div className="collection-head"><h2><Bookmark size={20}/>{t('recipes')} <span className="count-badge">{format(list.length)}</span></h2></div>
    {list.length ? <div className="saved-list">{list.map(({ recipe, count }) => {
      const item = catalog.items[recipe.itemId];
      const open = expandedId === recipe.id;
      return <div className={'saved-entry' + (open ? ' expanded' : '')} key={recipe.id}><div className="saved-row">
        <button className="open-saved" id={'saved-toggle-' + recipe.id} aria-expanded={open} aria-controls={'saved-detail-' + recipe.id} onClick={() => onExpand(recipe.id)}><ItemIcon item={item}/><span><strong>{itemName(item, language)}</strong><small>{t(recipe.profession)} · {t('level')} {format(recipe.level)} · {format(count)}×</small></span><ChevronDown size={17}/></button>
        <button className="icon-button" aria-label={t('removeSaved') + ' · ' + itemName(item, language)} onClick={() => workshop.change({ type: 'save', recipeId: recipe.id, count: null })}><BookmarkMinus size={17}/></button>
      </div><div id={'saved-detail-' + recipe.id} role="region" aria-labelledby={'saved-toggle-' + recipe.id} hidden={!open}>{open && detail}</div></div>;
    })}</div> : <div className="empty-state saved-empty"><span className="big-symbol"><Bookmark size={31}/></span><h3>{t('noSaved')}</h3><p>{t('noSavedHint')}</p><button className="button primary" onClick={() => go('calculator')}>{t('openCalculator')}</button></div>}
  </section>;
}
