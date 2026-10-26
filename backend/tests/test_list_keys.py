from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import dependencies
from app.main import app
from app.routers import virtual_key

AUTH = {"Authorization": "Bearer good-token"}
LED_TEAM = "11111111-1111-1111-1111-111111111111"
MEMBER_TEAM = "22222222-2222-2222-2222-222222222222"
OTHER_TEAM = "33333333-3333-3333-3333-333333333333"
LED_PROJECT = "44444444-4444-4444-4444-444444444444"
MEMBER_PROJECT = "55555555-5555-5555-5555-555555555555"
OTHER_PROJECT = "66666666-6666-6666-6666-666666666666"
UNKNOWN_PROJECT = "77777777-7777-7777-7777-777777777777"
PROJECT_TEAMS = {LED_PROJECT: LED_TEAM, MEMBER_PROJECT: MEMBER_TEAM, OTHER_PROJECT: OTHER_TEAM}
FUTURE = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
client = TestClient(app)


def stored_key(key_id, **overrides):
    return {
        "id": key_id,
        "prefix": "mq-k_AbCdEfG",
        "name": None,
        "project_id": MEMBER_PROJECT,
        "user_id": "me",
        "created_at": "2026-10-20T00:00:00+00:00",
        "expires_at": FUTURE,
        "revoked_at": None,
        "hash": "must-never-be-listed",
        "projects": {"name": "Chatbot", "team_id": MEMBER_TEAM},
        **overrides,
    }


@pytest.fixture
def db(monkeypatch):
    """Mock every database call; by default the caller leads one team and is in another."""
    state = {"role": "user", "keys": [stored_key("key-1")], "conditions": []}

    def get_project_ids(project_id=None, team_ids=None):
        return {
            project: team
            for project, team in PROJECT_TEAMS.items()
            if (project_id is None or project == str(project_id))
            and (team_ids is None or team in team_ids)
        }

    def get_keys(conditions):
        state["conditions"].append(conditions)
        return state["keys"]

    auth_client = MagicMock()
    auth_client.auth.get_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="me", email="me@example.com")
    )
    monkeypatch.setattr(dependencies, "supabase", auth_client)
    monkeypatch.setattr(dependencies, "get_user_role", lambda user_id: state["role"])
    monkeypatch.setattr(virtual_key, "get_led_team_ids", lambda user_id: {LED_TEAM})
    monkeypatch.setattr(virtual_key, "get_member_team_ids", lambda user_id: {MEMBER_TEAM})
    monkeypatch.setattr(virtual_key, "get_project_ids", get_project_ids)
    monkeypatch.setattr(virtual_key, "get_keys", get_keys)
    monkeypatch.setattr(virtual_key, "get_user_emails", lambda: {"me": "me@example.com"})
    return state


def list_keys(**params):
    return client.get("/api_keys", params=params, headers=AUTH)


def test_lists_key_fields_without_hash(db):
    response = list_keys()

    assert response.status_code == 200
    assert response.json() == [
        {
            "id": "key-1",
            "prefix": "mq-k_AbCdEfG",
            "name": None,
            "project_id": MEMBER_PROJECT,
            "project_name": "Chatbot",
            "team_id": MEMBER_TEAM,
            "user_id": "me",
            "user_email": "me@example.com",
            "allowed_models": [],
            "created_at": "2026-10-20T00:00:00+00:00",
            "expires_at": FUTURE,
            "revoked_at": None,
            "status": "active",
        }
    ]


def test_user_sees_own_keys_and_keys_in_teams_they_lead(db):
    list_keys()

    assert db["conditions"] == [[f"project_id.in.({LED_PROJECT})", "user_id.eq.me"]]


def test_admin_sees_every_key(db):
    db["role"] = "admin"

    list_keys()

    assert db["conditions"] == [None]


def test_project_in_led_team_shows_all_its_keys(db):
    list_keys(project_id=LED_PROJECT)

    assert db["conditions"] == [
        [f"project_id.in.({LED_PROJECT})", f"and(user_id.eq.me,project_id.in.({LED_PROJECT}))"]
    ]


def test_project_in_member_team_shows_only_own_keys(db):
    list_keys(project_id=MEMBER_PROJECT)

    assert db["conditions"] == [[f"and(user_id.eq.me,project_id.in.({MEMBER_PROJECT}))"]]


def test_team_filter_narrows_to_its_projects(db):
    list_keys(team_id=MEMBER_TEAM)

    assert db["conditions"] == [[f"and(user_id.eq.me,project_id.in.({MEMBER_PROJECT}))"]]


@pytest.mark.parametrize(
    "params",
    [{"project_id": OTHER_PROJECT}, {"team_id": OTHER_TEAM}, {"project_id": UNKNOWN_PROJECT}],
)
def test_filter_outside_your_teams_is_forbidden(db, params):
    response = list_keys(**params)

    assert response.status_code == 403
    assert db["conditions"] == []


def test_admin_may_filter_by_any_project(db):
    db["role"] = "admin"

    list_keys(project_id=OTHER_PROJECT)

    assert db["conditions"] == [[f"project_id.in.({OTHER_PROJECT})"]]


def test_admin_filter_for_unknown_project_is_empty(db):
    db["role"] = "admin"

    response = list_keys(project_id=UNKNOWN_PROJECT)

    assert response.json() == []
    assert db["conditions"] == []


def test_status_is_worked_out_and_filterable(db):
    db["keys"] = [
        stored_key("active-key"),
        stored_key("expired-key", expires_at=PAST),
        # Revoked wins over expired.
        stored_key("revoked-key", expires_at=PAST, revoked_at="2026-10-20T00:00:00+00:00"),
    ]

    assert [k["status"] for k in list_keys().json()] == ["active", "expired", "revoked"]
    assert [k["id"] for k in list_keys(status="expired").json()] == ["expired-key"]


def test_unknown_status_is_rejected(db):
    assert list_keys(status="deleted").status_code == 422


def test_list_needs_login(db):
    assert client.get("/api_keys").status_code == 401


def test_database_error_is_hidden(db, monkeypatch):
    def fail(conditions):
        raise RuntimeError("database password")

    monkeypatch.setattr(virtual_key, "get_keys", fail)

    response = list_keys()

    assert response.status_code == 500
    assert response.json() == {"message": "Failed to list keys"}
