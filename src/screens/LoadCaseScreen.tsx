import { useState } from 'react';
import { b64ToBlob, decryptCase } from '../caseCode';
import { createCase, hashPin } from '../db';

// Escort path: paste the case code from the repat desk, open a .repat case
// file, or arrive via a #case= link — then enter the PIN and the patient
// details (plus any pre-filled clinical info and attached reports) populate
// this device.

export default function LoadCaseScreen({
  initialCode,
  onLoaded,
  onBack,
}: {
  initialCode?: string;
  onLoaded: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  const [fileName, setFileName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openCaseFile = async (file: File) => {
    // Accept any file name/extension — desk staff sometimes rename the
    // download (e.g. to .pdf), which doesn't change the contents. Only the
    // contents matter: they must be a case code (starts "RPT1.").
    const text = (await file.text()).replace(/^﻿/, '').trim();
    if (!text.startsWith('RPT1.')) {
      setError(
        'That file doesn’t look like a case file. Use the file exactly as downloaded by the ' +
          'repat desk (named Repat_….repat). Renaming it is fine, but a file that was ' +
          'converted, re-saved or printed to PDF can’t be read — ask the desk to re-send the ' +
          'original download.',
      );
      setFileName('');
      return;
    }
    setCode(text);
    setFileName(file.name);
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const payload = await decryptCase(code, pin);
    if (!payload) {
      setError('Could not load the case — check the code is complete and the PIN is correct.');
      setBusy(false);
      return;
    }
    const attachments = (payload.files ?? []).map((f) => ({
      name: f.name,
      type: f.type,
      data: b64ToBlob(f.dataB64, f.type),
      addedBy: 'desk' as const,
      addedAt: new Date().toISOString(),
    }));
    await createCase(
      { ...payload.details, pinHash: await hashPin(pin) },
      payload.prefills,
      attachments,
    );
    onLoaded();
  };

  return (
    <div className="screen load-screen">
      <header className="app-header main-header">
        <div>
          <h1>Load case</h1>
          <p className="subtitle">Enter the case code and PIN from the repatriation desk</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </header>
      <form className="setup-form" onSubmit={submit}>
        <section className="form-section">
          <div className="field">
            <label className="field-label" htmlFor="case-file">
              Case file (if the desk sent a .repat file)
            </label>
            <input
              id="case-file"
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void openCaseFile(file);
                e.target.value = '';
              }}
            />
            <div className="field-hint">
              Any file name is fine — even if it was renamed, the contents are what matter.
            </div>
            {fileName && <div className="field-hint">Loaded: {fileName}</div>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="case-code">
              Or paste the case code
            </label>
            <textarea
              id="case-code"
              className="field-textarea code-input"
              rows={5}
              value={code}
              placeholder="Paste the case code here (starts with RPT1.)"
              onChange={(e) => {
                setCode(e.target.value);
                setFileName('');
              }}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="load-pin">
              PIN
            </label>
            <input
              id="load-pin"
              className="field-input pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy || !code.trim() || pin.length < 4}
          >
            {busy ? 'Loading…' : 'Load case'}
          </button>
        </section>
      </form>
    </div>
  );
}
