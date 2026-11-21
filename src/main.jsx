import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LoaderCircle } from 'lucide-react';
import '@fontsource-variable/inter';
import '@fontsource/baskervville/latin-400.css';
import '@fontsource/baskervville/latin-400-italic.css';
import './styles.css';
import './lines.css';
import { loadData, readSettings } from './data.js';
import { tFor } from './i18n.js';
import App from './App.jsx';
import { useAccount } from './useAccount.js';

function Bootstrap() {
  const account = useAccount();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const t = tFor(readSettings().language);
  useEffect(() => {
    let active = true;
    loadData().then(next => { if (active) setData(next); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [tries]);
  if (data) return <App key={account.user?.uid || 'device'} {...data} account={account}/>;
  return <main className="boot-screen"><img src="/forge-mark.svg" alt="" width="54" height="54"/><h1>Atreia Forge</h1>
    {failed ? <><p>{t('loadError')}</p><button className="button primary" onClick={() => { setFailed(false); setTries(n => n + 1); }}>{t('retry')}</button></> : <LoaderCircle className="spinning" size={20} aria-label={t('loading')}/>}
  </main>;
}
createRoot(document.getElementById('root')).render(<Bootstrap/>);
