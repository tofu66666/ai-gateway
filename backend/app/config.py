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
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
SAMBANOVA_API_KEY = os.getenv("SAMBANOVA_API_KEY", "")
CF_ACCOUNT_ID = os.getenv("CF_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN", "")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
# Standard Port for a self-hosted Ollama: port 11434
# From inside the Docker use http://host.docker.internal:11434 (Ollama on the host)
# or http://ollama:11434 (an ollama service in docker-compose)
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
# Deployments can also name their own key, LLM_KEY_<NAME>, which providers.py
# reads by name at request time. See "Load balancing" in DEVELOPMENT.md.
