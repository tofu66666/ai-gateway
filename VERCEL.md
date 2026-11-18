# Vercel deployment guide

This guide explains how to deploy the AI Gateway project to Vercel.

## Repository layout

- `frontend/` — Vite + React dashboard
- `backend/` — FastAPI API
- `vercel.json` — root-level routing config for the deployed app

## Prerequisites

- Vercel account
- GitHub repository connected to Vercel
- Supabase credentials for auth and DB access
- API provider keys for OpenAI, Anthropic, Gemini, and Ollama (as needed)

## Required environment variables

Set these in Vercel Project Settings > Environment Variables.

- `APP_ENV=prod`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `OLLAMA_BASE_URL` (optional, default `http://localhost:11434`)

For local development, the app also uses a `.env` file pattern shown in the repo, but production deployments should use Vercel environment variables instead.

## Recommended deployment flow

1. Push the branch with the Vercel config and app updates to GitHub.
2. In Vercel, import the repository and select the project root.
3. Keep the repo root as the project root.
4. Configure the project to use the repo layout shown above.
5. Add the environment variables listed in this guide.
6. Trigger the deployment.

## Deployment requirements

For handover to Vercel, the deployed branch must include all of the following:

- `vercel.json` at the repository root
- the FastAPI app entrypoint updates in `backend/app/main.py`
- the `/api` route wiring used by the frontend
- the frontend API client expectations for `/api/...` requests
- the required environment variables for Supabase, app config, and provider keys

The key requirement is that routers must be mounted with a prefix so the app uses `/api/...` paths consistently. This is not optional.

Backend example:

```python
app.include_router(auth.router, prefix="/api")
app.include_router(team.router, prefix="/api")
```

Frontend example:

```ts
fetch(new URL(`/api${path}`, window.location.origin))
```

This is the contract the dashboard expects for requests such as `/api/login`, `/api/me`, `/api/models`, and `/api/requests`.

If any of these are missing, the deployment will not behave as a combined frontend + API service.

## Vercel routing expectations

The repo uses a Vercel routing config that expects:

- `/api/*` to be forwarded to the backend
- all other routes to be served by the frontend

This allows the dashboard and API to work together under a single deployment.

## Summary

A successful Vercel deployment requires:

- the Vercel routing config (`vercel.json`)
- the FastAPI app + `/api` entrypoint updates in `backend/app/main.py`
- the frontend/backend API wiring
- the required environment variables

This is the minimum required for handover to `/origin/main`-based deployment.
