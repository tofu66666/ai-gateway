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
MODEL = {
    "id": MODEL_ID,
    "provider": "openai",
    "model": "gpt",
    "price_per_1m_input": "1.000000",
    "price_per_1m_output": "2.000000",
    "data_processing_country": "US",
    "data_processing_state": None,
    "prompt": None,
    "routing_strategy": "least_busy",
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
    models.update.return_value.eq.return_value.execute.return_value.data = [MODEL]
    deployments = MagicMock()
    deployments.select.return_value.eq.return_value.eq.return_value.order.return_value \
        .execute.return_value.data = [ROW]
    deployments.upsert.return_value.execute.return_value.data = [ROW]
    audits = MagicMock()
    fake.table.side_effect = lambda name: {
        "models": models,
        "model_deployments": deployments,
        "audits": audits,
    }[name]
    fake.models = models
    fake.deployments = deployments
    fake.audits = audits
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


# PUT
def test_put_saves_settings_and_audits_model_state(role, db):
    r = put(BODY)

    assert r.status_code == 200
    assert r.json() == EXPECTED
    db.models.update.assert_called_once_with({"routing_strategy": "least_busy"})
    db.deployments.upsert.assert_called_once_with(
        [
            {
                **ONE,
                "base_url": None,
                "api_key_env": None,
                "model_id": MODEL_ID,
                "position": 0,
                "enabled": True,
            }
        ],
        on_conflict="model_id,name",
    )
    db.audits.insert.assert_called_once_with(
        {
            "action": "model_modify",
            "user_id": "admin-1",
            "target_id": MODEL_ID,
            "details": {
                "provider": "openai",
                "model": "gpt",
                "price_per_1m_input": "1.000000",
                "price_per_1m_output": "2.000000",
                "data_processing_country": "US",
                "data_processing_state": None,
                "prompt": None,
                "routing_strategy": "least_busy",
                "deployments": [{**ONE, "base_url": None, "api_key_env": None}],
            },
        }
    )


def test_put_disables_only_what_it_did_not_save(role, db):
    put(BODY)

    db.deployments.update.assert_called_once_with({"enabled": False})
    disabling = db.deployments.update.return_value.eq
    disabling.assert_called_once_with("model_id", MODEL_ID)
    disabling.return_value.not_.in_.assert_called_once_with("id", ["d-east"])


def test_put_sets_position_from_list_order(role, db):
    second = {**ONE, "name": "west"}
    put({"routing_strategy": "round_robin", "deployments": [ONE, second]})

    saved = db.deployments.upsert.call_args.args[0]
    assert [(row["name"], row["position"]) for row in saved] == [("east", 0), ("west", 1)]


def test_put_accepts_own_url_and_key(role, db, monkeypatch):
    monkeypatch.setenv("LLM_KEY_EAST", "east-key")

    r = put(with_deployment(base_url="https://east.test/v1", api_key_env="LLM_KEY_EAST"))

    assert r.status_code == 200
    sent = db.deployments.upsert.call_args.args[0][0]
    assert sent["base_url"] == "https://east.test/v1"
    assert sent["api_key_env"] == "LLM_KEY_EAST"
    assert "east-key" not in str(db.deployments.mock_calls)
    assert "east-key" not in str(db.audits.mock_calls)


@pytest.mark.parametrize("non_admin", ["team_lead", "user"])
def test_put_admin_only(role, db, non_admin):
    role["role"] = non_admin
    assert put(BODY).status_code == 403
    db.table.assert_not_called()


@pytest.mark.parametrize(
    "body",
    [
        {"deployments": [ONE]},
        {"routing_strategy": "random", "deployments": [ONE]},
        {"routing_strategy": "round_robin", "deployments": []},
        {"routing_strategy": "round_robin", "deployments": [ONE, ONE]},
        with_deployment(provider="nope"),
        with_deployment(name="   "),
        with_deployment(base_url="ftp://east.test"),
        with_deployment(api_key="sk-real-key"),
    ],
)
def test_put_rejects_bad_settings(role, db, body):
    assert put(body).status_code == 422
    db.table.assert_not_called()


@pytest.mark.parametrize("name", ["SUPABASE_KEY", "OPENAI_API_KEY", "llm_key_east"])
def test_put_refuses_key_env_outside_the_prefix(role, db, monkeypatch, name):
    monkeypatch.setenv(name, "a-secret")

    assert put(with_deployment(api_key_env=name)).status_code == 422
    db.table.assert_not_called()


def test_put_refuses_key_env_that_is_not_set(role, db, monkeypatch):
    monkeypatch.delenv("LLM_KEY_MISSING", raising=False)

    r = put(with_deployment(api_key_env="LLM_KEY_MISSING"))

    assert r.status_code == 422
    assert "not set" in r.text
    db.table.assert_not_called()


def test_put_unknown_model(role, db):
    db.models.update.return_value.eq.return_value.execute.return_value.data = []

    assert put(BODY).status_code == 404
    db.deployments.upsert.assert_not_called()
    db.audits.insert.assert_not_called()


def test_put_database_error_hidden(role, db):
    db.table.side_effect = RuntimeError("connection string with secrets")
    r = put(BODY)
    assert r.status_code == 500
    assert "secrets" not in r.text


# A save is several calls, so check each way it can stop part way through
def test_put_saves_new_list_before_disabling_the_rest(role, db):
    put(BODY)

    calls = [call[0] for call in db.deployments.method_calls]
    assert calls.index("upsert") < calls.index("update")


def test_put_failed_save_disables_nothing(role, db):
    db.deployments.upsert.side_effect = RuntimeError("database down")

    assert put(BODY).status_code == 500
    db.deployments.update.assert_not_called()
    db.audits.insert.assert_not_called()


def test_put_failed_disable_is_an_error_and_not_audited(role, db):
    db.deployments.update.side_effect = RuntimeError("database down")

    assert put(BODY).status_code == 500
    db.deployments.upsert.assert_called_once()
    db.audits.insert.assert_not_called()


def test_put_audit_failure_keeps_the_saved_settings(role, db):
    db.audits.insert.side_effect = RuntimeError("audit down")

    r = put(BODY)

    assert r.status_code == 200
    assert r.json() == EXPECTED
