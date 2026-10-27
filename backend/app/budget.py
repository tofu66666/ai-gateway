"""Shared monthly-budget status calculations."""

from decimal import Decimal, InvalidOperation
from typing import Literal, TypedDict

from app.routers.db import supabase


DEFAULT_WARNING_THRESHOLD = Decimal("0.8")

DecimalInput = Decimal | int | float | str


class BudgetStatus(TypedDict):
    usage_ratio: Decimal | None
    warning: bool
    blocked: bool


class ExhaustedBudget(TypedDict):
    scope: Literal["project", "team"]
    id: str
    name: str


def _as_decimal(value: DecimalInput, field_name: str) -> Decimal:
    """Convert database or request numeric values without float arithmetic."""
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError(f"{field_name} must be a finite number") from exc

    if not result.is_finite():
        raise ValueError(f"{field_name} must be a finite number")
    return result


def calculate_budget_status(
    spend: DecimalInput,
    budget: DecimalInput | None,
    warning_threshold: DecimalInput = DEFAULT_WARNING_THRESHOLD,
) -> BudgetStatus:
    """Return usage, warning and blocking state for one monthly budget."""
    spend_value = _as_decimal(spend, "spend")
    threshold_value = _as_decimal(warning_threshold, "warning_threshold")

    if spend_value < 0:
        raise ValueError("spend must be greater than or equal to zero")
    if threshold_value <= 0 or threshold_value > 1:
        raise ValueError("warning_threshold must be greater than 0 and at most 1")

    if budget is None:
        return {"usage_ratio": None, "warning": False, "blocked": False}

    budget_value = _as_decimal(budget, "budget")
    if budget_value < 0:
        raise ValueError("budget must be greater than or equal to zero")
    if budget_value == 0:
        return {"usage_ratio": None, "warning": True, "blocked": True}

    usage_ratio = spend_value / budget_value
    return {
        "usage_ratio": usage_ratio,
        "warning": usage_ratio >= threshold_value,
        "blocked": usage_ratio >= 1,
    }


def get_team_spend(team_id: str) -> Decimal:
    """Return the sum of the team's existing monthly project counters."""
    response = (
        supabase.table("projects")
        .select("spend_this_month")
        .eq("team_id", team_id)
        .execute()
    )
    rows = response.data or []
    return sum(
        (_as_decimal(row["spend_this_month"], "spend_this_month") for row in rows),
        start=Decimal("0"),
    )


def get_exhausted_budget(project_id: str) -> ExhaustedBudget | None:
    """Return the exhausted project or team budget for a new request."""
    project_response = (
        supabase.table("projects")
        .select(
            "id,name,team_id,budget_per_month,spend_this_month,warning_threshold"
        )
        .eq("id", project_id)
        .limit(1)
        .execute()
    )
    projects = project_response.data or []
    if not projects:
        raise ValueError("Project not found")

    project = projects[0]
    project_status = calculate_budget_status(
        spend=project["spend_this_month"],
        budget=project.get("budget_per_month"),
        warning_threshold=project["warning_threshold"],
    )
    if project_status["blocked"]:
        return {
            "scope": "project",
            "id": str(project["id"]),
            "name": str(project["name"]),
        }

    team_id = str(project["team_id"])
    team_response = (
        supabase.table("teams")
        .select("id,name,budget_per_month,warning_threshold")
        .eq("id", team_id)
        .limit(1)
        .execute()
    )
    teams = team_response.data or []
    if not teams:
        raise ValueError("Team not found")

    team = teams[0]
    team_status = calculate_budget_status(
        spend=get_team_spend(team_id),
        budget=team.get("budget_per_month"),
        warning_threshold=team["warning_threshold"],
    )
    if team_status["blocked"]:
        return {
            "scope": "team",
            "id": str(team["id"]),
            "name": str(team["name"]),
        }
    return None
