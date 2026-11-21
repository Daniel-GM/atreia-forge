import React, { useEffect, useRef, useState } from 'react';
import { Cloud, Download, HardDrive, LogIn, Upload } from 'lucide-react';
import { backupOf, readBackup } from '../shared/backup.js';
import { Modal } from './ui.jsx';
import { readDeviceWorkshop } from './useWorkshop.js';

export function GoogleAccess({ account, t }) {
  useEffect(() => { account.prepare(); }, []);
  const waiting = account.busy || account.opening || (!account.ready && !account.error);
  return <div className="google-access">
    <strong>{t('inviteOnly')}</strong>
    <button className="button primary" type="button" disabled={waiting} onClick={account.login}><LogIn size={16}/>{t(waiting ? 'loading' : 'googleLogin')}</button>
    {account.error && <p role="alert" className="form-error">{t(account.error)}</p>}
  </div>;
}

export function DeviceDialog({ catalog, workshop, account, onClose, onImport, t, format }) {
  const input = useRef(null);
  const [pending, setPending] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [pasted, setPasted] = useState('');
  function download() {
    const contents = JSON.stringify(backupOf(workshop.state), null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atreia-forge-' + new Date().toISOString().slice(0, 10) + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function preview(text) {
    setInvalid(false); setPending(null);
    try {
      const value = JSON.parse(text);
      setPending(backupOf(readBackup(value, catalog)));
    } catch { setInvalid(true); }
  }
  async function choose(file) {
    if (!file) return;
    try { preview(await file.text()); }
    catch { setInvalid(true); setPending(null); }
    input.current.value = '';
  }
  function importDevice() {
    try { preview(JSON.stringify(backupOf(readDeviceWorkshop()))); }
    catch { setInvalid(true); }
  }
  return <Modal title={t('account')} t={t} onClose={onClose}>
    {account.user ? <div className="signed-account"><Cloud size={22}/><div><strong>{t('connected')}</strong><small>{account.user.email}</small></div><button className="text-button" onClick={account.logout}>{t('signOut')}</button></div> : <GoogleAccess account={account} t={t}/>}
    <div className="device-lead">{account.user ? <Cloud size={25}/> : <HardDrive size={25}/>}<p>{t(account.user ? 'syncHint' : 'deviceHint')}</p></div>
    <input type="file" hidden accept=".json,application/json" ref={input} onChange={e => choose(e.target.files[0])}/>
    {invalid && <p role="alert" className="form-error">{t('invalidBackup')}</p>}
    {pending ? <><p>{account.user ? t('cloudImportConfirm') + ' ' + account.user.email : t('importConfirm')}</p><p className="form-hint">{format(Object.keys(pending.workshop.stock).length)} · {t('inventoryItems')}<br/>{format(Object.keys(pending.workshop.saved).length)} · {t('saved')}<br/>{format(Object.keys(pending.workshop.lines).length)} · {t('lines')}</p><div className="modal-actions">
      <button className="button secondary" onClick={() => setPending(null)}>{t('cancel')}</button>
      <button className="button primary" onClick={async () => { if (await workshop.change({ type: 'import', file: pending })) onImport(); }}>{t('confirm')}</button>
    </div></> : <><div className="modal-actions"><button className="button secondary" onClick={download}><Download size={16}/>{t('exportData')}</button><button className="button primary" onClick={() => input.current.click()}><Upload size={16}/>{t('importData')}</button></div>
      {account.user && <button className="text-button copy-device" onClick={importDevice}>{t('copyLocal')}</button>}
      <details className="paste-copy"><summary>{t('pasteBackup')}</summary><label className="form-label">JSON<textarea rows={4} className="form-input" value={pasted} onChange={e => setPasted(e.target.value)} spellCheck={false}/></label>
        <button className="button secondary" disabled={!pasted.trim()} onClick={() => preview(pasted)}>{t('confirm')}</button></details></>}
  </Modal>;
}
