from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, FiniteFloat, StringConstraints

from app.routers.db import get_user_id, get_user_role, supabase

router = APIRouter(tags=["project"])
security = HTTPBearer()


class ProjectCreateRequest(BaseModel):
    team_id: UUID
    name: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True,
            min_length=1,
        ),
    ]

    model_ids: list[UUID]

    budget_per_month: Annotated[
        FiniteFloat | None,
        Field(default=None, ge=0),
    ]


def can_create_project(
    user_id: str,
    role: str | None,
    team_owner_id: str,
) -> bool:
    """Return whether a user may create a project for one particular team."""
    return role == "admin" or user_id == team_owner_id


def find_missing_model_ids(
    requested_model_ids: list[UUID],
    model_rows: list[dict],
) -> list[str]:
    """Return requested IDs that were not found in the models table."""
    # Store every model ID that exists in the database.
    existing_model_ids = set()
    for model_row in model_rows:
        if model_row.get("id") is not None:
            model_id = str(model_row["id"])
            existing_model_ids.add(model_id)

    # Store every requested ID that was not found in the database.
    missing_model_ids = []
    for model_id in requested_model_ids:
        model_id_as_text = str(model_id)
        if model_id_as_text not in existing_model_ids:
            missing_model_ids.append(model_id_as_text)

    return missing_model_ids


def get_team_by_id(team_id: UUID) -> dict | None:
    """Look up one team and return its ID and owner ID, if it exists."""
    team_response = (
        supabase.table("teams")
        .select("id, owner_id")
        .eq("id", str(team_id))
        .limit(1)
        .execute()
    )
    team_rows = team_response.data or []

    if not team_rows:
        return None

    return team_rows[0]


def get_model_rows(model_ids: list[UUID]) -> list[dict]:
    """Return database rows for the requested model IDs."""
    # An empty IN () query is invalid, so there is nothing to query here.
    if not model_ids:
        return []

    model_response = (
        supabase.table("models")
        .select("id")
        .in_("id", [str(model_id) for model_id in model_ids])
        .execute()
    )
    return model_response.data or []


def build_project_data(payload: ProjectCreateRequest) -> dict:
    """Convert validated request values into the database insert format."""
    return {
        "team_id": str(payload.team_id),
        "name": payload.name,
        "model_ids": [str(model_id) for model_id in payload.model_ids],
        "budget_per_month": payload.budget_per_month,
    }


def insert_project(project_data: dict) -> dict | None:
    """Insert one project and return the created row, if Supabase returns it."""
    insert_response = supabase.table("projects").insert(project_data).execute()
    created_projects = insert_response.data or []

    if not created_projects:
        return None

    return created_projects[0]


@router.post("/projects", status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateRequest,
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Create a project for its team owner or for an administrator."""
    token = credentials.credentials if credentials else None
    if not token:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Missing or invalid bearer token"}

    user_id = get_user_id(token)
    if not user_id:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Invalid token"}

    role = get_user_role(user_id)

    # Read the team owner from the database instead of trusting client input.
    try:
        team = get_team_by_id(payload.team_id)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up team"}

    if team is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Team not found"}

    team_owner_id = str(team["owner_id"])
    if not can_create_project(user_id, role, team_owner_id):
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: only the team owner or an admin can create projects"}

    try:
        model_rows = get_model_rows(payload.model_ids)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to validate models"}

    missing_model_ids = find_missing_model_ids(payload.model_ids, model_rows)
    if missing_model_ids:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "One or more model IDs do not exist"}

    project_to_insert = build_project_data(payload)

    try:
        created_project = insert_project(project_to_insert)
    except Exception:
        # Do not send raw database errors to a public client.
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to create project"}

    if created_project is None:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Project creation did not return a project"}

    return created_project
