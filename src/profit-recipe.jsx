import React from 'react';
import { ArrowUpRight, ChevronDown, ExternalLink, Layers3, Pencil, Sparkles } from 'lucide-react';
import { profitScenario } from '../shared/profit-scenario.js';
import { itemName } from './data.js';
import { Coin, ItemIcon, ItemName } from './ui.jsx';
import { TierComparison } from './tier-comparison.jsx';

function Amount({ value, money, t }) {
  if (value == null) return <span className="amount-unknown">{t('unpriced')}</span>;
  return <><Coin/>{money(value)}</>;
}

function QuoteInfo({ id, market, manual, server, language, t, stamp, onPrice }) {
  const date = market.captures?.[id], listings = market.listings?.[id];
  const info = [manual && t('manual'), listings != null && (t('offerCount') + ' ' + listings),
    listings == null && market.availability?.[id] === 'unlisted' && t('noOffers'), date && stamp(new Date(date))].filter(Boolean);
  const url = 'https://questlog.gg/aion-2/' + language + '/auction-house/item/' + id + '?server=' + server.id;
  return <small className="rank-quote">{info.length > 0 && info.join(' · ') + ' · '}<a href={url} target="_blank" rel="noreferrer">Questlog <ExternalLink size={10}/></a>
    {(manual || market.prices[id] == null) && <> · <button type="button" onClick={() => onPrice(id)}>{t('editPrice')}</button></>}</small>;
}

function Outcome({ result, item, amounts, quoteProps, money, percent }) {
  const { language, t } = quoteProps;
  const { kind, chance, quantity, price, sale, expectedGross, manual, bound } = result;
  const amount = value => value == null ? t('unpriced') : money(value) + ' Kinah';
  return <li className={'rank-outcome ' + kind}>
    <div className="rank-outcome-head"><strong>{t(kind === 'normal' ? 'normalResult' : 'combo')}</strong><span>{t('outcomeChance')} {percent(chance)}</span></div>
    <div className="rank-product"><ItemIcon item={item}/><div><strong><ItemName {...{ item, language }}/></strong>
      <small>{bound ? t('boundNoSale') : <>{t(manual ? 'manual' : 'unitAsk')} · {money(quantity)} × {amount(price)}</>}</small>
      {!bound && <QuoteInfo id={result.itemId} manual={manual} {...quoteProps}/>}
    </div></div>
    {amounts && <div className="rank-actual"><span>{t('grossSale')} <b>{amount(sale)}</b></span>
      <span>{t('netSale')} <b>{amount(amounts.net)}</b></span>
      <span>{t('saleProfit')} <b className={amounts.profit > 0 ? 'positive' : amounts.profit < 0 ? 'negative' : ''}>{amount(amounts.profit)}</b></span></div>}
    <div className="rank-weight"><span>{t('weightedSale')}</span><b>{sale != null && <>{percent(chance)} × {money(sale)} = </>}{amount(expectedGross)}</b></div>
  </li>;
}

function RecipeBreakdown({ row, recipe, view, kind, strategy, catalog, money, percent, feeBps, quoteProps, onPrice, openRecipe }) {
  const { t, language } = quoteProps;
  const formula = (a, b, total) => total == null ? <span className="amount-unknown">{t('missingPrices')}</span> :
    <>{money(a)} − {money(b)} = <strong>{money(total)} Kinah</strong></>;
  const avg = kind === 'average';
  return <div className="rank-breakdown">
    {row.chain && <TierComparison {...{ row, recipe, catalog, kind, feeBps, language, t, money, percent, onPrice }}/>}
    <div className="rank-parts">
      <section><div className="rank-section-head"><h3><Layers3 size={16}/>{t('materials')}</h3><small>{t('subtotal')}</small></div>
        <ul className="rank-materials">{row.materials.map((material, index) => {
          const item = catalog.items[material.itemId];
          return <li key={index}><ItemIcon item={item}/><div><strong><ItemName {...{ item, language }}/></strong>
            <small>{money(material.quantity)} × {material.price == null ? t('unpriced') : money(material.price) + ' Kinah'}</small>
            <QuoteInfo id={material.itemId} manual={material.manual} {...quoteProps}/>
            {material.alternative && <small>{t('cheapestOption')}</small>}
          </div><b><Amount value={material.subtotal} {...{ money, t }}/></b></li>;
        })}</ul>
        <div className="rank-cost-total"><span>{t(row.chain ? 'buyInputs' : 'craftCost')}</span><b><Amount value={row.cost} {...{ money, t }}/></b></div>
      </section>
      <section><div className="rank-section-head"><h3><Sparkles size={16}/>{t('outcomeSales')}</h3></div>
        <ul className="rank-outcomes">{row.outcomes.map(out => <Outcome key={out.kind} result={out} item={catalog.items[out.itemId]}
          amounts={profitScenario(row, recipe, out.kind, strategy, feeBps)} {...{ quoteProps, money, percent }}/>)}</ul>
      </section>
    </div>
    <dl className="rank-equations">
      <div><dt>{t(avg ? 'averageNet' : 'netSale')}<small>{t(avg ? 'averageGross' : 'grossSale')} − {t('marketFee')} ({percent(feeBps / 100)})</small></dt><dd>{formula(view.gross, view.fee, view.net)}</dd></div>
      <div><dt>{t(avg ? 'averageProfit' : 'saleProfit')}<small>{t('netSale')} − {t('craftCost')} · {t(strategy === 'chain' ? 'fromFirst' : 'buyInputs')}</small></dt>
        <dd className={view.profit > 0 ? 'positive' : view.profit < 0 ? 'negative' : ''}>{formula(view.net, view.cost, view.profit)}</dd></div>
    </dl>
    {feeBps > 0 && <p className="rank-rounding">{t('saleRounding')}</p>}
    {!row.chain && view.missing.length > 0 && <div className="rank-missing-prices"><b>{t('missingPrices')}</b><div>{view.missing.map(id =>
      <button className="text-button" key={id} onClick={() => onPrice(id)}><ItemName item={catalog.items[id]} language={language}/><Pencil size={12}/></button>)}</div></div>}
    <button type="button" className="text-button rank-open-calculator" onClick={() => openRecipe(recipe)}>{t('openCalculator')}<ArrowUpRight size={15}/></button>
  </div>;
}

