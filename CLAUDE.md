# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline-first PWA for medical escorts documenting patient repatriations (Healix), replacing
paper forms. There is deliberately **no server**: patient data exists only on the escort's
device (encrypted at rest), inside encrypted case/transfer files, and in exported PDFs.
`README.md` describes the user-facing workflow; `SECURITY.md` is the security brief given to
the clinical risk team — keep it truthful when changing anything security-relevant.

## Commands

```bash
npm run dev          # dev server
npm run build        # tsc -b && vite build (typecheck is part of build)
npm run typecheck    # tsc -b only
```

**Tests** — there are no unit tests; `e2e-check.mjs` (playwright-core, ~47 checks) is the test
suite and must pass before pushing. It drives the production build end-to-end, including
offline mode, encryption-at-rest assertions, PDF exports and the demo layer:

```bash
npm run build
npm run preview -- --port 4173 --strictPort   # in background
CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node e2e-check.mjs
```

`CHROME_PATH` points playwright-core at a Chromium binary (the path above is the Claude Code
web sandbox's preinstalled one); `SHOT_DIR=<dir>` redirects screenshots/PDF artifacts. The
suite is one linear script — there is no "run a single test"; comment out sections locally if
needed. Note: `pkill -f 'vite[ ]preview'` (the `[ ]` avoids pkill matching its own command line).

**Deployment** — pushing to `claude/repatriation-docs-platform-os0fi5` auto-deploys via
`.github/workflows/deploy.yml` to GitHub Pages at `https://<owner>.github.io/Repat-App/`.
This is why `base: '/Repat-App/'` is set in `vite.config.ts` — all e2e URLs and links include
that prefix. Users have installed the PWA; every push updates them on next online launch.

## Architecture

### Invariants (do not break)

- Works fully offline: `vite-plugin-pwa` precaches everything (size limit raised in
  `vite.config.ts`); new heavy dependencies should be lazy-loaded like the PDF renderer is.
- Zero third-party requests at runtime (no analytics, fonts, CDNs). Fonts are bundled
  (`@fontsource/inter`).
- Patient data is never plaintext at rest and never in URLs sent to a server (case links keep
  the payload in the `#fragment`).

### Schema-driven form engine

Tabs are **data**, not JSX: `src/schema/preRepatAssessment.ts`, `repatRecord.ts`,
`handover.ts` define sections/fields using the types in `src/schema/types.ts`. Two renderers
consume the same schema:

- On screen: `src/components/FormRenderer.tsx` dispatches to components in
  `src/components/fields.tsx`.
- On paper: `src/pdf/common.tsx` (`FieldLine`/`PdfSection`) renders the identical schema into
  the full-record PDF.

Adding a section or tab is schema-only work (plus the `tabs` array). Adding a **field type**
touches four places: `types.ts`, `fields.tsx`, `FormRenderer.tsx` dispatch, `pdf/common.tsx`.
Fields with cross-tab or case-record behaviour are special-cased in FormRenderer:
`transportTime` (reads start-of-repat from another tab), `deskSummary` (share-sheet summary),
`destinationType` (seeds the address from the case record), and `seedFrom` on any field
(one-time seed from a CaseRecord field). Custom non-form tabs (`custom: 'uploads' | 'mission'`)
are dispatched in `MainScreen.tsx`.

The N/A conventions come from the original paper form: `textWithNA` blanks+disables its text
box when ticked; `sectionNA: true` on a section blanks every child field.

### Encrypted data layer

`src/crypto.ts` holds a session AES-256-GCM key in module memory, derived from the case PIN
(PBKDF2-SHA256, 310k iterations — same construction as `caseCode.ts`). `src/db.ts` stores every
Dexie row as `{iv, ct}` ciphertext; the only plaintext row is `meta` (Healix ref for the lock
screen, key salt, PIN-throttle state). There is no stored PIN/hash: `unlockWithPin` proves the
PIN by decrypting the case row (AES-GCM auth). Wrong-PIN throttling and the lockout window live
in `meta`. Answers are keyed `` `${tabId}/${fieldId}` ``. Legacy plaintext cases (pre-encryption)
migrate lazily on first unlock. `clearCase()` wipes everything and drops the session key.

### Case handoff (`src/caseCode.ts`)

Desk→escort and escort→escort transfer use one format: `RPT1.` + base64url(salt|iv|AES-GCM
ciphertext), PIN-derived key. Payload v3 is `{v:3, details, prefills?, files?, answers?}` —
`answers` (full dump) is what makes device-to-device transfer resume mid-case; v1/v2 payloads
must remain decryptable. A `.repat` file is literally the code text; `LoadCaseScreen` validates
by content (`RPT1.` prefix), never by extension, because desk staff rename files. QR/link paths
only work for small payloads; attachments force the file path.

### Screens and time

`App.tsx` is a state machine: start → setup/load → lock ⇄ main ⇄ export, plus an inactivity
auto-lock (default 15 min; test override via localStorage `repat-autolock-s`). Timestamps are
stored as ISO UTC and displayed as "14:32 UK (13:32 UTC)" everywhere via `src/time.ts` — keep
that dual display for any new time UI (clinical requirement).

### Exports

`ExportScreen` lazy-loads `@react-pdf/renderer` and the two documents: `FullRecordPdf` (every
tab + uploads, for the repat desk) and `HandoverPdf` (curated clinical fields only, for the
receiving hospital/GP). Internal-operational content (checklists, travel/logistics, desk
confirmation) must stay out of the handover letter. The LMWH section on the Repat record tab is
mandatory and gates both exports (`lmwhComplete`).

### Other load-bearing details

- Demo layer (`src/demoData.ts` + entry points in Setup/Start screens): fictitious patient,
  PIN 123456, watermarked `public/demo-report.png`; only reachable when no case exists.
- `src/schema/kitBag.ts` is a placeholder medication list awaiting the real kit-bag contents.
- Healix brand: colour tokens in `src/styles.css` (`:root`) and `src/pdf/common.tsx` (`BRAND`)
  — change both together. Font stack lists 'Neue Montreal' first (files pending licence
  check); Inter is the brand-sanctioned fallback. Icons and the demo report are generated by
  screenshotting SVG/HTML with headless Chromium (see git history for the throwaway scripts).
- `server/email-relay.worker.js` + `docs/email-relay.md` are a **reference design only** (not
  deployed) for sending PDFs from a company mailbox, pending an IT decision.
