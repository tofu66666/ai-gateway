"""Shared monthly-budget status calculations."""

from decimal import Decimal, InvalidOperation
from typing import TypedDict


DEFAULT_WARNING_THRESHOLD = Decimal("0.8")

DecimalInput = Decimal | int | float | str


class BudgetStatus(TypedDict):
    usage_ratio: Decimal | None
    warning: bool
    blocked: bool


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
