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

function ReceiptRow({ label, value, deduct = false, total = false, format, t }) {
  return <div className={total ? 'receipt-total' : undefined}><dt>{label}</dt>
    <dd><Money value={deduct && value != null ? -value : value} {...{ format, t }}/></dd></div>;
}

export function StageSale({ sale, catalog, language, format, t, onPrice, loading, feeLabel }) {
  const { now, next } = sale;
  const nameOf = id => itemName(catalog.items[id], language);
  const difference = next?.difference;
  const up = difference != null && difference > 0n;
  const down = difference != null && difference < 0n;
  const Icon = up ? TrendingUp : down ? TrendingDown : Equal;
  const missing = next ? [...new Set([next.forgone, ...next.extra, ...next.products]
    .filter(lot => lot.value == null).map(lot => lot.itemId))] : [];
  const lotProps = { nameOf, onPrice, t, format };
  const money = { format, t };
  return <section className="stage-sale" aria-label={t('sellNow') + ' · ' + nameOf(now.itemId)}>
    <div className="sale-now"><div><strong>{t('sellNow')}</strong><small>{format(now.quantity)} × {nameOf(now.itemId)}</small></div>
      <div className="sale-payout"><small>{t('netSale')}</small><button className="sale-edit" type="button" onClick={() => onPrice(now.itemId)} aria-label={nameOf(now.itemId) + ' · ' + t('editPrice')}>
        <Money value={now.net} {...money}/><Pencil size={12}/>
      </button></div>
    </div>
    {next && <>
      <div className="sale-target"><CornerDownRight size={15}/><span>{t(next.index == null ? 'suggestedTier' : 'nextStep')} · {format(next.count)} × {nameOf(next.recipe.itemId)}{next.recorded && ' · ' + t('stageDone')}</span></div>
      <dl className="sale-metrics">
        <div><dt>{t('nextNetSale')}</dt><dd><Money value={next.netRevenue} {...money}/></dd></div>
        <div><dt>{t('extraInputs')}</dt><dd><Money value={next.extraCost} {...money}/></dd></div>
        {next.used > 0 && <div><dt>{t('continueNet')}</dt><dd><Money value={next.netReturn} {...money}/></dd></div>}
      </dl>
      <div className={'sale-verdict' + (up ? ' positive' : down ? ' negative' : '')}>
        <div><small>{t('continueDifference')}</small><strong>{difference == null ? t(!next.used ? 'noUnitsToCompare' : loading ? 'marketLoading' : 'missingPrices') : t(up ? 'continueWins' : down ? 'sellWins' : 'sameReturn')}</strong></div>
        {difference != null && <b><Icon size={16} aria-hidden="true"/><Money value={difference} {...money} signed/></b>}
      </div>
      {!!next.used && missing.length > 0 && <div className="sale-missing">{missing.map(id =>
        <button key={id} type="button" onClick={() => onPrice(id)} aria-label={t('editPrice') + ' · ' + nameOf(id)}>{nameOf(id)}<Pencil size={11}/></button>)}</div>}
    </>}
    <details className="sale-breakdown"><summary>{t('saleBreakdown')}<ChevronDown size={13}/></summary>
      <div className="sale-receipt"><strong>{t('sellNow')}</strong><dl>
        <ReceiptRow label={t('grossSale')} value={now.value} {...money}/>
        <ReceiptRow label={feeLabel} value={now.fee} deduct {...money}/>
        <ReceiptRow label={t('netSale')} value={now.net} total {...money}/>
      </dl></div>
      {next && <>
        {next.used > 0 && <><SaleLots title="usedFromBatch" lots={[next.forgone]} {...lotProps}/>
          <div className="sale-forgone"><span>{t('forgoneSale')}</span><Money value={next.forgoneNet} {...money}/></div></>}
        {next.leftover.quantity > 0 && <SaleLots title="leftToSell" lots={[next.leftover]} {...lotProps}/>}
        <SaleLots title="extraInputs" lots={next.extra} {...lotProps}/>
        <div className="sale-cost-total"><span>{t('nextBatchCost')}</span><Money value={next.cost} {...money}/></div>
        <SaleLots title="nextRevenue" lots={next.products} {...lotProps}/>
        <div className="sale-receipt"><strong>{nameOf(next.recipe.itemId)}</strong><dl>
          <ReceiptRow label={t('grossSale')} value={next.revenue} {...money}/>
          <ReceiptRow label={feeLabel} value={next.saleFee} deduct {...money}/>
          {next.leftover.quantity > 0 && <ReceiptRow label={t('leftToSell') + ' · ' + t('netSale')} value={next.leftover.net} {...money}/>}
          <ReceiptRow label={t('extraInputs')} value={next.extraCost} deduct {...money}/>
          {next.used > 0 && <ReceiptRow label={t('continueNet')} value={next.netReturn} total {...money}/>}
        </dl></div>
        {difference != null && <div className="sale-equation"><strong>{t('continueDifference')}</strong>
          <span>{format(next.netReturn)} − {format(now.net)} = {difference > 0n ? '+' : ''}{format(difference)} Kinah</span></div>}
      </>}
      <p>{t('saleRounding')}</p>
    </details>
  </section>;
}
