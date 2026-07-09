import { useState } from 'react';
import QRCode from 'qrcode';
import { createCase, type CasePrefills, type CaseRecord, type FileInput } from '../db';
import { blobToB64, caseLink, encryptCase, type CodeFile } from '../caseCode';
import { DEMO_PIN, demoAttachment, demoDetails, demoPrefills } from '../demoData';

// Completed by the repat desk when an escort is assigned a repatriation.
// Two ways to hand the case to the escort:
//  - "Save on this device" when setting up the escort's own tablet directly.
//  - "Generate case code" to send the (encrypted) details to an escort who
//    is elsewhere; nothing is saved on the desk's machine. With attached
//    reports the case travels as an encrypted .repat file instead of QR/text.

const REQUIRED_FIELDS = [
  { key: 'patientName', label: 'Patient name', type: 'text' },
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'homeAddress', label: 'Home address', type: 'text' },
  { key: 'paxMobile', label: 'Pax mobile no.', type: 'tel' },
  { key: 'healixRef', label: 'Healix file reference number', type: 'text' },
  { key: 'escortName', label: 'Escort name', type: 'text' },
] as const;

const OPTIONAL_FIELDS = [
  { key: 'email', label: 'Patient/NOK email address (for handover)', type: 'email' },
  { key: 'hospitalName', label: 'Destination hospital name (if applicable)', type: 'text' },
] as const;

const CLINICAL_FIELDS: Array<{ key: keyof CasePrefills; label: string; hint?: string }> = [
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'historyTreatment', label: 'History and treatment abroad' },
  { key: 'allergies', label: 'Allergies' },
  { key: 'pastMedicalHistory', label: 'Past Medical History' },
  {
    key: 'medications',
    label: 'Current medications',
    hint: 'One per line (drug/route/dosage/frequency) — these also appear in the escort’s “Medications given” dropdown.',
  },
];

type Details = Record<
  (typeof REQUIRED_FIELDS)[number]['key'] | (typeof OPTIONAL_FIELDS)[number]['key'],
  string
>;

