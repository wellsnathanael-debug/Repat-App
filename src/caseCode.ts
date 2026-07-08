// Encrypted case-code handoff: the repat desk encrypts the patient details
// (and optionally clinical pre-fills and attached medical reports) with the
// case PIN and sends the resulting code to the escort over any channel.
// Only someone who knows the PIN can decrypt it. Cases with attachments are
// too large for QR/paste, so they travel as a downloaded .repat file
// containing the same code text.
//
// Format: RPT1.<base64url(salt[16] | iv[12] | AES-GCM ciphertext)>
// Plaintext v2: JSON { v: 2, details, prefills?, files? } (v1 was a bare
// details object — still accepted on decrypt).
// Key derivation: PBKDF2-SHA256, 310,000 iterations (OWASP guidance).

import type { CaseRecord, CasePrefills } from './db';

export type CaseDetails = Omit<CaseRecord, 'id' | 'createdAt' | 'pinHash'>;

export interface CodeFile {
  name: string;
  type: string;
  dataB64: string;
}

export interface CasePayload {
  details: CaseDetails;
  prefills?: CasePrefills;
  files?: CodeFile[];
}

const PREFIX = 'RPT1.';
const PBKDF2_ITERATIONS = 310_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function blobToB64(blob: Blob): Promise<string> {
  return toBase64Url(new Uint8Array(await blob.arrayBuffer()));
}

export function b64ToBlob(b64: string, type: string): Blob {
  return new Blob([fromBase64Url(b64) as BlobPart], { type });
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptCase(payload: CasePayload, pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify({ v: 2, ...payload }));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext),
  );
  const packed = new Uint8Array(salt.length + iv.length + ciphertext.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(ciphertext, salt.length + iv.length);
  return PREFIX + toBase64Url(packed);
}

/** Returns the payload, or null if the code is invalid or the PIN is wrong
 *  (AES-GCM authentication makes the two indistinguishable by design). */
export async function decryptCase(code: string, pin: string): Promise<CasePayload | null> {
  try {
    const trimmed = code.trim();
    if (!trimmed.startsWith(PREFIX)) return null;
    const packed = fromBase64Url(trimmed.slice(PREFIX.length));
    const salt = packed.slice(0, 16);
    const iv = packed.slice(16, 28);
    const ciphertext = packed.slice(28);
    const key = await deriveKey(pin, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plaintext));
    if (parsed.v === 2) {
      return { details: parsed.details, prefills: parsed.prefills, files: parsed.files };
    }
    // v1 payload: a bare details object (no email/hospitalName fields).
    return { details: { email: '', hospitalName: '', ...parsed } };
  } catch {
    return null;
  }
}

/** Shareable link that opens the app with the code pre-filled. The code sits
 *  in the URL fragment, which browsers never send to the server. */
export function caseLink(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#case=${code}`;
}

/** Reads (and clears) a case code from the current URL fragment. */
export function caseCodeFromUrl(): string | null {
  const match = location.hash.match(/^#case=(.+)$/);
  if (!match) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return match[1];
}
