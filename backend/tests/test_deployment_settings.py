# GET/PUT /models/{id}/deployments (H18IALMOND-37); Supabase is faked

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import dependencies, load_balancer
from app.load_balancer import LoadBalancer
from app.main import app
from app.routers import deployment_settings

client = TestClient(app)
AUTH = {"Authorization": "Bearer good-token"}
MODEL_ID = "44444444-4444-4444-4444-444444444444"
URL = f"/models/{MODEL_ID}/deployments"
ROW = {
    "id": "d-east",
    "name": "east",
    "provider": "openai",
    "model": "gpt",
    "base_url": None,
    "api_key_env": None,
    "position": 0,
}
EXPECTED = {
    "model_id": MODEL_ID,
    "routing_strategy": "least_busy",
    "deployments": [
        {
            "id": "d-east",
            "name": "east",
            "provider": "openai",
            "model": "gpt",
            "base_url": None,
            "api_key_env": None,
            "in_flight": 0,
            "cooldown_seconds": 0,
        }
    ],
}
ONE = {"name": "east", "provider": "openai", "model": "gpt"}
BODY = {"routing_strategy": "least_busy", "deployments": [ONE]}


@pytest.fixture
def role(monkeypatch):
    state = {"role": "admin"}
    auth_client = MagicMock()
    auth_client.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="admin-1", email="admin@example.com")
    )
    monkeypatch.setattr(dependencies, "supabase", auth_client)
    monkeypatch.setattr(dependencies, "get_user_role", lambda user_id: state["role"])
    monkeypatch.setattr(load_balancer, "balancer", LoadBalancer())
    return state


@pytest.fixture
def db(monkeypatch):
    fake = MagicMock()
    models = MagicMock()
    models.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": MODEL_ID, "routing_strategy": "least_busy"}
    ]
    deployments = MagicMock()
    deployments.select.return_value.eq.return_value.eq.return_value.order.return_value \
        .execute.return_value.data = [ROW]
    fake.table.side_effect = lambda name: {
        "models": models,
        "model_deployments": deployments,
    }[name]
    fake.models = models
    fake.rpc.return_value.execute.return_value.data = [ROW]
    monkeypatch.setattr(deployment_settings, "supabase", fake)
    return fake


def put(body):
    return client.put(URL, json=body, headers=AUTH)


def with_deployment(**fields):
    return {"routing_strategy": "round_robin", "deployments": [{**ONE, **fields}]}


# GET
def test_get_requires_token():
    assert client.get(URL).status_code == 401


def test_get_returns_settings(role, db):
    r = client.get(URL, headers=AUTH)
    assert r.status_code == 200
    assert r.json() == EXPECTED


def test_get_shows_live_state(role, db):
    load_balancer.balancer.acquire("alias", [ROW], "round_robin")
    for _ in range(3):
        load_balancer.balancer.record_failure("d-east")

    deployment = client.get(URL, headers=AUTH).json()["deployments"][0]

    assert deployment["in_flight"] == 1
    assert deployment["cooldown_seconds"] == 60


@pytest.mark.parametrize("non_admin", ["team_lead", "user"])
def test_get_admin_only(role, db, non_admin):
    role["role"] = non_admin
    assert client.get(URL, headers=AUTH).status_code == 403
    db.table.assert_not_called()


def test_get_unknown_model(role, db):
    db.models.select.return_value.eq.return_value.limit.return_value \
        .execute.return_value.data = []
    assert client.get(URL, headers=AUTH).status_code == 404


def test_get_database_error_hidden(role, db):
    db.table.side_effect = RuntimeError("connection string with secrets")
    r = client.get(URL, headers=AUTH)
    assert r.status_code == 500
    assert "secrets" not in r.text
