import type { TabDef } from './types';

// "Repat record" — covers the whole transfer including ground movements.
// Timestamps auto-record on entry (shown as UK time with UTC alongside) and
// can be edited manually, e.g. when noting times retrospectively.

export const repatRecord: TabDef = {
  id: 'repat-record',
  title: 'Repat record',
  sections: [
    {
      id: 'start-of-repat',
      title: 'Start of repat',
      fields: [
        {
          id: 'note-times',
          type: 'note',
          text:
            'Times are recorded automatically in UK time with UTC shown alongside, and can be ' +
            'edited manually (entered as UK time).',
        },
        { id: 'startOfRepat', type: 'timestamp', label: 'Start of repat (date and time)' },
      ],
    },
    {
      id: 'baseline-vitals',
      title: 'Baseline vital signs',
      fields: [
        { id: 'baseTime', type: 'timestamp', label: 'Time taken' },
        { id: 'baseBP', type: 'text', label: 'BP' },
        { id: 'baseHR', type: 'text', label: 'HR' },
        { id: 'baseRR', type: 'text', label: 'RR' },
        { id: 'baseSpO2', type: 'text', label: 'SpO2 (and O2 if in use)' },
        { id: 'baseTemp', type: 'text', label: 'Temp' },
      ],
    },
    {
      id: 'vitals-log',
      title: 'Vital signs during repat',
      fields: [
        {
          id: 'note-vitals',
          type: 'note',
          text: 'Add an entry each time vital signs are taken, for the duration of the repat.',
        },
        {
          id: 'vitalsLog',
          type: 'repeat',
          addLabel: 'Add vital signs entry',
          columns: [
            { key: 'time', label: 'Time', kind: 'timestamp' },
            { key: 'bp', label: 'BP', kind: 'text' },
            { key: 'hr', label: 'HR', kind: 'text' },
            { key: 'rr', label: 'RR', kind: 'text' },
            { key: 'spo2', label: 'SpO2/O2', kind: 'text' },
            { key: 'temp', label: 'Temp', kind: 'text' },
            { key: 'notes', label: 'Notes', kind: 'text', wide: true },
          ],
        },
      ],
    },
    {
      id: 'medications-given',
      title: 'Medications given',
      fields: [
        {
          id: 'note-meds',
          type: 'note',
          text:
            'The drug box suggests the patient’s own medications (as entered by the repat desk) ' +
            'and the kit bag contents — free text is also accepted.',
        },
        {
          id: 'medsGiven',
          type: 'repeat',
          addLabel: 'Add medication given',
          columns: [
            { key: 'time', label: 'Time', kind: 'timestamp' },
            { key: 'drug', label: 'Drug', kind: 'drug', wide: true },
            { key: 'dose', label: 'Dose/route', kind: 'text' },
            { key: 'notes', label: 'Notes', kind: 'text', wide: true },
          ],
        },
      ],
    },
    {
      id: 'lmwh',
      title: 'Low molecular weight heparin (LMWH)',
      fields: [
        {
          id: 'note-lmwh',
          type: 'note',
          text: 'This section is mandatory — the PDF cannot be exported until it is complete.',
        },
        { id: 'lmwhGiven', type: 'lmwh', label: 'LMWH given during this repatriation?' },
      ],
    },
    {
      id: 'transport-log',
      title: 'Transport log',
      fields: [
        {
          id: 'transportLog',
          type: 'text',
          tall: true,
          label: 'Log of other events and details for the transportation',
          placeholder:
            'e.g. ground transfers, flight details, delays, patient condition en route…',
        },
      ],
    },
  ],
};
