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

Deploy the `dist/` folder to any static host (GitHub Pages, Netlify, etc.) over HTTPS — the
service worker then makes the app installable and fully offline-capable.

## Stack

React + TypeScript + Vite, `vite-plugin-pwa` (offline/installable), Dexie (IndexedDB autosave),
`@react-pdf/renderer` (client-side PDF generation).
