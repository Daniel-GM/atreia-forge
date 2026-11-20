import { integer, MAX_CRAFTS, MAX_STOCK } from './quantities.js';
import { attemptsFromBatch, requirements } from './crafting.js';

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function checkedName(value) {
  const name = typeof value === 'string' && value.trim();
  if (!name || name.length > 120) throw new Error('lineName');
  return name;
}

export function checkedLine(line, catalog) {
  if (!line || !uuid.test(line.id) || !Array.isArray(line.steps)) throw new Error('lineChanged');
  const name = checkedName(line.name);
  const ids = new Set();
  const steps = line.steps.map(step => {
    if (!step || !uuid.test(step.id) || ids.has(step.id) || !Object.hasOwn(catalog.byId, step.recipeId)) throw new Error('lineChanged');
    if (!Number.isInteger(step.count) || step.count < 0 || step.count > MAX_CRAFTS) throw new Error('lineChanged');
    if (step.combos != null && (!Number.isInteger(step.combos) || step.combos < 0 || step.combos > step.count)) throw new Error('lineChanged');
    ids.add(step.id);
    const clean = { id: step.id, recipeId: step.recipeId, count: step.count, combos: step.combos ?? null };
    if (step.done) clean.done = checkedResult(step, catalog.byId[step.recipeId]);
    return clean;
  });
  return { id: line.id, name, steps };
}

function checkedResult({ count, done }, recipe) {
  if (!count || typeof done.receipt !== 'string' || !done.receipt || done.receipt.length > 120 ||
      !Number.isSafeInteger(done.order) || done.order < 1 || typeof done.credit !== 'boolean' ||
      !Number.isInteger(done.combos) || done.combos < 0 || done.combos > count || (!recipe.combo && done.combos) ||
      !Array.isArray(done.used)) throw new Error('lineChanged');
  const amounts = {};
  for (const { itemId, required } of done.used) {
    if (!/^\d+$/.test(itemId) || Object.hasOwn(amounts, itemId) || !Number.isSafeInteger(required) || required < 1 || required > MAX_STOCK) throw new Error('lineChanged');
    amounts[itemId] = required;
  }
  const used = requirements(recipe, count, amounts).map(({ itemId, required }) => ({ itemId, required }));
  if (used.length !== done.used.length || used.some(row => amounts[row.itemId] !== row.required)) throw new Error('lineChanged');
  return { receipt: done.receipt, order: done.order, combos: done.combos, credit: done.credit, used };
}

function withCount(step, count) {
  return { ...step, count, combos: step.combos == null ? null : Math.min(step.combos, count) };
}

export function completeStep(lines, action, catalog, used, produced) {
  const line = lines?.[action.lineId];
  const pos = line?.steps.findIndex(s => s.id === action.stepId) ?? -1;
  const current = line?.steps[pos];
  if (!current || current.done || !current.count || current.count !== action.count || current.recipeId !== action.recipeId) throw new Error('lineChanged');
  const steps = [...line.steps];
  const order = steps.reduce((last, s) => Math.max(last, s.done?.order || 0), 0) + 1;
  steps[pos] = { ...current, done: { receipt: action.id, order, combos: action.combos ?? 0, credit: !!action.credit, used } };
  let followUp = null;
  if (action.credit) {
    for (let i = pos + 1; i < steps.length; i++) {
      const next = steps[i];
      if (next.done) continue;
      const count = attemptsFromBatch(catalog.byId[current.recipeId], catalog.byId[next.recipeId], produced);
      if (count == null) continue;
      steps[i] = withCount(next, count);
      followUp = { id: next.id, countBefore: next.count, combosBefore: next.combos, countAfter: count, combosAfter: steps[i].combos };
      break;
    }
  }
  return { lines: { ...lines, [line.id]: { ...line, steps } }, followUp };
}

export function undoStep(lines, last) {
  const line = lines?.[last.lineId];
  if (!line) return lines;
  const original = line.steps.find(s => s.id === last.stepId);
  if (original && original.done?.receipt !== last.receipt) return lines;
  const next = last.followUp;
  const steps = line.steps.map(step => {
    if (step === original) {
      const { done, ...pending } = step;
      return pending;
    }
    if (step.id === next?.id && !step.done && step.count === next.countAfter && step.combos === next.combosAfter) {
      return { ...step, count: next.countBefore, combos: next.combosBefore };
    }
    return step;
  });
  return { ...lines, [line.id]: { ...line, steps } };
}

// Keep existing steps and their custom counts. Known recipes anchor new ones
// before or after the selected recipe, even when a chain is built backwards.
function insertSequence(steps, incoming, anchorId, recipeId) {
  const anchor = anchorId ? steps.find(s => s.id === anchorId && s.recipeId === recipeId) : null;
  if (anchorId && !anchor) throw new Error('lineChanged');
  const existing = draft => draft.recipeId === recipeId && anchor ? anchor : steps.find(s => s.recipeId === draft.recipeId);
  let after = -1;
  for (const [index, draft] of incoming.entries()) {
    const match = existing(draft);
    if (match) { after = steps.indexOf(match); continue; }
    const upcoming = incoming.slice(index + 1).map(existing).find(s => s && steps.indexOf(s) > after);
    const at = upcoming ? steps.indexOf(upcoming) : after >= 0 ? after + 1 : steps.length;
    steps.splice(at, 0, draft);
    after = at;
  }
}

export function editLines(lines = {}, action, catalog) {
  const { type, lineId, stepId } = action;
  if (!uuid.test(lineId)) throw new Error('lineChanged');
  if (type === 'lineCreate') {
    if (Object.hasOwn(lines, lineId)) throw new Error('lineChanged');
    return { ...lines, [lineId]: checkedLine({ id: lineId, name: action.name, steps: action.steps }, catalog) };
  }
  const line = lines[lineId];
  if (!line) throw new Error('lineChanged');
  const next = { ...lines };
  if (type === 'lineDelete') { delete next[lineId]; return next; }
  if (type === 'lineRename') return { ...lines, [lineId]: { ...line, name: checkedName(action.name) } };
  const steps = [...line.steps];
  if (type === 'lineAppend') steps.push(...action.steps);
  else if (type === 'lineInsert') insertSequence(steps, action.steps, action.anchorId, action.recipeId);
  else if (type === 'lineRestart') {
    for (const [i, s] of steps.entries()) {
      const { done, ...pending } = s;
      steps[i] = pending;
    }
  }
  else {
    const pos = steps.findIndex(step => step.id === stepId);
    if (pos < 0) throw new Error('lineChanged');
    const step = steps[pos];
    if (step.done && (type === 'lineCount' || type === 'lineCombos')) throw new Error('lineChanged');
    if (type === 'lineCount') steps[pos] = withCount(step, integer(action.value, MAX_CRAFTS));
    else if (type === 'lineCombos') steps[pos] = { ...step, combos: action.value == null ? null : integer(action.value, step.count) };
    else if (type === 'lineRemove') steps.splice(pos, 1);
    else if (type === 'lineMove') {
      const to = pos + action.direction;
      if (![-1, 1].includes(action.direction) || to < 0 || to >= steps.length) return lines;
      [steps[pos], steps[to]] = [steps[to], steps[pos]];
    } else throw new Error('lineChanged');
  }
  next[lineId] = checkedLine({ ...line, steps }, catalog);
  return next;
}
