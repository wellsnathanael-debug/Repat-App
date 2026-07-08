import type { TabDef } from './types';
import { repatRecord } from './repatRecord';
import { handover } from './handover';

// Full specification of the "Pre repatriation assessment at origin" tab.
// Patient details (name, DOB, address, mobile, Healix ref, escort) are not
// fields here — they auto-populate from the case record into the header.

export const preRepatAssessment: TabDef = {
  id: 'pre-repat-assessment',
  title: 'Pre repatriation assessment at origin',
  shortTitle: 'Pre-repat assessment',
  sections: [
    {
      id: 'diagnosis',
      title: 'Diagnosis',
      fields: [{ id: 'diagnosis', type: 'text' }],
    },
    {
      id: 'history-treatment',
      title: 'History and treatment abroad',
      fields: [{ id: 'historyTreatment', type: 'text' }],
    },
    {
      id: 'allergies',
      title: 'Allergies',
      fields: [{ id: 'allergies', type: 'text' }],
    },
    {
      id: 'pmh',
      title: 'Past Medical History',
      fields: [{ id: 'pastMedicalHistory', type: 'text' }],
    },
    {
      id: 'assessment-at-origin',
      title: 'Assessment at origin',
      major: true,
      fields: [
        {
          id: 'note-utc',
          type: 'note',
          text: 'All timings to be in UTC for the duration of repatriation.',
        },
        {
          id: 'note-na',
          type: 'note',
          text:
            'Please complete this form based upon the in person medical escort’s assessment. ' +
            'If a section is not relevant to the specific patient please tick the N/A box.',
        },
      ],
    },
    {
      id: 'assessment-datetime',
      title: 'Date and time of assessment',
      fields: [{ id: 'assessmentDateTime', type: 'datetime', label: 'Date and time (UTC)' }],
    },
    {
      id: 'patient-location',
      title: 'Patient location',
      fields: [{ id: 'patientLocation', type: 'text' }],
    },
    {
      id: 'cardiovascular',
      title: 'Cardiovascular',
      fields: [
        { id: 'cvBP', type: 'text', label: 'BP' },
        { id: 'cvHR', type: 'text', label: 'HR' },
        { id: 'cvTemp', type: 'text', label: 'Temp' },
        { id: 'cvVTE', type: 'text', label: 'Venous thromboembolism risk assessment' },
        { id: 'cvAdditional', type: 'text', label: 'Additional information' },
      ],
    },
    {
      id: 'respiratory',
      title: 'Respiratory',
      fields: [
        { id: 'respRR', type: 'text', label: 'RR' },
        { id: 'respSpO2', type: 'text', label: 'SpO2 and O2 requirements' },
        { id: 'respDyspnoea', type: 'text', label: 'Dyspnoea at rest or on exertion' },
        { id: 'respCough', type: 'textWithNA', label: 'Cough/respiratory symptoms' },
        { id: 'respInhalers', type: 'textWithNA', label: 'Inhalers/nebulisers' },
        { id: 'respAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'cns',
      title: 'CNS',
      fields: [
        { id: 'cnsGCS', type: 'text', label: 'GCS' },
        { id: 'cnsPupils', type: 'textWithNA', label: 'Pupils' },
        { id: 'cnsLimbDeficits', type: 'textWithNA', label: 'Limb deficits' },
        {
          id: 'cnsAdditional',
          type: 'textWithNA',
          label: 'Additional information — if GCS <15/15 please elaborate on this',
        },
      ],
    },
    {
      id: 'gastrointestinal',
      title: 'Gastrointestinal',
      fields: [
        { id: 'giEating', type: 'text', label: 'Eating and drinking' },
        { id: 'giSpecialDiet', type: 'textWithNA', label: 'Special diet?' },
        { id: 'giBowels', type: 'text', label: 'Bowel movements / continence' },
        { id: 'giAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'urinary',
      title: 'Urinary',
      fields: [
        { id: 'uriCatheter', type: 'textWithNA', label: 'Urinary catheter in situ?' },
        { id: 'uriDysuria', type: 'textWithNA', label: 'Any dysuria symptoms?' },
        { id: 'uriAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'musculoskeletal-skin',
      title: 'Muscle/skeletal/Skin',
      fields: [
        { id: 'mskWounds', type: 'textWithNA', label: 'Wounds and management' },
        { id: 'mskPressureSores', type: 'textWithNA', label: 'Pressure sores' },
        { id: 'mskAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'mobility',
      title: 'Mobility',
      fields: [
        { id: 'mobIndependent', type: 'text', label: 'Is the patient independently mobile?' },
        { id: 'mobADLs', type: 'text', label: 'Are they able to independently manage their ADLs?' },
        { id: 'mobElaborate', type: 'textWithNA', label: 'If not please elaborate' },
        { id: 'mobAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'pain',
      title: 'Pain',
      fields: [
        { id: 'painChest', type: 'textWithNA', label: 'Last episode of chest pain (if applicable)' },
        { id: 'painChronic', type: 'textWithNA', label: 'Chronic pain (cause and pain score)' },
        {
          id: 'painNew',
          type: 'textWithNA',
          label: 'New/acute pain since admission (cause and pain score)',
        },
        { id: 'painAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'medications',
      title: 'Medications list (Drug name/route/dosage/frequency)',
      fields: [
        { id: 'medsList', type: 'text', label: 'Medications list' },
        { id: 'medsAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'psychological',
      title: 'Psychological',
      fields: [
        { id: 'psychPMH', type: 'textWithNA', label: 'Relevant PMH' },
        { id: 'psychNewDiagnosis', type: 'textWithNA', label: 'Any new diagnosis' },
        { id: 'psychAdditional', type: 'textWithNA', label: 'Additional information' },
      ],
    },
    {
      id: 'labs-imaging',
      title: 'Lab tests/Imaging',
      fields: [
        { id: 'labsAdditional', type: 'textWithNA', label: 'Additional information' },
        {
          id: 'note-reports',
          type: 'note',
          text: 'Please add any new medical reports provided by the hospital to the Medical reports / Uploads section.',
        },
      ],
    },
    {
      id: 'pre-repat-checks',
      title: 'Pre repatriation checks',
      fields: [
        {
          id: 'checkPassports',
          type: 'yesNoNA',
          label: 'Does the patient / travel companion(s) have their passports',
        },
        {
          id: 'checkMeeting',
          type: 'yesNoNA',
          label: 'Meeting time/place confirmed for day of repatriation',
        },
        {
          id: 'checkOverview',
          type: 'yesNoNA',
          label: 'Repatriation overview discussed with patient',
        },
        {
          id: 'checkHomeVsHospital',
          type: 'textWithNA',
          label: 'Home vs Hospital admission in home country — discussed with patient',
        },
        { id: 'checkAdditional', type: 'textWithNA', label: 'Additional info' },
      ],
    },
    {
      id: 'still-admitted',
      title: 'If still admitted overseas',
      sectionNA: true,
      fields: [
        {
          id: 'admDoctorAware',
          type: 'yesNoNA',
          label: 'Treating Doctor/RNs aware of discharge/repat plan',
        },
        { id: 'admMedsReady', type: 'yesNoNA', label: 'Medications ready for discharge' },
        {
          id: 'admDischargeDocs',
          type: 'yesNoNA',
          label: 'Copies of discharge summary and imaging available ready for discharge',
        },
        {
          id: 'admLuggage',
          type: 'yesNoNA',
          label: 'Patient’s luggage/belongings with patient',
        },
        { id: 'admAdditional', type: 'text', label: 'Additional information' },
      ],
    },
    {
      id: 'additional-info',
      title: 'Any additional relevant information',
      fields: [{ id: 'anyAdditional', type: 'textWithNA' }],
    },
  ],
};

export const tabs: TabDef[] = [
  preRepatAssessment,
  repatRecord,
  handover,
  { id: 'uploads', title: 'Medical reports / Uploads', custom: 'uploads', sections: [] },
];