export default function SetupScreen({
  onCreated,
  onBack,
}: {
  onCreated: (record: CaseRecord) => void;
  onBack: () => void;
}) {
  const [details, setDetails] = useState<Details>({
    patientName: '',
    dob: '',
    homeAddress: '',
    paxMobile: '',
    healixRef: '',
    escortName: '',
    email: '',
    hospitalName: '',
  });
  const [prefills, setPrefills] = useState<CasePrefills>({});
  const [attachments, setAttachments] = useState<File[]>([]);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState<{
    code: string;
    link: string;
    qr: string | null;
    fileName: string;
  } | null>(null);
  const [copied, setCopied] = useState('');
  const [demoHint, setDemoHint] = useState('');

  // Demo layer for presentations: fills the whole form with a clearly-fake
  // patient (watermarked sample report included) so the desk-side flow can be
  // shown without typing. The presenter proceeds exactly as the desk would.
  const fillDemo = async () => {
    setDetails({ ...demoDetails });
    setPrefills({ ...demoPrefills });
    setPin(DEMO_PIN);
    setPinConfirm(DEMO_PIN);
    const report = await demoAttachment();
    setAttachments(report ? [new File([report.data], report.name, { type: report.type })] : []);
    setDemoHint(`Demo data loaded — fictitious patient. Demo PIN: ${DEMO_PIN}`);
  };

  const validate = (): boolean => {
    setError('');
    for (const f of REQUIRED_FIELDS) {
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

  const attachmentRecords = (): FileInput[] =>
    attachments.map((f) => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      data: f,
      addedBy: 'desk',
      addedAt: new Date().toISOString(),
    }));

  const saveOnDevice = async () => {
    if (!validate()) return;
    setBusy(true);
    const record = await createCase(details, pin, prefills, attachmentRecords());
    onCreated(record);
  };

  const generateCode = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const files: CodeFile[] = [];
      for (const f of attachments) {
        files.push({ name: f.name, type: f.type || 'application/octet-stream', dataB64: await blobToB64(f) });
      }
      const code = await encryptCase(
        { details, prefills, files: files.length ? files : undefined },
        pin,
      );
      const link = caseLink(code);
      // QR codes and pasted text only work for small payloads; with attached
      // reports the case is handed over as an encrypted file instead.
      const qr = link.length <= 2000 ? await QRCode.toDataURL(link, { width: 320, margin: 2 }) : null;
      const clean = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '');
      setGenerated({ code, link, qr, fileName: `Repat_${clean(details.healixRef)}.repat` });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(''), 2000);
  };

  const downloadCaseFile = () => {
    if (!generated) return;
    const blob = new Blob([generated.code], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generated.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (generated) {
    const hasFiles = attachments.length > 0;
    return (
      <div className="screen setup-screen">
        <header className="app-header">
          <h1>Case {hasFiles ? 'file' : 'code'} ready</h1>
          <p className="subtitle">
            {details.patientName} — {details.healixRef}
          </p>
        </header>
        <section className="form-section">
          <p className="field-note">
            Send the {hasFiles ? 'case file' : 'code or link'} below to the escort (
            {details.escortName}) by email or message — it is encrypted and unreadable without the
            PIN. Give them the PIN separately (e.g. by phone). Nothing has been saved on this
            device.
          </p>
          {hasFiles && (
            <div className="field">
              <label className="field-label">
                Encrypted case file ({attachments.length} report{attachments.length > 1 ? 's' : ''}{' '}
                included)
              </label>
              <button className="btn btn-primary" onClick={downloadCaseFile}>
                Download {generated.fileName}
              </button>
              <div className="field-hint">
                Attach the downloaded file to an email exactly as it is — do not save it as a
                PDF, convert it, or copy its contents into another document. The escort chooses
                “Load case from code”, picks the file and enters the PIN.
              </div>
            </div>
          )}
          {!hasFiles && (
            <>
              <div className="field">
                <label className="field-label">Case code</label>
                <textarea
                  className="field-textarea code-input"
                  rows={5}
                  readOnly
                  value={generated.code}
                />
                <button className="btn btn-secondary" onClick={() => copy(generated.code, 'code')}>
                  {copied === 'code' ? 'Copied ✓' : 'Copy code'}
                </button>
              </div>
              <div className="field">
                <label className="field-label">
                  Or a link that opens the app with the code filled in
                </label>
                <button className="btn btn-secondary" onClick={() => copy(generated.link, 'link')}>
                  {copied === 'link' ? 'Copied ✓' : 'Copy link'}
                </button>
              </div>
              {generated.qr && (
                <div className="field">
                  <label className="field-label">Or scan on the escort's device</label>
                  <img className="qr" src={generated.qr} alt="QR code for the case link" />
                </div>
              )}
            </>
          )}
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
        <div className="demo-row">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => void fillDemo()}>
            Fill with demo patient (fake data, for presentations)
          </button>
          {demoHint && <p className="demo-hint">{demoHint}</p>}
        </div>
        <section className="form-section">
          <h2 className="section-title">Patient details</h2>
          {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((f) => (
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
          <h2 className="section-title">Clinical details (optional)</h2>
          <p className="field-note">
            These pre-fill the escort's assessment form; the escort can still edit them.
          </p>
          {CLINICAL_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label className="field-label" htmlFor={`clin-${f.key}`}>
                {f.label}
              </label>
              <textarea
                id={`clin-${f.key}`}
                className="field-textarea"
                rows={f.key === 'medications' ? 4 : 2}
                value={prefills[f.key] ?? ''}
                onChange={(e) => setPrefills({ ...prefills, [f.key]: e.target.value })}
              />
              {f.hint && <div className="field-hint">{f.hint}</div>}
            </div>
          ))}
        </section>

        <section className="form-section">
          <h2 className="section-title">Medical reports (optional)</h2>
          <p className="field-note">
            Attach reports already on the case (PDF or photos). They appear in the escort's
            “Medical reports / Uploads” tab. With attachments, the case is handed over as an
            encrypted file rather than a QR code.
          </p>
          <input
            id="attachments"
            type="file"
            multiple
            accept="application/pdf,image/*"
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              if (list.length) setAttachments((prev) => [...prev, ...list]);
              e.target.value = '';
            }}
          />
          {attachments.length > 0 && (
            <ul className="file-list">
              {attachments.map((f, i) => (
                <li key={i}>
                  <span className="file-name">{f.name}</span>
                  <span className="file-size">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
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
