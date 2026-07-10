import { useEffect, useState } from 'react';
import { addFile, deleteFile, listFiles, type FileRecord } from '../db';

// "Medical reports / Uploads" — reports attached by the repat desk at setup
// plus anything the escort adds during the repat (photos of new reports,
// discharge summaries, etc.). Everything is wiped by clear-case.

export default function UploadsTab() {
  const [files, setFiles] = useState<FileRecord[] | null>(null);

  const refresh = () => listFiles().then(setFiles);
  useEffect(() => {
    void refresh();
  }, []);

  const onAdd = async (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      await addFile({
        name: f.name,
        type: f.type || 'application/octet-stream',
        data: f,
        addedBy: 'escort',
        addedAt: new Date().toISOString(),
        category: 'report',
      });
    }
    void refresh();
  };

  const open = (file: FileRecord) => {
    const url = URL.createObjectURL(file.data);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (files === null) return <div className="loading">Loading…</div>;

  return (
    <div className="form">
      <section className="form-section">
        <h2 className="section-title">Medical reports / Uploads</h2>
        <p className="field-note">
          Add any new medical reports provided by the hospital here (photos or PDFs). Reports
          attached by the repatriation desk also appear below. Everything is included in the case
          record and wiped when the case is cleared.
        </p>
        <input
          id="upload-input"
          type="file"
          multiple
          accept="application/pdf,image/*"
          onChange={(e) => {
            void onAdd(e.target.files);
            e.target.value = '';
          }}
        />
        {files.filter((f) => f.category !== 'travel').length === 0 ? (
          <p className="field-hint">No reports on this case yet.</p>
        ) : (
          <ul className="file-list">
            {files
              .filter((f) => f.category !== 'travel')
              .map((f) => (
              <li key={f.id}>
                {f.type.startsWith('image/') ? (
                  <img
                    className="file-thumb"
                    src={URL.createObjectURL(f.data)}
                    alt={f.name}
                    onClick={() => open(f)}
                  />
                ) : (
                  <span className="file-icon">📄</span>
                )}
                <span className="file-name">{f.name}</span>
                <span className="file-size">
                  {(f.data.size / 1024).toFixed(0)} KB · added by {f.addedBy}
                </span>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => open(f)}>
                  Open
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    if (f.id !== undefined && confirm(`Delete ${f.name}?`)) {
                      void deleteFile(f.id).then(refresh);
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="field-hint">
          Travel documents (itineraries, bookings) are on the “Mission details” tab.
        </p>
      </section>
    </div>
  );
}
