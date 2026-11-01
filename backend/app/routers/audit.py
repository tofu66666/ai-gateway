from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import supabase
from app.routers.stats import iso_utc

router = APIRouter(tags=["audit"])

AUDIT_ACTIONS = [
    "create_api_key",
    "revoke_api_key",
    "rotate_api_key",
    "team_add_user",
    "team_remove_user",
    "team_modify_owner",
    "team_create",
    "team_modify",
    "model_create",
    "model_modify",
    "project_create",
    "project_modify",
]


class AuditLogRequest(BaseModel):
    action: str | None = None
    user_email: str | None = None
    start: int | None = None
    end: int | None = None


def add_email_to_row(rows: list[dict], email_by_user_id: dict[str, str | None] | None = None) -> list[dict]:
    """Add the associated user email to each audit entry when available."""
    if email_by_user_id is None:
        users = supabase.auth.admin.list_users(per_page=1000)
        email_by_user_id = {
            str(user.id): user.email for user in users if getattr(user, "id", None)
        }

    enriched = []
    for row in rows:
        payload = dict(row)
        payload["user_email"] = email_by_user_id.get(str(payload.get("user_id")))
        enriched.append(payload)

    return enriched


@router.get("/audit_actions", status_code=status.HTTP_200_OK)
def list_audit_actions(
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Return the set of supported audit action names."""
    if current_user.role != "admin":
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: only admins can view audit actions"}

    return AUDIT_ACTIONS


@router.get("/audit_logs", status_code=status.HTTP_200_OK)
def list_audit_logs(
    payload: AuditLogRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """List audit entries filtered by action, user email, and time range."""
    if current_user.role != "admin":
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: only admins can view audit logs"}

    query = supabase.table("audits").select(
        "id, user_id, action, target_id, details, created_at"
    )

    if payload.action is not None:
        query = query.eq("action", payload.action)

    if payload.start is not None:
        query = query.gte("created_at", iso_utc(payload.start))

    if payload.end is not None:
        query = query.lte("created_at", iso_utc(payload.end))

    rows = (query.order("created_at", desc=True).execute().data) or []

    email_by_user_id = None
    if payload.user_email is not None:
        users = supabase.auth.admin.list_users(per_page=1000)
        email_by_user_id = {
            str(user.id): user.email for user in users if getattr(user, "id", None)
        }
        matching_ids = {
            str(user_id)
            for user_id, email in email_by_user_id.items()
            if (email or "").lower() == payload.user_email.lower()
        }
        rows = [row for row in rows if str(row.get("user_id")) in matching_ids]

    return add_email_to_row(rows, email_by_user_id)
