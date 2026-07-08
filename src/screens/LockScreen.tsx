import { useState } from 'react';
import { unlockWithPin, type CaseRecord } from '../db';

// Pre-unlock, the only case information available (or shown) is the Healix
// reference — patient details are encrypted at rest and cannot be displayed
// until the PIN has been entered. Repeated wrong PINs trigger an escalating
// lockout (see db.ts).

export default function LockScreen({
  healixRef,
  onUnlocked,
}: {
  healixRef: string;
  onUnlocked: (caseRecord: CaseRecord) => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await unlockWithPin(pin);
    setBusy(false);
    if (result.ok) {
      onUnlocked(result.caseRecord);
      return;
    }
    setPin('');
    if (result.reason === 'locked') {
      setError(
        `Too many incorrect attempts — try again in ${result.waitSeconds} seconds.`,
      );
    } else {
      setError('Incorrect PIN.');
    }
  };

  return (
    <div className="screen lock-screen">
      <header className="app-header">
        <h1>Repatriation Documentation</h1>
        <p className="subtitle">Case reference: {healixRef || '—'}</p>
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
        <button className="btn btn-primary" type="submit" disabled={busy || pin.length < 4}>
          {busy ? 'Checking…' : 'Unlock'}
        </button>
        <p className="field-hint">
          Patient details are encrypted on this device and only become visible after the correct
          PIN is entered.
        </p>
      </form>
    </div>
  );
}
