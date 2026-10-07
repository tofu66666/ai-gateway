# AI Gateway

AI Gateway is our COMP9900 capstone project. We are building an OpenAI-compatible gateway with virtual keys, provider routing, budgets, and a dashboard for usage and cost reporting.

The repo currently contains the app skeleton: a FastAPI backend, a Supabase health check, and a placeholder dashboard. Provider calls, key management, and reporting are not implemented yet.

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

## Working on the code

See [DEVELOPMENT.md](DEVELOPMENT.md) for development, tests, Git workflow, and troubleshooting.
