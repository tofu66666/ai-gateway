from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import dependencies
from app.main import app
from app.routers import virtual_key

KEY_ID = "22222222-2222-2222-2222-222222222222"
TEAM = {"id": "team-1", "owner_id": "lead-1"}
AUTH = {"Authorization": "Bearer good-token"}
REVOKED_AT = "2026-10-21T00:00:00+00:00"
client = TestClient(app)


@pytest.fixture
def db(monkeypatch):
    """Mock every database call; by default the caller owns an active key."""
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    state = {
        "user_id": "member-1",
        "role": "user",
        "key": {
            "id": KEY_ID,
            "project_id": "project-1",
            "user_id": "member-1",
            "expires_at": future,
            "revoked_at": None,
        },
        "revoked": [],
    }

    def revoke_key(key_id, actor_id):
        state["revoked"].append((str(key_id), actor_id))
        return {**state["key"], "revoked_at": REVOKED_AT}

    auth_client = MagicMock()
    auth_client.auth.get_user.side_effect = lambda token: SimpleNamespace(
        user=SimpleNamespace(id=state["user_id"], email=None)
    )
    monkeypatch.setattr(dependencies, "supabase", auth_client)
    monkeypatch.setattr(dependencies, "get_user_role", lambda user_id: state["role"])
    monkeypatch.setattr(virtual_key, "find_key", lambda key_id: state["key"])
    monkeypatch.setattr(virtual_key, "get_project_team", lambda project_id: TEAM)
    monkeypatch.setattr(virtual_key, "revoke_key", revoke_key)
    return state


def revoke(key_id=KEY_ID):
    return client.post("/revoke_api_key", json={"key_id": key_id}, headers=AUTH)


def test_owner_revokes_own_key(db):
    response = revoke()

    assert response.status_code == 200
    assert response.json() == {"id": KEY_ID, "status": "revoked", "revoked_at": REVOKED_AT}
    assert db["revoked"] == [(KEY_ID, "member-1")]


def test_team_lead_revokes_key_in_their_team(db):
    db["user_id"], db["role"] = "lead-1", "team_lead"

    assert revoke().status_code == 200
    assert db["revoked"] == [(KEY_ID, "lead-1")]


def test_admin_revokes_any_key(db):
    db["user_id"], db["role"] = "admin-1", "admin"

    assert revoke().status_code == 200


@pytest.mark.parametrize("role", ["user", "team_lead"])
def test_other_users_cannot_revoke(db, role):
    db["user_id"], db["role"] = "someone-else", role

    response = revoke()

    assert response.status_code == 403
    assert db["revoked"] == []


def test_unknown_key_is_not_found(db):
    db["key"] = None

    assert revoke().status_code == 404


def test_already_revoked_key_is_rejected(db):
    db["key"]["revoked_at"] = REVOKED_AT

    response = revoke()

    assert response.status_code == 400
    assert db["revoked"] == []


def test_revoke_lost_to_another_request_is_rejected(db, monkeypatch):
    monkeypatch.setattr(virtual_key, "revoke_key", lambda key_id, actor_id: None)

    assert revoke().status_code == 400


def test_revoke_database_error_is_hidden(db, monkeypatch):
    def fail(key_id, actor_id):
        raise RuntimeError("database password")

    monkeypatch.setattr(virtual_key, "revoke_key", fail)

    response = revoke()

    assert response.status_code == 500
    assert response.json() == {"message": "Failed to revoke key"}


def test_revoke_needs_a_valid_key_id(db):
    assert revoke("not-a-uuid").status_code == 422


def test_revoke_needs_login(db):
    assert client.post("/revoke_api_key", json={"key_id": KEY_ID}).status_code == 401


def test_revoke_key_calls_the_atomic_function(monkeypatch):
    fake = MagicMock()
    fake.rpc.return_value.execute.return_value = SimpleNamespace(data=[{"id": KEY_ID}])
    monkeypatch.setattr(virtual_key, "supabase", fake)

    assert virtual_key.revoke_key(KEY_ID, "member-1") == {"id": KEY_ID}
    fake.rpc.assert_called_once_with(
        "revoke_virtual_key", {"p_key_id": KEY_ID, "p_actor_id": "member-1"}
    )
