from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app import dependencies
from app.budget import calculate_budget_status
from app.main import app
from app.routers import project

AUTH = {"Authorization": "Bearer good-token"}
TEAM_ID = "11111111-1111-1111-1111-111111111111"
OTHER_TEAM_ID = "22222222-2222-2222-2222-222222222222"
PROJECT_ID = "33333333-3333-3333-3333-333333333333"
PROJECT_ROW = {
    "id": PROJECT_ID,
    "team_id": TEAM_ID,
    "name": "Alpha Project",
    "model_ids": [],
    "budget_per_month": 100,
    "spend_this_month": 25,
    "warning_threshold": 0.8,
}
PROJECT_RESPONSE = {
    **PROJECT_ROW,
    "usage_ratio": Decimal("0.25"),
    "warning": False,
    "blocked": False,
}

client = TestClient(app)


@pytest.fixture
def current_user(monkeypatch):
    state = {"user_id": "user-1", "role": "member"}

    def get_user(token):
        if state["user_id"] is None:
            raise AuthApiError("invalid JWT", 403, "bad_jwt")
        return SimpleNamespace(
            user=SimpleNamespace(id=state["user_id"], email="user@example.com")
        )

    auth_client = MagicMock()
    auth_client.auth.get_user.side_effect = get_user
    monkeypatch.setattr(dependencies, "supabase", auth_client)
    monkeypatch.setattr(
        dependencies,
        "get_user_role",
        lambda user_id: state["role"],
    )
    return state


def test_missing_token_is_unauthorised(current_user):
    response = client.get("/projects")

    assert response.status_code == 401


def test_invalid_token_is_unauthorised(current_user):
    current_user["user_id"] = None

    response = client.get("/projects", headers=AUTH)

    assert response.status_code == 401


def test_admin_can_list_all_projects(current_user, monkeypatch):
    current_user["role"] = "admin"
    get_rows = MagicMock(return_value=[PROJECT_RESPONSE])
    get_team_ids = MagicMock()
    monkeypatch.setattr(project, "get_project_rows", get_rows)
    monkeypatch.setattr(project, "get_accessible_team_ids", get_team_ids)

    response = client.get("/projects", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_RESPONSE]
    get_rows.assert_called_once_with(team_id=None)
    get_team_ids.assert_not_called()


def test_admin_can_filter_projects_by_team(current_user, monkeypatch):
    current_user["role"] = "admin"
    get_rows = MagicMock(return_value=[PROJECT_RESPONSE])
    monkeypatch.setattr(project, "get_project_rows", get_rows)

    response = client.get(f"/projects?team_id={TEAM_ID}", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_RESPONSE]
    get_rows.assert_called_once_with(team_id=UUID(TEAM_ID))


def test_member_sees_projects_from_accessible_teams(current_user, monkeypatch):
    get_team_ids = MagicMock(return_value={TEAM_ID, OTHER_TEAM_ID})
    get_rows = MagicMock(return_value=[PROJECT_RESPONSE])
    monkeypatch.setattr(project, "get_accessible_team_ids", get_team_ids)
    monkeypatch.setattr(project, "get_project_rows", get_rows)

    response = client.get("/projects", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_RESPONSE]
    get_team_ids.assert_called_once_with("user-1")
    get_rows.assert_called_once_with(team_ids={TEAM_ID, OTHER_TEAM_ID})


def test_member_can_filter_by_an_accessible_team(current_user, monkeypatch):
    monkeypatch.setattr(
        project,
        "get_accessible_team_ids",
        MagicMock(return_value={TEAM_ID}),
    )
    get_rows = MagicMock(return_value=[PROJECT_RESPONSE])
    monkeypatch.setattr(project, "get_project_rows", get_rows)

    response = client.get(f"/projects?team_id={TEAM_ID}", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_RESPONSE]
    get_rows.assert_called_once_with(team_id=UUID(TEAM_ID))


