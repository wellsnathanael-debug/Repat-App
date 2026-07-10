import { useEffect, useState } from 'react';
import {
  clearCase,
  exportAllAnswers,
  getAnswers,
  listFiles,
  verifyPin,
  type CaseRecord,
} from '../db';
import { blobToB64, encryptCase, type CodeFile } from '../caseCode';
import { tabs } from '../schema/preRepatAssessment';
import type { Answers } from '../schema/types';
import { lmwhComplete } from '../components/fields';
import { flushOutbox, outboxCount, repoAvailable, submitOrQueue } from '../repo';

function fileName(prefix: string, caseRecord: CaseRecord): string {
  const surname = caseRecord.patientName.trim().split(/\s+/).pop() ?? 'Patient';
  const clean = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${clean(caseRecord.healixRef)}_${clean(surname)}_${date}.pdf`;
}

async function collectAnswers(): Promise<Record<string, Answers>> {
  const out: Record<string, Answers> = {};
  for (const tab of tabs) {
    if (!tab.custom && !tab.placeholder) out[tab.id] = await getAnswers(tab.id);
  }
  return out;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function ExportScreen({
  caseRecord,
  onBack,
  onCleared,
}: {
  caseRecord: CaseRecord;
  onBack: () => void;
  onCleared: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');
  const [lmwhOk, setLmwhOk] = useState<boolean | null>(null);

  // Mandatory-field gate: LMWH on the Repat record tab must be complete
  // before either PDF can be exported.
  const checkMandatory = async () => {
    const record = await getAnswers('repat-record');
    setLmwhOk(lmwhComplete(record.lmwhGiven));
  };
  useEffect(() => {
    void checkMandatory();
  }, []);

  // Optional IT-hosted case repository: probe for it, flush any queued
  // submissions (now and whenever connectivity returns).
  const [repoOk, setRepoOk] = useState(false);
  const [queued, setQueued] = useState(0);
  const [repoMsg, setRepoMsg] = useState('');

  const refreshRepo = async () => {
    const flushed = await flushOutbox();
    setQueued(await outboxCount());
    if (flushed > 0) {
      setRepoMsg(`${flushed} queued submission${flushed > 1 ? 's' : ''} sent to the desk repository.`);
    }
  };
  useEffect(() => {
    void repoAvailable().then(setRepoOk);
    void refreshRepo();
    const onOnline = () => void refreshRepo();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  const submitToRepository = async () => {
    setBusy(true);
    setRepoMsg('');
    const record = await getAnswers('repat-record');
    if (!lmwhComplete(record.lmwhGiven)) {
      setLmwhOk(false);
      setRepoMsg('The LMWH section on the Repat record tab is mandatory — complete it before submitting.');
      setBusy(false);
      return;
    }
    try {
      const [fullPdf, handoverPdf] = [await generate('full'), await generate('handover')];
      const toB64 = async (f: File) => (await blobToDataUrl(f)).split(',')[1];
      const result = await submitOrQueue({
        caseRef: caseRecord.healixRef,
        patientName: caseRecord.patientName,
        escortName: caseRecord.escortName,
        submittedAt: new Date().toISOString(),
        data: { caseRecord, answers: await exportAllAnswers() },
        fullPdfB64: await toB64(fullPdf),
        handoverPdfB64: await toB64(handoverPdf),
      });
      setQueued(await outboxCount());
      setExported(true);
      setRepoMsg(
        result === 'sent'
          ? 'Submitted to the desk repository (record, handover letter and structured data).'
          : 'No connection — submission queued on this device and will send automatically when online.',
      );
    } catch (err) {
      setRepoMsg('Submission failed. Please try again.');
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const generate = async (kind: 'full' | 'handover'): Promise<File> => {
    // Lazy-load the PDF renderer: it is by far the largest dependency and is
    // only needed at export time. The service worker precaches the chunk, so
    // this still works fully offline.
    const [{ pdf }, { default: FullRecordPdf }, { default: HandoverPdf }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../pdf/FullRecordPdf'),
      import('../pdf/HandoverPdf'),
    ]);
    const answersByTab = await collectAnswers();
    let doc;
    let name;
    if (kind === 'full') {
      const files = await listFiles();
      const uploads = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          type: f.type,
          addedBy: f.addedBy,
          dataUrl: f.type.startsWith('image/') ? await blobToDataUrl(f.data) : undefined,
        })),
      );
      doc = <FullRecordPdf caseRecord={caseRecord} answersByTab={answersByTab} uploads={uploads} />;
      name = fileName('Repat', caseRecord);
    } else {
      doc = <HandoverPdf caseRecord={caseRecord} answersByTab={answersByTab} />;
      name = fileName('Handover', caseRecord);
    }
    const blob = await pdf(doc).toBlob();
    return new File([blob], name, { type: 'application/pdf' });
  };

  const share = async (kind: 'full' | 'handover') => {
    setBusy(true);
    setMessage('');
    await checkMandatory();
    const record = await getAnswers('repat-record');
    if (!lmwhComplete(record.lmwhGiven)) {
      setLmwhOk(false);
      setMessage(
        'The LMWH section on the Repat record tab is mandatory — complete it before exporting.',
      );
      setBusy(false);
      return;
    }
    try {
      const file = await generate(kind);
      // Web Share API opens the native share sheet (email etc.) on tablets;
      // fall back to a download when unavailable (e.g. desktop browsers).
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: file.name });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
      setExported(true);
      setMessage(
        `PDF generated: ${file.name}. ${
          kind === 'full'
            ? 'Send it to the repatriation desk.'
            : 'Give it to the receiving hospital/GP (and copy the desk if required).'
        }`,
      );
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setMessage('PDF generation failed. Please try again.');
        console.error(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const doClear = async () => {
    setBusy(true);
    await clearCase();
    onCleared();
  };

  // Transfer the whole live case (details, every entry, attachments) to a
  // second escort device as an encrypted .repat file — fully offline
  // (AirDrop/Bluetooth/cable). Requires the case PIN, which also becomes the
  // PIN on the receiving device. Not gated by the LMWH check: transfers
  // happen mid-mission.
  const [transferPin, setTransferPin] = useState('');
  const [transferMsg, setTransferMsg] = useState('');

  const createTransferFile = async () => {
    setBusy(true);
    setTransferMsg('');
    try {
      if (!(await verifyPin(transferPin))) {
        setTransferMsg('Incorrect PIN — enter this case’s PIN to create a transfer file.');
        return;
      }
      const answers = await exportAllAnswers();
      const files: CodeFile[] = [];
      for (const f of await listFiles()) {
        files.push({ name: f.name, type: f.type, dataB64: await blobToB64(f.data) });
      }
      const { id: _id, createdAt: _createdAt, ...details } = caseRecord;
      const code = await encryptCase(
        { details, answers, files: files.length ? files : undefined },
        transferPin,
      );
      const clean = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '');
      const name = `Repat_${clean(caseRecord.healixRef)}_transfer.repat`;
      const file = new File([code], name, { type: 'application/octet-stream' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      }
      setTransferMsg(
        `Transfer file created (${name}). Send it to the other device (AirDrop/Bluetooth works ` +
          'offline); the other escort loads it via “Load case from code” with the same PIN. ' +
          'Only document on one device at a time.',
      );
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setTransferMsg('Could not create the transfer file. Please try again.');
        console.error(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen export-screen">
      <header className="app-header main-header">
        <div>
          <h1>Export &amp; finish</h1>
          <p className="subtitle">
            Case: {caseRecord.healixRef} — {caseRecord.patientName}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={onBack}>
            Back to form
          </button>
        </div>
      </header>

      <div className="export-body">
        {lmwhOk === false && (
          <p className="error export-warning">
            ⚠ The LMWH section on the Repat record tab is incomplete. It is mandatory and blocks
            export.
          </p>
        )}
        <section className="form-section">
          <h2 className="section-title">1. Export PDFs</h2>
          <p className="field-note">
            <strong>Full repat record</strong> — the complete documentation, for the repatriation
            desk / case file. <strong>Handover letter</strong> — a focused clinical summary for
            the receiving hospital or GP (no internal checklists). On a tablet or phone each
            opens the share sheet; on a computer it downloads.
          </p>
          <div className="header-actions">
            <button className="btn btn-primary" onClick={() => share('full')} disabled={busy}>
              {busy ? 'Working…' : 'Full repat record (desk)'}
            </button>
            <button className="btn btn-primary" onClick={() => share('handover')} disabled={busy}>
              {busy ? 'Working…' : 'Handover letter (receiving team)'}
            </button>
          </div>
          {message && <p className="export-message">{message}</p>}
        </section>

        {(repoOk || queued > 0) && (
          <section className="form-section">
            <h2 className="section-title">Submit to desk repository</h2>
            <p className="field-note">
              Sends the full record, handover letter and structured case data to the
              repatriation desk's central repository. If there is no connection, the submission
              is queued on this device and sent automatically when you are back online.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => void submitToRepository()}
              disabled={busy}
              data-testid="submit-repo"
            >
              {busy ? 'Working…' : 'Submit completed case to desk repository'}
            </button>
            {queued > 0 && (
              <p className="field-hint">
                {queued} submission{queued > 1 ? 's' : ''} queued on this device awaiting a
                connection.
              </p>
            )}
            {repoMsg && <p className="export-message">{repoMsg}</p>}
          </section>
        )}

        <section className="form-section">
          <h2 className="section-title">Transfer case to a second escort device</h2>
          <p className="field-note">
            For two-escort missions or a device swap: creates an encrypted transfer file
            containing the whole live case (all entries and reports). Move it to the other device
            — AirDrop or Bluetooth work offline — and the other escort loads it with the same
            PIN. To avoid conflicting records, document on <strong>one device at a time</strong>,
            like a single paper chart.
          </p>
          <div className="field">
            <label className="field-label" htmlFor="transfer-pin">
              Case PIN
            </label>
            <input
              id="transfer-pin"
              className="field-input pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={transferPin}
              onChange={(e) => setTransferPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button
            className="btn btn-secondary"
            onClick={createTransferFile}
            disabled={busy || transferPin.length < 4}
          >
            Create transfer file
          </button>
          {transferMsg && <p className="export-message">{transferMsg}</p>}
        </section>

        <section className="form-section danger-zone">
          <h2 className="section-title">2. Clear case</h2>
          <p className="field-note">
            Once the repatriation desk has confirmed receipt of the PDFs, clear this device for
            the next repatriation. This permanently deletes the patient details, all form entries
            and all uploaded reports from this device.
          </p>
          {!confirmClear ? (
            <button
              className="btn btn-danger"
              onClick={() => setConfirmClear(true)}
              disabled={busy}
            >
              Clear case…
            </button>
          ) : (
            <div className="confirm-clear">
              <p className="error">
                {queued > 0
                  ? `${queued} queued submission${queued > 1 ? 's have' : ' has'} NOT been sent to the desk repository yet — clearing now deletes ${queued > 1 ? 'them' : 'it'} too. `
                  : ''}
                {exported
                  ? 'This will permanently delete all case data from this device. Continue?'
                  : 'No PDF has been exported in this session. Clearing now will permanently delete all case data. Continue anyway?'}
              </p>
              <div className="header-actions">
                <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={doClear} disabled={busy}>
                  Yes, delete everything
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
