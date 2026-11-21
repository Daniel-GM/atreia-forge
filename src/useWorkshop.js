import { useCallback, useEffect, useRef, useState } from 'react';
import { applyChange, emptyWorkshop } from '../shared/planner.js';

const storageKey = 'atreia-forge.workshop.v1';
export function readDeviceWorkshop() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return emptyWorkshop();
  const stored = JSON.parse(raw);
  if (!stored || typeof stored !== 'object' || !stored.stock || !stored.saved || !stored.prices) throw new Error('storageError');
  return { ...emptyWorkshop(), ...stored };
}

export function useWorkshop(catalog, account) {
  const { user, writeCloud } = account;
  const [initial] = useState(() => {
    try { return { state: user ? emptyWorkshop() : readDeviceWorkshop(), problem: '' }; }
    catch { return { state: emptyWorkshop(), problem: 'storageError' }; }
  });
  const [state, setState] = useState(initial.state);
  const [problem, setProblem] = useState(initial.problem);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    if (user) return;
    function sync(event) {
      if (event.key && event.key !== storageKey) return;
      try { setState(readDeviceWorkshop()); } catch { setProblem('storageError'); }
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [user]);
  const change = useCallback(action => {
    const id = crypto.randomUUID();
    function write() {
      const current = readDeviceWorkshop();
      setState(current);
      const next = applyChange(current, { ...action, id }, catalog);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setState(next);
      setProblem('');
      return id;
    }
    const job = queue.current.then(async () => {
      if (!user) return navigator.locks ? navigator.locks.request(storageKey, write) : write();
      await writeCloud(user, { ...action, id }, catalog);
      setProblem('');
      return id;
    }).catch(error => {
      const known = ['stockChanged', 'stockLimit', 'invalidBackup', 'lineChanged', 'lineName', 'actualCombos', 'cloudFull', 'accessDenied'];
      setProblem(known.includes(error.message) ? error.message : user ? 'cloudUnavailable' : 'storageError');
      return false;
    });
    queue.current = job;
    return job;
  }, [catalog, user, writeCloud]);
  return { state: user ? account.cloudState : state, change, problem, clearProblem: () => setProblem('') };
}
