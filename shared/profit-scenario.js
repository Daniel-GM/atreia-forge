import { materialOptions } from './crafting.js';
import { netSaleValue } from './quantities.js';

// A single observed outcome sells its entire lot. Only the average uses probabilities.
export function profitScenario(row, recipe, kind, strategy, feeBps, sellByproducts = false) {
  const chain = strategy === 'chain' ? row.chain : null;
  const cost = chain ? chain.cost : row.cost;
  const outputs = row.outcomes.filter(o => o.chance > 0 && !o.bound && (kind === 'average' || o.kind === kind));
  if (!outputs.length) return null;
  let gross = row.gross, net = row.net;
  if (kind !== 'average') {
    const out = outputs[0];
    gross = out.sale;
    net = out.price == null ? null : Number(netSaleValue(BigInt(out.quantity) * BigInt(out.price), feeBps));
  }
  const missing = new Set();
  if (cost == null) {
    const ids = chain ? chain.missingInputs : row.materials.flatMap((m, i) =>
      m.price == null ? materialOptions(recipe.materials[i]).map(option => option.itemId) : []);
    for (const id of ids) missing.add(id);
  }
  for (const out of outputs) if (out.price == null) missing.add(out.itemId);
  const side = chain && sellByproducts ? chain.byproductNet : 0;
  if (side == null) for (const lot of chain.byproducts) if (lot.net == null) missing.add(lot.itemId);
  const revenue = net == null || side == null ? null : net + side;
  const profit = kind === 'average' && !chain ? row.profit : revenue == null || cost == null ? null : revenue - cost;
  const fee = kind === 'average' ? row.fee : net == null ? null : gross - net;
  return { cost, gross, net, fee, side, profit,
    margin: profit == null || !revenue ? null : profit / revenue * 100, missing: [...missing] };
}
