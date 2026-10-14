from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from supabase_auth.errors import AuthApiError

from app import dependencies
from app.main import app
from app.routers import project

AUTH = {"Authorization": "Bearer good-token"}
TEAM_ID = "11111111-1111-1111-1111-111111111111"
OTHER_TEAM_ID = "22222222-2222-2222-2222-222222222222"
PROJECT_ROW = {
    "id": "33333333-3333-3333-3333-333333333333",
    "team_id": TEAM_ID,
    "name": "Alpha Project",
    "model_ids": [],
    "budget_per_month": 100,
    "spend_this_month": 25,
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
    get_rows = MagicMock(return_value=[PROJECT_ROW])
    get_team_ids = MagicMock()
    monkeypatch.setattr(project, "get_project_rows", get_rows)
    monkeypatch.setattr(project, "get_accessible_team_ids", get_team_ids)

    response = client.get("/projects", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_ROW]
    get_rows.assert_called_once_with(team_id=None)
    get_team_ids.assert_not_called()


def test_admin_can_filter_projects_by_team(current_user, monkeypatch):
    current_user["role"] = "admin"
    get_rows = MagicMock(return_value=[PROJECT_ROW])
    monkeypatch.setattr(project, "get_project_rows", get_rows)

    response = client.get(f"/projects?team_id={TEAM_ID}", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_ROW]
    get_rows.assert_called_once_with(team_id=UUID(TEAM_ID))


def test_member_sees_projects_from_accessible_teams(current_user, monkeypatch):
    get_team_ids = MagicMock(return_value={TEAM_ID, OTHER_TEAM_ID})
    get_rows = MagicMock(return_value=[PROJECT_ROW])
    monkeypatch.setattr(project, "get_accessible_team_ids", get_team_ids)
    monkeypatch.setattr(project, "get_project_rows", get_rows)

    response = client.get("/projects", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_ROW]
    get_team_ids.assert_called_once_with("user-1")
    get_rows.assert_called_once_with(team_ids={TEAM_ID, OTHER_TEAM_ID})


def test_member_can_filter_by_an_accessible_team(current_user, monkeypatch):
    monkeypatch.setattr(
        project,
        "get_accessible_team_ids",
        MagicMock(return_value={TEAM_ID}),
    )
    get_rows = MagicMock(return_value=[PROJECT_ROW])
    monkeypatch.setattr(project, "get_project_rows", get_rows)

    response = client.get(f"/projects?team_id={TEAM_ID}", headers=AUTH)

    assert response.status_code == 200
    assert response.json() == [PROJECT_ROW]
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

    assert result == [PROJECT_ROW]
    projects_table.select.assert_called_once_with(project.PROJECT_READ_COLUMNS)
    selected.in_.assert_called_once_with("team_id", [TEAM_ID, OTHER_TEAM_ID])
    filtered.order.assert_called_once_with("name")


def test_empty_accessible_team_set_does_not_query_projects(monkeypatch):
    fake_supabase = MagicMock()
    monkeypatch.setattr(project, "supabase", fake_supabase)

    assert project.get_project_rows(team_ids=set()) == []
    fake_supabase.table.assert_not_called()
