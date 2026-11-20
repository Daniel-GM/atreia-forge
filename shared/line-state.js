import { integer, MAX_CRAFTS } from './quantities.js';

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
    if (!Number.isInteger(step.count) || step.count < 1 || step.count > MAX_CRAFTS) throw new Error('lineChanged');
    if (step.combos != null && (!Number.isInteger(step.combos) || step.combos < 0 || step.combos > step.count)) throw new Error('lineChanged');
    ids.add(step.id);
    return { id: step.id, recipeId: step.recipeId, count: step.count, combos: step.combos ?? null };
  });
  return { id: line.id, name, steps };
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
  let steps = [...line.steps];
  if (type === 'lineAppend') steps.push(...action.steps);
  else {
    const pos = steps.findIndex(step => step.id === stepId);
    if (pos < 0) throw new Error('lineChanged');
    const step = steps[pos];
    if (type === 'lineCount') {
      const count = integer(action.value, MAX_CRAFTS, 1);
      steps[pos] = { ...step, count, combos: step.combos == null ? null : Math.min(step.combos, count) };
    } else if (type === 'lineCombos') steps[pos] = { ...step, combos: action.value == null ? null : integer(action.value, step.count) };
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
