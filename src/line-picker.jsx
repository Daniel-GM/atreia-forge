import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ListPlus } from 'lucide-react';
import { recipeSuggestions } from '../shared/lines.js';
import { gradeName } from './i18n.js';
import { useRecipeList } from './recipe-filter.js';
import { RecipeBrowser } from './recipes.jsx';
import { FactionSelect, ItemIcon, ItemName, Modal, Professions } from './ui.jsx';

export const withIds = steps => steps.map(step => ({ ...step, id: crypto.randomUUID() }));

function RelatedGroup({ title, steps, existing, chosen, toggle, catalog, language, t, format }) {
  const [limit, setLimit] = useState(5);
  if (!steps.length) return null;
  return <fieldset className="related-group"><legend>{t(title)}</legend>
    {steps.slice(0, limit).map(draft => {
      const r = catalog.byId[draft.recipeId], item = catalog.items[r.itemId], found = existing.get(r.id);
      return <label className={'related-row' + (found ? ' in-line' : '')} key={r.id}>
        <input type="checkbox" checked={!!found || chosen.has(r.id)} disabled={!!found} onChange={() => toggle(r.id)}/>
        <ItemIcon item={item}/><span><strong><ItemName item={item} language={language}/></strong><small>{found ? t('inLine') : gradeName(item.grade, language) + ' · ' + t('level') + ' ' + format(r.level)}</small></span>
        <b>×{format(found?.count ?? draft.count)}</b>
      </label>;
    })}
    {steps.length > limit && <button className="more-button" onClick={() => setLimit(n => n + 12)}>{t('loadMore')}</button>}
  </fieldset>;
}

function RelatedOptions({ recipe, related, line, anchor, onBack, onClose, workshop, catalog, language, t, format }) {
  const existing = new Map(line.steps.map(step => [step.recipeId, step]));
  const [chosen, setChosen] = useState(() => new Set(related.gold ? [...related.before, ...related.after].filter(s => !existing.has(s.recipeId)).map(s => s.recipeId) : []));
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const item = catalog.items[recipe.itemId];
  const hasLinks = related.before.length + related.after.length > 0;
  const useStep = s => chosen.has(s.recipeId) || existing.has(s.recipeId);
  function toggle(id) {
    setChosen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function add(onlySelected) {
    if (submitting.current) return;
    submitting.current = true; setBusy(true);
    const single = { recipeId: recipe.id, count: 1, combos: null };
    const repeat = onlySelected && existing.has(recipe.id);
    const include = onlySelected ? s => existing.has(s.recipeId) : useStep;
    const steps = repeat ? [single] : [...related.before.filter(include), onlySelected ? single : related.selected, ...related.after.filter(include)];
    const ok = await workshop.change({ type: repeat ? 'lineAppend' : 'lineInsert', lineId: line.id, recipeId: recipe.id, anchorId: anchor?.id, steps: withIds(steps) });
    if (ok) onClose();
    else { submitting.current = false; setBusy(false); }
  }
  const groupProps = { catalog, language, t, format, existing, chosen, toggle };
  return <Modal title={t('relatedSteps')} onClose={onClose} className="related-dialog" t={t}>
    {onBack && <button className="text-button picker-back" onClick={onBack}><ArrowLeft size={15}/>{t('chooseRecipe')}</button>}
    <div className="related-selected"><ItemIcon item={item} large/><div><small>{t(recipe.profession)} · {t('level')} {format(recipe.level)}</small><strong><ItemName item={item} language={language}/></strong></div>
      <b>×{format(anchor?.count ?? (chosen.size ? related.selected.count : 1))}</b></div>
    <div className="related-scroll"><RelatedGroup {...groupProps} title="previousSteps" steps={related.before}/>
      <RelatedGroup {...groupProps} title="followingSteps" steps={related.after}/>
      {!hasLinks && <p className="form-hint">{t('noRelated')}</p>}
    </div>
    {workshop.problem && <p className="form-error" role="alert">{t(workshop.problem)}</p>}
    <div className="modal-actions">{!anchor && chosen.size > 0 && <button className="button secondary" disabled={busy} onClick={() => add(true)}>{t('singleRecipe')}</button>}
      {anchor && !chosen.size ? <button className="button secondary" onClick={onClose}>{t('close')}</button>
        : <button className="button primary" disabled={busy} onClick={() => add(!chosen.size && !anchor)}><ListPlus size={16}/>{t(chosen.size ? 'addSteps' : 'addRecipe')}</button>}
    </div>
  </Modal>;
}

export function LineRecipePicker({ line, anchor, initialProfession, server, catalog, workshop, language, t, format, onClose }) {
  const [picked, setPicked] = useState(null);
  const last = catalog.byId[line.steps.at(-1)?.recipeId];
  const [profession, setProfession] = useState(last?.profession || initialProfession);
  const [category, setCategory] = useState('all');
  const [factionMode, setFactionMode] = useState('server');
  const [query, setQuery] = useState('');
  const [showFaction, setShowFaction] = useState(false);
  const faction = factionMode === 'server' ? server.faction.toLowerCase() : factionMode;
  const { filtered, categories, counts } = useRecipeList(catalog, language, faction, profession, category, query);
  const recipe = anchor ? catalog.byId[anchor.recipeId] : picked;
  const related = useMemo(() => recipe && recipeSuggestions(recipe, catalog, faction, anchor), [recipe, catalog, faction, anchor]);
  function chooseProfession(value) { setProfession(value); setCategory('all'); setQuery(''); }
  function clear() { setCategory('all'); setQuery(''); setFactionMode('server'); }
  if (recipe) return <RelatedOptions key={recipe.id} {...{ recipe, related, line, anchor, onClose, workshop, catalog, language, t, format }} onBack={anchor ? null : () => setPicked(null)}/>;
  return <Modal title={t('chooseRecipe')} onClose={onClose} className="line-picker-dialog" t={t}>
    <Professions selected={profession} counts={counts} onSelect={chooseProfession} t={t} format={format}/>
    {showFaction && <FactionSelect server={server} value={factionMode} onChange={value => { setFactionMode(value); setCategory('all'); }} t={t}/>}
    <RecipeBrowser {...{ catalog, language, t, format, profession, categories, category, setCategory, query, setQuery }} recipes={filtered} select={setPicked} inModal
      filteredFaction={factionMode === 'server' ? '' : factionMode} onFilters={() => setShowFaction(value => !value)} clearFilters={clear}/>
  </Modal>;
}
