import React, { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { profitScenario } from '../shared/profit-scenario.js';
import { ItemName } from './ui.jsx';

export function TierComparison({ row, recipe, catalog, kind, feeBps, language, t, money, percent, onPrice }) {
  const [sell, setSell] = useState(false);
  const bought = profitScenario(row, recipe, kind, 'buy', feeBps);
  const made = profitScenario(row, recipe, kind, 'chain', feeBps, sell);
  // Both routes sell the same final outcome, so its price cancels in the difference.
  const delta = bought.cost == null || made.cost == null || made.side == null ? null : bought.cost - made.cost + made.side;
  const amount = value => value == null ? t('missingPrices') : money(value);
  const missing = [...new Set([...bought.missing, ...made.missing])];
  return <section className="tier-compare">
    <h3><GitBranch size={16}/>{t('chainCompare')}</h3>
    <p>{t('targetAttempt')}</p>
    <table><thead><tr><th scope="col">Kinah</th><th scope="col">{t('buyPrevious')}</th><th scope="col">{t('fromFirst')}</th></tr></thead>
      <tbody>{[['craftCost','cost'],['netSale','net'],...(sell ? [['leftToSell','side']] : []),['profit','profit'],['margin','margin']].map(([label, key]) =>
        <tr key={key}><th scope="row">{t(label)}</th>{[bought, made].map((v, i) => <td key={i} className={key === 'profit' ? (v.profit > 0 ? 'positive' : v.profit < 0 ? 'negative' : '') : ''}>
          {key === 'margin' ? v.margin == null ? '—' : percent(v.margin) : amount(v[key])}</td>)}</tr>)}</tbody>
    </table>
    <div className="tier-delta"><span>{t('chainDelta')}</span><b className={delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}>{delta > 0 && '+'}{amount(delta)}{delta != null && ' Kinah'}</b></div>
    {!!row.chain.byproducts.length && <label className="tier-credit"><input type="checkbox" checked={sell} onChange={e => setSell(e.target.checked)}/>{t('sellSpare')}</label>}
    <details className="tier-steps"><summary>{t('stages')} · {row.chain.steps.map(s => money(s.attempts)).join(' → ')}</summary>
      <ol>{row.chain.steps.map(step => <li key={step.recipeId}><b>{money(step.attempts)} ×</b> <ItemName item={catalog.items[catalog.byId[step.recipeId].itemId]} language={language}/>
        <small> · {t('inputValue')} · {amount(step.externalCost)}{step.externalCost != null && ' Kinah'}</small></li>)}</ol>
      {!!row.chain.byproducts.length && <><strong>{t('leftToSell')}</strong><ul>{row.chain.byproducts.map(lot => <li key={lot.itemId}>{money(lot.quantity)} × <ItemName item={catalog.items[lot.itemId]} language={language}/></li>)}</ul></>}
    </details>
    {missing.length > 0 && <div className="rank-missing-prices"><b>{t('missingPrices')}</b><div>{missing.map(id =>
      <button key={id} className="text-button" onClick={() => onPrice(id)}><ItemName item={catalog.items[id]} language={language}/></button>)}</div></div>}
  </section>;
}
