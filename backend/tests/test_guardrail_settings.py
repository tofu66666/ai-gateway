# GET/PUT /projects/{id}/guardrails (H18IALMOND-39); Supabase is faked

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import dependencies
from app.main import app
from app.routers import guardrail_settings, project

client = TestClient(app)
AUTH = {"Authorization": "Bearer good-token"}
PROJECT_ID = "33333333-3333-3333-3333-333333333333"
URL = f"/projects/{PROJECT_ID}/guardrails"
ROW = {
    "id": PROJECT_ID,
    "team_id": "22222222-2222-2222-2222-222222222222",
    "name": "Support bot",
    "model_ids": ["44444444-4444-4444-4444-444444444444"],
    "budget_per_month": 100.0,
    "warning_threshold": 0.8,
    "blocked_patterns": ["secret"],
    "max_tokens_cap": 500,
}
EXPECTED = {"project_id": PROJECT_ID, "blocked_patterns": ["secret"], "max_tokens_cap": 500}


@pytest.fixture
def role(monkeypatch):
    state = {"role": "admin"}
    auth_client = MagicMock()
    auth_client.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="admin-1", email="admin@example.com")
    )
    monkeypatch.setattr(dependencies, "supabase", auth_client)
    monkeypatch.setattr(dependencies, "get_user_role", lambda user_id: state["role"])
    return state


@pytest.fixture
def db(monkeypatch):
    fake = MagicMock()
    select = fake.table.return_value.select.return_value.eq.return_value.limit.return_value
    select.execute.return_value.data = [ROW]
    fake.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [ROW]
    monkeypatch.setattr(guardrail_settings, "supabase", fake)
    monkeypatch.setattr(project, "supabase", fake)
    return fake


def put(body):
    return client.put(URL, json=body, headers=AUTH)


def saved_changes(db):
    return db.table.return_value.update.call_args.args[0]


# GET
def test_get_requires_token():
    assert client.get(URL).status_code == 401


def test_get_returns_settings(role, db):
    r = client.get(URL, headers=AUTH)
    assert r.status_code == 200
    assert r.json() == EXPECTED


@pytest.mark.parametrize("non_admin", ["team_lead", "user"])
def test_get_admin_only(role, db, non_admin):
    role["role"] = non_admin
    assert client.get(URL, headers=AUTH).status_code == 403
    db.table.assert_not_called()


def test_get_unknown_project(role, db):
    db.table.return_value.select.return_value.eq.return_value.limit.return_value \
        .execute.return_value.data = []
    assert client.get(URL, headers=AUTH).status_code == 404


def test_get_database_error_hidden(role, db):
    db.table.side_effect = RuntimeError("connection string with secrets")
    r = client.get(URL, headers=AUTH)
    assert r.status_code == 500
    assert "secrets" not in r.text


# PUT
def test_put_saves_settings_and_audits_project_state(role, db):
    r = put({"blocked_patterns": [" secret ", "SECRET", "launch codes"], "max_tokens_cap": 500})

    assert r.status_code == 200
    assert r.json() == EXPECTED
    assert saved_changes(db) == {
        "blocked_patterns": ["secret", "launch codes"],
        "max_tokens_cap": 500,
    }
    db.table.assert_any_call("audits")
    db.table.return_value.insert.assert_called_once_with(
        {
            "action": "project_modify",
            "user_id": "admin-1",
            "target_id": PROJECT_ID,
            "details": {
                "name": "Support bot",
                "team_id": ROW["team_id"],
                "model_ids": ROW["model_ids"],
                "budget_per_month": 100.0,
                "warning_threshold": 0.8,
                "blocked_patterns": ["secret"],
                "max_tokens_cap": 500,
            },
        }
    )


def test_put_empty_body_clears_guardrails(role, db):
    assert put({}).status_code == 200
    assert saved_changes(db) == {"blocked_patterns": [], "max_tokens_cap": None}


def test_put_audit_failure_keeps_the_saved_settings(role, db):
    db.table.return_value.insert.side_effect = RuntimeError("audit down")
    r = put({"max_tokens_cap": 500})
    assert r.status_code == 200
    assert r.json() == EXPECTED


@pytest.mark.parametrize("non_admin", ["team_lead", "user"])
def test_put_admin_only(role, db, non_admin):
    role["role"] = non_admin
    assert put({"max_tokens_cap": 10}).status_code == 403
    db.table.assert_not_called()


@pytest.mark.parametrize(
    "body",
    [
        {"max_tokens_cap": 0},
        {"max_tokens_cap": -5},
        {"max_tokens_cap": "100"},
        {"max_tokens_cap": True},
        {"blocked_patterns": ["   "]},
        {"blocked_patterns": ["x" * 201]},
        {"blocked_patterns": [f"p{i}" for i in range(101)]},
        {"blocked_patterns": "secret"},
    ],
)
def test_put_rejects_bad_settings(role, db, body):
    assert put(body).status_code == 422
    db.table.assert_not_called()


def test_put_unknown_project(role, db):
    db.table.return_value.update.return_value.eq.return_value.execute.return_value.data = []
    assert put({"max_tokens_cap": 10}).status_code == 404
    db.table.return_value.insert.assert_not_called()


def test_put_database_error_hidden(role, db):
    db.table.return_value.update.side_effect = RuntimeError("connection string with secrets")
    r = put({"max_tokens_cap": 10})
    assert r.status_code == 500
    assert "secrets" not in r.text
