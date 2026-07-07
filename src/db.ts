import Dexie, { type EntityTable } from 'dexie';
import type { FieldValue } from './schema/types';

// One active case at a time (single-device workflow). The case record holds
// the patient details entered by the repat desk; answers hold every form
// field, autosaved individually so a crash never loses more than a keystroke.

export interface CaseRecord {
  id: number; // always 1 — single active case
  patientName: string;
  dob: string;
  homeAddress: string;
  paxMobile: string;
  healixRef: string;
  escortName: string;
  pinHash: string;
  createdAt: string;
}

export interface AnswerRecord {
  key: string; // `${tabId}/${fieldId}`
  value: FieldValue;
}

const db = new Dexie('repat-app') as Dexie & {
  cases: EntityTable<CaseRecord, 'id'>;
  answers: EntityTable<AnswerRecord, 'key'>;
};

db.version(1).stores({
  cases: 'id',
  answers: 'key',
});

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`repat-app:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getCase(): Promise<CaseRecord | undefined> {
  return db.cases.get(1);
}

export async function createCase(details: Omit<CaseRecord, 'id' | 'createdAt'>): Promise<void> {
  await db.cases.put({ ...details, id: 1, createdAt: new Date().toISOString() });
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

export async function clearCase(): Promise<void> {
  await db.transaction('rw', db.cases, db.answers, async () => {
    await db.cases.clear();
    await db.answers.clear();
  });
}

export default db;
