"""Admin settings for sharing an alias across deployments (H18IALMOND-37).

The gateway chooses between them in app/load_balancer.py.
"""

import math
import os
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app import load_balancer
from app.dependencies import CurrentUser, get_current_user
from app.providers import PROVIDERS
from app.routers.db import supabase
from app.routers.models import model_audit_details

router = APIRouter(tags=["deployments"])

DEPLOYMENT_COLUMNS = "id,name,provider,model,base_url,api_key_env,position"
FORBIDDEN = {"message": "Forbidden: only an admin can manage deployments"}

RoutingStrategy = Literal["round_robin", "least_busy"]
RequiredText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
]
BaseUrl = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=500, pattern=r"^https?://\S+$"),
]
# The prefix stops a deployment reading other settings, such as SUPABASE_KEY,
# and sending them to its base_url.
KeyEnvName = Annotated[str, StringConstraints(pattern=r"^LLM_KEY_[A-Z0-9_]+$")]


class DeploymentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: RequiredText
    provider: RequiredText
    model: RequiredText
    base_url: BaseUrl | None = None
    api_key_env: KeyEnvName | None = None

    @field_validator("provider")
    @classmethod
    def provider_is_supported(cls, provider: str) -> str:
        if provider not in PROVIDERS:
            raise ValueError(f"Provider '{provider}' is not supported")
        return provider

    @field_validator("api_key_env")
    @classmethod
    def key_is_set(cls, name: str | None) -> str | None:
        if name is not None and not os.getenv(name):
            raise ValueError(f"{name} is not set on the server")
        return name


class RoutingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    routing_strategy: RoutingStrategy
    deployments: Annotated[list[DeploymentRequest], Field(min_length=1, max_length=20)]

    @field_validator("deployments")
    @classmethod
    def names_are_unique(cls, deployments: list) -> list:
        names = [deployment.name for deployment in deployments]
        if len(names) != len(set(names)):
            raise ValueError("Deployment names must be unique")
        return deployments


def deployment_body(row: dict) -> dict:
    # Live state sits next to the settings so an admin can see what is in rotation
    balancer = load_balancer.balancer
    return {
        "id": row["id"],
        "name": row["name"],
        "provider": row["provider"],
        "model": row["model"],
        "base_url": row.get("base_url"),
        "api_key_env": row.get("api_key_env"),
        "in_flight": balancer.in_flight(row["id"]),
        "cooldown_seconds": math.ceil(balancer.cooldown_left(row["id"])),
    }


def routing_body(model_id: str, strategy: str, rows: list[dict]) -> dict:
    return {
        "model_id": model_id,
        "routing_strategy": strategy,
        "deployments": [deployment_body(row) for row in rows],
    }


def get_model_strategy(model_id: str) -> dict | None:
    rows = (
        supabase.table("models")
        .select("id,routing_strategy")
        .eq("id", model_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def get_active_deployments(model_id: str) -> list[dict]:
    rows = (
        supabase.table("model_deployments")
        .select(DEPLOYMENT_COLUMNS)
        .eq("model_id", model_id)
        .eq("enabled", True)
        .order("position")
        .execute()
        .data
    )
    return rows or []


def deployment_audit_details(model: dict, deployments: list[dict]) -> dict:
    """Return the model's audit state plus its routing."""
    return {
        **model_audit_details(model),
        "routing_strategy": model.get("routing_strategy"),
        "deployments": [
            {
                "name": deployment.get("name"),
                "provider": deployment.get("provider"),
                "model": deployment.get("model"),
                "base_url": deployment.get("base_url"),
                "api_key_env": deployment.get("api_key_env"),
            }
            for deployment in deployments
        ],
    }


def update_model_strategy(model_id: str, strategy: str) -> dict | None:
    """Update one model's strategy and return the updated row."""
    rows = (
        supabase.table("models")
        .update({"routing_strategy": strategy})
        .eq("id", model_id)
        .execute()
        .data
    )
    return rows[0] if rows else None


def replace_deployments(model_id: str, deployments: list[DeploymentRequest]) -> None:
    # Save the new list before disabling the rest, so a failure part way through
    # can leave an alias with extra deployments but never with none.
    saved = (
        supabase.table("model_deployments")
        .upsert(
            [
                {
                    **deployment.model_dump(),
                    "model_id": model_id,
                    "position": position,
                    "enabled": True,
                }
                for position, deployment in enumerate(deployments)
            ],
            on_conflict="model_id,name",
        )
        .execute()
        .data
    )
    (
        supabase.table("model_deployments")
        .update({"enabled": False})
        .eq("model_id", model_id)
        .not_.in_("id", [row["id"] for row in saved])
        .execute()
    )


@router.get("/models/{model_id}/deployments", status_code=status.HTTP_200_OK)
def get_deployments(
    model_id: UUID,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Return an alias's strategy and its active deployments."""
    if current_user.role != "admin":
        response.status_code = status.HTTP_403_FORBIDDEN
        return FORBIDDEN

    try:
        model = get_model_strategy(str(model_id))
        rows = get_active_deployments(str(model_id)) if model else []
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up deployments"}

    if model is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Model not found"}
    return routing_body(model["id"], model["routing_strategy"], rows)


@router.put("/models/{model_id}/deployments", status_code=status.HTTP_200_OK)
def put_deployments(
    model_id: UUID,
    payload: RoutingRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Replace an alias's deployments and audit the model's new state."""
    if current_user.role != "admin":
        response.status_code = status.HTTP_403_FORBIDDEN
        return FORBIDDEN

    try:
        model = update_model_strategy(str(model_id), payload.routing_strategy)
        if model is None:
            response.status_code = status.HTTP_404_NOT_FOUND
            return {"message": "Model not found"}
        replace_deployments(str(model_id), payload.deployments)
        rows = get_active_deployments(str(model_id))
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to update deployments"}

    try:
        supabase.table("audits").insert(
            {
                "action": "model_modify",
                "user_id": current_user.id,
                "target_id": str(model_id),
                "details": deployment_audit_details(model, rows),
            }
        ).execute()
    except Exception:
        pass

    return routing_body(str(model_id), payload.routing_strategy, rows)
