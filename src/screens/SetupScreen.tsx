import { useState } from 'react';
import { createCase, hashPin } from '../db';

// Completed by the repat desk when an escort is assigned a repatriation.
// These details auto-populate the assessment header and the PDF.

const FIELDS = [
  { key: 'patientName', label: 'Patient name', type: 'text' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'homeAddress', label: 'Home address', type: 'text' },
  { key: 'paxMobile', label: 'Pax mobile no.', type: 'tel' },
  { key: 'healixRef', label: 'Healix file reference number', type: 'text' },
  { key: 'escortName', label: 'Escort name', type: 'text' },
] as const;

type Details = Record<(typeof FIELDS)[number]['key'], string>;

export default function SetupScreen({ onCreated }: { onCreated: () => void }) {
  const [details, setDetails] = useState<Details>({
    patientName: '',
    dob: '',
    homeAddress: '',
    paxMobile: '',
    healixRef: '',
    escortName: '',
  });
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    for (const f of FIELDS) {
      if (!details[f.key].trim()) {
        setError(`Please complete: ${f.label}`);
        return;
      }
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4–6 digits.');
      return;
    }
    if (pin !== pinConfirm) {
      setError('PINs do not match.');
      return;
    }
    setSaving(true);
    await createCase({ ...details, pinHash: await hashPin(pin) });
    onCreated();
  };

  return (
    <div className="screen setup-screen">
      <header className="app-header">
        <h1>Repatriation Documentation</h1>
        <p className="subtitle">New case setup — completed by the repatriation desk</p>
      </header>
      <form className="setup-form" onSubmit={submit}>
        <section className="form-section">
          <h2 className="section-title">Patient details</h2>
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label className="field-label" htmlFor={f.key}>
                {f.label}
              </label>
              <input
                id={f.key}
                className="field-input"
                type={f.type}
                value={details[f.key]}
                onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
              />
            </div>
          ))}
        </section>
        <section className="form-section">
          <h2 className="section-title">Escort access PIN</h2>
          <p className="field-note">
            Set a 4–6 digit PIN and provide it to the escort with the device. The PIN unlocks this
            case only.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="pin">
              PIN
            </label>
            <input
              id="pin"
              className="field-input pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="pinConfirm">
              Confirm PIN
            </label>
            <input
              id="pinConfirm"
              className="field-input pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </section>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? 'Creating…' : 'Create case'}
        </button>
      </form>
    </div>
  );
}
