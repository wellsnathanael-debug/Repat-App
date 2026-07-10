import { useEffect, useState } from 'react';
import { listFiles, type CaseRecord, type FileRecord } from '../db';

// "Mission details" — the escort's one-stop shop for the logistics the repat
// desk entered at setup: flight itinerary, hotel, travel documents. Clinical
// content lives on the assessment tabs; medical reports in Uploads.

export default function MissionTab({ caseRecord }: { caseRecord: CaseRecord }) {
  const [travelDocs, setTravelDocs] = useState<FileRecord[] | null>(null);

  useEffect(() => {
    listFiles().then((files) => setTravelDocs(files.filter((f) => f.category === 'travel')));
  }, []);

  const open = (file: FileRecord) => {
    const url = URL.createObjectURL(file.data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="form">
      <section className="form-section">
        <h2 className="section-title">Flight itinerary</h2>
        {caseRecord.flightItinerary.trim() ? (
          <p className="mission-text">{caseRecord.flightItinerary}</p>
        ) : (
          <p className="field-hint">No flight itinerary was added by the repatriation desk.</p>
        )}
      </section>

      <section className="form-section">
        <h2 className="section-title">Hotel details</h2>
        {caseRecord.hotelDetails.trim() ? (
          <p className="mission-text">{caseRecord.hotelDetails}</p>
        ) : (
          <p className="field-hint">No hotel details were added by the repatriation desk.</p>
        )}
      </section>

      <section className="form-section">
        <h2 className="section-title">Travel documents</h2>
        {travelDocs === null ? (
          <div className="loading">Loading…</div>
        ) : travelDocs.length === 0 ? (
          <p className="field-hint">No travel documents on this case.</p>
        ) : (
          <ul className="file-list">
            {travelDocs.map((f) => (
              <li key={f.id}>
                <span className="file-icon">🧳</span>
                <span className="file-name">{f.name}</span>
                <span className="file-size">{(f.data.size / 1024).toFixed(0)} KB</span>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => open(f)}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">Medical reports are in the “Medical reports / Uploads” tab.</p>
      </section>
    </div>
  );
}
