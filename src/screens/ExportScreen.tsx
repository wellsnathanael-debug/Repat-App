import { useState } from 'react';
import { clearCase, getAnswers, type CaseRecord } from '../db';
import { preRepatAssessment } from '../schema/preRepatAssessment';

function pdfFileName(caseRecord: CaseRecord): string {
  const surname = caseRecord.patientName.trim().split(/\s+/).pop() ?? 'Patient';
  const clean = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '');
  const date = new Date().toISOString().slice(0, 10);
  return `Repat_${clean(caseRecord.healixRef)}_${clean(surname)}_${date}.pdf`;
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

  const generatePdf = async (): Promise<File> => {
    // Lazy-load the PDF renderer: it is by far the largest dependency and is
    // only needed at export time. The service worker precaches the chunk, so
    // this still works fully offline.
    const [{ pdf }, { default: AssessmentPdf }] = await Promise.all([
      import('@react-pdf/renderer'),
      import('../pdf/AssessmentPdf'),
    ]);
    const answers = await getAnswers(preRepatAssessment.id);
    const blob = await pdf(<AssessmentPdf caseRecord={caseRecord} answers={answers} />).toBlob();
    return new File([blob], pdfFileName(caseRecord), { type: 'application/pdf' });
  };

  const sharePdf = async () => {
    setBusy(true);
    setMessage('');
    try {
      const file = await generatePdf();
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
      setMessage(`PDF generated: ${file.name}. Send it to the repatriation desk.`);
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
        <section className="form-section">
          <h2 className="section-title">1. Export PDF</h2>
          <p className="field-note">
            Generates a formatted PDF of the completed documentation. On a tablet or phone this
            opens the share sheet so it can be emailed to the repatriation desk; on a computer it
            downloads the file.
          </p>
          <button className="btn btn-primary" onClick={sharePdf} disabled={busy}>
            {busy ? 'Working…' : 'Generate & share PDF'}
          </button>
          {message && <p className="export-message">{message}</p>}
        </section>

        <section className="form-section danger-zone">
          <h2 className="section-title">2. Clear case</h2>
          <p className="field-note">
            Once the repatriation desk has confirmed receipt of the PDF, clear this device for the
            next repatriation. This permanently deletes the patient details and all form entries
            from this device.
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
