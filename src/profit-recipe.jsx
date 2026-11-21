import React from 'react';
import { ArrowUpRight, ChevronDown, Layers3, Pencil, Sparkles } from 'lucide-react';
import { itemName } from './data.js';
import { Coin, ItemIcon } from './ui.jsx';

function Amount({ value, money, t }) {
  if (value == null) return <span className="amount-unknown">{t('unpriced')}</span>;
  return <><Coin/>{money(value)}</>;
}

function Outcome({ result, item, language, t, money, percent }) {
  const { kind, chance, quantity, price, sale, expectedGross, manual, bound } = result;
  return <li className={'rank-outcome ' + kind}>
    <div className="rank-outcome-head"><strong>{t(kind === 'normal' ? 'normalResult' : 'combo')}</strong><span>{t('outcomeChance')} {percent(chance)}</span></div>
    <div className="rank-product"><ItemIcon item={item}/><div><strong>{itemName(item, language)}</strong>
      <small>{bound ? t('boundNoSale') : <>{quantity} × {price == null ? t('unpriced') : money(price) + ' Kinah'}{manual && ' · ' + t('manual')}</>}</small>
    </div></div>
    <div className="rank-weight"><span>{t('weightedSale')}</span><b>{sale != null && <>{percent(chance)} × {money(sale)} = </>}
      {expectedGross == null ? t('unpriced') : money(expectedGross) + ' Kinah'}</b></div>
  </li>;
}

function RecipeBreakdown({ row, recipe, catalog, language, t, money, percent, feeBps, onPrice, openRecipe }) {
  const { materials, outcomes, cost, gross, fee, net, profit } = row;
  const formula = (a, b, total) => total == null ? <span className="amount-unknown">{t('missingPrices')}</span> :
    <>{money(a)} − {money(b)} = <strong>{money(total)} Kinah</strong></>;
  return <div className="rank-breakdown">
    <div className="rank-parts">
      <section><div className="rank-section-head"><h3><Layers3 size={16}/>{t('materials')}</h3><small>{t('subtotal')}</small></div>
        <ul className="rank-materials">{materials.map((material, index) => {
          const item = catalog.items[material.itemId];
          return <li key={index}><ItemIcon item={item}/><div><strong>{itemName(item, language)}</strong>
            <small>{material.quantity} × {material.price == null ? t('unpriced') : money(material.price) + ' Kinah'}{material.manual && ' · ' + t('manual')}</small>
            {material.alternative && <small>{t('cheapestOption')}</small>}
          </div><b><Amount value={material.subtotal} {...{ money, t }}/></b></li>;
        })}</ul>
        <div className="rank-cost-total"><span>{t('craftCost')}</span><b><Amount value={cost} {...{ money, t }}/></b></div>
      </section>
      <section><div className="rank-section-head"><h3><Sparkles size={16}/>{t('outcomeSales')}</h3></div>
        <ul className="rank-outcomes">{outcomes.map(out => <Outcome key={out.kind} result={out} item={catalog.items[out.itemId]} {...{ language, t, money, percent }}/>)}</ul>
      </section>
    </div>
    <dl className="rank-equations">
      <div><dt>{t('netSale')}<small>{t('grossSale')} − {t('marketFee')} ({percent(feeBps / 100)})</small></dt><dd>{formula(gross, fee, net)}</dd></div>
      <div><dt>{t('profitPerAttempt')}<small>{t('netSale')} − {t('craftCost')}</small></dt>
        <dd className={profit > 0 ? 'positive' : profit < 0 ? 'negative' : ''}>{formula(net, cost, profit)}</dd></div>
    </dl>
    {feeBps > 0 && <p className="rank-rounding">{t('saleRounding')}</p>}
    {row.missing?.length > 0 && <div className="rank-missing-prices"><b>{t('missingPrices')}</b><div>{row.missing.map(id =>
      <button className="text-button" key={id} onClick={() => onPrice(id)}>{itemName(catalog.items[id], language)}<Pencil size={12}/></button>)}</div></div>}
    <button type="button" className="text-button rank-open-calculator" onClick={() => openRecipe(recipe)}>{t('openCalculator')}<ArrowUpRight size={15}/></button>
  </div>;
}

const metrics = [['craftCost', 'cost'], ['grossSale', 'gross'], ['netSale', 'net'], ['profit', 'profit'], ['margin', 'margin']];

export function RankColumns({ t }) {
  return <div className="profit-columns" aria-hidden="true"><span>{t('product')}</span>{metrics.map(([label]) => <span key={label}>{t(label)}</span>)}</div>;
}

export function ProfitRecipe({ row, catalog, language, t, money, percent, feeBps, showFaction, expanded, onToggle, onPrice, openRecipe }) {
  const recipe = catalog.byId[row.recipeId], item = catalog.items[recipe.itemId];
  const id = 'rank-' + recipe.id;
  const name = itemName(item, language);
  const tone = row.profit > 0 ? 'positive' : row.profit < 0 ? 'negative' : '';
  return <article className={'rank-entry' + (expanded ? ' expanded' : '')}>
    <button id={id + '-toggle'} type="button" className={'profit-row' + (row.missing ? ' incomplete' : '')}
      aria-expanded={expanded} aria-controls={id + '-detail'} onClick={() => onToggle(recipe.id)}>
      <span className="profit-item"><ItemIcon item={item}/><span><strong>{name}</strong><small>{t(recipe.profession)} · {t('level')} {recipe.level}{showFaction && recipe.faction && ' · ' + t(recipe.faction)}</small></span></span>
      {row.missing ? <small className="rank-missing-count">{t('missingPrices')} · {row.missing.length}</small> : metrics.map(([label, key]) =>
        <span key={key} className={'profit-value ' + (key === 'profit' || key === 'margin' ? tone : '')}><small>{t(label)}</small>
          <b>{key === 'margin' ? row.margin == null ? '—' : percent(row.margin) : <Amount value={row[key]} {...{ money, t }}/>}</b></span>)}
      <ChevronDown className="rank-chevron" size={17} aria-hidden="true"/>
    </button>
    <div id={id + '-detail'} role="region" aria-label={t('details') + ' · ' + name} hidden={!expanded}>
      {expanded && <RecipeBreakdown {...{ row, recipe, catalog, language, t, money, percent, feeBps, onPrice, openRecipe }}/>}
    </div>
  </article>;
}
