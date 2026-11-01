"""Admin settings for project guardrails (H18IALMOND-39).

The gateway enforces them in app/guardrails.py.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field, StrictInt, StringConstraints

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import supabase
from app.routers.project import project_audit_details, update_project

router = APIRouter(tags=["guardrails"])

GUARDRAIL_COLUMNS = "id,blocked_patterns,max_tokens_cap"
FORBIDDEN = {"message": "Forbidden: only an admin can manage guardrails"}

Phrase = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]


class GuardrailsRequest(BaseModel):
    blocked_patterns: Annotated[list[Phrase], Field(max_length=100)] = []
    max_tokens_cap: Annotated[StrictInt | None, Field(gt=0)] = None


def unique_phrases(phrases: list[str]) -> list[str]:
    """Drop repeats that differ only by case, keeping the first spelling."""
    seen = set()
    kept = []
    for phrase in phrases:
        if phrase.casefold() not in seen:
            seen.add(phrase.casefold())
            kept.append(phrase)
    return kept


def guardrails_body(row: dict) -> dict:
    return {
        "project_id": row["id"],
        "blocked_patterns": row.get("blocked_patterns") or [],
        "max_tokens_cap": row.get("max_tokens_cap"),
    }


@router.get("/projects/{project_id}/guardrails", status_code=status.HTTP_200_OK)
def get_guardrails(
    project_id: UUID,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Return a project's blocked phrases and max_tokens cap."""
    if current_user.role != "admin":
        response.status_code = status.HTTP_403_FORBIDDEN
        return FORBIDDEN

    try:
        rows = (
            supabase.table("projects")
            .select(GUARDRAIL_COLUMNS)
            .eq("id", str(project_id))
            .limit(1)
            .execute()
            .data
        )
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up project"}

    if not rows:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Project not found"}
    return guardrails_body(rows[0])


@router.put("/projects/{project_id}/guardrails", status_code=status.HTTP_200_OK)
def put_guardrails(
    project_id: UUID,
    payload: GuardrailsRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Replace a project's guardrails and audit the project's new state."""
    if current_user.role != "admin":
        response.status_code = status.HTTP_403_FORBIDDEN
        return FORBIDDEN

    try:
        updated_project = update_project(
            project_id,
            {
                "blocked_patterns": unique_phrases(payload.blocked_patterns),
                "max_tokens_cap": payload.max_tokens_cap,
            },
        )
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to update guardrails"}

    if updated_project is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Project not found"}

    try:
        supabase.table("audits").insert(
            {
                "action": "project_modify",
                "user_id": current_user.id,
                "target_id": str(project_id),
                "details": project_audit_details(updated_project),
            }
        ).execute()
    except Exception:
        pass

    return guardrails_body(updated_project)
