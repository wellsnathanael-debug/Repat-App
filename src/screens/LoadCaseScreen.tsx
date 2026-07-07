import { useState } from 'react';
import { decryptCase } from '../caseCode';
import { createCase, hashPin } from '../db';

// Escort path: paste the case code from the repat desk (or arrive via a
// #case= link), enter the PIN, and the patient details populate this device.

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
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const details = await decryptCase(code, pin);
    if (!details) {
      setError('Could not load the case — check the code is complete and the PIN is correct.');
      setBusy(false);
      return;
    }
    await createCase({ ...details, pinHash: await hashPin(pin) });
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
            <label className="field-label" htmlFor="case-code">
              Case code
            </label>
            <textarea
              id="case-code"
              className="field-textarea code-input"
              rows={5}
              value={code}
              placeholder="Paste the case code here (starts with RPT1.)"
              onChange={(e) => setCode(e.target.value)}
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
