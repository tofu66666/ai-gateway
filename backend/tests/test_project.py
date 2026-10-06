"""Focused unit tests for project creation business rules.

These tests use no live Supabase connection.  They exercise the small helpers
that the endpoint uses, matching the team's preference for unit tests and
mocks over end-to-end TestClient tests.
"""

import os
from uuid import UUID

import pytest
from pydantic import ValidationError

# db.py creates the Supabase client while it is imported.  Test values are
# sufficient because these helper tests never make a network request.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "test-key")

from app import config

config.SUPABASE_URL = os.environ["SUPABASE_URL"]
config.SUPABASE_KEY = os.environ["SUPABASE_KEY"]

from app.routers.project import (
    ProjectCreateRequest,
    build_project_data,
    can_create_project,
    find_missing_model_ids,
)


TEAM_ID = UUID("00000000-0000-0000-0000-000000000001")
OWNER_ID = "00000000-0000-0000-0000-000000000002"
FIRST_MODEL_ID = UUID("00000000-0000-0000-0000-000000000003")
SECOND_MODEL_ID = UUID("00000000-0000-0000-0000-000000000004")


def test_admin_can_create_project_for_any_team():
    assert can_create_project("admin-id", "admin", OWNER_ID)


def test_team_owner_can_create_project():
    assert can_create_project(OWNER_ID, "team_lead", OWNER_ID)


def test_other_team_lead_cannot_create_project():
    assert not can_create_project("different-lead", "team_lead", OWNER_ID)


def test_find_missing_model_ids_returns_only_unknown_models():
    rows = [{"id": str(FIRST_MODEL_ID)}]

    assert find_missing_model_ids([FIRST_MODEL_ID, SECOND_MODEL_ID], rows) == [
        str(SECOND_MODEL_ID)
    ]


def test_project_name_is_trimmed():
    project = ProjectCreateRequest(
        team_id=TEAM_ID,
        name="  Gateway project  ",
        model_ids=[],
        budget_per_month=None,
    )

    assert project.name == "Gateway project"
    assert project.budget_per_month is None


def test_project_name_cannot_be_only_whitespace():
    with pytest.raises(ValidationError):
        ProjectCreateRequest(
            team_id=TEAM_ID,
            name="   ",
            model_ids=[],
            budget_per_month=None,
        )


def test_project_budget_cannot_be_negative():
    with pytest.raises(ValidationError):
        ProjectCreateRequest(
            team_id=TEAM_ID,
            name="Gateway project",
            model_ids=[],
            budget_per_month=-1,
        )


def test_build_project_data_converts_uuids_to_strings():
    payload = ProjectCreateRequest(
        team_id=TEAM_ID,
        name="Gateway project",
        model_ids=[FIRST_MODEL_ID],
        budget_per_month=100,
    )

    assert build_project_data(payload) == {
        "team_id": str(TEAM_ID),
        "name": "Gateway project",
        "model_ids": [str(FIRST_MODEL_ID)],
        "budget_per_month": 100.0,
    }
