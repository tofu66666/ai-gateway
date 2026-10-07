from fastapi import APIRouter, Depends, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.routers.db import get_user_id, get_user_role, supabase

router = APIRouter(tags=["models"])
security = HTTPBearer()

PUBLIC_MODEL_COLUMNS = "id,alias,data_processing_country"
ADMIN_MODEL_COLUMNS = PUBLIC_MODEL_COLUMNS + ",provider,model"
UNKNOWN_COUNTRY = "Not specified"


def get_model_rows(include_provider_details: bool) -> list[dict]:
    # Return the fields the current caller is allowed to receive.
    if include_provider_details:
        columns = ADMIN_MODEL_COLUMNS
    else:
        columns = PUBLIC_MODEL_COLUMNS

    model_response = (
        supabase.table("models").select(columns).order("alias").execute()
    )

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
        "data_processing_country": format_data_processing_country(
            model_row.get("data_processing_country")
        ),
    }

    if include_provider_details:
        serialized_model["provider"] = model_row["provider"]
        serialized_model["model"] = model_row["model"]

    return serialized_model


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