def test_member_cannot_list_projects_from_another_team(current_user, monkeypatch):
    monkeypatch.setattr(
        project,
        "get_accessible_team_ids",
        MagicMock(return_value={TEAM_ID}),
    )
    get_rows = MagicMock()
    monkeypatch.setattr(project, "get_project_rows", get_rows)

    response = client.get(f"/projects?team_id={OTHER_TEAM_ID}", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == []
    get_rows.assert_not_called()


def test_invalid_team_filter_is_rejected(current_user):
    response = client.get("/projects?team_id=not-a-uuid", headers=AUTH)

    assert response.status_code == 422


def test_database_failure_returns_safe_error(current_user, monkeypatch):
    monkeypatch.setattr(
        project,
        "get_accessible_team_ids",
        MagicMock(side_effect=RuntimeError("database details")),
    )

    response = client.get("/projects", headers=AUTH)

    assert response.status_code == 500
    assert response.json() == {"message": "Failed to load projects"}


def test_accessible_team_ids_include_owned_and_joined_teams(monkeypatch):
    teams_table = MagicMock()
    teams_table.select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[{"id": TEAM_ID}])
    )
    memberships_table = MagicMock()
    memberships_table.select.return_value.eq.return_value.execute.return_value = (
        SimpleNamespace(data=[{"team_id": OTHER_TEAM_ID}])
    )
    fake_supabase = MagicMock()
    fake_supabase.table.side_effect = {
        "teams": teams_table,
        "user_team_mappings": memberships_table,
    }.__getitem__
    monkeypatch.setattr(project, "supabase", fake_supabase)

    result = project.get_accessible_team_ids("user-1")

    assert result == {TEAM_ID, OTHER_TEAM_ID}
    teams_table.select.return_value.eq.assert_called_once_with("owner_id", "user-1")
    memberships_table.select.return_value.eq.assert_called_once_with(
        "user_id", "user-1"
    )


def test_project_query_is_limited_to_accessible_teams(monkeypatch):
    projects_table = MagicMock()
    selected = projects_table.select.return_value
    filtered = selected.in_.return_value
    ordered = filtered.order.return_value
    ordered.execute.return_value = SimpleNamespace(data=[PROJECT_ROW])
    fake_supabase = MagicMock()
    fake_supabase.table.return_value = projects_table
    monkeypatch.setattr(project, "supabase", fake_supabase)

    result = project.get_project_rows(team_ids={OTHER_TEAM_ID, TEAM_ID})

    assert result == [PROJECT_RESPONSE]
    projects_table.select.assert_called_once_with(project.PROJECT_READ_COLUMNS)
    selected.in_.assert_called_once_with("team_id", [TEAM_ID, OTHER_TEAM_ID])
    filtered.order.assert_called_once_with("name")


def test_empty_accessible_team_set_does_not_query_projects(monkeypatch):
    fake_supabase = MagicMock()
    monkeypatch.setattr(project, "supabase", fake_supabase)

    assert project.get_project_rows(team_ids=set()) == []
    fake_supabase.table.assert_not_called()


def set_patch_project(monkeypatch, *, owner_id="user-1", updated=None):
    monkeypatch.setattr(project, "get_project_by_id", lambda project_id: PROJECT_ROW)
    monkeypatch.setattr(
        project,
        "get_team_by_id",
        lambda team_id: {"id": TEAM_ID, "owner_id": owner_id},
    )
    update = MagicMock(return_value=updated or PROJECT_ROW)
    monkeypatch.setattr(project, "update_project", update)
    return update


def test_team_lead_updates_project_budget(current_user, monkeypatch):
    current_user["role"] = "team_lead"
    updated = {**PROJECT_ROW, "budget_per_month": 80, "warning_threshold": 0.75}
    update = set_patch_project(monkeypatch, updated=updated)

    response = client.patch(
        f"/projects/{PROJECT_ID}",
        headers=AUTH,
        json={"budget_per_month": 80, "warning_threshold": 0.75},
    )

    assert response.status_code == 200
    assert response.json()["usage_ratio"] == 0.3125
    assert response.json()["warning"] is False
    update.assert_called_once_with(
        UUID(PROJECT_ID),
        {"budget_per_month": 80.0, "warning_threshold": 0.75},
    )


