# CMS integration — coordinator-to-escort-to-case-record (design for IT)

**Goal:** a repat coordinator works only in the CMS. They create the case there, attach the
medical reports and the escort's itinerary there, and press one button — the escort receives a
ready-to-open case file on their device. When the escort finishes the mission, the completed
record, the handover letter and the structured clinical data land back on **that same CMS
case**, automatically, without anyone re-keying anything.

This is a **reference design, not deployed code** — it is written to be CMS-agnostic so it can
be handed to any vendor during selection. The two things it depends on already exist in the
app: the encrypted case-code format (`src/caseCode.ts`) and the repository/submission server
(`server/repo-server.mjs`, `src/repo.ts`).

## Architecture

```
  ┌──────────────────────── CMS (system of record) ────────────────────────┐
  │  Coordinator creates case, attaches reports + itinerary, assigns escort │
  └───────────────┬─────────────────────────────────▲──────────────────────┘
                  │ ① webhook / "Send to escort"    │ ③ attach PDFs, write fields,
                  │    (case JSON + files)          │    advance status
                  ▼                                 │
          ┌───────────────────┐            ┌────────┴──────────┐
          │ Case-code service │            │  Adapter service  │
          │ (encrypt → .repat)│            │ (already built as │
          └─────────┬─────────┘            │  repo-server.mjs) │
                    │                      └────────▲──────────┘
    .repat file (+ PIN by separate channel)         │ ② POST completed case
                    ▼                               │    (2 PDFs + JSON)
             ┌──────────────────────────────────────┴──┐
             │   Escort device — offline for the whole  │
             │   mission; queues the submission if the  │
             │   aircraft/airside has no connectivity   │
             └──────────────────────────────────────────┘
```

Both services are small, stateless-ish, and sit on Healix infrastructure. They can be the same
process — in fact the adapter **is** `repo-server.mjs` with an extra outbound step.

## The join key

Every flow is correlated by the **Healix case reference** (`healixRef` in the app,
`caseRef` in the submission payload). It is already: entered by the desk at setup, the only
plaintext field held on the device (shown on the lock screen), and included in every
submission. **Requirement on the CMS:** the case reference must be available at case-creation
time and be stable for the life of the case.

## ① CMS → escort: creating the case

The coordinator presses a button (or the CMS fires a webhook on an "escort assigned" status
change). The CMS sends the case-code service a JSON document plus the attachments; the service
returns a `.repat` file, which the CMS **attaches back onto its own case** and emails to the
escort. No app change is needed — the app already opens `.repat` files, validating by content
rather than extension.

Field mapping (the app already models everything a coordinator would enter):

| CMS field | App field | Notes |
|---|---|---|
| Case reference | `details.healixRef` | **join key** |
| Patient name / DOB / home address | `details.patientName` / `.dob` / `.homeAddress` | |
| Patient or next-of-kin mobile | `details.paxMobile` | |
| Assigned escort name / email | `details.escortName` / `.escortEmail` | email used to deliver the file |
| Receiving hospital | `details.hospitalName` | seeds the handover tab |
| Handover contact email | `details.email` | |
| Flight itinerary | `details.flightItinerary` | shown on the Mission details tab |
| Hotel / accommodation | `details.hotelDetails` | |
| Diagnosis | `prefills.diagnosis` | seeds the assessment tab |
| History & treatment to date | `prefills.historyTreatment` | |
| Allergies | `prefills.allergies` | |
| Past medical history | `prefills.pastMedicalHistory` | |
| Current medications | `prefills.medications` | |
| Patient location overseas | `prefills.patientLocation` | |
| Medical reports (PDF/JPG) | `files[]` with `category: 'report'` | appear in the Uploads tab |
| Tickets, visas, itinerary docs | `files[]` with `category: 'travel'` | appear in Mission details |

### The PIN

The case file is encrypted with a PIN (PBKDF2-SHA256, 310k iterations → AES-256-GCM). The
coordinator's CMS screen generates a random 6-digit PIN, shows it **once**, and the coordinator
passes it to the escort by a separate channel (phone or SMS) — exactly the discipline the desk
follows today. Two honest points for the risk team:

- The PIN protects the file **in transit and on the escort's device**. It does not protect the
  patient data from Healix: the CMS holds that record in the clear by design. Encryption here
  stops a mislaid email attachment or a lost tablet becoming a breach.
- Whether the CMS **stores** the PIN is a deliberate decision. Storing it means a coordinator
  can re-issue a case file to a replacement escort without re-keying, but also means CMS
  administrators can decrypt any case file. Not storing it means a lost PIN requires a fresh
  case file. Recommendation: do not store it; re-issuing is cheap.

## ② + ③ Escort → CMS: filing the completed case

This is the flow already built and tested (57 e2e checks, including the offline queue). The app
POSTs the completed case to the adapter; **the only change is what the adapter does next.**

The submission payload is already:

```json
{ "caseRef": "...", "patientName": "...", "escortName": "...", "submittedAt": "...",
  "data": { "caseRecord": {...}, "answers": { "tabId/fieldId": ... } },
  "fullPdfB64": "...", "handoverPdfB64": "..." }
```

