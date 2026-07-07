import { useState } from 'react';
import QRCode from 'qrcode';
import { createCase, hashPin } from '../db';
import { caseLink, encryptCase } from '../caseCode';

// Completed by the repat desk when an escort is assigned a repatriation.
// Two ways to hand the case to the escort:
//  - "Save on this device" when setting up the escort's own tablet directly.
//  - "Generate case code" to send the (encrypted) details to an escort who
//    is elsewhere; nothing is saved on the desk's machine.

const FIELDS = [
  { key: 'patientName', label: 'Patient name', type: 'text' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'homeAddress', label: 'Home address', type: 'text' },
  { key: 'paxMobile', label: 'Pax mobile no.', type: 'tel' },
  { key: 'healixRef', label: 'Healix file reference number', type: 'text' },
  { key: 'escortName', label: 'Escort name', type: 'text' },
] as const;

type Details = Record<(typeof FIELDS)[number]['key'], string>;

export default function SetupScreen({
  onCreated,
  onBack,
}: {
  onCreated: () => void;
  onBack: () => void;
}) {
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
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{ code: string; link: string; qr: string } | null>(
    null,
  );
  const [copied, setCopied] = useState('');

  const validate = (): boolean => {
    setError('');
    for (const f of FIELDS) {
      if (!details[f.key].trim()) {
        setError(`Please complete: ${f.label}`);
        return false;
      }
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setError('PIN must be 4–6 digits.');
      return false;
    }
    if (pin !== pinConfirm) {
      setError('PINs do not match.');
      return false;
    }
    return true;
  };

  const saveOnDevice = async () => {
    if (!validate()) return;
    setBusy(true);
    await createCase({ ...details, pinHash: await hashPin(pin) });
    onCreated();
  };

  const generateCode = async () => {
    if (!validate()) return;
    setBusy(true);
    const code = await encryptCase(details, pin);
    const link = caseLink(code);
    const qr = await QRCode.toDataURL(link, { width: 320, margin: 2 });
    setGenerated({ code, link, qr });
    setBusy(false);
  };

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(''), 2000);
  };

  if (generated) {
    return (
      <div className="screen setup-screen">
        <header className="app-header">
          <h1>Case code ready</h1>
          <p className="subtitle">
            {details.patientName} — {details.healixRef}
          </p>
        </header>
        <section className="form-section">
          <p className="field-note">
            Send the code or link below to the escort ({details.escortName}) by email or message —
            it is encrypted and unreadable without the PIN. Give them the PIN separately (e.g. by
            phone). Nothing has been saved on this device.
          </p>
          <div className="field">
            <label className="field-label">Case code</label>
            <textarea className="field-textarea code-input" rows={5} readOnly value={generated.code} />
            <button className="btn btn-secondary" onClick={() => copy(generated.code, 'code')}>
              {copied === 'code' ? 'Copied ✓' : 'Copy code'}
            </button>
          </div>
          <div className="field">
            <label className="field-label">Or a link that opens the app with the code filled in</label>
            <button className="btn btn-secondary" onClick={() => copy(generated.link, 'link')}>
              {copied === 'link' ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
          <div className="field">
            <label className="field-label">Or scan on the escort's device</label>
            <img className="qr" src={generated.qr} alt="QR code for the case link" />
          </div>
        </section>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setGenerated(null)}>
            Back to details
          </button>
          <button className="btn btn-primary" onClick={onBack}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen setup-screen">
      <header className="app-header main-header">
        <div>
          <h1>New case setup</h1>
          <p className="subtitle">Completed by the repatriation desk</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </header>
      <form className="setup-form" onSubmit={(e) => e.preventDefault()}>
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
            Set a 4–6 digit PIN (6 digits recommended). The escort needs it to open the case;
            share it with them separately from the case code.
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
        <div className="header-actions">
          <button className="btn btn-primary" onClick={generateCode} disabled={busy}>
            {busy ? 'Working…' : 'Generate case code for escort'}
          </button>
          <button className="btn btn-secondary" onClick={saveOnDevice} disabled={busy}>
            Save case on this device
          </button>
        </div>
      </form>
    </div>
  );
}
