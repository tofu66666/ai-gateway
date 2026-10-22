from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, FiniteFloat, StringConstraints

from app.budget import calculate_budget_status
from app.dependencies import CurrentUser, get_current_user
from app.routers.db import get_user_id, get_user_role, supabase

router = APIRouter(tags=["project"])
security = HTTPBearer()

PROJECT_READ_COLUMNS = (
    "id,team_id,name,model_ids,budget_per_month,spend_this_month,warning_threshold"
)


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


class ProjectUpdateRequest(BaseModel):
    budget_per_month: Annotated[
        FiniteFloat | None,
        Field(default=None, ge=0),
    ]
    warning_threshold: Annotated[
        FiniteFloat | None,
        Field(default=None, gt=0, le=1),
    ]


def has_missing_model_ids(
    requested_model_ids: list[UUID],
    model_rows: list[dict],
) -> bool:
    """Return whether any requested model ID was not found in the models table."""
    existing_model_ids = {
        str(model_row["id"])
        for model_row in model_rows
        if model_row.get("id") is not None
    }

    for model_id in requested_model_ids:
        if str(model_id) not in existing_model_ids:
            return True

    return False


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


def get_accessible_team_ids(user_id: str) -> set[str]:
    """Return IDs of teams that the user owns or belongs to."""
    owned_teams = (
        supabase.table("teams")
        .select("id")
        .eq("owner_id", user_id)
        .execute()
        .data
        or []
    )
    team_memberships = (
        supabase.table("user_team_mappings")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )

    return {
        str(team["id"])
        for team in owned_teams
        if team.get("id") is not None
    } | {
        str(membership["team_id"])
        for membership in team_memberships
        if membership.get("team_id") is not None
    }


def get_project_rows(
    team_ids: set[str] | None = None,
    team_id: UUID | None = None,
) -> list[dict]:
    """Return projects, optionally limited to one team or an allowed team set."""
    if team_id is None and team_ids is not None and not team_ids:
        return []

    query = supabase.table("projects").select(PROJECT_READ_COLUMNS)

    if team_id is not None:
        query = query.eq("team_id", str(team_id))
    elif team_ids is not None:
        query = query.in_("team_id", sorted(team_ids))

    project_response = query.order("name").execute()
    return [with_budget_status(row) for row in project_response.data or []]


def get_project_by_id(project_id: UUID) -> dict | None:
    """Return one project with the fields needed for access and budget checks."""
    response = (
        supabase.table("projects")
        .select(PROJECT_READ_COLUMNS)
        .eq("id", str(project_id))
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def with_budget_status(project: dict) -> dict:
    """Add the derived monthly-budget state to a project response."""
    return {
        **project,
        **calculate_budget_status(
            spend=project["spend_this_month"],
            budget=project.get("budget_per_month"),
            warning_threshold=project["warning_threshold"],
        ),
    }


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


def update_project(project_id: UUID, changes: dict) -> dict | None:
    """Update one project and return the updated database row."""
    response = (
        supabase.table("projects")
        .update(changes)
        .eq("id", str(project_id))
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


@router.get("/projects", status_code=status.HTTP_200_OK)
def list_projects(
    response: Response,
    team_id: UUID | None = None,
    current_user: CurrentUser = Depends(get_current_user),
):
    """List projects visible to the current user, with an optional team filter."""
    try:
        if current_user.role == "admin":
            return get_project_rows(team_id=team_id)

        accessible_team_ids = get_accessible_team_ids(current_user.id)
        if team_id is not None and str(team_id) not in accessible_team_ids:
            return []

        if team_id is not None:
            return get_project_rows(team_id=team_id)

        return get_project_rows(team_ids=accessible_team_ids)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to load projects"}


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

    if role != "admin" and user_id != str(team["owner_id"]):
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: only the team owner or an admin can create projects"}

    try:
        model_rows = get_model_rows(payload.model_ids)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to validate models"}

    if has_missing_model_ids(payload.model_ids, model_rows):
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


@router.patch("/projects/{project_id}", status_code=status.HTTP_200_OK)
def patch_project(
    project_id: UUID,
    payload: ProjectUpdateRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update budget settings for a project owned by the caller's team."""
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "At least one project field must be provided"}
    if "warning_threshold" in changes and changes["warning_threshold"] is None:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "warning_threshold cannot be null"}

    try:
        project = get_project_by_id(project_id)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up project"}

    if project is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Project not found"}

    if current_user.role != "team_lead":
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: only the team lead can update project budgets"}

    try:
        team = get_team_by_id(UUID(str(project["team_id"])))
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up team"}

    if team is None or current_user.id != str(team["owner_id"]):
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: only the team lead can update project budgets"}

    try:
        updated_project = update_project(project_id, changes)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to update project"}

    if updated_project is None:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Project update did not return a project"}

    return with_budget_status(updated_project)
