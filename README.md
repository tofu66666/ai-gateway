# P127 AI Gateway

COMP9900 26T3 capstone project P127, an AI request analysis platform: one OpenAI-compatible gateway in front of several LLM providers, with virtual keys, usage and cost logging, budgets and a web dashboard.

The repository holds two services that start together with Docker Compose: a FastAPI backend (the gateway) and a React dashboard. The database is the team's hosted Supabase project, so there is no database container.

## Repository structure

```text
.
├── backend/                  FastAPI gateway (Python 3.12)
│   ├── app/
│   │   ├── main.py           creates the app and registers the routers
│   │   ├── config.py         settings read from environment variables
│   │   └── routers/          one module per area (health now; keys, chat, stats later)
│   ├── tests/                pytest tests
│   ├── Dockerfile
│   ├── requirements.txt      runtime dependencies, pinned
│   └── requirements-dev.txt  test dependencies
├── frontend/                 dashboard (React + TypeScript, built with Vite)
│   ├── src/                  React code; api.ts holds the calls to the backend
│   ├── nginx.conf            serves the built site and forwards /api to the backend
│   ├── Dockerfile            Node build stage, then nginx
│   └── vite.config.ts        dev server; forwards /api to localhost:8000
├── docker-compose.yml        starts backend and frontend together
├── .env.example              template for your .env (placeholders only)
└── .gitlab-ci.yml            backend tests and frontend lint and build on every push
```

## Quick start with Docker

You need Git and Docker Desktop (running).

1. Clone the repository and open a terminal in it.
2. Create your environment file: `cp .env.example .env`
3. Put the real `DATABASE_URL` in `.env` (ask Alex). The placeholder is enough to start the skeleton.
4. Build and start both services: `docker compose up --build`

| What | Address |
|---|---|
| Dashboard | http://localhost:8080 |
| Gateway API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

The dashboard shows `Backend: ok (...)` when both containers are up. The frontend starts only after the backend passes its health check. Stop with `Ctrl+C`, then run `docker compose down`.

## Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `APP_ENV` | no (default `dev`) | `dev`, `test` or `prod` |
| `DATABASE_URL` | yes | Supabase Postgres, Session pooler connection string. Compose refuses to start without it |

`.env` is git-ignored and never committed. When you add a variable, read it in `backend/app/config.py` and add it to `.env.example` with a placeholder value.

## Local development with hot reload

Docker runs the production build. While you work on one part, run that part on your machine instead.

Backend (Python 3.12):

```sh
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS / Linux: source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Run this way, the backend reads variables from your shell, not from `.env`; the defaults are enough for the skeleton.

Frontend (Node 24):

```sh
cd frontend
npm ci
npm run dev                       # http://localhost:5173; /api goes to localhost:8000
```

## Tests

```sh
cd backend
pytest -q
```

```sh
cd frontend
npm run lint
npm run build
```

Without Python on your machine, run the backend tests in Docker:

```sh
docker compose run --rm --build backend sh -c "pip install -r requirements-dev.txt && pytest -q"
```

GitLab CI runs the same checks on every push (`.gitlab-ci.yml`).

## Adding code

- New API endpoint: add a router module in `backend/app/routers/`, register it in `backend/app/main.py`, and add a test in `backend/tests/`.
- New dashboard page or component: put it in `frontend/src/` and call the backend through `/api/...` (see `src/api.ts`), never through a hard-coded host.
- New dependency: pin it in `requirements.txt`, or install it with `npm install <package>` and commit both `package.json` and `package-lock.json`.

## Working together

- Work on a branch and open a merge request into `main`; do not push to `main` directly.
- Never commit `.env`, keys or passwords.

## Common problems

| Symptom | Fix |
|---|---|
| `required variable DATABASE_URL is missing a value` | Run `cp .env.example .env`, then set `DATABASE_URL` |
| `port is already allocated` | Another container uses port 8000 or 8080: find it with `docker ps` and stop it |
| Dashboard shows `Backend: unreachable` | Check `docker compose ps` and `docker compose logs backend` |
| Code changes do not show up | Rebuild: `docker compose up --build` |
| A shell script fails with `no such file or directory` | It has Windows (CRLF) line endings; `.gitattributes` keeps fresh checkouts on LF |
