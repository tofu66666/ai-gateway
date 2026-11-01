from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import get_user_id, get_user_role, supabase

router = APIRouter(tags=["models"])
security = HTTPBearer()

PUBLIC_MODEL_COLUMNS = (
    "id,alias,price_per_1m_input,price_per_1m_output,data_processing_country"
)
ADMIN_MODEL_COLUMNS = PUBLIC_MODEL_COLUMNS + ",provider,model,data_processing_state"
UNKNOWN_COUNTRY = "Not specified"
MODEL_WRITE_COLUMNS = (
    "id,alias,provider,model,price_per_1m_input,price_per_1m_output,"
    "data_processing_country,data_processing_state,created_at"
)

RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
ModelPrice = Annotated[
    Decimal,
    Field(ge=0, max_digits=12, decimal_places=6),
]


class ModelCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alias: RequiredText
    provider: RequiredText
    model: RequiredText
    price_per_1m_input: ModelPrice
    price_per_1m_output: ModelPrice
    data_processing_country: RequiredText | None = None
    data_processing_state: RequiredText | None = None


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


def serialize_model(model_row: dict, include_provider_details: bool) -> dict:
    # Convert a database row into the role-appropriate public response.
    serialized_model = {
        "id": model_row["id"],
        "alias": model_row["alias"],
        "price_per_1m_input": model_row["price_per_1m_input"],
        "price_per_1m_output": model_row["price_per_1m_output"],
        "data_processing_country": format_data_processing_country(
            model_row.get("data_processing_country")
        ),
    }

    if include_provider_details:
        serialized_model["provider"] = model_row["provider"]
        serialized_model["model"] = model_row["model"]
        serialized_model["data_processing_state"] = model_row.get(
            "data_processing_state"
        )

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

    supabase.table("audits").insert(
        {
            "action": "model_create",
            "user_id": user.id,
            "target_id": str(created_model["id"]),
            "details": {
                "provider": created_model.get("provider"),
                "model": created_model.get("model"),
                "price_per_1m_input": created_model.get("price_per_1m_input"),
                "price_per_1m_output": created_model.get("price_per_1m_output"),
                "data_processing_country": created_model.get("data_processing_country"),
                "data_processing_state": created_model.get("data_processing_state"),
                "prompt": created_model.get("prompt"),
            },
        }
    ).execute()

    return created_model
