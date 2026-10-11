import hashlib
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AwareDatetime, BaseModel

from app.routers.db import controls_virtual_key, get_user_id, supabase

router = APIRouter(tags=["virtual_key"])
security = HTTPBearer()

# Every key starts with this, so a leaked key is easy to recognise in logs or code.
KEY_MARKER = "mq-k_"
# 32 random bytes = 256 bits, far too many to guess.
KEY_RANDOM_BYTES = 32
# Stored in plain text so users can tell their keys apart, e.g. "mq-k_Ab3dE9x".
DISPLAY_PREFIX_LENGTH = 12


class CreateKeyRequest(BaseModel):
    project_id: UUID
    # Leave out to use the database default (30 days from now).
    expires_at: AwareDatetime | None = None


def generate_key() -> str:
    """Return a new random raw key. Only its hash is ever stored."""
    return KEY_MARKER + secrets.token_urlsafe(KEY_RANDOM_BYTES)


def hash_key(raw_key: str) -> str:
    """
    SHA-256 hex digest of a raw key, as stored in virtual_keys.hash.

    Key validation must hash the incoming key with this same function and look
    the hash up. No salt is needed because the key itself is long and random.
    """
    return hashlib.sha256(raw_key.encode()).hexdigest()


def get_project_team(project_id: UUID) -> dict | None:
    """Look up the project's team and return its ID and owner ID, if both exist."""
    project_rows = (
        supabase.table("projects")
        .select("team_id")
        .eq("id", str(project_id))
        .limit(1)
        .execute()
        .data
    )
    if not project_rows:
        return None

    team_rows = (
        supabase.table("teams")
        .select("id, owner_id")
        .eq("id", project_rows[0]["team_id"])
        .limit(1)
        .execute()
        .data
    )
    return team_rows[0] if team_rows else None


def can_create_key(user_id: str, team: dict) -> bool:
    """Team leads (owners) and members with can_create_key may create keys."""
    if user_id == str(team["owner_id"]):
        return True
    return bool(controls_virtual_key(user_id, team["id"]))


def insert_key(key_data: dict) -> dict | None:
    """Insert one key and return the created row, if Supabase returns it."""
    created_keys = supabase.table("virtual_keys").insert(key_data).execute().data
    return created_keys[0] if created_keys else None


@router.post("/create_api_key", status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: CreateKeyRequest,
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Create a virtual key for a project. The raw key is in this response only;
    the platform stores just its SHA-256 hash and a short display prefix.
    """
    user_id = get_user_id(credentials.credentials)
    if not user_id:
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"message": "Invalid token"}

    expires_at = payload.expires_at
    if expires_at is not None and expires_at <= datetime.now(timezone.utc):
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "expires_at must be in the future"}

    try:
        team = get_project_team(payload.project_id)
        allowed = team is not None and can_create_key(user_id, team)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up project"}

    if team is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Project not found"}

    if not allowed:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {
            "message": "Forbidden: only the team lead or members allowed to create keys can create keys"
        }

    raw_key = generate_key()
    key_data = {
        "project_id": str(payload.project_id),
        "user_id": user_id,
        "hash": hash_key(raw_key),
        "prefix": raw_key[:DISPLAY_PREFIX_LENGTH],
    }
    if expires_at is not None:
        key_data["expires_at"] = expires_at.isoformat()

    try:
        created_key = insert_key(key_data)
    except Exception:
        # Do not send raw database errors to a public client.
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to create key"}

    if created_key is None:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Key creation did not return a key"}

    # The raw key is a secret shown once, so ask clients and proxies not to cache it.
    response.headers["Cache-Control"] = "no-store"
    return {
        "id": created_key["id"],
        "key": raw_key,
        "prefix": created_key["prefix"],
        "project_id": created_key["project_id"],
        "expires_at": created_key["expires_at"],
        "created_at": created_key["created_at"],
    }
