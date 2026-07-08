import Dexie, { type EntityTable } from 'dexie';
import type { FieldValue } from './schema/types';
import {
  decryptBytes,
  decryptJson,
  deriveDetachedKey,
  encryptBytes,
  encryptJson,
  lockSession,
  newSalt,
  startSession,
  type Encrypted,
} from './crypto';

// One active case at a time (single-device workflow). All case content is
// encrypted at rest with a key derived from the case PIN (see crypto.ts):
// only the `meta` record is plaintext, and it holds no patient-identifiable
// data — just the Healix reference, the key salt and PIN-throttling state.
// The PIN is never stored; a correct PIN is proven by the case record
// decrypting successfully (AES-GCM authentication).

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
  createdAt: string;
}

export type CaseDetails = Omit<CaseRecord, 'id' | 'createdAt'>;

/** Clinical details the desk can pre-fill; they seed the assessment tab. */
export interface CasePrefills {
  diagnosis?: string;
  historyTreatment?: string;
  allergies?: string;
  pastMedicalHistory?: string;
  medications?: string;
}

export interface FileInput {
  name: string;
  type: string;
  data: Blob;
  addedBy: 'desk' | 'escort';
  addedAt: string;
}

export interface FileRecord extends FileInput {
  id: number;
}

export interface MetaRecord {
  id: number; // always 1
  salt: Uint8Array;
  healixRef: string;
  failedAttempts: number;
  /** Epoch ms until which unlocking is refused after repeated failures. */
  lockUntil: number;
}

interface EncRow {
  id?: number;
  key?: string;
  iv: Uint8Array;
  ct: ArrayBuffer;
}

/** Encrypted file row: header = encrypted metadata JSON, iv/ct = the bytes. */
interface EncFileRow {
  id?: number;
  iv: Uint8Array;
  ct: ArrayBuffer;
  header: Encrypted;
}

/** Legacy (pre-encryption) plaintext case record, migrated on first unlock. */
interface LegacyCaseRow extends Partial<CaseRecord> {
  id: number;
  pinHash?: string;
}

const db = new Dexie('repat-app') as Dexie & {
  cases: EntityTable<EncRow & { id: number }, 'id'>;
  answers: EntityTable<EncRow & { key: string }, 'key'>;
  files: EntityTable<EncFileRow, 'id'>;
  meta: EntityTable<MetaRecord, 'id'>;
};

db.version(1).stores({ cases: 'id', answers: 'key' });
db.version(2).stores({ cases: 'id', answers: 'key', files: '++id' });
db.version(3).stores({ cases: 'id', answers: 'key', files: '++id', meta: 'id' });

