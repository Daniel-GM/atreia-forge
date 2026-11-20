import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronRight, CircleAlert, ExternalLink, Search, X } from 'lucide-react';
import { estimate, integer, MAX_CRAFTS } from '../shared/planner.js';
import { fold, itemName, readSettings, useMarket, writeSettings } from './data.js';
import { categoryName, locales, tFor } from './i18n.js';
import { useWorkshop } from './useWorkshop.js';
import { Hero, ItemIcon, Modal, Navigation, NumberField, Professions, SelectionDialog, Topbar } from './ui.jsx';
import { CraftDialog, PriceDialog, RecipeBrowser, RecipeDetail } from './recipes.jsx';
import { Inventory, SavedRecipes } from './collections.jsx';
import { AddToLineDialog, Lines } from './lines.jsx';
import { DeviceDialog } from './device.jsx';

function route(catalog) {
  const value = window.location.hash.slice(1).replace(/^\//, '');
  const match = /^(?:recipe\/|r)(\d+)$/.exec(value);
  return { page: ['inventory', 'saved', 'lines'].includes(value) ? value : 'calculator', id: match && catalog.byId[match[1]] ? match[1] : null };
}
const mobileLayout = () => matchMedia('(max-width: 850px)').matches;
const matchesFaction = (recipe, faction) => !recipe.faction || faction === 'all' || recipe.faction === faction;
const gameOrder = (a, b) => Number(a.mechanism === 'succession') - Number(b.mechanism === 'succession') || a.level - b.level || a.order - b.order || a.id.localeCompare(b.id);

export default function App({ catalog, servers, snapshot }) {
  const [prefs] = useState(readSettings);
  const [language, setLanguage] = useState(locales.some(l => l.code === prefs.language) ? prefs.language : 'pt');
  const [serverId, setServerId] = useState(servers.some(s => s.id === prefs.server) ? prefs.server : '1406');
  const server = servers.find(s => s.id === serverId) || servers[0];
  const [firstRoute] = useState(() => route(catalog));
  const [page, setPage] = useState(firstRoute.page);
  const [selectedId, setSelectedId] = useState(() => {
    if (firstRoute.id) return firstRoute.id;
    const initial = catalog.byId[catalog.defaultRecipeId] || catalog.recipes[0];
    const sameFaction = catalog.recipes.find(r => r.profession === initial.profession && r.category === initial.category && r.level === initial.level && matchesFaction(r, server.faction.toLowerCase()));
    return matchesFaction(initial, server.faction.toLowerCase()) ? initial.id : (sameFaction || initial).id;
  });
  const recipe = catalog.byId[selectedId];
  const [profession, setProfession] = useState(recipe.profession);
  const [category, setCategory] = useState('all');
  const [factionMode, setFactionMode] = useState(matchesFaction(recipe, server.faction.toLowerCase()) ? 'server' : 'all');
  const [query, setQuery] = useState('');
  const workshop = useWorkshop(catalog);
  const [count, changeCount] = useState(() => workshop.state.saved[selectedId] || 1);
  const [lineId, setLineId] = useState(prefs.activeLine || '');
  const [dialog, setDialog] = useState('');
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [toast, setToast] = useState(null);
  const [returnToList, setReturnToList] = useState(false);
  const market = useMarket(server.id, page === 'calculator' ? recipe.materials : [], snapshot);
  const plan = estimate(recipe, count, workshop.state, server.id, market.prices);
  const t = useMemo(() => tFor(language), [language]);
  const locale = locales.find(l => l.code === language) || locales.find(l => l.code === 'pt');
  const formatter = useMemo(() => new Intl.NumberFormat(locale.locale), [locale]);
  const format = value => formatter.format(value);
  const faction = factionMode === 'server' ? server.faction.toLowerCase() : factionMode;
  const allRecipes = useMemo(() => catalog.recipes.filter(r => matchesFaction(r, faction)), [catalog, faction]);
  const counts = useMemo(() => allRecipes.reduce((acc, r) => { acc[r.profession] = (acc[r.profession] || 0) + 1; return acc; }, {}), [allRecipes]);
  const profRecipes = useMemo(() => allRecipes.filter(r => r.profession === profession).sort(gameOrder), [allRecipes, profession]);
  const categories = [...new Set(profRecipes.map(r => r.category))];
  const filtered = profRecipes.filter(r => (category === 'all' || r.category === category) && fold(itemName(catalog.items[r.itemId], language)).includes(fold(query)));
  const saved = Object.hasOwn(workshop.state.saved, selectedId);
  useEffect(() => {
    document.documentElement.lang = locale.locale;
    document.title = t(page === 'calculator' ? 'planner' : page) + ' · Atreia Forge';
  }, [locale, page, t]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? 12000 : 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  function openRecipe(next, withHistory = true) {
    setSelectedId(next.id);
    setProfession(next.profession);
    if (!matchesFaction(next, faction)) setFactionMode('all');
    changeCount(workshop.state.saved[next.id] || 1);
    setPage('calculator');
    setDialog('');
    if (withHistory && location.hash !== '#recipe/' + next.id) history.pushState(null, '', '#recipe/' + next.id);
  }
  function go(next) {
    setPage(next);
    setDialog('');
    const hash = next === 'calculator' ? '#recipe/' + selectedId : '#' + next;
    if (location.hash !== hash) history.pushState(null, '', hash);
    window.scrollTo({ top: 0 });
  }
  useEffect(() => {
    const handle = () => {
      const target = route(catalog);
      if (target.id) { setCategory('all'); setQuery(''); openRecipe(catalog.byId[target.id], false); }
      else { setPage(target.page); setDialog(''); }
    };
    window.addEventListener('hashchange', handle);
    return () => window.removeEventListener('hashchange', handle);
  });
  function chooseProfession(key) {
    setProfession(key); setCategory('all'); setQuery('');
    if (recipe.profession !== key) {
      const first = allRecipes.filter(r => r.profession === key).sort(gameOrder)[0];
      if (first) openRecipe(first);
    }
    if (mobileLayout()) setDialog('recipes');
  }
  function chooseServer(id) {
    setServerId(id); writeSettings({ server: id });
    const side = servers.find(s => s.id === id).faction.toLowerCase();
    if (factionMode === 'server' && !matchesFaction(recipe, side)) {
      const candidates = catalog.recipes.filter(r => r.profession === profession && matchesFaction(r, side));
      const same = candidates.find(r => r.category === recipe.category && r.level === recipe.level && itemName(catalog.items[r.itemId], 'en') === itemName(catalog.items[recipe.itemId], 'en'));
      const next = same || candidates.find(r => r.category === recipe.category && r.level === recipe.level) || candidates[0];
      if (next) { const fromPage = page; openRecipe(next, page === 'calculator'); setPage(fromPage); setFactionMode('server'); }
    }
  }
  function changeCrafts(value) {
    const next = integer(value, MAX_CRAFTS, 1);
    changeCount(next);
    if (saved) workshop.change({ type: 'save', recipeId: selectedId, count: next });
  }
  function selectLine(id) { setLineId(id); writeSettings({ activeLine: id }); }
  async function bookmark() {
    const ok = await workshop.change({ type: 'save', recipeId: selectedId, count: saved ? null : count });
    if (ok && !saved) setToast({ label: 'bookmarked' });
  }
  async function register(outcome) {
    const receipt = await workshop.change({ type: 'craft', recipeId: selectedId, count, ...outcome });
    if (receipt) { setDialog(''); setToast({ label: 'craftDone', undo: receipt }); }
    return receipt;
  }
  function showFilters() { setReturnToList(dialog === 'recipes'); setDialog('filters'); }
  function clearFilters() { setQuery(''); setCategory('all'); setFactionMode('server'); }
  const libraryProps = { recipes: filtered, categories, category, setCategory, query, setQuery, selected: recipe, select: openRecipe, onFilters: showFilters, filteredFaction: factionMode === 'server' ? '' : factionMode, catalog, language, t, format, clearFilters };
  const activeRow = plan.rows.find(row => row.itemId === editingMaterial);
  const questUrl = 'https://questlog.gg/aion-2/' + language + '/auction-house?server=' + server.id;
  return <div className="app-shell">
    <Navigation page={page} go={go} t={t} numSaved={Object.keys(workshop.state.saved).length} onDevice={() => setDialog('device')} questUrl={questUrl}/>
    <div className="main-column">
      <Topbar page={page} t={t} server={server} locale={locale} onServer={() => setDialog('server')} onLanguage={() => setDialog('language')} onDevice={() => setDialog('device')} onHome={() => go('calculator')}/>
      <main className="workbench">
        <Hero page={page} t={t}/>
        {page === 'calculator' ? <>
          <Professions selected={profession} counts={counts} onSelect={chooseProfession} t={t} format={format}/>
          <button className="mobile-picker" onClick={() => setDialog('recipes')}><BookOpen size={18}/><b>{t('recipes')}</b><span className="count-badge">{format(profRecipes.length)}</span><span className="mobile-picker-search"><Search size={15}/>{t('searchRecipe')}</span><ChevronRight size={16}/></button>
          <div className="workspace-grid">
            <RecipeBrowser {...libraryProps}/>
            <RecipeDetail recipe={recipe} catalog={catalog} language={language} locale={locale} t={t} format={format} count={count} setCount={changeCrafts} plan={plan} market={market} saved={saved} onSave={bookmark} onCraft={() => setDialog('craft')} onLine={() => setDialog('addToLine')} onStock={(itemId, value) => workshop.change({ type: 'stock', itemId, value })} onPrice={row => { setEditingMaterial(row.itemId); setDialog('price'); }}
              onInfo={() => setDialog('info')} onAlternatives={options => { setAlternatives(options); setDialog('alternatives'); }}/>
          </div>
        </> : page === 'lines' ? <Lines {...{ catalog, workshop, lineId, language, locale, server, snapshot, t, format }} onSelect={selectLine}/>
          : page === 'inventory' ? <Inventory catalog={catalog} workshop={workshop} language={language} t={t} format={format}/> : <SavedRecipes catalog={catalog} workshop={workshop} language={language} t={t} format={format} go={go} onSelect={next => { setQuery(''); setCategory('all'); openRecipe(next); window.scrollTo({ top: 0 }); }}/>}
      </main>
    </div>
    {['server', 'language'].includes(dialog) && <SelectionDialog key={dialog} kind={dialog} onClose={() => setDialog('')} t={t} server={server} servers={servers} language={language} onServer={chooseServer} onLanguage={code => { setLanguage(code); writeSettings({ language: code }); }}/>}
    {dialog === 'device' && <DeviceDialog {...{ catalog, workshop, t, format }} onClose={() => setDialog('')} onImport={() => { setDialog(''); setToast({ label: 'imported' }); }}/>}
    {dialog === 'addToLine' && <AddToLineDialog {...{ recipe, count, catalog, workshop, t, language, format }} selectedId={lineId} onSelect={id => { selectLine(id); go('lines'); setToast({ label: 'lineAdded' }); }} onClose={() => setDialog('')}/>}
    {dialog === 'recipes' && <Modal className="library-dialog" title={t('recipes') + ' · ' + t(profession)} t={t} onClose={() => setDialog('')}><RecipeBrowser {...libraryProps} inModal/></Modal>}
    {dialog === 'filters' && <Modal title={t('filter')} onClose={() => setDialog(returnToList ? 'recipes' : '')} t={t}>
      <label className="form-label">{t('faction')}<span className="form-select"><select value={factionMode} onChange={e => setFactionMode(e.target.value)}>
        <option value="server">{server.name} · {t(server.faction.toLowerCase())}</option><option value="all">{t('bothFactions')}</option><option value="elyos">{t('elyos')}</option><option value="asmodian">{t('asmodian')}</option>
      </select><ChevronDown size={15}/></span></label>
      <label className="form-label">{t('category')}<span className="form-select"><select value={category} onChange={e => setCategory(e.target.value)}><option value="all">{t('allCategories')}</option>{categories.map(key => <option key={key} value={key}>{categoryName(key, language)}</option>)}</select><ChevronDown size={15}/></span></label>
      <div className="modal-actions"><button className="text-button" onClick={clearFilters}>{t('clearFilters')}</button><button className="button primary" onClick={() => setDialog(returnToList ? 'recipes' : '')}>{t('confirm')}</button></div>
    </Modal>}
    {dialog === 'price' && activeRow && <PriceDialog row={activeRow} item={catalog.items[activeRow.itemId]} server={server} language={language} workshop={workshop} market={market} t={t} format={format} onClose={() => setDialog('')}/>}
    {dialog === 'craft' && <CraftDialog recipe={recipe} catalog={catalog} plan={plan} count={count} t={t} language={language} format={format} onConfirm={register} onClose={() => setDialog('')}/>}
    {dialog === 'info' && <Modal title={t('details')} onClose={() => setDialog('')} t={t}>
      <div className="craft-summary"><ItemIcon item={catalog.items[recipe.itemId]}/><strong>{itemName(catalog.items[recipe.itemId], language)}</strong></div>
      <dl className="recipe-facts">
        <div><dt>{t('faction')}</dt><dd>{t(recipe.faction || 'bothFactions')}</dd></div>
        <div><dt>{t('profLevel')}</dt><dd>{recipe.mechanism === 'succession' ? t('succession') : t(recipe.profession) + ' · ' + format(recipe.level)}</dd></div>
        <div><dt>{t('product')}</dt><dd>×{format(recipe.yield)}</dd></div>
        {recipe.combo && <div><dt>{t('combo')} · {format(recipe.combo.chance)}%</dt><dd>{itemName(catalog.items[recipe.combo.itemId], language)} ×{format(recipe.combo.quantity)}</dd></div>}
      </dl>
      <a className="source-link" target="_blank" rel="noreferrer" href={catalog.sources[0].url}>{t('sourceData')} <ExternalLink size={14}/></a>
    </Modal>}
    {dialog === 'alternatives' && <Modal title={t('alternatives')} onClose={() => setDialog('')} t={t}>
      <div className="inventory-labels"><span>{t('material')}</span><span>{t('owned')}</span></div>
      {alternatives.map(({ itemId, quantity }) => <div className="inventory-row" key={itemId}><ItemIcon item={catalog.items[itemId]}/><strong>{itemName(catalog.items[itemId], language)} ×{format(quantity)}</strong><NumberField value={workshop.state.stock[itemId] || 0} label={t('owned') + ' · ' + itemName(catalog.items[itemId], language)} onChange={value => workshop.change({ type: 'stock', itemId, value })}/></div>)}
    </Modal>}
    {(toast || workshop.problem) && <div className={'toast' + (workshop.problem ? ' error' : '')} role="status">{workshop.problem ? <CircleAlert size={17}/> : <Check size={17}/>}<span>{t(workshop.problem || toast?.label)}</span>
      {!workshop.problem && toast.undo && <button className="text-button" onClick={async () => { if (await workshop.change({ type: 'undo', receipt: toast.undo })) setToast({ label: 'undone' }); }}>{t('undo')}</button>}
      <button className="icon-button" aria-label={t('close')} onClick={() => { workshop.clearProblem(); setToast(null); }}><X size={15}/></button>
    </div>}
  </div>;
}
