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
  {
    key: 'patientLocation',
    label: "Patient's current location (hospital/hotel, ward/room, city)",
    hint: 'Pre-fills “Patient location” on the escort’s assessment — the escort can update it.',
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
  const [travelDocs, setTravelDocs] = useState<File[]>([]);
  const [escortEmail, setEscortEmail] = useState('');
  const [escortEmailConfirm, setEscortEmailConfirm] = useState('');
  const [flightItinerary, setFlightItinerary] = useState('');
  const [hotelDetails, setHotelDetails] = useState('');
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
    const { escortEmail: demoEscortEmail, flightItinerary: fi, hotelDetails: hd, ...rest } = demoDetails;
    setDetails({ ...rest });
    setEscortEmail(demoEscortEmail);
    setEscortEmailConfirm(demoEscortEmail);
    setFlightItinerary(fi);
    setHotelDetails(hd);
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
    // Escort email is optional, but if provided it must be typed twice the
    // same to catch mistypes — it's where the case code gets sent.
    if (escortEmail.trim() || escortEmailConfirm.trim()) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(escortEmail.trim())) {
        setError('Escort email does not look like a valid email address.');
        return false;
      }
      if (escortEmail.trim() !== escortEmailConfirm.trim()) {
        setError('Escort email addresses do not match — please re-check both boxes.');
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

  const fullDetails = () => ({
    ...details,
    escortEmail: escortEmail.trim(),
    flightItinerary,
    hotelDetails,
  });

  const attachmentRecords = (): FileInput[] => {
    const toRecord = (f: File, category: 'report' | 'travel'): FileInput => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      data: f,
      addedBy: 'desk',
      addedAt: new Date().toISOString(),
      category,
    });
    return [
      ...attachments.map((f) => toRecord(f, 'report')),
      ...travelDocs.map((f) => toRecord(f, 'travel')),
    ];
  };

  const saveOnDevice = async () => {
    if (!validate()) return;
    setBusy(true);
    const record = await createCase(fullDetails(), pin, prefills, attachmentRecords());
    onCreated(record);
  };

  const generateCode = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const files: CodeFile[] = [];
      for (const f of attachments) {
        files.push({
          name: f.name,
          type: f.type || 'application/octet-stream',
          dataB64: await blobToB64(f),
          category: 'report',
        });
      }
      for (const f of travelDocs) {
        files.push({
          name: f.name,
          type: f.type || 'application/octet-stream',
          dataB64: await blobToB64(f),
          category: 'travel',
        });
      }
      const code = await encryptCase(
        { details: fullDetails(), prefills, files: files.length ? files : undefined },
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

  // One-click email to the escort: opens the desk's mail client pre-filled.
  // The PIN is deliberately excluded — it must travel separately. Mail
  // clients truncate very long mailto bodies, so large payloads (attachments
  // or a long link) get attach-the-file instructions instead of the link.
  const mailtoHref = () => {
    if (!generated) return '';
    const hasFiles = attachments.length + travelDocs.length > 0;
    const linkFits = !hasFiles && generated.link.length <= 1800;
    const body = [
      `You have been assigned repatriation case ${details.healixRef} (${details.patientName}).`,
      '',
      linkFits
        ? `Open this link on your device, then enter the case PIN:\n${generated.link}`
        : `The encrypted case file (${generated.fileName}) is attached to this email. ` +
          'On your device, open the Repatriation Documentation app, choose "Load case from code", pick the attached file and enter the case PIN.' +
          (hasFiles ? '' : ' (If no file is attached, ask the repat desk to re-send it.)'),
      '',
      'Your PIN will be provided separately — it is never sent in the same message as the case.',
      '',
      'Healix Repatriation Desk',
    ].join('\n');
    return (
      `mailto:${encodeURIComponent(escortEmail.trim())}` +
      `?subject=${encodeURIComponent(`Repatriation case ${details.healixRef}`)}` +
      `&body=${encodeURIComponent(body)}`
    );
  };

  if (generated) {
    const hasFiles = attachments.length + travelDocs.length > 0;
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
          {escortEmail.trim() && (
            <div className="field">
              <label className="field-label">Email the case to {details.escortName}</label>
              <a className="btn btn-primary btn-link" href={mailtoHref()} data-testid="email-escort">
                Email code to escort ({escortEmail.trim()})
              </a>
              <div className="field-hint">
                Opens your email program with everything filled in
                {hasFiles ? ' — attach the downloaded case file before sending' : ''}. The PIN is
                not included: give it to the escort separately (e.g. by phone).
              </div>
            </div>
          )}
          {hasFiles && (
            <div className="field">
              <label className="field-label">
                Encrypted case file ({attachments.length + travelDocs.length} document
                {attachments.length + travelDocs.length > 1 ? 's' : ''} included)
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
          <h2 className="section-title">Escort travel details (optional)</h2>
          <p className="field-note">
            Everything the escort needs in one place — shown on their “Mission details” tab, so
            no separate email of itineraries is needed.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="escortEmail">
              Escort email address (the case code can be emailed here)
            </label>
            <input
              id="escortEmail"
              className="field-input"
              type="email"
              autoComplete="off"
              value={escortEmail}
              onChange={(e) => setEscortEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="escortEmailConfirm">
              Confirm escort email address
            </label>
            <input
              id="escortEmailConfirm"
              className="field-input"
              type="email"
              autoComplete="off"
              value={escortEmailConfirm}
              onChange={(e) => setEscortEmailConfirm(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="flightItinerary">
              Flight itinerary
            </label>
            <textarea
              id="flightItinerary"
              className="field-textarea"
              rows={4}
              placeholder={'e.g. 12 Jul  BA423  ALC → LHR  dep 10:35 arr 12:20\n(one leg per line)'}
              value={flightItinerary}
              onChange={(e) => setFlightItinerary(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="hotelDetails">
              Hotel details
            </label>
            <textarea
              id="hotelDetails"
              className="field-textarea"
              rows={3}
              placeholder="Hotel name, address, booking reference, check-in/out dates"
              value={hotelDetails}
              onChange={(e) => setHotelDetails(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="travel-docs">
              Travel documents (itinerary PDFs, booking confirmations…)
            </label>
            <input
              id="travel-docs"
              type="file"
              multiple
              accept="application/pdf,image/*"
              onChange={(e) => {
                const list = Array.from(e.target.files ?? []);
                if (list.length) setTravelDocs((prev) => [...prev, ...list]);
                e.target.value = '';
              }}
            />
            {travelDocs.length > 0 && (
              <ul className="file-list">
                {travelDocs.map((f, i) => (
                  <li key={i}>
                    <span className="file-name">{f.name}</span>
                    <span className="file-size">{(f.size / 1024).toFixed(0)} KB</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => setTravelDocs(travelDocs.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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
