// Client for the optional, IT-hosted case repository (server/repo-server.mjs).
// When the app is served by that container, /api/health responds and the
// Export screen offers "Submit to desk repository". On GitHub Pages (no
// server) the probe 404s and the feature stays hidden — the app then behaves
// exactly as the no-server design describes.

import db, { type CaseRecord } from './db';
import { decryptJson, encryptJson } from './crypto';
import type { FieldValue } from './schema/types';

export interface SubmissionPayload {
  caseRef: string;
  patientName: string;
  escortName: string;
  submittedAt: string;
  data: {
    caseRecord: CaseRecord;
    answers: Record<string, FieldValue>;
  };
  fullPdfB64: string;
  handoverPdfB64: string;
}

export async function repoAvailable(): Promise<boolean> {
  try {
    const resp = await fetch('/api/health', { cache: 'no-store' });
    if (!resp.ok) return false;
    const body = await resp.json();
    return body?.service === 'repat-case-repository';
  } catch {
    return false;
  }
}

async function post(payload: SubmissionPayload): Promise<boolean> {
  try {
    const resp = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// Offline outbox: queued submissions are stored encrypted at rest (same
// session key as everything else) and flushed when connectivity returns.
export async function queueSubmission(payload: SubmissionPayload): Promise<void> {
  const enc = await encryptJson(payload);
  await db.table('outbox').add({ iv: enc.iv, ct: enc.ct });
}

export async function outboxCount(): Promise<number> {
  return db.table('outbox').count();
}

/** Try to send a submission now; queue it if the send fails. Returns 'sent' or 'queued'. */
export async function submitOrQueue(payload: SubmissionPayload): Promise<'sent' | 'queued'> {
  if (navigator.onLine && (await post(payload))) return 'sent';
  await queueSubmission(payload);
  return 'queued';
}

/** Send everything in the outbox; requires the session to be unlocked.
 *  Returns the number of submissions sent. */
export async function flushOutbox(): Promise<number> {
  const rows = await db.table('outbox').toArray();
  let sent = 0;
  for (const row of rows) {
    try {
      const payload = await decryptJson<SubmissionPayload>({ iv: row.iv, ct: row.ct });
      if (await post(payload)) {
        await db.table('outbox').delete(row.id);
        sent++;
      }
    } catch {
      // Locked session or transient failure — leave the row for next time.
      break;
    }
  }
  return sent;
}
