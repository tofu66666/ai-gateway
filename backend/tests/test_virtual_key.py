import hashlib
from datetime import datetime, timedelta, timezone

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import Response
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app import dependencies
from app.main import app
from app.routers import virtual_key
from app.routers.virtual_key import KEY_MARKER, generate_key, hash_key

PROJECT_ID = "11111111-1111-1111-1111-111111111111"
MODEL_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
MODEL_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
OTHER_MODEL = "cccccccc-cccc-cccc-cccc-cccccccccccc"
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
        virtual_key, "get_project_model_ids", lambda project_id: {MODEL_A, MODEL_B}
    )
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


def test_name_is_stored(db):
    response = create({"project_id": PROJECT_ID, "name": "billing-bot"})

    assert response.status_code == 201
    assert db["inserted"][0]["name"] == "billing-bot"


def test_name_is_optional(db):
    create()

    assert "name" not in db["inserted"][0]


def test_empty_name_is_rejected(db):
    assert create({"project_id": PROJECT_ID, "name": ""}).status_code == 422


def test_chosen_models_are_stored(db):
    response = create({"project_id": PROJECT_ID, "model_ids": [MODEL_B, MODEL_A, MODEL_B]})

    assert response.status_code == 201
    assert db["inserted"][0]["model_ids"] == [MODEL_A, MODEL_B]


def test_models_are_optional(db):
    assert create().status_code == 201
    assert "model_ids" not in db["inserted"][0]


def test_model_outside_the_project_is_rejected(db):
    response = create({"project_id": PROJECT_ID, "model_ids": [MODEL_A, OTHER_MODEL]})

    assert response.status_code == 400
    assert db["inserted"] == []


def test_empty_model_list_is_rejected(db):
    response = create({"project_id": PROJECT_ID, "model_ids": []})

    assert response.status_code == 422
    assert db["inserted"] == []


def test_model_lookup_failure_is_hidden(db, monkeypatch):
    def fail(project_id):
        raise RuntimeError("database password")

    monkeypatch.setattr(virtual_key, "get_project_model_ids", fail)

    response = create({"project_id": PROJECT_ID, "model_ids": [MODEL_A]})

    assert response.status_code == 500
    assert response.json() == {"message": "Failed to look up project"}


def test_models_are_not_looked_up_for_a_caller_who_cannot_create_keys(db, monkeypatch):
    lookup = MagicMock()
    monkeypatch.setattr(virtual_key, "get_project_model_ids", lookup)
    db["user_id"] = "member-1"

    response = create({"project_id": PROJECT_ID, "model_ids": [OTHER_MODEL]})

    assert response.status_code == 403
    lookup.assert_not_called()


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


@pytest.mark.parametrize(
    "rows, expected",
    [
        ([{"model_ids": [MODEL_A, MODEL_B]}], {MODEL_A, MODEL_B}),
        ([{"model_ids": None}], set()),
        ([], set()),
    ],
)
def test_get_project_model_ids(monkeypatch, rows, expected):
    fake = MagicMock()
    query = fake.table.return_value.select.return_value.eq.return_value.limit.return_value
    query.execute.return_value = SimpleNamespace(data=rows)
    monkeypatch.setattr(virtual_key, "supabase", fake)

    assert virtual_key.get_project_model_ids(PROJECT_ID) == expected


def validate(monkeypatch, key_row):
    """Call validate_virtual_key with a stored key row (None for an unknown key)."""
    fake = MagicMock()
    query = fake.table.return_value.select.return_value.eq.return_value
    query.execute.side_effect = [
        SimpleNamespace(data=[key_row] if key_row else []),
        SimpleNamespace(data=[{"team_id": "team-1"}]),
    ]
    monkeypatch.setattr(virtual_key, "supabase", fake)
    response = Response()
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="mq-k_raw")
    body = virtual_key.validate_virtual_key(response, credentials)
    return response.status_code, body


def stored_key(**overrides):
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    return {
        "project_id": PROJECT_ID,
        "user_id": "owner-1",
        "expires_at": future,
        "revoked_at": None,
        **overrides,
    }


def test_active_key_is_valid(monkeypatch):
    status_code, body = validate(monkeypatch, stored_key())

    assert status_code == 200
    assert body["team_id"] == "team-1"


def test_unknown_key_is_unauthorised(monkeypatch):
    assert validate(monkeypatch, None)[0] == 401


def test_revoked_key_is_unauthorised(monkeypatch):
    status_code, body = validate(monkeypatch, stored_key(revoked_at="2026-10-20T00:00:00+00:00"))

    assert status_code == 401
    assert body == {"message": "Virtual key revoked"}


def test_expired_key_is_unauthorised(monkeypatch):
    past = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()

    status_code, body = validate(monkeypatch, stored_key(expires_at=past))

    assert status_code == 401
    assert body == {"message": "Virtual key expired"}
