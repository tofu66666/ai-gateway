from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import supabase

router = APIRouter(tags=["stats"])

REQUEST_COLUMNS = "id, project_id, model_id, user_id, input_tokens, output_tokens, cost, status, latency, created_at"


def iso_utc(epoch_seconds: int) -> str:
    return (
        datetime.fromtimestamp(epoch_seconds, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def can_access_team(current_user: CurrentUser, team_id: str) -> bool:
    if current_user.role == "admin":
        return True

    team_row = (
        supabase.table("teams")
        .select("owner_id")
        .eq("id", str(team_id))
        .limit(1)
        .execute()
        .data
    )
    if not team_row:
        return False
    return str(team_row[0].get("owner_id")) == str(current_user.id)


def can_access_project(current_user: CurrentUser, project_id: str) -> bool:
    if current_user.role == "admin":
        return True

    project_row = (
        supabase.table("projects")
        .select("team_id")
        .eq("id", str(project_id))
        .limit(1)
        .execute()
        .data
    )
    if not project_row:
        return False

    team_id = project_row[0].get("team_id")
    if not team_id:
        return False

    return can_access_team(current_user, str(team_id))


def get_team_rows_for_range(team_id: str, start: int, end: int) -> list[dict]:
    project_rows = (
        supabase.table("projects")
        .select("id")
        .eq("team_id", str(team_id))
        .execute()
        .data
    )
    project_ids = [str(project["id"]) for project in project_rows if project.get("id")]

    return (
        supabase.table("requests")
        .select(REQUEST_COLUMNS)
        .in_("project_id", project_ids)
        .gte("created_at", iso_utc(start))
        .lte("created_at", iso_utc(end))
        .execute()
        .data
    )


def get_rows_for_id(id: str, current_user: CurrentUser, start: int, end: int):

    team_row = (
        supabase.table("teams").select("id").eq("id", str(id)).limit(1).execute().data
    )
    if team_row:
        if not can_access_team(current_user, str(id)):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: only the team owner or an admin can access team stats",
            )
        return get_team_rows_for_range(str(id), start, end)

    project_row = (
        supabase.table("projects")
        .select("id")
        .eq("id", str(id))
        .limit(1)
        .execute()
        .data
    )
    if project_row:
        if not can_access_project(current_user, str(id)):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: only project owners or admins can access project stats",
            )
        return (
            supabase.table("requests")
            .select(REQUEST_COLUMNS)
            .eq("project_id", str(id))
            .gte("created_at", iso_utc(start))
            .lte("created_at", iso_utc(end))
            .execute()
            .data
        )

    for column in ("model_id", "user_id"):
        if column == "user_id" and current_user.role != "admin":
            if str(id) != str(current_user.id):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: you can only view your own user stats",
                )

        rows = (
            supabase.table("requests")
            .select(REQUEST_COLUMNS)
            .eq(column, str(id))
            .gte("created_at", iso_utc(start))
            .lte("created_at", iso_utc(end))
            .execute()
            .data
        )
        if rows:
            return rows

    return []
