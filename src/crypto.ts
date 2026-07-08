// At-rest encryption for on-device case data.
//
// A session AES-256-GCM key is derived from the case PIN (PBKDF2-SHA256,
// 310,000 iterations — same construction as the case-code handoff in
// caseCode.ts) and held in module memory only, never persisted. Locking the
// app clears the key; every record in IndexedDB (case details, form answers,
// uploaded files) is stored as { iv, ct } ciphertext, so without the PIN the
// database contents are unreadable.

const PBKDF2_ITERATIONS = 310_000;

let sessionKey: CryptoKey | null = null;

export interface Encrypted {
  iv: Uint8Array;
  ct: ArrayBuffer;
}

export function hasSession(): boolean {
  return sessionKey !== null;
}

export function lockSession(): void {
  sessionKey = null;
}

export function newSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
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

export async function startSession(pin: string, salt: Uint8Array): Promise<void> {
  sessionKey = await deriveKey(pin, salt);
}

/** Derive a key without touching the current session (for verifyPin). */
export async function deriveDetachedKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  return deriveKey(pin, salt);
}

function requireKey(): CryptoKey {
  if (!sessionKey) throw new Error('Session is locked');
  return sessionKey;
}

export async function encryptBytes(data: BufferSource, key?: CryptoKey): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key ?? requireKey(),
    data,
  );
  return { iv, ct };
}

/** Throws (AES-GCM authentication failure) if the key is wrong or data tampered. */
export async function decryptBytes(enc: Encrypted, key?: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: enc.iv as BufferSource },
    key ?? requireKey(),
    enc.ct,
  );
}

export async function encryptJson(value: unknown, key?: CryptoKey): Promise<Encrypted> {
  return encryptBytes(new TextEncoder().encode(JSON.stringify(value)), key);
}

export async function decryptJson<T>(enc: Encrypted, key?: CryptoKey): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await decryptBytes(enc, key))) as T;
}
