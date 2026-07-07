# Repat App — offline repatriation documentation

An offline-first web app (PWA) for scheduled repatriation documentation, replacing paper-based
forms. Built for medical escorts completing assessments on a tablet or phone, including fully
offline inflight.

## How it works

1. **Case setup (repat desk).** When an escort is assigned a repatriation, the repat desk opens
   the app on the device, enters the patient details (name, DOB, home address, pax mobile,
   Healix file reference, escort name) and sets a 4–6 digit PIN for the escort.
2. **Documentation (escort).** The escort unlocks the app with the PIN and completes the
   *Pre repatriation assessment at origin* form. Every entry autosaves to the device — no
   connection needed at any point. Fields marked N/A are blanked and disabled, as on the paper
   form.
3. **Export & clear.** When the repatriation is complete, the escort taps *Export / Finish* to
   generate a formatted PDF (named `Repat_<HealixRef>_<Surname>_<date>.pdf`) and shares it to
   the repat desk via the device share sheet (email etc.). Once receipt is confirmed, *Clear
   case* wipes all patient data from the device, ready for the next repatriation.

No server is involved: patient data only ever exists on the device and in the exported PDF.

## Tabs

- **Pre repatriation assessment at origin** — implemented in full.
- **In-flight record**, **Handover at destination**, **Medical reports / Uploads** — placeholders;
  each is added by writing a schema file in `src/schema/` (see `preRepatAssessment.ts` for the
  pattern), no new UI code required.

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
