"""Settings read from environment variables.

Add every new variable here and to .env.example, with a placeholder value.
"""

import os

APP_ENV = os.getenv("APP_ENV", "dev")
DATABASE_URL = os.getenv("DATABASE_URL", "")
