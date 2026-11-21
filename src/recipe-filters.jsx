import React from 'react';
import { ChevronDown, ListFilter, SlidersHorizontal } from 'lucide-react';
import { categoryName } from './i18n.js';
import { FactionSelect, Modal, SearchField } from './ui.jsx';

function CategoryOptions({ categories, language, t }) {
  return <><option value="all">{t('allCategories')}</option>
    {categories.map(key => <option value={key} key={key}>{categoryName(key, language)}</option>)}</>;
}

export function RecipeFilterFields({ categories, category, setCategory, query, setQuery, onFilters, filteredFaction, language, t }) {
  return <>
    <div className="search-row"><SearchField value={query} setValue={setQuery} label={t('searchRecipe')} t={t}/>
      <button type="button" className={'filter-button' + (filteredFaction ? ' applied' : '')} onClick={onFilters} aria-label={t('filter') + ' · ' + t('faction')}><SlidersHorizontal size={17}/></button>
    </div>
    <label className="category-select"><ListFilter size={15}/><select aria-label={t('category')} value={category} onChange={e => setCategory(e.target.value)}>
      <CategoryOptions {...{ categories, language, t }}/>
    </select><ChevronDown size={14}/></label>
  </>;
}

export function RecipeFilterDialog({ server, factionMode, setFactionMode, categories, category, setCategory, language, t, clearFilters, onClose }) {
  return <Modal title={t('filter')} onClose={onClose} t={t}>
    <FactionSelect server={server} value={factionMode} onChange={setFactionMode} t={t}/>
    <label className="form-label">{t('category')}<span className="form-select"><select value={category} onChange={e => setCategory(e.target.value)}>
      <CategoryOptions {...{ categories, language, t }}/>
    </select><ChevronDown size={15}/></span></label>
    <div className="modal-actions"><button className="text-button" onClick={clearFilters}>{t('clearFilters')}</button><button className="button primary" onClick={onClose}>{t('confirm')}</button></div>
  </Modal>;
}