def test_project_update_audits_the_full_project_state(current_user, monkeypatch):
    current_user["role"] = "team_lead"
    updated = {
        **PROJECT_ROW,
        "budget_per_month": 80,
        "blocked_patterns": ["secret"],
        "max_tokens_cap": 500,
    }
    set_patch_project(monkeypatch, updated=updated)
    fake_supabase = MagicMock()
    monkeypatch.setattr(project, "supabase", fake_supabase)

    response = client.patch(
        f"/projects/{PROJECT_ID}",
        headers=AUTH,
        json={"budget_per_month": 80},
    )

    assert response.status_code == 200
    fake_supabase.table.assert_called_once_with("audits")
    fake_supabase.table.return_value.insert.assert_called_once_with(
        {
            "action": "project_modify",
            "user_id": "user-1",
            "target_id": PROJECT_ID,
            "details": {
                "name": "Alpha Project",
                "team_id": TEAM_ID,
                "model_ids": [],
                "budget_per_month": 80,
                "warning_threshold": 0.8,
                "blocked_patterns": ["secret"],
                "max_tokens_cap": 500,
            },
        }
    )


def test_team_lead_removes_project_budget(current_user, monkeypatch):
    current_user["role"] = "team_lead"
    update = set_patch_project(
        monkeypatch,
        updated={**PROJECT_ROW, "budget_per_month": None},
    )

    response = client.patch(
        f"/projects/{PROJECT_ID}",
        headers=AUTH,
        json={"budget_per_month": None},
    )

    assert response.status_code == 200
    assert response.json()["usage_ratio"] is None
    update.assert_called_once_with(UUID(PROJECT_ID), {"budget_per_month": None})


@pytest.mark.parametrize("role", ["admin", "user"])
def test_admin_and_user_cannot_update_project(current_user, monkeypatch, role):
    current_user["role"] = role
    update = set_patch_project(monkeypatch)

    response = client.patch(
        f"/projects/{PROJECT_ID}", headers=AUTH, json={"budget_per_month": 50}
    )

    assert response.status_code == 403
    update.assert_not_called()


def test_team_lead_cannot_update_another_teams_project(current_user, monkeypatch):
    current_user["role"] = "team_lead"
    update = set_patch_project(monkeypatch, owner_id="another-lead")

    response = client.patch(
        f"/projects/{PROJECT_ID}", headers=AUTH, json={"budget_per_month": 50}
    )

    assert response.status_code == 403
    update.assert_not_called()


def test_patch_unknown_project_returns_not_found(current_user, monkeypatch):
    current_user["role"] = "team_lead"
    monkeypatch.setattr(project, "get_project_by_id", lambda project_id: None)

    response = client.patch(
        f"/projects/{PROJECT_ID}", headers=AUTH, json={"budget_per_month": 50}
    )

    assert response.status_code == 404


@pytest.mark.parametrize(
    "payload, status_code",
    [
        ({}, 400),
        ({"warning_threshold": None}, 400),
        ({"warning_threshold": 0}, 422),
        ({"warning_threshold": 1.01}, 422),
        ({"budget_per_month": -0.01}, 422),
    ],
)
def test_patch_project_rejects_invalid_payload(
    current_user, monkeypatch, payload, status_code
):
    lookup = MagicMock()
    monkeypatch.setattr(project, "get_project_by_id", lookup)

    response = client.patch(f"/projects/{PROJECT_ID}", headers=AUTH, json=payload)

    assert response.status_code == status_code
    lookup.assert_not_called()


def test_budget_without_limit_is_not_warning_or_blocked():
    assert calculate_budget_status("12.345678", None) == {
        "usage_ratio": None,
        "warning": False,
        "blocked": False,
    }


@pytest.mark.parametrize(
    "spend, warning, blocked",
    [
        ("79.99", False, False),
        ("80.00", True, False),
        ("100.00", True, True),
        ("105.00", True, True),
    ],
)
def test_budget_status_boundaries(spend, warning, blocked):
    status = calculate_budget_status(spend, "100.00")

    assert status["warning"] is warning
    assert status["blocked"] is blocked


def test_zero_budget_is_immediately_blocked():
    assert calculate_budget_status(0, 0) == {
        "usage_ratio": None,
        "warning": True,
        "blocked": True,
    }


def test_small_budget_uses_exact_decimal_threshold():
    status = calculate_budget_status("0.024", "0.03")

    assert status == {
        "usage_ratio": Decimal("0.8"),
        "warning": True,
        "blocked": False,
    }


@pytest.mark.parametrize(
    "spend, budget, threshold",
    [
        (-1, 10, 0.8),
        (0, -1, 0.8),
        (0, 10, 0),
        (0, 10, 1.01),
    ],
)
def test_budget_status_rejects_invalid_values(spend, budget, threshold):
    with pytest.raises(ValueError):
        calculate_budget_status(spend, budget, threshold)