The adapter then, against the CMS case matching `caseRef`:

1. Attaches `Repat_<ref>_full.pdf` (the desk's complete record) and
   `Repat_<ref>_handover.pdf` (the clinical letter for the receiving team).
2. Writes the structured `data` — either into CMS custom fields for reporting, or as a
   `data.json` attachment if the CMS has no suitable fields. Values worth promoting to real,
   reportable CMS fields: start of repat, arrival time, computed total transport time,
   LMWH given (and the reason if not), handover recipient, and any adverse events recorded.
3. Advances the case status (e.g. to *Escort documentation received*).

**Why keep the adapter rather than have the app call the CMS directly:** CMS credentials stay
server-side instead of shipping inside a PWA installed on escort tablets; the adapter buffers
if the CMS is down or rate-limits; and when the CMS is replaced, the app does not change at
all — only the adapter's outbound half does.

### Retries, duplicates and failure

- **Offline is the normal case.** The app already queues submissions encrypted on-device and
  flushes them automatically when connectivity returns — the escort can submit from the
  aircraft and it will file itself on landing.
- **Idempotency:** retries must not attach the same PDF twice. Each submission needs a UUID
  generated when it enters the outbox (so a retry reuses it) and echoed as an
  `Idempotency-Key`; the adapter records it and treats a repeat as a no-op. *This is a small
  app change — see below.*
- **Unknown case reference:** the adapter must not silently discard. It should keep the
  submission, alert the desk (the case ref was mistyped at setup, or the CMS case was merged),
  and expose it in the existing `/desk` view for manual attachment.
- **CMS rejection / outage:** the submission stays in the adapter's store and is retried with
  backoff. The escort has already had their confirmation; nothing is lost if the CMS is down
  for a day. The `/desk` view is the fallback the coordinators can always work from.

## What the app has to change

Reassuringly little — the design deliberately puts the CMS-specific work in the adapter:

1. **Submission UUID** for idempotency (`src/repo.ts`, outbox row + payload; server schema).
2. **Per-case submission token**, embedded in the encrypted case file by the case-code service
   and presented on submission. This closes the one open authorisation question in v1 (today
   the submission endpoint relies on network placement) and is the *same mechanism* the email
   relay needs — build it once, use it for both.
3. **Configurable endpoint** if the adapter is not the origin serving the app. Today the app
   calls same-origin `/api/health` and `/api/submissions`, which is correct when the container
   serves both; a split deployment needs a build-time base URL and CORS on the adapter.
4. Nothing for direction ①. The app opens CMS-generated case files today, unchanged.

Note the app is deliberately **one active case at a time** — the escort's device holds the
mission in hand, not a caseload. The CMS remains the only place a coordinator sees all cases.

## What to require from any candidate CMS

A selection checklist — if a vendor cannot do these, the integration degrades to manual steps:

| Requirement | Why | Severity |
|---|---|---|
| REST/JSON API with service-account auth (OAuth2 client credentials or scoped API key) | Both directions | **Essential** |
| Attach a binary file (PDF) to a case via API | Filing the record and handover letter | **Essential** |
| Read case + custom fields via API | Building the case file | **Essential** |
| Stable, API-visible case reference | The join key | **Essential** |
| Outbound webhook (or scheduled query) on status change | Makes ① one button instead of a poll | Strongly wanted |
| Writable custom fields, ideally typed (date/time, boolean, text) | Structured clinical data becomes reportable rather than a buried JSON blob | Strongly wanted |
| Idempotent writes, or a field to record an external submission ID | Safe retries | Strongly wanted |
| Sandbox / test tenant | Lets the integration be tested without touching live patient records | Strongly wanted |
| Attachment size limit ≥ 25 MB | Repat records with photographed reports | Check early |
| Audit log of API-made changes | Clinical governance | Nice to have |

A CMS with only CSV import/export is still workable — the adapter can drop files on SFTP and
write a manifest — but the coordinator loses the one-button experience and gains a daily batch.

## Governance implications

Enabling this makes the CMS the system of record for repatriation documentation, which is the
point — but it changes the posture described in `SECURITY.md`, so update it alongside:

- Patient data now flows device → adapter → CMS, all on Healix-controlled infrastructure. No
  new third-party processor is introduced unless the CMS itself is SaaS — **if it is, the CMS
  vendor is a data processor and needs the DPA/DPIA review**, which is the single biggest
  data-protection question in CMS selection.
- The device-side model is unchanged: encrypted at rest, PIN-gated, auto-locking, wiped after
  export. The escort's device stays a transient working copy, not a store.
- Retention becomes a CMS policy question rather than an app one, which is the right place for
  it.

## What IT needs to decide

1. Which CMS (and whether it clears the checklist above).
2. Where the case-code and adapter services run — the same container as today, or the
   organisation's standard app-hosting platform.
3. Whether the CMS stores case PINs (recommendation: no).
4. The per-case token mechanism, shared with the email relay (`docs/email-relay.md`).
5. Whether escorts install the app from the Healix-hosted container (required for submission)
   rather than the public GitHub Pages URL.
