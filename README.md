# AI Gateway

AI Gateway is our COMP9900 capstone project. We are building an OpenAI-compatible gateway with virtual keys, provider routing, budgets, and a dashboard for usage and cost reporting.

Applications call one endpoint (`/chat/completions`, `/embeddings`, `/completions`) with a virtual key. The gateway checks the key, budget, and guardrails, routes the request to a deployment of the requested model alias (OpenAI, Anthropic, Gemini, or Ollama), and logs its cost. The dashboard shows usage and spend, and manages teams, projects, keys, and models.

## What's in the repo

- `backend/` - Python 3.12, FastAPI, and Uvicorn.
- `frontend/` - React, TypeScript, and Vite.
- Supabase hosts the database and authentication. There is no database container.

Docker Compose starts the backend and the dashboard together.

## Run it

You need Git and Docker Desktop, with the Docker engine running.

1. Clone the repo and open a terminal in its folder.
2. Copy the environment template (`cp` also works in PowerShell):

   ```sh
   cp .env.example .env
   ```

3. Set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`. This file is ignored by Git.
4. Build and start both services:

   ```sh
   docker compose up --build
   ```

   The first build may take a few minutes.

| Service | Address |
|---|---|
| Dashboard | http://localhost:8080 |
| API docs | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

With the default `APP_ENV=dev`, the dashboard should show `Backend: ok (env: dev, database URL set)`.

To stop, press `Ctrl+C` and then run `docker compose down`.

## Testing

Every push runs the backend tests and the frontend lint and build in GitLab CI (`.gitlab-ci.yml`). None of the automated tests need a Supabase project or provider API keys.

### Approach

- **Backend unit and integration tests** (`backend/tests/`, pytest). Route tests call the real FastAPI app through its test client, so they cover request validation, auth, permission checks, business logic, and the HTTP response together. Pure logic (cost, guardrails, load balancing, retry policy) is also tested directly.
- **Mocked external services.** The Supabase client and the LLM providers are replaced with fakes in every test. This keeps the tests fast and repeatable, and lets them simulate failures that are hard to cause for real: database errors, provider 5xx responses, timeouts, rejected provider keys, and streams that fail part way through.
- **Happy and sad paths.** Alongside the working cases, tests check:
  - 401 for missing, invalid, or expired tokens
  - 403 for wrong roles or teams, 404 for unknown resources, and 400 or 422 for bad input
  - revoked or expired keys, and exhausted budgets refused before any provider call
  - blocked phrases, and database errors returned as safe messages
- **Resilience and concurrency.** Tests cover retries and backoff, deployment cooldown after repeated failures, 503 when every deployment is cooling down, and a caller hanging up mid-stream (logged as 499). `test_load_split.py` sends 200 requests, 8 at a time, over real HTTP to a stub provider and checks how the load balancer spreads them across deployments.
- **Frontend end-to-end tests** (`frontend/cypress/e2e/`, Cypress). These drive the real dashboard in a browser with the API stubbed: sign-in redirects, signing in, and navigating every dashboard page. The frontend is also type-checked and linted on every push.

### Running the tests

Backend, from the repo root. Compose needs the `.env` file from [Run it](#run-it), but the tests never use its Supabase values:

```sh
docker compose run --rm --build backend sh -c "pip install -r requirements-dev.txt && pytest -q"
```

Backend coverage report:

```sh
docker compose run --rm --build backend sh -c "pip install -r requirements-dev.txt && pytest -q --cov=app --cov-report=term"
```

Frontend checks, from `frontend/`:

```sh
npm ci
npm run lint
npm run build
```

Cypress, from `frontend/` (starts Vite on port 5173 itself, no backend needed):

```sh
npm run e2e
```

### Results

On 18 Nov 2026: **631 backend tests pass, with 86% line coverage of `backend/app`**, and both Cypress specs pass.

| Area | Tests | Files |
|---|---:|---|
| Gateway requests, streaming, embeddings, failover | 153 | `test_gateway*.py` |
| Teams and projects | 124 | `test_team.py`, `test_project.py` |
| Models, deployments, retry settings | 89 | `test_models.py`, `test_deployment_settings.py`, `test_resilience_settings.py` |
| Virtual keys (create, list, rotate, revoke) | 76 | `test_virtual_key.py`, `test_manage_keys.py`, `test_list_keys.py` |
| Load balancing, retries, providers | 61 | `test_load_balancer.py`, `test_load_split.py`, `test_retry_policy.py`, `test_providers.py` |
| Guardrails | 44 | `test_guardrails.py`, `test_guardrail_settings.py` |
| Request logging, history, cost | 38 | `test_request_log.py`, `test_request_history.py`, `test_cost.py` |
| Register, login, current user, audit log | 44 | `test_auth.py`, `test_login.py`, `test_current_user.py` |
| Health | 2 | `test_health.py` |

| Coverage | Modules |
|---|---|
| 100% | `gateway_logic_helper`, `load_balancer`, `request_log`, `retry_policy`, `cost`, `config`, `routers/deployment_settings`, `routers/guardrail_settings`, `routers/health`, `routers/request_history` |
| 90–99% | `budget`, `dependencies`, `guardrails`, `providers`, `routers/audit`, `routers/auth`, `routers/gateway`, `routers/models` |
| 80–89% | `routers/virtual_key`, `routers/project` |
| Below 80% | `routers/team` (76%), `routers/db` (45%), `routers/stats` (15%) |

### What the automated tests do not cover

- **Real Supabase and real providers.** Calls to the live database and to OpenAI, Anthropic, Gemini, and Ollama are mocked. Live behaviour was checked by hand during each sprint through the API docs (`/docs`) and the dashboard Playground. These checks need real credentials and paid provider calls, and can fail for reasons outside our control (provider outages, rate limits, expired keys), so they are not part of CI.
- **Frontend components.** The Cypress specs check that pages load and navigation works with empty data. Component behaviour (forms, dialogs, filters) is checked by hand.
- **Load testing the full stack.** `backend/loadtest/split_test.py` runs the load-balancing check against the running gateway and a stub provider (`docker compose --profile loadtest up -d`). It needs a live database and a virtual key, so it is run by hand.

## Working on the code

See [DEVELOPMENT.md](DEVELOPMENT.md) for development, tests, Git workflow, and troubleshooting.
