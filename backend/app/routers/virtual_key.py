import hashlib
import secrets
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import AwareDatetime, BaseModel, Field

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import controls_virtual_key, supabase

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
    # Optional label so users can tell their keys apart, e.g. "billing-bot".
    name: str | None = Field(default=None, min_length=1, max_length=100)
    # Leave out to use the database default (30 days from now).
    expires_at: AwareDatetime | None = None
    # Leave out to allow every model the project allows. An empty list is
    # rejected so a mistake can't quietly grant all of them.
    model_ids: list[UUID] | None = Field(default=None, min_length=1)


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


def get_project_model_ids(project_id: UUID) -> set[str]:
    """The IDs of the models this project allows."""
    rows = (
        supabase.table("projects")
        .select("model_ids")
        .eq("id", str(project_id))
        .limit(1)
        .execute()
        .data
    )
    return {str(model_id) for model_id in rows[0]["model_ids"] or []} if rows else set()


def has_models_outside_project(project_id: UUID, model_ids: set[str]) -> bool:
    """True if a key limited to model_ids would name a model its project doesn't allow."""
    return bool(model_ids) and not model_ids <= get_project_model_ids(project_id)


def can_create_key(user_id: str, team: dict) -> bool:
    """Team leads (owners) and members with can_create_key may create keys."""
    if user_id == str(team["owner_id"]):
        return True
    return bool(controls_virtual_key(user_id, team["id"]))


