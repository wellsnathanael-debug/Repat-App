import Dexie, { type EntityTable } from 'dexie';
import type { FieldValue } from './schema/types';

// One active case at a time (single-device workflow). The case record holds
// the patient details entered by the repat desk; answers hold every form
// field, autosaved individually so a crash never loses more than a keystroke;
// files hold attached medical reports (desk-attached or escort-added).

export interface CaseRecord {
  id: number; // always 1 — single active case
  patientName: string;
  dob: string;
  homeAddress: string;
  paxMobile: string;
  healixRef: string;
  escortName: string;
  /** Contact email for handover (optional, set by the desk). */
  email: string;
  /** Destination hospital name, if known at setup (optional). */
  hospitalName: string;
  pinHash: string;
  createdAt: string;
}

/** Clinical details the desk can pre-fill; they seed the assessment tab. */
export interface CasePrefills {
  diagnosis?: string;
  historyTreatment?: string;
  allergies?: string;
  pastMedicalHistory?: string;
  medications?: string;
}

export interface AnswerRecord {
  key: string; // `${tabId}/${fieldId}`
  value: FieldValue;
}

export interface FileRecord {
  id?: number;
  name: string;
  type: string;
  data: Blob;
  addedBy: 'desk' | 'escort';
  addedAt: string;
}

const db = new Dexie('repat-app') as Dexie & {
  cases: EntityTable<CaseRecord, 'id'>;
  answers: EntityTable<AnswerRecord, 'key'>;
  files: EntityTable<FileRecord, 'id'>;
};

db.version(1).stores({
  cases: 'id',
  answers: 'key',
});

db.version(2).stores({
  cases: 'id',
  answers: 'key',
  files: '++id',
});

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`repat-app:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getCase(): Promise<CaseRecord | undefined> {
  const record = await db.cases.get(1);
  if (!record) return undefined;
  // Cases created before v2 lack the optional fields.
  return { ...record, email: record.email ?? '', hospitalName: record.hospitalName ?? '' };
}

/** Field ids on the assessment tab that desk pre-fills map onto. */
const PREFILL_FIELD_IDS: Record<keyof CasePrefills, string> = {
  diagnosis: 'diagnosis',
  historyTreatment: 'historyTreatment',
  allergies: 'allergies',
  pastMedicalHistory: 'pastMedicalHistory',
  medications: 'medsList',
};

export async function createCase(
  details: Omit<CaseRecord, 'id' | 'createdAt'>,
  prefills?: CasePrefills,
  attachments?: Array<Omit<FileRecord, 'id'>>,
): Promise<void> {
  await db.transaction('rw', db.cases, db.answers, db.files, async () => {
    await db.cases.put({ ...details, id: 1, createdAt: new Date().toISOString() });
    if (prefills) {
      for (const [key, fieldId] of Object.entries(PREFILL_FIELD_IDS)) {
        const text = prefills[key as keyof CasePrefills];
        if (text?.trim()) {
          await db.answers.put({ key: `pre-repat-assessment/${fieldId}`, value: { text } });
        }
      }
    }
    if (attachments) {
      for (const file of attachments) await db.files.add(file);
    }
  });
}

export async function saveAnswer(tabId: string, fieldId: string, value: FieldValue): Promise<void> {
  await db.answers.put({ key: `${tabId}/${fieldId}`, value });
}

export async function getAnswers(tabId: string): Promise<Record<string, FieldValue>> {
  const prefix = `${tabId}/`;
  const rows = await db.answers.where('key').startsWith(prefix).toArray();
  const out: Record<string, FieldValue> = {};
  for (const row of rows) out[row.key.slice(prefix.length)] = row.value;
  return out;
}

export async function listFiles(): Promise<FileRecord[]> {
  return db.files.toArray();
}

export async function addFile(file: Omit<FileRecord, 'id'>): Promise<void> {
  await db.files.add(file);
}

export async function deleteFile(id: number): Promise<void> {
  await db.files.delete(id);
}

export async function clearCase(): Promise<void> {
  await db.transaction('rw', db.cases, db.answers, db.files, async () => {
    await db.cases.clear();
    await db.answers.clear();
    await db.files.clear();
  });
}

export default db;