function metrics(kind) {
  const avg = kind === 'average';
  return [['craftCost','cost'], [avg ? 'averageGross' : 'grossSale','gross'], [avg ? 'averageNet' : 'netSale','net'],
    [avg ? 'averageProfit' : 'saleProfit','profit'], ['margin','margin']];
}

export function RankColumns({ t, kind }) {
  return <div className="profit-columns" aria-hidden="true"><span>{t('product')} · {t('unitAsk')}</span>{metrics(kind).map(([label]) => <span key={label}>{t(label)}</span>)}</div>;
}

export function ProfitRecipe({ row, view, catalog, quoteProps, money, percent, kind, strategy, feeBps, showFaction, expanded, onToggle, onPrice, openRecipe }) {
  const { t, language } = quoteProps;
  const recipe = catalog.byId[row.recipeId];
  const id = 'rank-' + recipe.id;
  const selected = kind === 'average' ? row.outcomes.filter((out, i) => !i || out.itemId !== recipe.itemId) : row.outcomes.filter(out => out.kind === kind);
  const name = itemName(catalog.items[selected[0].itemId], language);
  const tone = view.profit > 0 ? 'positive' : view.profit < 0 ? 'negative' : '';
  return <article className={'rank-entry' + (expanded ? ' expanded' : '')}>
    <button id={id + '-toggle'} type="button" className="profit-row" aria-expanded={expanded} aria-controls={id + '-detail'} onClick={() => onToggle(recipe.id)}>
      <span className="profit-item rank-results"><small>{t(recipe.profession)} · {t('level')} {recipe.level}{showFaction && recipe.faction && ' · ' + t(recipe.faction)}</small>
        {selected.map(out => { const item = catalog.items[out.itemId]; return <span key={out.kind} className="rank-result-line"><ItemIcon item={item}/><span>
          <strong>{out.kind === 'combo' && <Sparkles size={12} aria-label={t('combo')}/>}<ItemName {...{ item, language }}/></strong>
          <small>{out.bound ? t('boundNoSale') : <>{t(out.manual ? 'manual' : 'unitAsk')} · {out.price == null ? t('unpriced') : money(out.price) + ' Kinah'}</>}{recipe.combo && ' · ' + t('outcomeChance') + ' ' + percent(out.chance)}</small>
        </span></span>; })}
      </span>
      {metrics(kind).map(([label, key]) => <span key={key} className={'profit-value ' + (key === 'profit' || key === 'margin' ? tone : '')}><small>{t(label)}</small>
        <b>{key === 'margin' ? view.margin == null ? '—' : percent(view.margin) : <Amount value={view[key]} {...{ money, t }}/>}</b></span>)}
      <ChevronDown className="rank-chevron" size={17} aria-hidden="true"/>
    </button>
    <div id={id + '-detail'} role="region" aria-label={t('details') + ' · ' + name} hidden={!expanded}>
      {expanded && <RecipeBreakdown {...{ row, recipe, view, kind, strategy, catalog, money, percent, feeBps, quoteProps, onPrice, openRecipe }}/>}
    </div>
  </article>;
}