def find_key(key_id: UUID) -> dict | None:
    """Return the virtual_keys row with this ID, if it exists."""
    rows = (
        supabase.table("virtual_keys")
        .select("id, project_id, user_id, expires_at, revoked_at")
        .eq("id", str(key_id))
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


def is_expired(key: dict) -> bool:
    """True once the key's expires_at has passed."""
    expires_at = key.get("expires_at")
    if not expires_at:
        return False
    expires_at_value = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
    if expires_at_value.tzinfo is None:
        expires_at_value = expires_at_value.replace(tzinfo=timezone.utc)
    return expires_at_value <= datetime.now(timezone.utc)


def can_revoke_key(user: CurrentUser, key: dict, team: dict | None) -> bool:
    """The key's owner, the lead of the key's team, or any admin may revoke it."""
    if user.role == "admin" or user.id == str(key["user_id"]):
        return True
    return team is not None and user.id == str(team["owner_id"])


def revoke_key(key_id: UUID, actor_id: str) -> dict | None:
    """Revoke and audit in one transaction; None if the key was already revoked."""
    rows = (
        supabase.rpc(
            "revoke_virtual_key", {"p_key_id": str(key_id), "p_actor_id": actor_id}
        )
        .execute()
        .data
    )
    return rows[0] if rows else None


def rotate_key(key_id: UUID, actor_id: str, raw_key: str) -> dict | None:
    """
    Swap the key for raw_key and audit it in one transaction. Returns the new
    row, or None if the old key was revoked or expired in the meantime.
    """
    rows = (
        supabase.rpc(
            "rotate_virtual_key",
            {
                "p_key_id": str(key_id),
                "p_actor_id": actor_id,
                "p_hash": hash_key(raw_key),
                "p_prefix": raw_key[:DISPLAY_PREFIX_LENGTH],
            },
        )
        .execute()
        .data
    )
    return rows[0] if rows else None


def insert_key(key_data: dict) -> dict | None:
    """Insert one key and return the created row, if Supabase returns it."""
    created_keys = supabase.table("virtual_keys").insert(key_data).execute().data
    return created_keys[0] if created_keys else None


@router.post("/create_api_key", status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: CreateKeyRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Create a virtual key for a project. The raw key is in this response only;
    the platform stores just its SHA-256 hash and a short display prefix.
    """
    expires_at = payload.expires_at
    if expires_at is not None and expires_at <= datetime.now(timezone.utc):
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "expires_at must be in the future"}

    model_ids = {str(model_id) for model_id in payload.model_ids or []}
    try:
        team = get_project_team(payload.project_id)
        allowed = team is not None and can_create_key(user.id, team)
        bad_models = allowed and has_models_outside_project(
            payload.project_id, model_ids
        )
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

    if bad_models:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "model_ids can only include models this project allows"}

    raw_key = generate_key()
    key_data = {
        "project_id": str(payload.project_id),
        "user_id": user.id,
        "hash": hash_key(raw_key),
        "prefix": raw_key[:DISPLAY_PREFIX_LENGTH],
    }
    if payload.name is not None:
        key_data["name"] = payload.name
    if expires_at is not None:
        key_data["expires_at"] = expires_at.isoformat()
    if model_ids:
        key_data["model_ids"] = sorted(model_ids)

    try:
        created_key = insert_key(key_data)
    except Exception:
        # Do not send raw database errors to a public client.
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to create key"}

    if created_key is None:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Key creation did not return a key"}

    try:
        supabase.table("audits").insert(
            {"action": "create_api_key", "user_id": user.id, "target_id": created_key["id"]}
        ).execute()
    except Exception:
        pass

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


class KeyIdRequest(BaseModel):
    key_id: UUID


@router.post("/revoke_api_key")
def revoke_api_key(
    payload: KeyIdRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
):
    """Stop a key at once. Later calls with it get 401."""
    try:
        key = find_key(payload.key_id)
        team = get_project_team(key["project_id"]) if key else None
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up key"}

    if key is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Key not found"}

    if not can_revoke_key(user, key, team):
        response.status_code = status.HTTP_403_FORBIDDEN
        return {
            "message": "Forbidden: only the key's owner, its team lead or an admin can revoke it"
        }

    if key["revoked_at"]:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "Key is already revoked"}

    try:
        revoked = revoke_key(payload.key_id, user.id)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to revoke key"}

    # Another request revoked it between our check and the update.
    if revoked is None:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "Key is already revoked"}

    return {
        "id": revoked["id"],
        "status": "revoked",
        "revoked_at": revoked["revoked_at"],
    }


@router.post("/rotate_api_key", status_code=status.HTTP_201_CREATED)
def rotate_api_key(
    payload: KeyIdRequest,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Replace an active key with a new one for the same project and user. The old
    key stops working at once; the new raw key is in this response only.
    """
    try:
        key = find_key(payload.key_id)
        team = get_project_team(key["project_id"]) if key else None
        # Rotating shows the new raw key to the caller, so only the key's owner
        # may do it, and only while they may still create keys in the team.
        allowed = (
            key is not None
            and team is not None
            and user.id == str(key["user_id"])
            and can_create_key(user.id, team)
        )
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up key"}

    if key is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Key not found"}

    if not allowed:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {
            "message": "Forbidden: only the key's owner, while allowed to create keys, can rotate it"
        }

    if key["revoked_at"] or is_expired(key):
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {
            "message": "Revoked or expired keys cannot be rotated; create a new key instead"
        }

    raw_key = generate_key()
    try:
        new_key = rotate_key(payload.key_id, user.id, raw_key)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to rotate key"}

    # Another request revoked it, or it expired, between our check and the swap.
    if new_key is None:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {
            "message": "Revoked or expired keys cannot be rotated; create a new key instead"
        }

    response.headers["Cache-Control"] = "no-store"
    return {
        "id": new_key["id"],
        "key": raw_key,
        "prefix": new_key["prefix"],
        "project_id": new_key["project_id"],
        "expires_at": new_key["expires_at"],
        "created_at": new_key["created_at"],
    }


def get_key_status(key: dict) -> str:
    """revoked if revoked_at is set, else expired if expires_at has passed, else active."""
    if key.get("revoked_at"):
        return "revoked"
    return "expired" if is_expired(key) else "active"


def get_led_team_ids(user_id: str) -> set[str]:
    """IDs of the teams this user leads (owns)."""
    rows = supabase.table("teams").select("id").eq("owner_id", user_id).execute().data
    return {row["id"] for row in rows}


def get_member_team_ids(user_id: str) -> set[str]:
    """IDs of the teams this user belongs to."""
    rows = (
        supabase.table("user_team_mappings")
        .select("team_id")
        .eq("user_id", user_id)
        .execute()
        .data
    )
    return {row["team_id"] for row in rows}


def get_project_ids(
    project_id: UUID | None = None, team_ids: set[str] | None = None
) -> dict:
    """Map project ID -> team ID for one project, the projects of some teams, or both."""
    query = supabase.table("projects").select("id, team_id")
    if project_id is not None:
        query = query.eq("id", str(project_id))
    if team_ids is not None:
        query = query.in_("team_id", sorted(team_ids))
    return {row["id"]: row["team_id"] for row in query.execute().data}


def get_keys(conditions: list[str] | None) -> list[dict]:
    """
    Keys newest first, with their project's name and team. conditions are
    PostgREST filters joined with OR; None means every key.
    """
    query = supabase.table("virtual_keys").select(
        "id, prefix, name, project_id, user_id, created_at, expires_at, revoked_at, "
        "model_ids, projects(name, team_id)"
    )
    if conditions is not None:
        query = query.or_(",".join(conditions))
    return query.order("created_at", desc=True).execute().data


def get_model_aliases(keys: list[dict]) -> dict:
    """Map model ID -> alias for the models these keys are limited to."""
    model_ids = {
        str(model_id) for key in keys for model_id in key.get("model_ids") or []
    }
    if not model_ids:
        return {}
    rows = (
        supabase.table("models")
        .select("id, alias")
        .in_("id", sorted(model_ids))
        .execute()
        .data
    )
    return {str(row["id"]): row["alias"] for row in rows}


def get_user_emails() -> dict:
    """Map user ID -> email from Supabase Auth."""
    return {
        user.id: user.email for user in supabase.auth.admin.list_users(per_page=1000)
    }


def in_filter(column: str, ids) -> str:
    return f"{column}.in.({','.join(sorted(ids))})"


def scoped_key_conditions(
    user: CurrentUser, led_team_ids: set[str], wanted_projects: set[str] | None
) -> list[str]:
    """
    Filters for the keys this user may see: their own keys, plus every key in
    the teams they lead. wanted_projects (None = no filter) narrows both.
    """
    conditions = []
    led_projects = (
        set(get_project_ids(team_ids=led_team_ids)) if led_team_ids else set()
    )
    if wanted_projects is not None:
        led_projects &= wanted_projects
    if led_projects:
        conditions.append(in_filter("project_id", led_projects))

    own_keys = f"user_id.eq.{user.id}"
    if wanted_projects is None:
        conditions.append(own_keys)
    elif wanted_projects:
        conditions.append(f"and({own_keys},{in_filter('project_id', wanted_projects)})")
    return conditions


class OutOfScope(Exception):
    """A key list filter names a team or project the user is not in."""


def wanted_project_ids(
    project_id: UUID | None, team_id: UUID | None, my_team_ids: set[str] | None
) -> set[str] | None:
    """
    Project IDs the filters ask for (None = no filter). my_team_ids is None for
    admins; anyone else gets OutOfScope for a team or project outside it.
    """
    wanted = None
    if team_id is not None:
        if my_team_ids is not None and str(team_id) not in my_team_ids:
            raise OutOfScope("Forbidden: you are not in this team")
        wanted = set(get_project_ids(team_ids={str(team_id)}))
    if project_id is not None:
        project_team = get_project_ids(project_id=project_id)
        if my_team_ids is not None and not set(project_team.values()) & my_team_ids:
            raise OutOfScope("Forbidden: you are not in this project's team")
        project_ids = set(project_team)
        wanted = project_ids if wanted is None else wanted & project_ids
    return wanted


def listed_key(key: dict, key_status: str, emails: dict, aliases: dict) -> dict:
    """A key as GET /api_keys shows it, never with its hash."""
    project = key.get("projects") or {}
    allowed_models = [
        aliases.get(str(model_id), "Unknown model")
        for model_id in key.get("model_ids") or []
    ]
    return {
        "id": key["id"],
        "prefix": key["prefix"],
        "name": key.get("name"),
        "project_id": key["project_id"],
        "project_name": project.get("name"),
        "team_id": project.get("team_id"),
        "user_id": key["user_id"],
        "user_email": emails.get(key["user_id"]),
        # Empty means every model the project allows.
        "allowed_models": sorted(allowed_models),
        "created_at": key["created_at"],
        "expires_at": key["expires_at"],
        "revoked_at": key.get("revoked_at"),
        "status": key_status,
    }


@router.get("/api_keys")
def list_api_keys(
    response: Response,
    project_id: UUID | None = None,
    team_id: UUID | None = None,
    status_filter: Literal["active", "revoked", "expired"] | None = Query(
        None, alias="status"
    ),
    user: CurrentUser = Depends(get_current_user),
):
    """
    List keys, newest first. Users see their own keys, team leads also every
    key in the teams they lead, admins every key.
    """
    is_admin = user.role == "admin"
    try:
        led_team_ids = set() if is_admin else get_led_team_ids(user.id)
        my_team_ids = None if is_admin else led_team_ids | get_member_team_ids(user.id)
        wanted = wanted_project_ids(project_id, team_id, my_team_ids)

        if not is_admin:
            conditions = scoped_key_conditions(user, led_team_ids, wanted)
        elif wanted is None:
            conditions = None
        else:
            conditions = [in_filter("project_id", wanted)] if wanted else []

        keys = get_keys(conditions) if conditions != [] else []
        emails = get_user_emails() if keys else {}
        aliases = get_model_aliases(keys)
    except OutOfScope as e:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": str(e)}
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to list keys"}

    listed = [listed_key(key, get_key_status(key), emails, aliases) for key in keys]
    if status_filter is not None:
        listed = [key for key in listed if key["status"] == status_filter]
    return listed


@router.get("/virtual_key/validate")
def validate_virtual_key(
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Validate a virtual key and reject revoked or expired keys with 401."""
    token = credentials.credentials if credentials else None
    if not token:
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"message": "Unauthorised"}

    token_hash = hash_key(token)
    result = supabase.table("virtual_keys").select("*").eq("hash", token_hash).execute()
    result = result.data[0] if result.data else None
    if result:
        if result.get("revoked_at"):
            response.status_code = status.HTTP_401_UNAUTHORIZED
            return {"message": "Virtual key revoked"}

        if is_expired(result):
            response.status_code = status.HTTP_401_UNAUTHORIZED
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
            "model_ids": result.get("model_ids") or [],
        }

    response.status_code = status.HTTP_401_UNAUTHORIZED
    return {"message": "Unauthorised"}
