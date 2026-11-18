# Supabase deployment guide

Use Supabase as the database and auth provider for the AI Gateway project. The backend expects the schema in `backend/db/schema.sql` to exist in the project database.

## 1. Create the Supabase project

1. Create a new Supabase project in the Supabase dashboard.
2. Note the project URL and anon/service role keys.
3. In the project settings, enable the features the app expects:
   - Authentication
   - Email auth
   - Postgres database

## 2. Apply the database schema

Run the SQL from `backend/db/schema.sql` in the Supabase SQL editor.

This schema creates the core tables the app relies on, including:

- `models`
- `model_deployments`
- `teams`
- `users`
- `user_team_mappings`
- `projects`
- `virtual_keys`
- `requests`
- `audits`

The schema also contains the helper functions:

- `add_spend(p_id uuid, amount numeric)`
- `revoke_virtual_key(p_key_id uuid, p_actor_id uuid)`
- `rotate_virtual_key(p_key_id uuid, p_actor_id uuid, p_hash text, p_prefix text)`

These are required for the backend key-rotation and spend-tracking flows.

## 3. Configure auth

The app relies on Supabase Auth for user login and signup. The `users` table is linked to `auth.users(id)`, so the app expects auth users to be created before rows are inserted into the `users` table.

Recommended setup:

- enable email/password sign-in
- keep email confirmation enabled if you want a stricter flow
- ensure the backend reads the Supabase URL and key from the deployment environment

## 4. Configure environment variables

Set these in Vercel or your deployment environment:

- `SUPABASE_URL`
- `SUPABASE_KEY`

The backend uses these values to create the client that accesses the Postgres database and auth layer.

## 5. Important database notes

The schema intentionally uses a service-role style setup for backend operations:

- the app is expected to use the backend's secret key, not the public anon key
- the SQL file defines data integrity checks such as role constraints and model routing settings

This means the database is meant to be operationally managed by the backend and not by client-side code directly.

## Deployment checklist

Before launch:

- create the Supabase project
- import `backend/db/schema.sql`
- set `SUPABASE_URL` and `SUPABASE_KEY`
- confirm email auth is enabled
- confirm environment variables are available in the deployment environment

Once both Vercel and Supabase are configured, the project should be ready to run with the backend, frontend, and database connected.
