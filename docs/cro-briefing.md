# Repatriation Documentation App — briefing for the Chief Risk Officer

*Companion documents: `SECURITY.md` (full security brief, residual risks and operating
disciplines) and `README.md` (user-facing workflow). This briefing summarises what the tool
is, how it handles patient data, and why it was built as a bespoke application rather than
assembled on the Microsoft 365 platform.*

## What it is

A digital replacement for the paper forms medical escorts complete during patient
repatriations. It is an installable web app ("add to home screen") that runs on any tablet or
phone and — critically — works **fully offline**, including inflight. It is live at
`https://wellsnathanael-debug.github.io/Repat-App/` and already covers the whole mission:

1. **Case setup (repatriation desk).** Patient details, clinical background (diagnosis,
   history, allergies, medications, current location), medical reports, the escort's flight
   itinerary and hotel, and a case PIN. The desk hands the case to the escort as an
   **encrypted case file or QR code** — unreadable without the PIN, which travels separately
   (e.g. by phone).
2. **Documentation (escort).** The escort unlocks the case with the PIN and works through the
   structured tabs: pre-repatriation assessment at origin (with the paper form's N/A
   conventions), a post-assessment confirmation checklist back to the desk (fit to fly,
   transport, luggage, destination), the repat record (timestamped vital signs and medications
   given, a mandatory low-molecular-weight-heparin section that blocks export until answered),
   and the handover at destination. Every entry autosaves; no connectivity is needed at any
   point.
3. **Output.** Two PDFs generated on the device: the **full repatriation record** for the desk
   and case file, and a **handover letter** containing only the clinical content the receiving
   hospital/GP needs. The escort then clears the case, permanently wiping the device.

## How patient data is handled

Patient data exists in exactly three places, and nowhere else:

- **On the escort's device**, encrypted at rest (AES-256, key derived from the case PIN and
  held in memory only). Before the PIN is entered, nothing patient-identifiable is readable.
  The app locks itself after 15 minutes of inactivity; PIN guessing is throttled with an
  escalating lockout; "Clear case" deletes everything.
- **Inside encrypted case/transfer files** while a case moves between the desk and escorts
  (or between two escorts on a shared mission). Same encryption; a wrong PIN and a corrupted
  file are indistinguishable.
- **In the exported PDFs**, which then fall under existing document-handling policy.

There is **no server and no central database**: the hosting service serves the app's code only
and never receives patient data. The app makes zero third-party requests — no analytics,
trackers or external services. The PIN is never stored; it is proven by decryption succeeding.
The full technical detail, the residual risks (PIN entropy on stolen files, device compromise,
plaintext PDFs after export) and the required operating disciplines are set out honestly in
`SECURITY.md`.

## Why a bespoke build rather than the Microsoft 365 platform

A note on framing: **Claude Code is the tool the app was built with** (AI-assisted software
development); the platform decision the organisation actually faced was *bespoke offline-first
application* versus *a solution assembled on M365* (Power Apps/Forms with data in
SharePoint or Dataverse) — or continuing with an external subscription platform (Fluix). The
bespoke route won on the points that matter most for this specific workflow:

1. **True offline operation.** The defining requirement is documenting vital signs and
   medications mid-flight with no connectivity. This app is offline-first by architecture —
   everything runs and saves on the device. Power Apps' offline mode is a constrained,
   premium-licensed feature designed around intermittent connectivity and sync, not hours of
   guaranteed disconnection; it would have been the project's permanent structural risk.
2. **Data minimisation.** An M365 build necessarily creates a *stored central dataset* of
   patient clinical data (SharePoint/Dataverse), bringing access management, retention
   schedules and a larger breach surface. This design stores **nothing centrally**: for each
   case the data exists transiently, encrypted, on one device, and the PDFs become the record
   in existing case-management systems. From a risk standpoint the question changes from "who
   can reach the patient database?" to "there is no patient database".
3. **Exact fit to clinical practice.** The forms replicate the paper originals precisely —
   N/A boxes that blank their fields, section-level N/A, a mandatory LMWH declaration that
   blocks export, dual UK/UTC timestamps on every observation, and two differently-scoped
   PDFs so internal logistics never reach the receiving hospital. Low-code platforms force
   compromises on exactly these details, which is where clinical-governance risk hides.
4. **No per-user licensing or account administration.** Escorts are transient; the per-case
   PIN model means no accounts to provision, licence or deprovision (and no Fluix
   subscription, no Power Apps premium licences). Running cost is effectively zero.
5. **Speed of iteration, with governance.** Features requested by clinicians (the Mission
   details tab, the desk-confirmation checklist, case transfer between escorts) went from
   request to deployed the same day. That speed is governed: every change is version-
   controlled with full history, and an automated ~47-check end-to-end test suite — including
   security assertions such as "no plaintext patient data at rest" and lockout behaviour —
   runs before every release.

**Where M365 would genuinely be stronger — and how the design responds.** Real-time desk
visibility of in-progress cases and central audit logs require a server; this design
deliberately trades them for data minimisation, with the PDFs as the auditable record.
Tenant identity, SSO and DLP are M365 strengths the no-account model simply doesn't need.
Vendor support and IT familiarity are fair points, mitigated by the fact that the entire
source is open and readable in this repository, the app is a folder of static files that can
be re-hosted on Healix-controlled (or M365) infrastructure at any time, and the one planned
server component — automatic emailing of the PDFs from a company mailbox — is **designed to
run on the Microsoft 365 tenant** (`docs/email-relay.md`), using the platform where it is
genuinely the right tool.

## Dependencies to be aware of

Stated plainly: maintenance is in-house rather than under a vendor SLA (mitigated by the open
source code, documentation and test suite in this repository); the repository is public (it
contains code only — patient data never touches it — but the organisation may prefer it
private, which is a hosting-plan decision); the app is served from GitHub Pages (installed
devices keep working offline regardless, and hosting is portable); and the Healix brand fonts
and logo files are still to be supplied for final visual polish.
