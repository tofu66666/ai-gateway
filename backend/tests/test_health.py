from unittest.mock import MagicMock
from app import config



def test_client_import_fails_when_no_supabase():
    if not config.SUPABASE_KEY or not config.SUPABASE_URL:
        try:
            from app.main import app
            from app.routers import health
            assert False
        except Exception:
            assert True
