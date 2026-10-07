# Development guide

Start the stack using the [README](README.md). Run commands from the repo root unless a different folder is specified.

## Tools

- Docker Desktop for the app containers.
- Node 24 for frontend development on your machine.
- Python 3.12 for backend tests outside Docker (optional).

## How the pieces fit together

```text
Browser
  |
  v
nginx (8080) or Vite (5173)
  |  /api/health -> /health
  v
FastAPI / Uvicorn (8000)
  |
  v
Supabase (database and auth)
```

The dashboard uses relative `/api/...` URLs. nginx (`frontend/nginx.conf`) and Vite (`frontend/vite.config.ts`) forward them to the backend and remove the `/api` prefix. This keeps requests on the page's origin, so the current setup needs no backend CORS configuration.

| Port | What runs there | Started by |
|---|---|---|
| 8080 | Built dashboard, served by nginx | `docker compose up` |
| 8000 | FastAPI backend | `docker compose up` |
| 5173 | Vite dev server | `npm run dev` in `frontend/` |

## Environment variables

Compose reads `.env` for variable substitution and passes it to the backend through `env_file`. `backend/app/config.py` reads those values.

| Variable | Required | What it's for |
|---|---|---|
| `APP_ENV` | no | Environment label: `dev` (default), `test` or `prod` |
| `SUPABASE_URL` | yes | the Supabase project URL, `https://<project-ref>.supabase.co` |
| `SUPABASE_KEY` | yes | the Supabase API key the backend uses |

- Compose refuses to start if either Supabase value is missing or empty.
- The frontend waits for the backend health check. `/health` queries the Supabase `users` table and returns HTTP 500 if the query fails.
- After changing `.env`, run `docker compose up --force-recreate` to apply it.
- Outside Docker, set variables in your shell; the app does not load `.env` itself.

Add new variables to `backend/app/config.py`, `.env.example`, and this table. Leave secrets empty in the template.

## Working on the backend

Compose mounts `backend/` at `/app` and runs Uvicorn with `--reload`. Python changes reload automatically. The Dockerfile alone runs without reload.

```sh
docker compose logs -f backend   # follow logs
docker compose ps               # check container status
docker compose up --build       # rebuild after dependency changes
```

Add packages to `backend/requirements.txt` with explicit versions, then rebuild. Packages are installed in the image, so code reload does not install new dependencies.

### Adding an endpoint

1. Create a module in `backend/app/routers/`, for example `ping.py`:

   ```python
   from fastapi import APIRouter

   router = APIRouter(tags=["ping"])


   @router.get("/ping")
   def ping():
       return {"pong": True}
   ```

2. Register it in `backend/app/main.py`:

   ```python
   from app.routers import ping

   app.include_router(ping.router)
   ```

3. Add tests in `backend/tests/`, including error cases where applicable.
4. Save and check the route at http://localhost:8000/docs.

## Working on the dashboard

The frontend container serves a static build. For live updates, keep Compose running and start Vite in a second terminal, from the repo root:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite updates the page as you save and proxies `/api/...` to port 8000.

Run `npm ci` after cloning or pulling lockfile changes. It installs the locked dependencies. To add a package, run `npm install <package>` in `frontend/` and commit both `package.json` and `package-lock.json`.

Put backend calls in `frontend/src/api.ts` and use `/api/...` paths. Calling port 8000 directly bypasses the proxy and requires CORS configuration.

The current page is in `frontend/src/App.tsx`; there is no client-side router yet.

To update the static build on port 8080, run `docker compose up --build` from the repo root.

## Tests and CI

`.gitlab-ci.yml` runs two jobs on push:

- `backend-test`: installs runtime and test dependencies, then runs `pytest -q` in `python:3.12-slim`.
- `frontend-build`: runs `npm ci`, `npm run lint` (oxlint), and `npm run build` (TypeScript and Vite) in `node:24-alpine`.

Run the frontend checks from `frontend/`:

```sh
npm ci
npm run lint
npm run build
```

Run backend tests from the repo root using Docker:

```sh
docker compose run --rm --build backend sh -c "pip install -r requirements-dev.txt && pytest -q"
```

Or use local Python. From the repo root in PowerShell:

```powershell
cd backend
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt -r requirements-dev.txt
.venv\Scripts\python -m pytest -q
```

On macOS or Linux, use Python 3.12 to create the venv and replace `.venv\Scripts\python` with `.venv/bin/python`. Activation is not required.

`pytest.ini` adds `backend/` to the import path, so tests can use `from app...`. `db.py` creates the Supabase client at import time; set test configuration and mock client creation before importing `app.main` in route tests.

Backend coverage is currently limited to an import test. API responses and database calls are not covered yet.

## Git workflow

1. Start from an up-to-date `main`: `git switch main`, then `git pull`.
2. Make a branch: `git switch -c <your-branch>`.
3. Push the branch and open a merge request into `main`. Do not push directly to `main`.

Stop the stack with `docker compose down` before switching branches: the running backend uses the files in your checkout.

Use LF line endings, as configured in `.gitattributes`.

Keep `.env` and credentials out of Git and screenshots. Rotate any exposed key.

## Common problems

| Problem | First check |
|---|---|
| Cannot connect to the Docker API or daemon | Check that Docker Desktop's engine is running. |
| Missing `SUPABASE_URL` or `SUPABASE_KEY` | Set both values in `.env`. |
| Backend is `unhealthy` | Run `docker compose logs backend`. Check startup errors and, if `/health` returns 500, Supabase configuration and access to `users`. |
| Dashboard shows `Backend: unreachable` | Check `docker compose ps` and backend logs. |
| `port is already allocated` | Check `docker ps` and local processes for another service on port 8000 or 8080. |
| Frontend edits do not appear on port 8080 | Use Vite on port 5173, or rebuild the frontend image. |
| `ModuleNotFoundError` after adding a package | Check `requirements.txt` and rebuild the backend image. |
| PowerShell blocks venv activation | Run `.venv\Scripts\python` directly. |
