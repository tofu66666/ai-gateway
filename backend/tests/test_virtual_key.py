import hashlib
from datetime import datetime, timedelta, timezone

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app import dependencies
from app.main import app
from app.routers import virtual_key
from app.routers.virtual_key import KEY_MARKER, generate_key, hash_key

PROJECT_ID = "11111111-1111-1111-1111-111111111111"
TEAM = {"id": "team-1", "owner_id": "owner-1"}
AUTH = {"Authorization": "Bearer good-token"}
client = TestClient(app)


@pytest.fixture
def db(monkeypatch):
    """Mock every database call; by default the caller is the team owner."""
    state = {"user_id": "owner-1", "team": TEAM, "can_create_key": None, "inserted": []}

    def insert_key(key_data):
        state["inserted"].append(key_data)
        return {
            "id": "key-1",
            "created_at": "2026-10-09T00:00:00+00:00",
            "expires_at": key_data.get("expires_at", "2026-11-08T00:00:00+00:00"),
            **key_data,
        }

    def get_user(token):
        # A user_id of None stands for a token Supabase rejects.
        if state["user_id"] is None:
            raise AuthApiError("invalid JWT", 403, "bad_jwt")
        return SimpleNamespace(user=SimpleNamespace(id=state["user_id"], email=None))

    auth_client = MagicMock()
    auth_client.auth.get_user.side_effect = get_user
    monkeypatch.setattr(dependencies, "supabase", auth_client)
    monkeypatch.setattr(dependencies, "get_user_role", lambda user_id: "member")
    monkeypatch.setattr(virtual_key, "get_project_team", lambda project_id: state["team"])
    monkeypatch.setattr(
        virtual_key, "controls_virtual_key", lambda user_id, team_id: state["can_create_key"]
    )
    monkeypatch.setattr(virtual_key, "insert_key", insert_key)
    return state


def create(body=None, headers=AUTH):
    return client.post("/create_api_key", json=body or {"project_id": PROJECT_ID}, headers=headers)


def test_hash_key_is_sha256_hex():
    assert hash_key("test") == hashlib.sha256(b"test").hexdigest()


def test_generate_key_is_marked_and_random():
    keys = {generate_key() for _ in range(100)}

    assert len(keys) == 100
    assert all(key.startswith(KEY_MARKER) and len(key) > 40 for key in keys)


def test_owner_gets_key_and_only_hash_and_prefix_are_stored(db):
    response = create()

    assert response.status_code == 201
    raw_key = response.json()["key"]
    stored = db["inserted"][0]
    assert stored["hash"] == hash_key(raw_key)
    assert stored["prefix"] == raw_key[:12]
    assert raw_key not in stored.values()
    assert stored["user_id"] == "owner-1"
    assert stored["project_id"] == PROJECT_ID


def test_response_shows_key_once_without_hash(db):
    response = create()

    body = response.json()
    assert set(body) == {"id", "key", "prefix", "project_id", "expires_at", "created_at"}
    assert response.headers["Cache-Control"] == "no-store"


def test_member_with_can_create_key_gets_key(db):
    db["user_id"], db["can_create_key"] = "member-1", True

    assert create().status_code == 201


@pytest.mark.parametrize("can_create_key", [False, None])
def test_member_without_permission_or_non_member_is_forbidden(db, can_create_key):
    db["user_id"], db["can_create_key"] = "member-1", can_create_key

    response = create()

    assert response.status_code == 403
    assert db["inserted"] == []


def test_missing_token_is_unauthorised(db):
    assert create(headers={}).status_code == 401


def test_invalid_token_is_unauthorised(db):
    db["user_id"] = None

    response = create()

    assert response.status_code == 401
    assert db["inserted"] == []


def test_unknown_project_is_not_found(db):
    db["team"] = None

    assert create().status_code == 404


def test_custom_expiry_is_stored(db):
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    response = create({"project_id": PROJECT_ID, "expires_at": expires_at.isoformat()})

    assert response.status_code == 201
    assert db["inserted"][0]["expires_at"] == expires_at.isoformat()


def test_default_expiry_is_left_to_database(db):
    create()

    assert "expires_at" not in db["inserted"][0]


def test_past_expiry_is_rejected(db):
    expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)

    response = create({"project_id": PROJECT_ID, "expires_at": expires_at.isoformat()})

    assert response.status_code == 400
    assert db["inserted"] == []


def test_expiry_without_timezone_is_rejected(db):
    response = create({"project_id": PROJECT_ID, "expires_at": "2030-01-01T00:00:00"})

    assert response.status_code == 422


def test_database_error_is_hidden(db, monkeypatch):
    def fail(key_data):
        raise RuntimeError("database password")

    monkeypatch.setattr(virtual_key, "insert_key", fail)

    response = create()

    assert response.status_code == 500
    assert response.json() == {"message": "Failed to create key"}


def test_get_project_team_follows_project_to_team(monkeypatch):
    fake = MagicMock()
    query = fake.table.return_value.select.return_value.eq.return_value.limit.return_value
    query.execute.side_effect = [
        SimpleNamespace(data=[{"team_id": "team-1"}]),
        SimpleNamespace(data=[TEAM]),
    ]
    monkeypatch.setattr(virtual_key, "supabase", fake)

    assert virtual_key.get_project_team(PROJECT_ID) == TEAM
    assert [c.args[0] for c in fake.table.call_args_list] == ["projects", "teams"]


def test_get_project_team_returns_none_for_unknown_project(monkeypatch):
    fake = MagicMock()
    query = fake.table.return_value.select.return_value.eq.return_value.limit.return_value
    query.execute.return_value = SimpleNamespace(data=[])
    monkeypatch.setattr(virtual_key, "supabase", fake)

    assert virtual_key.get_project_team(PROJECT_ID) is None
