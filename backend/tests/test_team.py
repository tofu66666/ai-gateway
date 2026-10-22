from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app import budget, dependencies
from app.main import app
from app.routers import team

AUTH = {"Authorization": "Bearer good-token"}
EMAILS = {"lead-1": "lead@example.com", "member-1": "member@example.com"}
client = TestClient(app)

ENDPOINTS = [
    ("post", "/team/create", {"name": "Alpha"}),
    ("put", "/team/change_owner", {"team_id": "team-1", "new_owner_id": "user-2"}),
    ("get", "/team", None),
    ("get", "/team/team-1", None),
    ("patch", "/team/team-1", {"budget_per_month": 20}),
    ("put", "/team/user", {"team_id": "team-1", "user_id": "user-2"}),
    ("delete", "/team/user", {"team_id": "team-1", "user_id": "user-2"}),
    ("get", "/team/team-1/users", None),
    ("get", "/team/team-1/requests", None),
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


TEAM_DETAIL = {
    "id": "team-1",
    "name": "Alpha",
    "owner_id": "lead-1",
    "budget_per_month": 10,
    "warning_threshold": 0.8,
}


def set_team_detail(monkeypatch, *, spend="8.00", member=False):
    monkeypatch.setattr(team, "get_team_by_id", lambda team_id: TEAM_DETAIL)
    get_spend = MagicMock(return_value=Decimal(spend))
    monkeypatch.setattr(team, "get_team_spend", get_spend)
    membership = MagicMock(return_value=member)
    monkeypatch.setattr(team, "is_team_member", membership)
    return get_spend, membership


def test_owner_sees_team_budget_status(db, monkeypatch):
    get_spend, membership = set_team_detail(monkeypatch)

    response = call("get", "/team/team-1")

    assert response.status_code == 200
    assert response.json() == {
        **TEAM_DETAIL,
        "spend_this_month": 8,
        "usage_ratio": 0.8,
        "warning": True,
        "blocked": False,
    }
    get_spend.assert_called_once_with("team-1")
    membership.assert_not_called()


def test_member_can_see_team_budget_status(db, monkeypatch):
    db["user_id"], db["role"] = "member-1", "user"
    _, membership = set_team_detail(monkeypatch, member=True)

    response = call("get", "/team/team-1")

    assert response.status_code == 200
    membership.assert_called_once_with("member-1", "team-1")


def test_admin_can_see_team_budget_without_membership(db, monkeypatch):
    db["user_id"], db["role"] = "admin-1", "admin"
    _, membership = set_team_detail(monkeypatch)

    response = call("get", "/team/team-1")

    assert response.status_code == 200
    membership.assert_not_called()


def test_outsider_cannot_see_team_budget(db, monkeypatch):
    db["user_id"], db["role"] = "outsider-1", "user"
    get_spend, _ = set_team_detail(monkeypatch)

    response = call("get", "/team/team-1")

    assert response.status_code == 403
    get_spend.assert_not_called()


def test_unknown_team_budget_is_not_found(db, monkeypatch):
    monkeypatch.setattr(team, "get_team_by_id", lambda team_id: None)

    assert call("get", "/team/team-9").status_code == 404


def test_team_spend_sums_project_counters(monkeypatch):
    projects = MagicMock()
    projects.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"spend_this_month": "0.015"}, {"spend_this_month": "0.025"}]
    )
    fake_supabase = MagicMock()
    fake_supabase.table.return_value = projects
    monkeypatch.setattr(budget, "supabase", fake_supabase)

    assert budget.get_team_spend("team-1") == Decimal("0.040")
    projects.select.assert_called_once_with("spend_this_month")
    projects.select.return_value.eq.assert_called_once_with("team_id", "team-1")


@pytest.mark.parametrize(
    "role,user_id",
    [("team_lead", "lead-1"), ("admin", "admin-1")],
)
def test_authorised_user_updates_team_budget(db, monkeypatch, role, user_id):
    db["role"], db["user_id"] = role, user_id
    monkeypatch.setattr(team, "get_team_by_id", lambda team_id: TEAM_DETAIL)
    updated = {**TEAM_DETAIL, "budget_per_month": 20, "warning_threshold": 0.75}
    update = MagicMock(return_value=updated)
    monkeypatch.setattr(team, "update_team", update)
    monkeypatch.setattr(team, "get_team_spend", lambda team_id: Decimal("15"))

    response = call(
        "patch",
        "/team/team-1",
        {"budget_per_month": 20, "warning_threshold": 0.75},
    )

    assert response.status_code == 200
    assert response.json()["warning"] is True
    assert response.json()["blocked"] is False
    update.assert_called_once_with(
        "team-1", {"budget_per_month": 20.0, "warning_threshold": 0.75}
    )


def test_team_lead_removes_team_budget(db, monkeypatch):
    monkeypatch.setattr(team, "get_team_by_id", lambda team_id: TEAM_DETAIL)
    updated = {**TEAM_DETAIL, "budget_per_month": None}
    update = MagicMock(return_value=updated)
    monkeypatch.setattr(team, "update_team", update)
    monkeypatch.setattr(team, "get_team_spend", lambda team_id: Decimal("15"))

    response = call("patch", "/team/team-1", {"budget_per_month": None})

    assert response.status_code == 200
    assert response.json()["blocked"] is False
    update.assert_called_once_with("team-1", {"budget_per_month": None})


