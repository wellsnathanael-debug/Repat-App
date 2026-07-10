// Case repository server — the optional, IT-hosted central store for
// completed cases (structured data + both PDFs). Runs in the Docker container
// alongside the static app (see Dockerfile / docs/self-hosting.md).
//
// Zero npm dependencies: node:http + the built-in node:sqlite (Node 22+).
//
// Env:
//   PORT        default 8080
//   DATA_DIR    default /data   (SQLite database file lives here — volume it)
//   DESK_TOKEN  REQUIRED to start; protects every read endpoint (HTTP Basic
//               auth, username 'desk')
//   DIST_DIR    default ./dist  (the built app to serve)
//
// v1 security stance (documented in docs/self-hosting.md and SECURITY.md):
// submissions are write-only and unauthenticated — host this on the internal
// network / behind a VPN, with TLS terminated by your reverse proxy. Read
// access always requires DESK_TOKEN.

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const PORT = Number(process.env.PORT ?? 8080);
const DATA_DIR = process.env.DATA_DIR ?? '/data';
const DIST_DIR = process.env.DIST_DIR ?? './dist';
const DESK_TOKEN = process.env.DESK_TOKEN;
const MAX_BODY = 40 * 1024 * 1024; // structured data + two PDFs + attachments headroom

if (!DESK_TOKEN) {
  console.error('DESK_TOKEN must be set (protects the desk view and downloads).');
  process.exit(1);
}

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'repat-repository.sqlite'));
db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caseRef TEXT NOT NULL,
    patientName TEXT NOT NULL,
    escortName TEXT NOT NULL,
    submittedAt TEXT NOT NULL,
    receivedAt TEXT NOT NULL,
    dataJson TEXT NOT NULL,
    fullPdf BLOB,
    handoverPdf BLOB
  );
