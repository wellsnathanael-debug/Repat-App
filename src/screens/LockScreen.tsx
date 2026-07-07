import { useState } from 'react';
import { hashPin, type CaseRecord } from '../db';

export default function LockScreen({
  caseRecord,
  onUnlocked,
}: {
  caseRecord: CaseRecord;
  onUnlocked: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((await hashPin(pin)) === caseRecord.pinHash) {
      onUnlocked();
    } else {
      setError('Incorrect PIN.');
      setPin('');
    }
  };

  return (
    <div className="screen lock-screen">
      <header className="app-header">
        <h1>Repatriation Documentation</h1>
        <p className="subtitle">
          Case: {caseRecord.healixRef} — {caseRecord.patientName}
        </p>
      </header>
      <form className="lock-form" onSubmit={submit}>
        <label className="field-label" htmlFor="unlock-pin">
          Enter PIN to unlock
        </label>
        <input
          id="unlock-pin"
          className="field-input pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          autoFocus
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''));
            setError('');
          }}
        />
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pin.length < 4}>
          Unlock
        </button>
      </form>
    </div>
  );
}
