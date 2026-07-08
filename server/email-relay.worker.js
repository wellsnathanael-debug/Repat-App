// Reference email relay — Cloudflare Worker.
//
// NOT DEPLOYED. This is the reference implementation described in
// docs/email-relay.md, for IT to review and deploy with real secrets. It
// receives the PDFs from the app over HTTPS and sends them from a company
// mailbox via Microsoft Graph. It stores nothing.
//
// Secrets (wrangler secret put …):
//   SEND_TOKEN_KEY   – HMAC key; the repat desk tool derives per-case send
//                      tokens from it (token = HMAC(healixRef)). Rotate freely.
//   MSGRAPH_TENANT   – Azure AD tenant id
//   MSGRAPH_CLIENT   – app registration client id (Mail.Send, one mailbox)
//   MSGRAPH_SECRET   – app registration client secret
// Vars:
//   SENDER           – e.g. repatriation@healix.com
//   DESK_TO          – fixed repat-desk destination address

const MAX_BODY = 15 * 1024 * 1024; // 15 MB — two PDFs is far below this

export default {
  async fetch(request, env) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/send') {
      return new Response('Not found', { status: 404 });
    }
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) {
      return new Response('Too large', { status: 413 });
    }

    const form = await request.formData();
    const caseRef = String(form.get('caseRef') ?? '');
    const token = String(form.get('token') ?? '');
    const kind = String(form.get('kind') ?? ''); // 'desk' | 'handover'
    const pdf = form.get('pdf'); // File
    const handoverTo = String(form.get('to') ?? ''); // only used for kind=handover

    if (!caseRef || !pdf || !['desk', 'handover'].includes(kind)) {
      return new Response('Bad request', { status: 400 });
    }
    if (!(await verifyToken(env.SEND_TOKEN_KEY, caseRef, token))) {
      return new Response('Unauthorised', { status: 401 });
    }

    const to = kind === 'desk' ? env.DESK_TO : handoverTo;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return new Response('Bad recipient', { status: 400 });
    }

    const accessToken = await graphToken(env);
    const message = {
      message: {
        subject:
          kind === 'desk'
            ? `Repatriation record — ${caseRef}`
            : `Repatriation handover letter — ${caseRef}`,
        body: {
          contentType: 'Text',
          content:
            'Please find the attached repatriation documentation. ' +
            'This email was sent automatically by the Healix repatriation documentation app.',
        },
        toRecipients: [{ emailAddress: { address: to } }],
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: pdf.name || `${caseRef}.pdf`,
            contentType: 'application/pdf',
            contentBytes: btoa(String.fromCharCode(...new Uint8Array(await pdf.arrayBuffer()))),
          },
        ],
      },
      saveToSentItems: true, // audit trail in the mailbox
    };

    const resp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.SENDER)}/sendMail`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      },
    );
    if (!resp.ok) {
      console.log('graph send failed', resp.status); // no patient content logged
      return new Response('Send failed', { status: 502 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

async function verifyToken(keyString, caseRef, token) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyString),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(caseRef));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time-ish comparison
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function graphToken(env) {
  const resp = await fetch(
    `https://login.microsoftonline.com/${env.MSGRAPH_TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MSGRAPH_CLIENT,
        client_secret: env.MSGRAPH_SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  const data = await resp.json();
  return data.access_token;
}
