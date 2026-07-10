import { useEffect, useState } from 'react';
import type { Answers, FieldValue, TabDef } from '../schema/types';
import { sectionNAKey } from '../schema/types';
import { getAnswers, saveAnswer, type CaseRecord } from '../db';
import { kitBagMedications } from '../schema/kitBag';
import {
  ChoiceField,
  DateTimeField,
  DeskSummaryField,
  LmwhField,
  NoteField,
  RepeatField,
  TextField,
  TextWithNAField,
  TimestampField,
  TransportTimeField,
  YesNoNAField,
} from './fields';

export default function FormRenderer({
  tab,
  caseRecord,
}: {
  tab: TabDef;
  caseRecord: CaseRecord;
}) {
  // Answers are tagged with the tab they belong to: when the tab changes,
  // the tag mismatch puts the form back into the loading state on the very
  // first render — without this, the new tab would briefly render with the
  // previous tab's answers (useEffect only fires after that render).
  const [loaded, setLoaded] = useState<{ tabId: string; answers: Answers } | null>(null);
  const [drugOptions, setDrugOptions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAnswers(tab.id).then((a) => {
      if (cancelled) return;
      // Seed empty fields from the case record the first time the tab opens
      // (e.g. contact tel/email on the handover tab). Values stay editable.
      for (const section of tab.sections) {
        for (const field of section.fields) {
          if (field.seedFrom && a[field.id] === undefined) {
            const seed = caseRecord[field.seedFrom];
            if (seed) {
              a[field.id] = { text: seed };
              void saveAnswer(tab.id, field.id, a[field.id]);
            }
          }
        }
      }
      setLoaded({ tabId: tab.id, answers: a });
    });
    return () => {
      cancelled = true;
    };
  }, [tab.id, caseRecord]);

  // Drug suggestions for 'repeat' fields with a drug column: the patient's
  // own medication list (one per line, entered by the desk or escort on the
  // assessment tab) plus the kit bag contents.
  const needsDrugs = tab.sections.some((s) =>
    s.fields.some((f) => f.columns?.some((c) => c.kind === 'drug')),
  );
  useEffect(() => {
    if (!needsDrugs) return;
    getAnswers('pre-repat-assessment').then((a) => {
      const patientMeds = (a.medsList?.text ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      setDrugOptions([...patientMeds, ...kitBagMedications]);
    });
  }, [needsDrugs, tab.id]);

  if (loaded === null || loaded.tabId !== tab.id) return <div className="loading">Loading…</div>;
  const answers = loaded.answers;

  const update = (fieldId: string, value: FieldValue) => {
    setLoaded((prev) => prev && { ...prev, answers: { ...prev.answers, [fieldId]: value } });
    void saveAnswer(tab.id, fieldId, value);
  };

  // Handover destination: picking Home/Hospital fills the address box from
  // the case record if it's still empty (manual edits are never overwritten).
  const onDestinationChange = (value: FieldValue) => {
    update('destinationType', value);
    const address = answers['destinationAddress']?.text?.trim();
    if (!address) {
      const seed = value.choice === 'home' ? caseRecord.homeAddress : caseRecord.hospitalName;
      if (seed) update('destinationAddress', { text: seed });
    }
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
                drugOptions,
                onChange:
                  field.id === 'destinationType'
                    ? onDestinationChange
                    : (v: FieldValue) => update(field.id, v),
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
                case 'timestamp':
                  return <TimestampField key={field.id} {...props} />;
                case 'choice':
                  return <ChoiceField key={field.id} {...props} />;
                case 'repeat':
                  return <RepeatField key={field.id} {...props} />;
                case 'lmwh':
                  return <LmwhField key={field.id} {...props} />;
                case 'transportTime':
                  return (
                    <TransportTimeField
                      key={field.id}
                      field={field}
                      arrivalIso={answers['arrivalDateTime']?.iso}
                    />
                  );
                case 'deskSummary':
                  return (
                    <DeskSummaryField
                      key={field.id}
                      answers={answers}
                      healixRef={caseRecord.healixRef}
                      escortName={caseRecord.escortName}
                    />
                  );
              }
            })}
          </section>
        );
      })}
    </div>
  );
}