`);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json' });
}

function deskAuthorised(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString();
  const token = decoded.slice(decoded.indexOf(':') + 1);
  if (token.length !== DESK_TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ DESK_TOKEN.charCodeAt(i);
  return diff === 0;
}

function requireDesk(req, res) {
  if (deskAuthorised(req)) return true;
  send(res, 401, 'Authentication required', {
    'WWW-Authenticate': 'Basic realm="Repat desk", charset="UTF-8"',
  });
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function serveStatic(res, urlPath) {
  // The app is served at both / and /Repat-App/ so the standard build works
  // in the container and behind the GitHub Pages base path.
  let path = urlPath.replace(/^\/Repat-App(\/|$)/, '/');
  if (path === '/' || path === '') path = '/index.html';
  const file = normalize(join(DIST_DIR, path));
  if (!file.startsWith(normalize(DIST_DIR))) return send(res, 403, 'Forbidden');
  if (!existsSync(file) || !statSync(file).isFile()) {
    // SPA fallback for app routes.
    const index = join(DIST_DIR, 'index.html');
    if (existsSync(index)) {
      return send(res, 200, readFileSync(index), { 'Content-Type': MIME['.html'] });
    }
    return send(res, 404, 'Not found');
  }
  return send(res, 200, readFileSync(file), {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  try {
    if (path === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, service: 'repat-case-repository' });
    }

    if (path === '/api/submissions' && req.method === 'POST') {
      let payload;
      try {
        payload = JSON.parse((await readBody(req)).toString('utf-8'));
      } catch {
        return sendJson(res, 400, { error: 'invalid JSON or body too large' });
      }
      const { caseRef, patientName, escortName, submittedAt, data, fullPdfB64, handoverPdfB64 } =
        payload ?? {};
      if (!caseRef || !patientName || !data) {
        return sendJson(res, 400, { error: 'caseRef, patientName and data are required' });
      }
      const result = db
        .prepare(
          `INSERT INTO submissions
             (caseRef, patientName, escortName, submittedAt, receivedAt, dataJson, fullPdf, handoverPdf)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          String(caseRef),
          String(patientName),
          String(escortName ?? ''),
          String(submittedAt ?? new Date().toISOString()),
          new Date().toISOString(),
          JSON.stringify(data),
          fullPdfB64 ? Buffer.from(fullPdfB64, 'base64') : null,
          handoverPdfB64 ? Buffer.from(handoverPdfB64, 'base64') : null,
        );
      console.log(`submission #${result.lastInsertRowid} received: ${caseRef}`);
      return sendJson(res, 201, { ok: true, id: Number(result.lastInsertRowid) });
    }

    if (path === '/api/submissions' && req.method === 'GET') {
      if (!requireDesk(req, res)) return;
      const rows = db
        .prepare(
          `SELECT id, caseRef, patientName, escortName, submittedAt, receivedAt,
                  length(fullPdf) AS fullPdfBytes, length(handoverPdf) AS handoverPdfBytes
             FROM submissions ORDER BY id DESC`,
        )
        .all();
      return sendJson(res, 200, { submissions: rows });
    }

    const fileMatch = path.match(/^\/api\/submissions\/(\d+)\/(data\.json|full\.pdf|handover\.pdf)$/);
    if (fileMatch && req.method === 'GET') {
      if (!requireDesk(req, res)) return;
      const row = db.prepare('SELECT * FROM submissions WHERE id = ?').get(Number(fileMatch[1]));
      if (!row) return send(res, 404, 'Not found');
      const clean = String(row.caseRef).replace(/[^A-Za-z0-9-]/g, '');
      if (fileMatch[2] === 'data.json') {
        return send(res, 200, row.dataJson, {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="Repat_${clean}_data.json"`,
        });
      }
      const blob = fileMatch[2] === 'full.pdf' ? row.fullPdf : row.handoverPdf;
      if (!blob) return send(res, 404, 'No PDF stored for this submission');
      return send(res, 200, Buffer.from(blob), {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Repat_${clean}_${fileMatch[2]}"`,
      });
    }

    if (path === '/desk' && req.method === 'GET') {
      if (!requireDesk(req, res)) return;
      const rows = db
        .prepare(
          `SELECT id, caseRef, patientName, escortName, submittedAt, receivedAt
             FROM submissions ORDER BY id DESC`,
        )
        .all();
      const tr = rows
        .map(
          (r) => `<tr>
            <td>${escapeHtml(r.caseRef)}</td><td>${escapeHtml(r.patientName)}</td>
            <td>${escapeHtml(r.escortName)}</td><td>${escapeHtml(r.receivedAt)}</td>
            <td><a href="/api/submissions/${r.id}/full.pdf">Full record</a> ·
                <a href="/api/submissions/${r.id}/handover.pdf">Handover</a> ·
                <a href="/api/submissions/${r.id}/data.json">Data</a></td>
          </tr>`,
        )
        .join('');
      return send(
        res,
        200,
        `<!doctype html><meta charset="utf-8"><title>Repat case repository</title>
         <style>body{font-family:Inter,Arial,sans-serif;margin:2rem;color:#1B3931;background:#F0F3EB}
         h1{color:#17362D}table{border-collapse:collapse;width:100%;background:#fff}
         td,th{border:1px solid #d3ddd2;padding:.5rem .75rem;text-align:left;font-size:14px}
         th{background:#DCEBD8}</style>
         <h1>Repat case repository</h1>
         <p>${rows.length} submission${rows.length === 1 ? '' : 's'}.</p>
         <table><tr><th>Case ref</th><th>Patient</th><th>Escort</th><th>Received</th><th>Downloads</th></tr>${tr}</table>`,
        { 'Content-Type': MIME['.html'] },
      );
    }

    if (req.method === 'GET') return serveStatic(res, path);
    return send(res, 405, 'Method not allowed');
  } catch (err) {
    console.error(err);
    return sendJson(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`repat case repository listening on :${PORT} (data: ${DATA_DIR}, app: ${DIST_DIR})`);
});
