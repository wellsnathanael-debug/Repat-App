# Security overview — Repatriation Documentation app

This document is written for clinical governance / risk / information-governance review. It
describes where patient data lives, how it is protected, the residual risks, and the operating
disciplines the app relies on. It is intentionally plain-English; the implementation is open
for inspection in this repository (`src/crypto.ts`, `src/caseCode.ts`, `src/db.ts`).

## Where patient data exists — and where it does not

Patient data exists in exactly three places:

1. **On the escort's device**, encrypted at rest (see below), for the duration of one case.
2. **Inside encrypted case/transfer files** while a case is being handed between the repat desk
   and escorts (email/message attachments, QR codes, links).
3. **In the exported PDFs** (full record and handover letter), from the moment the escort
   generates them.

There is **no server**. The app is a static web application: the hosting service (GitHub Pages)
serves the app's code only and never receives, stores, or processes any patient data. The app
makes **zero third-party requests** — no analytics, no trackers, no fonts or scripts fetched
from elsewhere. Once installed, it runs entirely on the device, including fully offline.

## Protection in transit (desk → escort, escort → escort)

Case files and case codes are encrypted with **AES-256-GCM** (an authenticated encryption
standard; the same class of cryptography used in online banking), implemented via the browser's
built-in WebCrypto — no third-party cryptography code. The encryption key is derived from the
case PIN using **PBKDF2-SHA256 with 310,000 iterations** (OWASP-recommended), with a random
16-byte salt and 12-byte IV generated per file. Consequences:

- A case file intercepted in email is unreadable without the PIN.
- Tampering is detected: a modified file simply fails to decrypt.
- A wrong PIN and a corrupted file are indistinguishable — the file reveals nothing.
- The PIN is communicated **out of band** (e.g. by phone), never alongside the file.
- Case links carry data only in the URL fragment, which browsers do not transmit to servers.

## Protection at rest (on the device)

All case content on the device — patient details, every form entry, uploaded medical reports —
is stored **encrypted with the same PIN-derived key**. The key is held in memory only, never
written to storage. Practical effects:

- Before the PIN is entered, the only readable value on the device is the Healix case
  reference (kept for the lock screen); no patient-identifiable data is accessible.
- Locking the app (manually, or automatically after **15 minutes of inactivity**) discards the
  key; the PIN is required again.
- PIN entry on the device is **throttled**: after 5 failed attempts the app enforces an
  escalating lockout (30 s, doubling per further failure).
- "Clear case" permanently deletes everything (details, entries, files, key salt).
- The PIN itself is never stored — a correct PIN is proven by successful decryption.

## Residual risks — stated honestly

- **PIN entropy.** A stolen *case file* can be attacked offline by trying PINs; the 310,000
  PBKDF2 iterations slow this substantially, but a 4-digit PIN (10,000 possibilities) is weak
  against a determined attacker. **Make 6-digit PINs the desk standard** (1,000,000
  possibilities; the app recommends this at setup) and treat the PIN like a password: separate
  channel, never written next to the file.
- **Exported PDFs are plaintext.** Once generated, PDFs are ordinary documents; their handling
  falls under your existing email/document-handling policy. The planned company-email relay
  (see `docs/email-relay.md`) removes personal email accounts from this path.
- **A compromised or jailbroken device** (malware, an attacker with the device *and* the PIN)
  defeats any app-level control. Standard mitigations apply: device passcodes (which enable
  iOS/Android full-device encryption), OS updates, and MDM on company devices.
- **Shoulder-surfing / device left unlocked mid-use** — mitigated by auto-lock, but escorts
  should lock the app (one tap) when stepping away.
- **Hosting supply chain.** The app's code is served from GitHub Pages; a compromise of the
  repository or GitHub could alter the app. Mitigations: repository access control and 2FA;
  the option to self-host the static files on Healix-controlled infrastructure at any time
  (it is a folder of static files).

## Operating disciplines the model relies on

1. 6-digit PINs, communicated by a different channel than the case file.
2. One case, one PIN, one use — the PIN dies with the case at "Clear case".
3. Clear the case promptly once the desk confirms receipt of the PDFs.
4. Document on one device at a time on two-escort missions (transfer feature moves the whole
   case between devices, offline).
5. Device passcode enabled on any phone/tablet used (enables OS-level storage encryption
   underneath the app's own encryption).

## Optional component: the self-hosted case repository

Everything above describes the default deployment (no server). At IT's request the app can
also run as a **Docker container on Healix infrastructure** which additionally hosts a
**case repository**: at the end of a mission the escort can submit the completed case
(structured data plus both PDFs) to it, queued automatically while offline. When this is
enabled, the organisation **does** hold a central store of patient data — that is the point
(reporting, and a permanent home for the PDFs) — and the risk position changes accordingly:

- The store lives on infrastructure Healix controls (a single SQLite database in the
  container's data volume), not with any third party.
- Read access (the desk view and all downloads) requires a token IT sets (`DESK_TOKEN`).
  In v1 the *submission* endpoint relies on network placement (internal network/VPN + TLS)
  rather than a token — see `docs/self-hosting.md`; a per-case submission token is planned.
- Access management, backup, and **retention** of the repository become IT-operated controls.
- Nothing changes on the device side: same encryption at rest, same PIN model, same wipe.
  The public (GitHub Pages) deployment has no repository and the feature is invisible there.

## Answers to likely review questions

- **Is patient data processed or stored by any third party?** No. No server, no analytics, no
  third-party requests. The only third party is the static file host, which serves code, not
  data. Email attachments transit your existing email provider, encrypted. (If the optional
  self-hosted repository is enabled, submitted cases are stored on Healix's own
  infrastructure — still no third party.)
- **What happens if a device is lost?** The finder sees a PIN screen and a case reference. The
  data at rest is AES-256 encrypted; PIN attempts are throttled on-device, and the underlying
  storage is unreadable without the key. Combined with a device passcode, exposure is minimal.
- **What happens if a case file/email is intercepted?** Nothing is readable without the PIN,
  which travelled separately.
- **Retention?** Nothing is retained after "Clear case". The PDFs become the record, in your
  existing case-management system.
- **Auditability?** The full source code is in this repository with a complete change history,
  and an automated end-to-end test suite (including security checks: no plaintext patient data
  at rest, lockout behaviour, wrong-PIN rejection) runs against every change.
