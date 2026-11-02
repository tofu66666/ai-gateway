from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import get_user_id, get_user_role, supabase

router = APIRouter(tags=["models"])
security = HTTPBearer()

PUBLIC_MODEL_COLUMNS = (
    "id,alias,price_per_1m_input,price_per_1m_output,data_processing_country,prompt"
)
ADMIN_MODEL_COLUMNS = PUBLIC_MODEL_COLUMNS + ",provider,model,data_processing_state"
UNKNOWN_COUNTRY = "Not specified"
MAX_PROMPT_LENGTH = 2000
MODEL_WRITE_COLUMNS = (
    "id,alias,provider,model,price_per_1m_input,price_per_1m_output,"
    "data_processing_country,data_processing_state,prompt,created_at"
)

RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ModelPrice = Annotated[
    Decimal,
    Field(ge=0, max_digits=12, decimal_places=6),
]
ModelPrompt = Annotated[str, StringConstraints(max_length=MAX_PROMPT_LENGTH)]


class ModelCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alias: RequiredText
    provider: RequiredText
    model: RequiredText
    price_per_1m_input: ModelPrice
    price_per_1m_output: ModelPrice
    data_processing_country: RequiredText | None = None
    data_processing_state: RequiredText | None = None
    prompt: ModelPrompt | None = None


class ModelPriceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price_per_1m_input: ModelPrice
    price_per_1m_output: ModelPrice


class ModelPromptUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: ModelPrompt | None


def get_model_rows(include_provider_details: bool) -> list[dict]:
    # Return the fields the current caller is allowed to receive.
    if include_provider_details:
        columns = ADMIN_MODEL_COLUMNS
    else:
        columns = PUBLIC_MODEL_COLUMNS

    model_response = supabase.table("models").select(columns).order("alias").execute()

    if model_response.data:
        return model_response.data

    return []


def format_data_processing_country(country: object) -> str:
    # Turn an unknown data-processing country into the public fallback value.
    if not isinstance(country, str):
        return UNKNOWN_COUNTRY

    if not country.strip():
        return UNKNOWN_COUNTRY

    return country


def normalize_prompt(prompt: str | None) -> str | None:
    """Store empty master prompts as null without changing non-empty text."""
    if prompt is None or not prompt.strip():
        return None
    return prompt


def serialize_model(model_row: dict, include_provider_details: bool) -> dict:
    # Convert a database row into the role-appropriate public response.
    prompt = normalize_prompt(model_row.get("prompt"))
    serialized_model = {
        "id": model_row["id"],
        "alias": model_row["alias"],
        "price_per_1m_input": model_row["price_per_1m_input"],
        "price_per_1m_output": model_row["price_per_1m_output"],
        "data_processing_country": format_data_processing_country(
            model_row.get("data_processing_country")
        ),
        "has_prompt": prompt is not None,
    }

    if include_provider_details:
        serialized_model["provider"] = model_row["provider"]
        serialized_model["model"] = model_row["model"]
        serialized_model["data_processing_state"] = model_row.get(
            "data_processing_state"
        )
        serialized_model["prompt"] = prompt

    return serialized_model


def build_model_data(payload: ModelCreateRequest) -> dict:
    """Convert validated values to the format stored by Supabase."""
    return {
        "alias": payload.alias,
        "provider": payload.provider,
        "model": payload.model,
        "price_per_1m_input": str(payload.price_per_1m_input),
        "price_per_1m_output": str(payload.price_per_1m_output),
        "data_processing_country": payload.data_processing_country,
        "data_processing_state": payload.data_processing_state,
        "prompt": normalize_prompt(payload.prompt),
    }


def insert_model(model_data: dict) -> dict | None:
    """Insert a model and return the row created by the database."""
    result = (
        supabase.table("models")
        .insert(model_data)
        .select(MODEL_WRITE_COLUMNS)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def update_model_price(model_id: UUID, price_data: dict) -> dict | None:
    """Update one model's prices and return the updated row."""
    result = (
        supabase.table("models")
        .update(price_data)
        .eq("id", str(model_id))
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def update_model_prompt(model_id: UUID, prompt: str | None) -> dict | None:
    """Update one model's master prompt and return the updated row."""
    result = (
        supabase.table("models")
        .update({"prompt": prompt})
        .eq("id", str(model_id))
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def model_audit_details(model: dict) -> dict:
    """Return the documented model state stored in an audit row."""
    return {
        "provider": model.get("provider"),
        "model": model.get("model"),
        "price_per_1m_input": model.get("price_per_1m_input"),
        "price_per_1m_output": model.get("price_per_1m_output"),
        "data_processing_country": model.get("data_processing_country"),
        "data_processing_state": model.get("data_processing_state"),
        "prompt": model.get("prompt"),
    }


def record_model_audit(action: str, actor_id: str, model: dict) -> None:
    """Write one model audit row; callers decide whether failure is fatal."""
    supabase.table("audits").insert(
        {
            "action": action,
            "user_id": actor_id,
            "target_id": str(model["id"]),
            "details": model_audit_details(model),
        }
    ).execute()


def is_duplicate_alias_error(error: Exception) -> bool:
    """Postgres uses code 23505 for a unique constraint violation."""
    return getattr(error, "code", None) == "23505"


@router.get("/models", status_code=status.HTTP_200_OK)
def list_models(
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    # List available model aliases without exposing provider details to non-admins.
    token = None
    if credentials:
        token = credentials.credentials

    if not token:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Missing or invalid bearer token"}

    user_id = get_user_id(token)
    if not user_id:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Invalid token"}

    try:
        role = get_user_role(user_id)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up user role"}

    if role == "admin":
        include_provider_details = True
    else:
        include_provider_details = False

    try:
        model_rows = get_model_rows(include_provider_details)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to retrieve models"}

    models = []
    for model_row in model_rows:
        serialized_model = serialize_model(model_row, include_provider_details)
        models.append(serialized_model)

    return models


@router.post("/models", status_code=status.HTTP_201_CREATED)
def create_model(
    payload: ModelCreateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Add a model to the catalogue. Only administrators may add models."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can add models",
        )

    try:
        created_model = insert_model(build_model_data(payload))
    except Exception as error:
        if is_duplicate_alias_error(error):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A model with this alias already exists",
            ) from error
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add model",
        ) from error

    if created_model is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Model creation did not return a model",
        )

    try:
        record_model_audit("model_create", user.id, created_model)
    except Exception:
        pass

    return created_model


@router.patch("/models/{model_id}/price", status_code=status.HTTP_200_OK)
def patch_model_price(
    model_id: UUID,
    payload: ModelPriceUpdateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Update model input and output prices. Only administrators may do this."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can update model prices",
        )

    price_data = {
        "price_per_1m_input": str(payload.price_per_1m_input),
        "price_per_1m_output": str(payload.price_per_1m_output),
    }
    try:
        updated_model = update_model_price(model_id, price_data)
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update model prices",
        ) from error

    if updated_model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )

    return updated_model


@router.patch("/models/{model_id}/prompt", status_code=status.HTTP_200_OK)
def patch_model_prompt(
    model_id: UUID,
    payload: ModelPromptUpdateRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """Set or remove a model's master prompt. Only administrators may do this."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can update model prompts",
        )

    try:
        updated_model = update_model_prompt(
            model_id,
            normalize_prompt(payload.prompt),
        )
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update model prompt",
        ) from error

    if updated_model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Model not found",
        )

    try:
        record_model_audit("model_modify", user.id, updated_model)
    except Exception:
        pass

    return updated_model