@pytest.mark.parametrize(
    "role,user_id",
    [("team_lead", "other-lead"), ("user", "member-1")],
)
def test_unauthorised_user_cannot_update_team_budget(db, monkeypatch, role, user_id):
    db["role"], db["user_id"] = role, user_id
    monkeypatch.setattr(team, "get_team_by_id", lambda team_id: TEAM_DETAIL)
    update = MagicMock()
    monkeypatch.setattr(team, "update_team", update)

    response = call("patch", "/team/team-1", {"budget_per_month": 20})

    assert response.status_code == 403
    update.assert_not_called()


@pytest.mark.parametrize(
    "payload,status_code",
    [
        ({}, 400),
        ({"warning_threshold": None}, 400),
        ({"warning_threshold": 0}, 422),
        ({"warning_threshold": 1.01}, 422),
        ({"budget_per_month": -0.01}, 422),
    ],
)
def test_team_budget_update_validation(db, payload, status_code):
    response = call("patch", "/team/team-1", payload)

    assert response.status_code == status_code
    db["supabase"].table.assert_not_called()


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


def set_team(db, owner_id, mappings):
    # The owner lookup runs first, then the team's membership rows.
    by_one_field = db["supabase"].table.return_value.select.return_value.eq
    by_one_field.return_value.execute.side_effect = [
        SimpleNamespace(data=[{"owner_id": owner_id}]),
        SimpleNamespace(data=mappings),
    ]
    db["supabase"].auth.admin.get_user_by_id.side_effect = lambda user_id: SimpleNamespace(
        user=SimpleNamespace(id=user_id, email=EMAILS[user_id])
    )
    return by_one_field


def test_member_sees_members_and_their_key_permission(db):
    db["user_id"], db["role"] = "member-1", "member"
    mappings = [
        {"user_id": "lead-1", "can_create_key": True},
        {"user_id": "member-1", "can_create_key": False},
    ]
    by_one_field = set_team(db, "lead-1", mappings)
    # The caller doesn't own the team, so their membership is checked.
    by_one_field.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"user_id": "member-1"}]
    )

    response = call("get", "/team/team-1/users")

    assert response.status_code == 200
    members = response.json()
    assert [m["user_id"] for m in members] == ["lead-1", "member-1"]
    assert [m["email"] for m in members] == ["lead@example.com", "member@example.com"]
    assert [m["can_create_key"] for m in members] == [True, False]
    assert [m["is_owner"] for m in members] == [True, False]


def test_owner_can_see_members_without_a_membership_row(db):
    by_one_field = set_team(db, "lead-1", [{"user_id": "member-1", "can_create_key": False}])

    response = call("get", "/team/team-1/users")

    assert response.status_code == 200
    assert [m["email"] for m in response.json()] == ["member@example.com"]
    by_one_field.return_value.eq.assert_not_called()


def test_outsider_cannot_see_members(db):
    db["user_id"], db["role"] = "outsider-1", "member"
    by_one_field = set_team(db, "lead-1", [{"user_id": "member-1", "can_create_key": False}])
    by_one_field.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

    response = call("get", "/team/team-1/users")

    assert response.status_code == 403
    db["supabase"].auth.admin.get_user_by_id.assert_not_called()


def test_unknown_team_is_not_found(db):
    by_one_field = db["supabase"].table.return_value.select.return_value.eq
    by_one_field.return_value.execute.return_value = SimpleNamespace(data=[])

    assert call("get", "/team/team-9/users").status_code == 404


def test_owner_sees_team_requests(db):
    # The owner lookup runs first, then the team's projects.
    by_one_field = db["supabase"].table.return_value.select.return_value.eq
    by_one_field.return_value.execute.side_effect = [
        SimpleNamespace(data=[{"owner_id": "lead-1"}]),
        SimpleNamespace(data=[{"id": "project-1"}, {"id": "project-2"}]),
    ]
    rows = [{"id": "request-1", "project_id": "project-1", "user_id": "member-1", "cost": 0.01}]
    by_project = db["supabase"].table.return_value.select.return_value.in_
    by_project.return_value.order.return_value.execute.return_value = SimpleNamespace(data=rows)

    response = call("get", "/team/team-1/requests")

    assert response.status_code == 200
    assert response.json() == rows
    assert by_project.call_args.args == ("project_id", ["project-1", "project-2"])


def test_outsider_cannot_see_team_requests(db):
    db["user_id"], db["role"] = "member-1", "member"
    by_one_field = db["supabase"].table.return_value.select.return_value.eq
    by_one_field.return_value.execute.return_value = SimpleNamespace(data=[{"owner_id": "lead-1"}])

    response = call("get", "/team/team-1/requests")

    assert response.status_code == 403
    db["supabase"].table.return_value.select.return_value.in_.assert_not_called()