async function legacyHashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`repat-app:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Plaintext state readable before unlock. No patient-identifiable data. */
export async function getMeta(): Promise<{ healixRef: string; lockUntil: number } | undefined> {
  const meta = await db.meta.get(1);
  if (meta) return { healixRef: meta.healixRef, lockUntil: meta.lockUntil };
  // Legacy plaintext case from before at-rest encryption?
  const legacy = (await db.cases.get(1)) as unknown as LegacyCaseRow | undefined;
  if (legacy && legacy.pinHash) return { healixRef: legacy.healixRef ?? '', lockUntil: 0 };
  return undefined;
}

const THROTTLE_AFTER = 5;
const THROTTLE_BASE_MS = 30_000;

async function recordFailedAttempt(): Promise<number> {
  const meta = await db.meta.get(1);
  if (!meta) return 0;
  const failedAttempts = meta.failedAttempts + 1;
  const over = failedAttempts - THROTTLE_AFTER;
  const lockUntil = over >= 0 ? Date.now() + THROTTLE_BASE_MS * 2 ** Math.min(over, 5) : 0;
  await db.meta.put({ ...meta, failedAttempts, lockUntil });
  return lockUntil;
}

export type UnlockResult =
  | { ok: true; caseRecord: CaseRecord }
  | { ok: false; reason: 'wrong-pin' | 'locked'; waitSeconds?: number };

export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  const meta = await db.meta.get(1);

  if (!meta) {
    // Legacy plaintext case: verify against the old pinHash, then migrate
    // everything to encrypted storage under this PIN.
    const legacy = (await db.cases.get(1)) as unknown as LegacyCaseRow | undefined;
    if (legacy?.pinHash) {
      if ((await legacyHashPin(pin)) !== legacy.pinHash) return { ok: false, reason: 'wrong-pin' };
      return { ok: true, caseRecord: await migrateLegacy(legacy, pin) };
    }
    return { ok: false, reason: 'wrong-pin' };
  }

  if (meta.lockUntil > Date.now()) {
    return {
      ok: false,
      reason: 'locked',
      waitSeconds: Math.ceil((meta.lockUntil - Date.now()) / 1000),
    };
  }

  await startSession(pin, meta.salt);
  try {
    const row = await db.cases.get(1);
    if (!row) throw new Error('missing case row');
    const caseRecord = await decryptJson<CaseRecord>(row);
    await db.meta.put({ ...meta, failedAttempts: 0, lockUntil: 0 });
    return { ok: true, caseRecord };
  } catch {
    lockSession();
    const lockUntil = await recordFailedAttempt();
    if (lockUntil > Date.now()) {
      return {
        ok: false,
        reason: 'locked',
        waitSeconds: Math.ceil((lockUntil - Date.now()) / 1000),
      };
    }
    return { ok: false, reason: 'wrong-pin' };
  }
}

async function migrateLegacy(legacy: LegacyCaseRow, pin: string): Promise<CaseRecord> {
  const caseRecord: CaseRecord = {
    id: 1,
    patientName: legacy.patientName ?? '',
    dob: legacy.dob ?? '',
    homeAddress: legacy.homeAddress ?? '',
    paxMobile: legacy.paxMobile ?? '',
    healixRef: legacy.healixRef ?? '',
    escortName: legacy.escortName ?? '',
    email: legacy.email ?? '',
    hospitalName: legacy.hospitalName ?? '',
    createdAt: legacy.createdAt ?? new Date().toISOString(),
  };
  const salt = newSalt();
  await startSession(pin, salt);

  const plainAnswers = (await db.answers.toArray()) as unknown as Array<{
    key: string;
    value?: FieldValue;
  }>;
  const plainFiles = (await db.files.toArray()) as unknown as Array<Partial<FileInput> & { id: number }>;

  await db.transaction('rw', db.cases, db.answers, db.files, db.meta, async () => {
    await db.meta.put({ id: 1, salt, healixRef: caseRecord.healixRef, failedAttempts: 0, lockUntil: 0 });
    await db.cases.put({ id: 1, ...(await encryptJson(caseRecord)) });
    for (const row of plainAnswers) {
      if (row.value !== undefined) {
        await db.answers.put({ key: row.key, ...(await encryptJson(row.value)) });
      }
    }
    for (const row of plainFiles) {
      if (row.data instanceof Blob) {
        await db.files.put({
          id: row.id,
          ...(await encryptFilePayload({
            name: row.name ?? 'file',
            type: row.type ?? 'application/octet-stream',
            data: row.data,
            addedBy: row.addedBy ?? 'desk',
            addedAt: row.addedAt ?? new Date().toISOString(),
          })),
        });
      }
    }
  });
  return caseRecord;
}

/** True if `pin` is the case PIN (checked by decryption, session untouched). */
export async function verifyPin(pin: string): Promise<boolean> {
  const meta = await db.meta.get(1);
  const row = await db.cases.get(1);
  if (!meta || !row) return false;
  try {
    const key = await deriveDetachedKey(pin, meta.salt);
    await decryptJson<CaseRecord>(row, key);
    return true;
  } catch {
    return false;
  }
}

/** Field ids on the assessment tab that desk pre-fills map onto. */
const PREFILL_FIELD_IDS: Record<keyof CasePrefills, string> = {
  diagnosis: 'diagnosis',
  historyTreatment: 'historyTreatment',
  allergies: 'allergies',
  pastMedicalHistory: 'pastMedicalHistory',
  medications: 'medsList',
};

// Files are stored as one encrypted JSON header (name/type/metadata) plus the
// encrypted raw bytes.
interface FileHeader {
  name: string;
  type: string;
  addedBy: 'desk' | 'escort';
  addedAt: string;
}

async function encryptFilePayload(file: FileInput): Promise<Omit<EncFileRow, 'id'>> {
  const header = await encryptJson({
    name: file.name,
    type: file.type,
    addedBy: file.addedBy,
    addedAt: file.addedAt,
  });
  const body = await encryptBytes(await file.data.arrayBuffer());
  return { iv: body.iv, ct: body.ct, header };
}

export async function createCase(
  details: CaseDetails,
  pin: string,
  prefills?: CasePrefills,
  attachments?: FileInput[],
  answersDump?: Record<string, FieldValue>,
): Promise<CaseRecord> {
  const caseRecord: CaseRecord = { ...details, id: 1, createdAt: new Date().toISOString() };
  const salt = newSalt();
  await startSession(pin, salt);

  // Encrypt everything before opening the transaction (crypto is async and
  // IndexedDB transactions do not survive foreign awaits).
  const caseEnc = await encryptJson(caseRecord);
  const answerRows: Array<{ key: string; enc: Encrypted }> = [];
  if (answersDump) {
    for (const [key, value] of Object.entries(answersDump)) {
      answerRows.push({ key, enc: await encryptJson(value) });
    }
  } else if (prefills) {
    for (const [key, fieldId] of Object.entries(PREFILL_FIELD_IDS)) {
      const text = prefills[key as keyof CasePrefills];
      if (text?.trim()) {
        answerRows.push({ key: `pre-repat-assessment/${fieldId}`, enc: await encryptJson({ text }) });
      }
    }
  }
  const fileRows: Array<Omit<EncFileRow, 'id'>> = [];
  for (const file of attachments ?? []) fileRows.push(await encryptFilePayload(file));

  await db.transaction('rw', db.cases, db.answers, db.files, db.meta, async () => {
    await db.cases.clear();
    await db.answers.clear();
    await db.files.clear();
    await db.meta.put({ id: 1, salt, healixRef: details.healixRef, failedAttempts: 0, lockUntil: 0 });
    await db.cases.put({ id: 1, iv: caseEnc.iv, ct: caseEnc.ct });
    for (const row of answerRows) {
      await db.answers.put({ key: row.key, iv: row.enc.iv, ct: row.enc.ct });
    }
    for (const row of fileRows) {
      await db.files.add(row);
    }
  });
  return caseRecord;
}

export async function saveAnswer(tabId: string, fieldId: string, value: FieldValue): Promise<void> {
  const enc = await encryptJson(value);
  await db.answers.put({ key: `${tabId}/${fieldId}`, iv: enc.iv, ct: enc.ct });
}

export async function getAnswers(tabId: string): Promise<Record<string, FieldValue>> {
  const prefix = `${tabId}/`;
  const rows = await db.answers.where('key').startsWith(prefix).toArray();
  const out: Record<string, FieldValue> = {};
  for (const row of rows) out[row.key.slice(prefix.length)] = await decryptJson<FieldValue>(row);
  return out;
}

/** Every answer on the case, keyed `tabId/fieldId` — for device transfer. */
export async function exportAllAnswers(): Promise<Record<string, FieldValue>> {
  const rows = await db.answers.toArray();
  const out: Record<string, FieldValue> = {};
  for (const row of rows) out[row.key] = await decryptJson<FieldValue>(row);
  return out;
}

export async function listFiles(): Promise<FileRecord[]> {
  const rows = await db.files.toArray();
  const out: FileRecord[] = [];
  for (const row of rows) {
    const header = await decryptJson<FileHeader>(row.header);
    const bytes = await decryptBytes({ iv: row.iv, ct: row.ct });
    out.push({ id: row.id!, ...header, data: new Blob([bytes], { type: header.type }) });
  }
  return out;
}

export async function addFile(file: FileInput): Promise<void> {
  await db.files.add(await encryptFilePayload(file));
}

export async function deleteFile(id: number): Promise<void> {
  await db.files.delete(id);
}

export async function clearCase(): Promise<void> {
  lockSession();
  await db.transaction('rw', db.cases, db.answers, db.files, db.meta, async () => {
    await db.cases.clear();
    await db.answers.clear();
    await db.files.clear();
    await db.meta.clear();
  });
}

export default db;
