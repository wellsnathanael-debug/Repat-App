# Email relay — sending PDFs from a company address (design for IT)

**Goal:** when the escort taps "Send", the full repat record is emailed to the repatriation
desk and the handover letter to the receiving team / patient contact, **from a Healix address**
— the escort's personal email is never involved. This is the app's first (and only) server
component; this document is the decision brief for IT.

## Architecture

```
Escort device (app) ──HTTPS POST (PDF + per-case send token)──▶ Relay endpoint ──▶ Email provider
                                                                (no storage;      (sends from
                                                                 relays & forgets) repat@healix…)
```

- The app generates the PDFs on-device exactly as today, then POSTs them to the relay.
- If the device is offline (e.g. still airside), the send is queued on-device and dispatched
  automatically when connectivity returns.
- The relay validates the request, hands the PDFs to the email provider, returns success, and
  **stores nothing**. It should log only metadata needed for support (timestamp, case ref,
  destination domain — no patient content).
- **Authorisation:** the repat desk embeds a random per-case *send token* in the encrypted case
  file; the relay is configured (or cryptographically able) to accept it. This stops strangers
  using the endpoint, without any user accounts. Recipient addresses for the desk are fixed
  server-side (the app cannot make the relay email arbitrary addresses except the handover
  recipient, which can be restricted or flagged).

## The decision IT needs to make: who sends the email

| Option | How | Data-protection view |
|---|---|---|
| **Microsoft 365 (recommended if Healix uses M365)** | Relay calls Microsoft Graph `sendMail` as a dedicated mailbox (e.g. `repatriation@…`) using an app registration with `Mail.Send` scoped to that one mailbox | Patient data goes device → relay → **your own tenant**. Sent items appear in the mailbox = free audit trail. No new data processor beyond the relay host |
| Google Workspace | Same shape, Gmail API | Same properties as above, Google tenant |
| Transactional provider (Postmark, AWS SES, Mailgun…) | Relay calls the provider's send API | Adds a new data processor that briefly handles the PDFs; needs a DPA review; simplest to set up |

## Where the relay runs

Any low-maintenance serverless host works — Cloudflare Workers (reference implementation
provided in `server/email-relay.worker.js`), Azure Functions (natural fit alongside M365), or
AWS Lambda. The relay is ~100 lines, has no database, and holds two secrets (email credential,
token-verification key). Cost is effectively zero at repatriation volumes.

## What I need from IT to build it

1. Which email option (M365 / Google / provider) and the sending address.
2. The fixed repat-desk destination address(es).
3. Where they want the relay hosted (or approval to use Cloudflare Workers).
4. An app registration / API key for the chosen email system, scoped to send-only from the
   dedicated mailbox.

Once those exist, the remaining work is: deploy the relay with its secrets, add the "Send to
repat desk / receiving team" buttons and the offline outbox to the app, and extend the test
suite to cover the queue-and-retry path.
