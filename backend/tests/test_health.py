from fastapi.testclient import TestClient

from app.main import app
from app import config

client = TestClient(app)

# dryrun database is not reachable without credentials
def test_test():
    response = client.get("/health")
    if config.SUPABASE_URL is None or config.SUPABASE_KEY is None:
        assert response.status_code == 500
    if config.SUPABASE_URL and config.SUPABASE_KEY:
        assert response.status_code == 200
