import { useCallback, useEffect, useRef, useState } from 'react';
import { applyChange, emptyWorkshop } from '../shared/planner.js';

const storageKey = 'atreia-forge.workshop.v1';
function read() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return emptyWorkshop();
  const stored = JSON.parse(raw);
  if (!stored || typeof stored !== 'object' || !stored.stock || !stored.saved || !stored.prices) throw new Error('storageError');
  return { ...emptyWorkshop(), ...stored };
}

export function useWorkshop(catalog) {
  const [initial] = useState(() => {
    try { return { state: read(), problem: '' }; }
    catch { return { state: emptyWorkshop(), problem: 'storageError' }; }
  });
  const [state, setState] = useState(initial.state);
  const [problem, setProblem] = useState(initial.problem);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    function sync(event) {
      if (event.key && event.key !== storageKey) return;
      try { setState(read()); } catch { setProblem('storageError'); }
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const change = useCallback(action => {
    const id = crypto.randomUUID();
    function write() {
      const current = read();
      setState(current);
      const next = applyChange(current, { ...action, id }, catalog);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setState(next);
      setProblem('');
      return id;
    }
    const job = queue.current.then(() => navigator.locks ? navigator.locks.request(storageKey, write) : write()).catch(error => {
      const known = ['stockChanged', 'stockLimit', 'invalidBackup', 'lineChanged', 'lineName', 'actualCombos'];
      setProblem(known.includes(error.message) ? error.message : 'storageError');
      return false;
    });
    queue.current = job;
    return job;
  }, [catalog]);
  return { state, change, problem, clearProblem: () => setProblem('') };
}
