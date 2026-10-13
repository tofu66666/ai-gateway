from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app import dependencies
from app.main import app
from app.routers import team

AUTH = {"Authorization": "Bearer good-token"}
client = TestClient(app)

ENDPOINTS = [
    ("post", "/team/create", {"name": "Alpha"}),
    ("put", "/team/change_owner", {"team_id": "team-1", "new_owner_id": "user-2"}),
    ("get", "/team", None),
    ("put", "/team/user", {"team_id": "team-1", "user_id": "user-2"}),
    ("delete", "/team/user", {"team_id": "team-1", "user_id": "user-2"}),
]


@pytest.fixture
def db(monkeypatch):
    """Mock auth and the team database; by default the caller is a team lead."""
    state = {"user_id": "lead-1", "role": "team_lead"}

    def get_user(token):
        # A user_id of None stands for a token Supabase rejects.
        if state["user_id"] is None:
            raise AuthApiError("invalid JWT", 403, "bad_jwt")
        return SimpleNamespace(user=SimpleNamespace(id=state["user_id"], email=None))

    auth_client = MagicMock()
    auth_client.auth.get_user.side_effect = get_user
    monkeypatch.setattr(dependencies, "supabase", auth_client)
    monkeypatch.setattr(dependencies, "get_user_role", lambda user_id: state["role"])

    fake = MagicMock()
    monkeypatch.setattr(team, "supabase", fake)
    state["supabase"] = fake
    return state


def call(method, path, body=None, headers=AUTH):
    return client.request(method, path, json=body, headers=headers)


@pytest.mark.parametrize("method, path, body", ENDPOINTS)
def test_missing_token_is_unauthorised(db, method, path, body):
    assert call(method, path, body, headers={}).status_code == 401


@pytest.mark.parametrize("method, path, body", ENDPOINTS)
def test_invalid_token_is_unauthorised(db, method, path, body):
    db["user_id"] = None

    assert call(method, path, body).status_code == 401
    db["supabase"].table.assert_not_called()


def test_member_cannot_create_team(db):
    db["role"] = "member"

    response = call("post", "/team/create", {"name": "Alpha"})

    assert response.status_code == 403
    db["supabase"].table.assert_not_called()


def test_team_lead_creates_team_they_own(db):
    by_name_and_owner = db["supabase"].table.return_value.select.return_value.eq.return_value.eq
    # First the duplicate check finds nothing, then the new team's ID is looked up.
    by_name_and_owner.return_value.execute.side_effect = [
        SimpleNamespace(data=[]),
        SimpleNamespace(data=[{"id": "team-1"}]),
    ]

    response = call("post", "/team/create", {"name": "Alpha"})

    assert response.status_code == 200
    assert response.json()["owner_id"] == "lead-1"
    assert response.json()["creator_role"] == "team_lead"
    inserts = [c.args[0] for c in db["supabase"].table.return_value.insert.call_args_list]
    assert inserts[1] == {"user_id": "lead-1", "team_id": "team-1", "can_create_key": True}


def test_member_sees_only_their_teams(db):
    db["user_id"], db["role"] = "member-1", "member"
    by_one_field = db["supabase"].table.return_value.select.return_value.eq
    by_one_field.return_value.execute.side_effect = [
        SimpleNamespace(data=[{"team_id": "team-1"}]),
        SimpleNamespace(data=[{"name": "Alpha"}]),
    ]

    response = call("get", "/team")

    assert response.status_code == 200
    assert response.json() == {"team-1": "Alpha"}
    assert by_one_field.call_args_list[0].args == ("user_id", "member-1")


def test_non_owner_cannot_change_owner(db, monkeypatch):
    db["user_id"], db["role"] = "member-1", "member"
    monkeypatch.setattr(team, "get_user_role", lambda user_id: "member")
    select = db["supabase"].table.return_value.select.return_value
    select.eq.return_value.execute.return_value = SimpleNamespace(data=[{"name": "Alpha"}])
    # No clashing team for the new owner, and the caller doesn't own this team.
    select.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

    response = call("put", "/team/change_owner", {"team_id": "team-1", "new_owner_id": "user-2"})

    assert response.status_code == 403
    db["supabase"].table.return_value.update.assert_not_called()
