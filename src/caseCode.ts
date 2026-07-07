// Encrypted case-code handoff: the repat desk encrypts the patient details
// with the case PIN and sends the resulting code to the escort over any
// channel. Only someone who knows the PIN can decrypt it.
//
// Format: RPT1.<base64url(salt[16] | iv[12] | AES-GCM ciphertext)>
// Key derivation: PBKDF2-SHA256, 310,000 iterations (OWASP guidance).

import type { CaseRecord } from './db';

export type CaseDetails = Omit<CaseRecord, 'id' | 'createdAt' | 'pinHash'>;

const PREFIX = 'RPT1.';
const PBKDF2_ITERATIONS = 310_000;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
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

export async function encryptCase(details: CaseDetails, pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pin, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(details));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext),
  );
  const packed = new Uint8Array(salt.length + iv.length + ciphertext.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(ciphertext, salt.length + iv.length);
  return PREFIX + toBase64Url(packed);
}

/** Returns the details, or null if the code is invalid or the PIN is wrong
 *  (AES-GCM authentication makes the two indistinguishable by design). */
export async function decryptCase(code: string, pin: string): Promise<CaseDetails | null> {
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
    return JSON.parse(new TextDecoder().decode(plaintext)) as CaseDetails;
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
