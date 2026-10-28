"""Settings read from environment variables.

Add every new variable here and to .env.example, with a placeholder value.
"""

import os

APP_ENV = os.getenv("APP_ENV", "dev")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
# Standard Port for a self-hosted Ollama: port 11434
# From inside the Docker use http://host.docker.internal:11434 (Ollama on the host)
# or http://ollama:11434 (an ollama service in docker-compose)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")