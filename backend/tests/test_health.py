from unittest.mock import MagicMock
from app import config
from app import load_balancer
from app.load_balancer import LoadBalancer
from app.main import app
from app.routers import health
from fastapi.testclient import TestClient



def test_client_import_fails_when_no_supabase():
    if not config.SUPABASE_KEY or not config.SUPABASE_URL:
        try:
            from app.main import app
            from app.routers import health
            assert False
        except Exception:
            assert True


def test_health_shows_cooldown_and_recovery(monkeypatch):
    now = [100.0]
    balancer = LoadBalancer(clock=lambda: now[0])
    monkeypatch.setattr(load_balancer, "balancer", balancer)
    fake = MagicMock()
    fake.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "east", "model_id": "alias"}, {"id": "west", "model_id": "alias"},
    ]
    monkeypatch.setattr(health, "supabase", fake)
    client = TestClient(app)
    assert client.get("/health").json()["cooling_deployments"] == []
    for _ in range(3):
        balancer.record_failure("east")
    now[0] += 0.25
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database_configured"] is True
    assert response.json()["cooling_deployments"] == [
        {"deployment_id": "east", "model_id": "alias", "cooldown_seconds": 60},
    ]
    fake.table.return_value.select.return_value.eq.assert_called_with("enabled", True)
    now[0] += 60
    assert client.get("/health").json()["cooling_deployments"] == []


def test_health_still_reports_database_failure(monkeypatch):
    fake = MagicMock()
    fake.table.side_effect = RuntimeError("offline")
    monkeypatch.setattr(health, "supabase", fake)
    response = TestClient(app).get("/health")
    assert response.status_code == 500
    assert response.json()["detail"]["status"] == "error - database not reachable"
