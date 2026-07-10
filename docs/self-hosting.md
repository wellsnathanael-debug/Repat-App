# Self-hosting (Docker) and the case repository

The app can run as a Docker container on Healix infrastructure. The container serves the app
itself **and** the optional **case repository** — a central store of completed cases
(structured data for reporting + both generated PDFs) that escorts submit to from the Export
screen, with automatic offline queueing.

## Run it

```bash
docker compose up --build        # uses docker-compose.yml; change DESK_TOKEN first
# or
docker build -t repat-app .
docker run -p 8080:8080 -e DESK_TOKEN='a-long-random-value' -v repat-data:/data repat-app
```

Environment variables:

| Var | Default | Purpose |
|---|---|---|
| `DESK_TOKEN` | — (required) | Protects the desk view and every download. HTTP Basic auth, username `desk`, password = the token |
| `PORT` | `8080` | Listen port |
| `DATA_DIR` | `/data` | Where the SQLite database lives — mount a volume and back it up |

## What it serves

- `/` — the app itself (identical to the GitHub Pages deployment, served at the root).
- `/desk` — the repat desk's list of submitted cases with download links (Basic auth).
- `/api/health` — feature probe; its presence is what makes the app show
  "Submit to desk repository" on the Export screen.
- `/api/submissions` — POST (from the app) and authenticated GET (JSON list);
  `/api/submissions/<id>/full.pdf|handover.pdf|data.json` for downloads.

The database is a single SQLite file in `DATA_DIR` — trivially backed up, and readable by any
reporting tool that speaks SQLite (the `dataJson` column holds every form answer, keyed
`tabId/fieldId`, plus the case record).

## Deployment requirements (v1 security stance — read before going live)

- **Host it on the internal network or behind a VPN, with TLS** terminated by your reverse
  proxy (the container speaks plain HTTP). The submission endpoint is deliberately
  unauthenticated in v1 — network placement is the control that protects it; `DESK_TOKEN`
  protects all reads. A per-case submission token is planned alongside the email-relay work.
- Escorts must use the app **served by this container** (install to home screen from its URL)
  for submissions to work — the GitHub Pages deployment has no repository and hides the
  feature. Everything else about the app behaves identically, including full offline use.
- Enabling the repository changes the organisation's data posture: a central store of patient
  data now exists, under IT's controls. `SECURITY.md` ("Optional component") covers what that
  means; make sure the risk team has seen it.
- Retention is yours to operate: the server keeps submissions until deleted
  (`DELETE FROM submissions WHERE …` on the SQLite file, or a scheduled job).
