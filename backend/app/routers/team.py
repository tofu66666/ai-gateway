from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field, FiniteFloat

from app.budget import calculate_budget_status, get_team_spend
from app.dependencies import CurrentUser, get_current_user
from app.routers.db import get_user_role, supabase

router = APIRouter(tags=["team"])
TEAM_DETAIL_COLUMNS = "id,name,owner_id,budget_per_month,warning_threshold"


class TeamCreateRequest(BaseModel):
    name: str
    owner_id: str | None = None
    budget_per_month: float | None = None


class TeamChangeOwnerRequest(BaseModel):
    team_id: str
    new_owner_id: str


class TeamUpdateRequest(BaseModel):
    budget_per_month: Annotated[
        FiniteFloat | None,
        Field(default=None, ge=0),
    ]
    warning_threshold: Annotated[
        FiniteFloat | None,
        Field(default=None, gt=0, le=1),
    ]


class TeamUserMappingRequest(BaseModel):
    team_id: str
    user_id: str | None = None
    email: str | None = None
    can_create_key: bool = False


def get_team_by_id(team_id: str) -> dict | None:
    """Return one team with the fields needed for its budget response."""
    response = (
        supabase.table("teams")
        .select(TEAM_DETAIL_COLUMNS)
        .eq("id", team_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    if rows:
        return rows[0]
    else:
        return None


def update_team(team_id: str, changes: dict) -> dict | None:
    """Update one team and return the updated database row."""
    response = supabase.table("teams").update(changes).eq("id", team_id).execute()
    rows = response.data or []
    if rows:
        return rows[0]
    else:
        return None


def is_team_member(user_id: str, team_id: str) -> bool:
    """Return whether the user has a membership row for the team."""
    rows = (
        supabase.table("user_team_mappings")
        .select("user_id")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    return bool(rows)


def with_team_budget_status(team: dict, spend) -> dict:
    """Add computed monthly spend and budget state to a team response."""
    return {
        **team,
        "spend_this_month": spend,
        **calculate_budget_status(
            spend=spend,
            budget=team.get("budget_per_month"),
            warning_threshold=team["warning_threshold"],
        ),
    }


@router.post("/team/create", status_code=status.HTTP_200_OK)
def create_team(
    payload: TeamCreateRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Create a new team. Returns the team name, owner_id, creator_role, and budget_per_month.
    """
    user_id = current_user.id
    role = current_user.role
    if role not in {"team_lead", "admin"}:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: requires team_lead or admin role"}

    owner_id = user_id
    if role == "admin" and payload.owner_id is not None:
        if (
            supabase.table("users")
            .select("id")
            .eq("id", payload.owner_id)
            .execute()
            .data
        ):
            owner_id = payload.owner_id
        else:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"message": "Invalid owner_id provided"}

    if (
        supabase.table("teams")
        .select("id")
        .eq("name", payload.name)
        .eq("owner_id", owner_id)
        .execute()
        .data
    ):
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "Team with this name and owner already exists"}

    try:
        supabase.table("teams").insert(
            {
                "name": payload.name,
                "owner_id": owner_id,
                "budget_per_month": payload.budget_per_month,
            }
        ).execute()
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": f"Failed to create team: {str(e)}"}
    team_id = (
        supabase.table("teams")
        .select("id")
        .eq("name", payload.name)
        .eq("owner_id", owner_id)
        .execute()
        .data[0]["id"]
    )
    try:
        supabase.table("user_team_mappings").insert(
            {
                "user_id": owner_id,
                "team_id": team_id,
                "can_create_key": True,
            }
        ).execute()
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": f"Team created but failed to link user to team: {str(e)}"}

    try:
        supabase.table("audits").insert(
            {
                "action": "team_create",
                "user_id": user_id,
                "target_id": team_id,
                "details": {
                    "owner_id": owner_id,
                    "name": payload.name,
                    "budget_per_month": payload.budget_per_month,
                    "warning_threshold": 0.8,
                },
            }
        ).execute()
    except Exception:
        pass

    try:
        supabase.table("audits").insert(
            {
                "action": "team_add_user",
                "user_id": user_id,
                "target_id": team_id,
                "details": {"user_id": owner_id, "can_create_key": True},
            }
        ).execute()
    except Exception:
        pass

    return {
        "status": "ok",
        "name": payload.name,
        "owner_id": owner_id,
        "creator_role": role,
        "budget_per_month": payload.budget_per_month,
    }


@router.put("/team/change_owner", status_code=status.HTTP_200_OK)
def change_owner(
    payload: TeamChangeOwnerRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Change the owner of a team. Only the current owner or an admin can change the owner.
    Returns the team name and new owner_id.
    """
    user_id = current_user.id
    new_owner_exists = get_user_role(payload.new_owner_id)
    if not new_owner_exists:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "New owner does not exist"}
    team_name = (
        supabase.table("teams").select("name").eq("id", payload.team_id).execute().data
    )
    existing_id = (
        supabase.table("teams")
        .select("id")
        .eq("name", team_name[0]["name"])
        .eq("owner_id", payload.new_owner_id)
        .execute()
        .data
    )
    if team_name and existing_id and existing_id[0]["id"] != payload.team_id:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "Team with this name and owner already exists"}

    role = current_user.role
    if role != "admin":
        # Non-admin can only change owner if they are the current owner
        team_entry = (
            supabase.table("teams")
            .select("owner_id")
            .eq("id", payload.team_id)
            .eq("owner_id", user_id)
            .execute()
            .data
        )
        if not team_entry:
            response.status_code = status.HTTP_403_FORBIDDEN
            return {
                "message": "Forbidden: only the current owner or an admin can change the owner"
            }

    try:
        supabase.table("teams").update({"owner_id": payload.new_owner_id}).eq(
            "id", payload.team_id
        ).execute()
    except:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to change team owner"}

    try:
        supabase.table("audits").insert(
            {
                "action": "team_modify_owner",
                "user_id": user_id,
                "target_id": payload.team_id,
                "details": {"user_id": payload.new_owner_id},
            }
        ).execute()
    except Exception:
        pass

    return {
        "status": "ok",
        "team_id": payload.team_id,
        "new_owner_id": payload.new_owner_id,
    }


@router.get("/team", status_code=status.HTTP_200_OK)
def get_teams(
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get a list of teams the user has access to.
    Returns a list: ["team_name1", "team_name2", ...]
    """
    user_id = current_user.id
    role = current_user.role
    res = {}
    if role == "admin":
        mappings = supabase.table("teams").select("name, id").execute().data
        for entry in mappings:
            res[entry["id"]] = entry["name"]
    else:
        mappings = (
            supabase.table("user_team_mappings")
            .select("team_id")
            .eq("user_id", user_id)
            .execute()
            .data
        )
        for entry in mappings:
            team_id = entry["team_id"]
            team_entry = (
                supabase.table("teams").select("name").eq("id", team_id).execute().data
            )
            if team_entry:
                res[team_id] = team_entry[0]["name"]
    return res


@router.get("/team/{team_id}", status_code=status.HTTP_200_OK)
def get_team(
    team_id: str,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Return team details and the sum of its projects' monthly spend."""
    try:
        team = get_team_by_id(team_id)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up team"}

    if team is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Team not found"}

    if current_user.role != "admin" and current_user.id != str(team["owner_id"]):
        try:
            allowed = is_team_member(current_user.id, team_id)
        except Exception:
            response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            return {"message": "Failed to check team membership"}
        if not allowed:
            response.status_code = status.HTTP_403_FORBIDDEN
            return {
                "message": "Forbidden: only team members or an admin can view the team"
            }

    try:
        spend = get_team_spend(team_id)
        return with_team_budget_status(team, spend)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to load team budget"}


@router.patch("/team/{team_id}", status_code=status.HTTP_200_OK)
def patch_team(
    team_id: str,
    payload: TeamUpdateRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """Update monthly budget settings for a team lead's team or an admin."""
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "At least one team field must be provided"}
    if "warning_threshold" in changes and changes["warning_threshold"] is None:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "warning_threshold cannot be null"}

    try:
        team = get_team_by_id(team_id)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to look up team"}

    if team is None:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Team not found"}

    is_admin = current_user.role == "admin"
    is_team_lead = current_user.role == "team_lead" and current_user.id == str(
        team["owner_id"]
    )
    if not (is_admin or is_team_lead):
        response.status_code = status.HTTP_403_FORBIDDEN
        return {
            "message": "Forbidden: only the team lead or an admin can update team budgets"
        }

    try:
        updated_team = update_team(team_id, changes)
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Failed to update team"}

    if updated_team is None:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Team update did not return a team"}

    try:
        supabase.table("audits").insert(
            {
                "action": "team_modify",
                "user_id": current_user.id,
                "target_id": team_id,
                "details": {
                    "owner_id": updated_team.get("owner_id"),
                    "name": updated_team.get("name"),
                    "budget_per_month": updated_team.get("budget_per_month"),
                    "warning_threshold": updated_team.get("warning_threshold"),
                },
            }
        ).execute()
    except Exception:
        pass

    try:
        return with_team_budget_status(updated_team, get_team_spend(team_id))
    except Exception:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": "Team updated but failed to load its budget status"}


@router.put("/team/user", status_code=status.HTTP_200_OK)
def upsert_user_team_mapping(
    response: Response,
    payload: TeamUserMappingRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    user_id = current_user.id
    role = current_user.role
    if role != "admin":
        is_owner = (
            supabase.table("teams")
            .select("owner_id")
            .eq("id", payload.team_id)
            .eq("owner_id", user_id)
            .execute()
            .data
        )
        if not is_owner:
            response.status_code = status.HTTP_403_FORBIDDEN
            return {
                "message": "Forbidden: only the team owner or an admin can modify user-team mappings"
            }
    if payload.user_id is None and payload.email is not None:
        users = supabase.auth.admin.list_users(per_page=1000)
        for user in users:
            if user.email == payload.email:
                payload.user_id = user.id
        if payload.user_id is None:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"message": f"No user found with email {payload.email}"}

    try:
        supabase.table("user_team_mappings").upsert(
            {
                "user_id": payload.user_id,
                "team_id": payload.team_id,
                "can_create_key": payload.can_create_key,
            },
            on_conflict="user_id,team_id",
        ).execute()
        try:
            supabase.table("audits").insert(
                {
                    "action": "team_add_user",
                    "user_id": current_user.id,
                    "target_id": payload.team_id,
                    "details": {
                        "user_id": payload.user_id,
                        "can_create_key": payload.can_create_key,
                    },
                }
            ).execute()
        except Exception:
            pass
        return {"status": "ok", "message": "User-team mapping upserted successfully"}
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": f"Failed to upsert user-team mapping: {str(e)}"}


@router.delete("/team/user", status_code=status.HTTP_200_OK)
def delete_user_team_mapping(
    response: Response,
    payload: TeamUserMappingRequest,
    current_user: CurrentUser = Depends(get_current_user),
):
    user_id = current_user.id
    role = current_user.role
    if role != "admin":
        is_owner = (
            supabase.table("teams")
            .select("owner_id")
            .eq("id", payload.team_id)
            .eq("owner_id", user_id)
            .execute()
            .data
        )
        if not is_owner:
            response.status_code = status.HTTP_403_FORBIDDEN
            return {
                "message": "Forbidden: only the team owner or an admin can remove users from teams"
            }

    if payload.user_id is None and payload.email is not None:
        users = supabase.auth.admin.list_users(per_page=1000)
        for user in users:
            if user.email == payload.email:
                payload.user_id = user.id
        if payload.user_id is None:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"message": f"No user found with email {payload.email}"}

    try:
        (
            supabase.table("user_team_mappings")
            .delete()
            .eq("user_id", payload.user_id)
            .eq("team_id", payload.team_id)
            .execute()
        )
        try:
            supabase.table("audits").insert(
                {
                    "action": "team_remove_user",
                    "user_id": current_user.id,
                    "target_id": payload.team_id,
                    "details": {"user_id": payload.user_id},
                }
            ).execute()
        except Exception:
            pass
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": f"Failed to delete user-team mapping: {str(e)}"}

    return {"status": "ok", "message": "User-team mapping deleted successfully"}


@router.get("/team/{team_id}/users", status_code=status.HTTP_200_OK)
def get_team_members(
    team_id: str,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get the members of a team. Only the owner, its members or an admin can view them.
    Returns a list: [{"user_id", "email", "can_create_key", "is_owner"}, ...]
    """
    user_id = current_user.id
    role = current_user.role
    team_entry = (
        supabase.table("teams").select("owner_id").eq("id", team_id).execute().data
    )
    if not team_entry:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Team not found"}
    owner_id = team_entry[0]["owner_id"]

    if role != "admin" and user_id != owner_id:
        is_member = (
            supabase.table("user_team_mappings")
            .select("user_id")
            .eq("team_id", team_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        if not is_member:
            response.status_code = status.HTTP_403_FORBIDDEN
            return {
                "message": "Forbidden: only team members or an admin can view team members"
            }
    mappings = (
        supabase.table("user_team_mappings")
        .select("user_id, can_create_key")
        .eq("team_id", team_id)
        .execute()
        .data
    )
    res = []
    for entry in mappings:
        user = supabase.auth.admin.get_user_by_id(entry["user_id"]).user
        res.append(
            {
                "user_id": user.id,
                "email": user.email,
                "can_create_key": entry["can_create_key"],
                "is_owner": user.id == owner_id,
            }
        )

    return res


@router.get("/team/{team_id}/requests", status_code=status.HTTP_200_OK)
def get_team_requests(
    team_id: str,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get the requests made by members of a team. Only the owner or an admin can view them.
    Returns a list of requests.
    """
    user_id = current_user.id
    role = current_user.role
    team_entry = (
        supabase.table("teams").select("owner_id").eq("id", team_id).execute().data
    )
    if not team_entry:
        response.status_code = status.HTTP_404_NOT_FOUND
        return {"message": "Team not found"}
    owner_id = team_entry[0]["owner_id"]

    if role != "admin" and user_id != owner_id:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {
            "message": "Forbidden: only the team owner or an admin can view team requests"
        }

    mappings = (
        supabase.table("projects").select("id").eq("team_id", team_id).execute().data
    )
    ids = [entry["id"] for entry in mappings]
    requests = (
        supabase.table("requests")
        .select("*")
        .in_("project_id", ids)
        .order("created_at", desc=True)
        .execute()
        .data
    )

    return requests
