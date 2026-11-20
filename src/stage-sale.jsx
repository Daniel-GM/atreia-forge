import React from 'react';
import { ChevronDown, CornerDownRight, Equal, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { itemName } from './data.js';
import { Coin } from './ui.jsx';

function Money({ value, format, t, signed = false }) {
  if (value == null) return <span className="amount-unknown">{t('unpriced')}</span>;
  return <span className="sale-money"><Coin/><span>{signed && value > 0n ? '+' : ''}{format(value)} Kinah</span></span>;
}

function SaleLots({ title, lots, nameOf, onPrice, format, t }) {
  if (!lots.length) return null;
  return <div className="sale-lots"><strong>{t(title)}</strong><ul>{lots.map(lot =>
    <li key={lot.itemId}><span>{format(lot.quantity)} × {nameOf(lot.itemId)}</span>
      <button type="button" className="unit-price" onClick={() => onPrice(lot.itemId)} aria-label={nameOf(lot.itemId) + ' · ' + t('editPrice')}>
        {lot.price == null ? t('unpriced') : <><Coin/>{format(lot.price)} {t('unit')}</>}<Pencil size={11}/>
      </button></li>)}</ul></div>;
}

export function StageSale({ sale, catalog, language, format, t, onPrice, loading }) {
  const { now, next } = sale;
  const nameOf = id => itemName(catalog.items[id], language);
  const difference = next?.difference;
  const up = difference != null && difference > 0n;
  const down = difference != null && difference < 0n;
  const Icon = up ? TrendingUp : down ? TrendingDown : Equal;
  const missing = next ? [...new Set([next.forgone, ...next.extra, ...next.products]
    .filter(lot => lot.value == null).map(lot => lot.itemId))] : [];
  const lotProps = { nameOf, onPrice, t, format };
  return <section className="stage-sale" aria-label={t('sellNow') + ' · ' + nameOf(now.itemId)}>
    <div className="sale-now"><div><strong>{t('sellNow')}</strong><small>{format(now.quantity)} × {nameOf(now.itemId)}</small></div>
      <button className="sale-edit" type="button" onClick={() => onPrice(now.itemId)} aria-label={nameOf(now.itemId) + ' · ' + t('editPrice')}>
        <Money value={now.value} {...{ t, format }}/><Pencil size={12}/>
      </button>
    </div>
    {next && <>
      <div className="sale-target"><CornerDownRight size={15}/><span>{t(next.index == null ? 'suggestedTier' : 'nextStep')} · {format(next.count)} × {nameOf(next.recipe.itemId)}{next.recorded && ' · ' + t('stageDone')}</span></div>
      <dl className="sale-metrics">
        <div><dt>{t('extraInputs')}</dt><dd><Money value={next.extraCost} {...{ t, format }}/></dd></div>
        <div><dt>{t('nextRevenue')}</dt><dd><Money value={next.revenue} {...{ t, format }}/></dd></div>
      </dl>
      <div className={'sale-verdict' + (up ? ' positive' : down ? ' negative' : '')}>
        <div><small>{t('continueDifference')}</small><strong>{difference == null ? t(!next.used ? 'noUnitsToCompare' : loading ? 'marketLoading' : 'missingPrices') : t(up ? 'continueWins' : down ? 'sellWins' : 'sameReturn')}</strong></div>
        {difference != null && <b><Icon size={16} aria-hidden="true"/><Money value={difference} {...{ t, format }} signed/></b>}
      </div>
      {!!next.used && missing.length > 0 && <div className="sale-missing">{missing.map(id =>
        <button key={id} type="button" onClick={() => onPrice(id)} aria-label={t('editPrice') + ' · ' + nameOf(id)}>{nameOf(id)}<Pencil size={11}/></button>)}</div>}
      <details className="sale-breakdown"><summary>{t('saleBreakdown')}<ChevronDown size={13}/></summary>
        {next.used > 0 && <SaleLots title="usedFromBatch" lots={[next.forgone]} {...lotProps}/>}
        {now.quantity > next.used && <p>{t('leftToSell')} · {format(now.quantity - next.used)} × {nameOf(now.itemId)}</p>}
        <SaleLots title="extraInputs" lots={next.extra} {...lotProps}/>
        <div className="sale-cost-total"><span>{t('nextBatchCost')}</span><Money value={next.cost} {...{ t, format }}/></div>
        <SaleLots title="nextRevenue" lots={next.products} {...lotProps}/>
      </details>
    </>}
  </section>;
}
