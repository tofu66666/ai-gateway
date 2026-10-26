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


def can_access_key(current_user: CurrentUser, key_id: str) -> bool:
    if current_user.role == "admin":
        return True

    key_row = (
        supabase.table("virtual_keys")
        .select("project_id, user_id")
        .eq("id", str(key_id))
        .limit(1)
        .execute()
        .data
    )
    if not key_row:
        return False

    key_data = key_row[0]
    if str(key_data.get("user_id")) == str(current_user.id):
        return True

    project_id = key_data.get("project_id")
    if project_id and can_access_project(current_user, str(project_id)):
        return True

    return False


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

    for column in ("model_id", "user_id", "key_id"):
        if column == "user_id" and current_user.role != "admin":
            if str(id) != str(current_user.id):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: you can only view your own user stats",
                )

        if column == "key_id":
            if not can_access_key(current_user, str(id)):
                raise HTTPException(
                    status_code=403,
                    detail="Forbidden: only the key owner, the project team owner, or an admin can access key stats",
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


def percentile(values: list[int], fraction: float):
    if not values:
        return 0.0

    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])

    position = max(0, min(len(ordered) - 1, int(len(ordered) * fraction)))
    return float(ordered[position])


def aggregate_metrics(rows: list[dict]):
    metrics = {
        "input": 0,
        "output": 0,
        "total_cost": 0.0000,
        "count": len(rows),
        "success_count": 0,
        "failure_count": 0,
    }
    latency_values = []

    for row in rows:
        metrics["input"] += int(row.get("input_tokens") or 0)
        metrics["output"] += int(row.get("output_tokens") or 0)
        metrics["total_cost"] += float(row.get("cost") or 0.0)

        status = str(row.get("status") or "")
        if status.startswith("2"):
            metrics["success_count"] += 1
        else:
            metrics["failure_count"] += 1

        latency = row.get("latency")
        if latency is not None:
            latency_values.append(int(latency))

    if rows:
        metrics["avg_cost"] = round(metrics["total_cost"] / len(rows), 4)
        metrics["success_rate"] = metrics["success_count"] / len(rows)
    else:
        metrics["avg_cost"] = 0.0000
        metrics["success_rate"] = 0.00

    metrics["total_cost"] = round(metrics["total_cost"], 4)

    if latency_values:
        metrics["latency_max"] = max(latency_values)
        metrics["latency_p50"] = int(round(percentile(latency_values, 0.5)))
        metrics["latency_p95"] = int(round(percentile(latency_values, 0.95)))
        metrics["latency_p99"] = int(round(percentile(latency_values, 0.99)))
    else:
        metrics["latency_max"] = 0
        metrics["latency_p50"] = 0
        metrics["latency_p95"] = 0
        metrics["latency_p99"] = 0

    return metrics


@router.get("/stats/{resource_id}")
def get_stats(
    resource_id: str,
    response: Response,
    start: int | None = None,
    end: int | None = None,
    current_user: CurrentUser = Depends(get_current_user),
):
    if start is None or end is None:
        now = datetime.now(timezone.utc)
        start = int((now - timedelta(days=30)).timestamp())
        end = int(now.timestamp())

    try:
        rows = get_rows_for_id(resource_id, current_user, start, end)
    except Exception as e:
        response.status_code = getattr(e, "status_code", 500)
        return {"message": getattr(e, "detail", str(e))}
    return aggregate_metrics(rows)
