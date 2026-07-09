# Repat App — offline repatriation documentation

An offline-first web app (PWA) for scheduled repatriation documentation, replacing paper-based
forms. Built for medical escorts completing assessments on a tablet or phone, including fully
offline inflight.

## How it works

1. **Case setup (repat desk).** When an escort is assigned a repatriation, the repat desk opens
   the app, enters the patient details (name, DOB, home address, pax mobile, Healix file
   reference, escort name) and sets a 4–6 digit PIN. Two ways to hand the case over:
   - **Same device:** "Save case on this device" when prepping the escort's tablet directly.
   - **Remote:** "Generate case code for escort" produces an encrypted code (plus a QR code and
     a clickable link) to send by email/message. The code is unreadable without the PIN, which
     is given to the escort separately (e.g. by phone). Nothing is saved on the desk's machine.
     The escort taps "Load case from code", enters the code (or opens the link/scans the QR)
     and the PIN — the patient details then appear on their device.
2. **Documentation (escort).** The escort unlocks the app with the PIN and completes the
   *Pre repatriation assessment at origin* form. Every entry autosaves to the device — no
   connection needed at any point. Fields marked N/A are blanked and disabled, as on the paper
   form.
3. **Export & clear.** When the repatriation is complete, the escort taps *Export / Finish* to
   generate a formatted PDF (named `Repat_<HealixRef>_<Surname>_<date>.pdf`) and shares it to
   the repat desk via the device share sheet (email etc.). Once receipt is confirmed, *Clear
   case* wipes all patient data from the device, ready for the next repatriation.

No server is involved: patient data only ever exists on the device (encrypted at rest with a
PIN-derived key — see `SECURITY.md`), in encrypted case/transfer files, and in the exported
PDFs. The app auto-locks after 15 minutes of inactivity and throttles PIN attempts. For
two-escort missions, "Transfer case to a second escort device" (Export screen) moves the whole
live case between devices offline.

## Tabs

- **Pre repatriation assessment at origin** — full assessment; clinical fields (diagnosis,
  history, allergies, PMH, medications) can be pre-filled by the repat desk at setup.
- **Repat record** — the whole transfer incl. ground movements: start of repat, baseline vitals,
  repeatable vital-signs log and medications-given log (auto-timestamped in UK time with UTC
  alongside, editable; drug dropdown = patient meds + kit bag list in `src/schema/kitBag.ts`),
  **mandatory LMWH section** (blocks export until complete), free-text transport log.
- **Handover at destination** — Home/Hospital destination (address copied from the case,
  overridable), contacts seeded from the case, arrival time, auto-calculated total transport
  time, and the escort's handover letter.
- **Medical reports / Uploads** — reports attached by the desk at setup plus photos/PDFs the
  escort adds en route.

## Exports

Two PDFs from the same data: the **Full repat record** (everything, for the repat desk / case
file) and the **Handover letter** (clinical summary for the receiving hospital/GP — no internal
checklists). Styling follows the Healix brand (palette approximated from healix.com; refine via
`src/styles.css` and `src/pdf/common.tsx` when the brand book is available).

## Demonstrating the tool

For presentations there is a demo layer with a clearly fictitious patient ("Samantha Example",
ref DEMO-2026-0001, watermarked sample report, PIN **123456**):

- **Two-device demo (desk → escort):** on the setup screen tap *"Fill with demo patient"* —
  everything fills instantly, then proceed as the desk would: Generate case code → scan the QR
  with the tablet → enter 123456 → the escort view appears with the clinical details pre-filled
  and the sample report in Uploads.
- **Single-device demo:** on the start screen tap *"Set up a demo case on this device"*.

Demo actions are only available when no case is loaded, so they can never touch live case data.

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # production build (dist/)
npm run preview    # serve the production build
```

## Deployment

The app deploys automatically to GitHub Pages on every push to the main development branch
(`.github/workflows/deploy.yml`), and is served at:

**https://wellsnathanael-debug.github.io/Repat-App/**

One-time setup in the GitHub repository (requires the repo to be public on a free plan):

1. Settings → General → change repository visibility to **Public**.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.

After the first visit on a device, add the app to the home screen ("Add to Home Screen" on
iPad/iPhone, "Install app" on Android) — it then launches like a native app and works fully
offline. The service worker also picks up new versions automatically when online.

To verify a build end-to-end (fills the form, checks N/A logic, exports the PDF, tests
offline): `npm run preview -- --port 4173` then `node e2e-check.mjs`.

## Stack

React + TypeScript + Vite, `vite-plugin-pwa` (offline/installable), Dexie (IndexedDB autosave),
`@react-pdf/renderer` (client-side PDF generation).
