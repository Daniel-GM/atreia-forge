import React, { useRef, useState } from 'react';
import { Download, HardDrive, Upload } from 'lucide-react';
import { backupOf, readBackup } from '../shared/backup.js';
import { Modal } from './ui.jsx';

export function DeviceDialog({ catalog, workshop, onClose, onImport, t, format }) {
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
  return <Modal title={t('deviceData')} t={t} onClose={onClose}>
    <div className="device-lead"><HardDrive size={28}/><p>{t('deviceHint')}</p></div>
    <input type="file" hidden accept=".json,application/json" ref={input} onChange={e => choose(e.target.files[0])}/>
    {invalid && <p role="alert" className="form-error">{t('invalidBackup')}</p>}
    {pending ? <><p>{t('importConfirm')}</p><p className="form-hint">{format(Object.keys(pending.workshop.stock).length)} · {t('inventoryItems')}<br/>{format(Object.keys(pending.workshop.saved).length)} · {t('saved')}<br/>{format(Object.keys(pending.workshop.lines).length)} · {t('lines')}</p><div className="modal-actions">
      <button className="button secondary" onClick={() => setPending(null)}>{t('cancel')}</button>
      <button className="button primary" onClick={async () => { if (await workshop.change({ type: 'import', file: pending })) onImport(); }}>{t('confirm')}</button>
    </div></> : <><div className="modal-actions"><button className="button secondary" onClick={download}><Download size={16}/>{t('exportData')}</button><button className="button primary" onClick={() => input.current.click()}><Upload size={16}/>{t('importData')}</button></div>
      <details className="paste-copy"><summary>{t('pasteBackup')}</summary><label className="form-label">JSON<textarea rows={4} className="form-input" value={pasted} onChange={e => setPasted(e.target.value)} spellCheck={false}/></label>
        <button className="button secondary" disabled={!pasted.trim()} onClick={() => preview(pasted)}>{t('confirm')}</button></details></>}
  </Modal>;
}
