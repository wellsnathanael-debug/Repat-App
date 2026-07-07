import { useEffect, useState } from 'react';
import type { Answers, FieldValue, TabDef } from '../schema/types';
import { sectionNAKey } from '../schema/types';
import { getAnswers, saveAnswer } from '../db';
import { DateTimeField, NoteField, TextField, TextWithNAField, YesNoNAField } from './fields';

export default function FormRenderer({ tab }: { tab: TabDef }) {
  const [answers, setAnswers] = useState<Answers | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAnswers(tab.id).then((a) => {
      if (!cancelled) setAnswers(a);
    });
    return () => {
      cancelled = true;
    };
  }, [tab.id]);

  if (answers === null) return <div className="loading">Loading…</div>;

  const update = (fieldId: string, value: FieldValue) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    void saveAnswer(tab.id, fieldId, value);
  };

  return (
    <div className="form">
      {tab.sections.map((section) => {
        const naKey = sectionNAKey(section.id);
        const sectionNA = section.sectionNA ? (answers[naKey]?.na ?? false) : false;
        return (
          <section key={section.id} className={`form-section ${section.major ? 'major' : ''}`}>
            <div className="section-header">
              <h2 className={section.major ? 'section-title-major' : 'section-title'}>
                {section.title}
              </h2>
              {section.sectionNA && (
                <label className={`na-toggle section-na ${sectionNA ? 'checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={sectionNA}
                    onChange={(e) => {
                      const na = e.target.checked;
                      update(naKey, { na });
                      if (na) {
                        // Blank out every field in the section, as specified.
                        for (const f of section.fields) update(f.id, {});
                      }
                    }}
                  />
                  N/A — section not applicable
                </label>
              )}
            </div>
            {section.fields.map((field) => {
              const value = answers[field.id] ?? {};
              const props = {
                field,
                value,
                disabled: sectionNA,
                onChange: (v: FieldValue) => update(field.id, v),
              };
              switch (field.type) {
                case 'note':
                  return <NoteField key={field.id} field={field} />;
                case 'text':
                  return <TextField key={field.id} {...props} />;
                case 'textWithNA':
                  return <TextWithNAField key={field.id} {...props} />;
                case 'yesNoNA':
                  return <YesNoNAField key={field.id} {...props} />;
                case 'datetime':
                  return <DateTimeField key={field.id} {...props} />;
              }
            })}
          </section>
        );
      })}
    </div>
  );
}
