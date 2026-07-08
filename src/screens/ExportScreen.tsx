import { useEffect, useState } from 'react';
import { clearCase, getAnswers, listFiles, type CaseRecord } from '../db';
import { tabs } from '../schema/preRepatAssessment';
import type { Answers } from '../schema/types';
import { lmwhComplete } from '../components/fields';

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
