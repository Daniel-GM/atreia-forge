import { useEffect, useState } from 'react';

const hintKey = 'atreia-forge.google-session';
function remembered() {
  try { return localStorage.getItem(hintKey) === '1'; } catch { return false; }
}
function remember(active) {
  try { if (active) localStorage.setItem(hintKey, '1'); else localStorage.removeItem(hintKey); } catch { /* Sessions can also be temporary. */ }
}

export function useAccount() {
  const [enabled, enable] = useState(remembered);
  const [retry, setRetry] = useState(0);
  const [sdk, setSdk] = useState(null);
  const [session, setSession] = useState({ user: null, busy: remembered() });
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    const observe = e => { if (e.key === hintKey && remembered()) enable(true); };
    window.addEventListener('storage', observe);
    return () => window.removeEventListener('storage', observe);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let active = true, stop;
    import('./firebase.js').then(module => {
      if (!active) return;
      setSdk(module);
      stop = module.watchAccount(next => {
        if (!active) return;
        if (next.error) setError(next.error);
        if (next.user) { setError(''); remember(true); }
        if (!next.busy && !next.user && next.error !== 'cloudUnavailable') remember(false);
        setSession(previous => next.pendingUid === previous.user?.uid && next.pendingUid ? { ...previous, busy: true } : next);
      });
    }).catch(() => { if (active) { setError('cloudUnavailable'); setSession({ user: null, busy: false }); } });
    return () => { active = false; stop?.(); };
  }, [enabled, retry]);
  return { ...session, error, opening, ready: !!sdk, prepare: () => enable(true),
    login: async () => {
      setError('');
      if (!sdk) { enable(true); setRetry(n => n + 1); return; }
      setOpening(true);
      try { await sdk.login(); }
      catch (err) {
        if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) setError(err.code === 'auth/popup-blocked' ? 'popupBlocked' : 'cloudUnavailable');
      } finally { setOpening(false); }
    },
    logout: async () => { try { await sdk.logout(); setError(''); } catch { setError('cloudUnavailable'); } },
    writeCloud: sdk?.writeCloud };
}
