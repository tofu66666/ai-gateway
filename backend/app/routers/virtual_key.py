from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from hashlib import sha256

from app.routers.db import supabase

router = APIRouter(tags=["virtual_key"])
security = HTTPBearer()


@router.get("/virtual_key/validate")
def validate_virtual_key(
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Validate a virtual key. Returns True if the key is valid, False otherwise.
    """
    token = credentials.credentials if credentials else None
    if not token:
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"message": "Unauthorised"}

    hash = sha256(token.encode()).hexdigest()

    # Check if the token exists in the virtual_keys table.
    result = supabase.table("virtual_keys").select("*").eq("hash", hash).execute()
    result = result.data[0] if result.data else None
    if result:
        expires_at_value = datetime.fromisoformat(result["expires_at"])
        if expires_at_value <= datetime.now(timezone.utc):
            response.status_code = status.HTTP_403_FORBIDDEN
            return {"message": "Virtual key expired"}

        team_id = (
            supabase.table("projects")
            .select("team_id")
            .eq("id", result["project_id"])
            .execute()
        ).data[0]

        return {
            "project_id": result["project_id"],
            "user_id": result["user_id"],
            "expires_at": result["expires_at"],
            "team_id": team_id["team_id"],
        }
    else:
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"message": "Unauthorised"}
