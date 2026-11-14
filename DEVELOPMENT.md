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
| 9100 | Stub provider for load tests | `docker compose --profile loadtest up -d` |

## Environment variables

Compose reads `.env` for variable substitution and passes it to the backend through `env_file`. `backend/app/config.py` reads those values.

| Variable | Required | What it's for |
|---|---|---|
| `APP_ENV` | no | Environment label: `dev` (default), `test` or `prod` |
| `SUPABASE_URL` | yes | the Supabase project URL, `https://<project-ref>.supabase.co` |
| `SUPABASE_KEY` | yes | the Supabase API key the backend uses |
| `LLM_KEY_<NAME>` | no | a provider key for one deployment, referred to by `api_key_env` |

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

### Load balancing

A row in `models` is the alias clients ask for. Its rows in `model_deployments` are the places it can be served from. Every alias starts with one deployment called `default`. Admins replace the list with `PUT /models/{id}/deployments`:

```json
{
  "routing_strategy": "least_busy",
  "deployments": [
    { "name": "east", "provider": "openai", "model": "gpt-4o", "api_key_env": "LLM_KEY_OPENAI_EAST" },
    { "name": "west", "provider": "openai", "model": "gpt-4o", "api_key_env": "LLM_KEY_OPENAI_WEST" }
  ]
}
```

- Deployments on the same key share one rate limit, so give each its own `LLM_KEY_<NAME>`.
- `base_url` overrides the provider's URL and includes the version path. A deployment with a `base_url` needs its own key, because the shared provider key is only sent to the provider's own URL.
- A deployment taken off the list is disabled, not deleted, so old requests keep their link to it.
- Three failures (provider 5xx, 429, timeout, or a rejected key) in 60 seconds take a deployment out of rotation for 60 seconds. If every deployment is out, clients get 503 with `Retry-After`. `GET /models/{id}/deployments` shows each one's `in_flight` and `cooldown_seconds`.
- Busy counts and cooldowns live in the backend process, so they reset on restart. Running more than one Uvicorn worker needs them moved to Redis first.

To see a traffic split, start the stub, point two deployments at it, and run the script with a virtual key for that alias:

```sh
docker compose --profile loadtest up -d
# base_url: http://stub-provider:9100/fast/v1 and http://stub-provider:9100/slow/v1
docker compose exec backend python loadtest/split_test.py --key mq-k_... --model my-alias
```

`STUB_DELAYS` sets how slowly each path answers (default `fast=0.01,slow=0.2`). `tests/test_load_split.py` runs the same check in CI without Supabase.

### Alias retries (H18IALMOND-23)

Admins read or replace an alias's complete policy with
`GET /models/{id}/resilience` and `PUT /models/{id}/resilience`:

```json
{"retry_count": 3, "retry_backoff_seconds": [1, 2, 4], "timeout_seconds": 30}
```

- Defaults allow four total attempts on the same deployment. Each attempt uses
  the alias's HTTPX timeout, including Ollama; this is not a total request deadline.
- Network failures, timeouts and upstream 429/500/502/503/504 are retried.
  A stream is only retried before it starts, never after output begins.
- Set `retry_count` to 0 and `retry_backoff_seconds` to `[]` to disable retries.
- Only the final result is logged and counted towards cooldown. `attempt_count`
  includes the first call; refusals before an upstream call record 0. Latency
  includes retry waits, and project spend is updated once for the final result.
- `/health` adds `cooling_deployments` with deployment/model IDs and remaining
  seconds. Database health still determines its HTTP status. The admin deployment
  endpoint continues to expose `cooldown_seconds` for the routing page.

## Working on the dashboard

The frontend container serves a static build. For live updates, keep Compose running and start Vite in a second terminal, from the repo root:

```sh
cd frontend
npm ci
npm run dev
```

Open http://localhost:5173. Vite updates the page as you save and proxies `/api/...` to port 8000.

Run `npm ci` after cloning or pulling lockfile changes. It installs the locked dependencies. To add a package, run `npm install <package>` in `frontend/` and commit both `package.json` and `package-lock.json`.

Put backend calls in `frontend/src/api/` and use `/api/...` paths. Calling port 8000 directly bypasses the proxy and requires CORS configuration.

Where things go in `frontend/src/`:

| Folder | Contents |
|---|---|
| `app/` | `router.tsx` (one line per page), providers, the not-found page |
| `components/layout/` | the shell: sidebar, top bar, time window, user menu; `nav.ts` lists the sidebar pages and the roles that see them |
| `components/ui/` | shadcn/ui components, generated: add one with `npx shadcn@latest add <name>` and keep it as generated |
| `features/<area>/` | the pages and their parts, for example `features/teams/` |
| `api/`, `auth/`, `lib/` | backend calls and types, the signed-in user and route guards, small helpers |

A new page needs a route in `app/router.tsx` and, if it belongs in the sidebar, an entry in `components/layout/nav.ts`. Style with Tailwind classes; the 3.b colours are theme variables in `src/index.css` (`bg-primary`, `text-muted-foreground`, `text-success`, `text-warning`, `text-destructive`). Run `npm run format` before committing; it uses Prettier and sorts Tailwind classes.

Call the backend with `apiFetch` from `api/client.ts`. It adds the signed-in token, turns an error body into an `ApiError` with the server's message, and signs the person out when the backend rejects the token. Read the signed-in user with `useAuth()`, or `useCurrentUser()` on pages behind sign-in. To limit routes to some roles, wrap them in `RequireRole` in `app/router.tsx`.

To update the static build on port 8080, run `docker compose up --build` from the repo root.

## Tests and CI

`.gitlab-ci.yml` runs two jobs on push:

- `backend-test`: installs runtime and test dependencies, then runs `pytest -q` in `python:3.12-slim`.
- `frontend-build`: runs `npm ci`, `npm run lint` (oxlint), and `npm run build` (TypeScript and Vite) in `node:24-alpine`.

Run the frontend checks from `frontend/`:

```sh
npm ci
npm run lint
npm run format:check
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

Backend tests mock the Supabase client and the providers; nothing runs against a real database. See [Testing in the README](README.md#testing) for the approach, coverage, and the Cypress tests.

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
