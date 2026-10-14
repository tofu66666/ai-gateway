from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import get_user_role, supabase

router = APIRouter(tags=["team"])


class TeamCreateRequest(BaseModel):
    name: str
    owner_id: str | None = None
    budget_per_month: float | None = None


class TeamChangeOwnerRequest(BaseModel):
    team_id: str
    new_owner_id: str


class TeamUserMappingRequest(BaseModel):
    team_id: str
    user_id: str | None = None
    email: str | None = None
    can_create_key: bool = False


class TeamMembersRequest(BaseModel):
    team_id: str


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
    try:
        supabase.table("user_team_mappings").insert(
            {
                "user_id": user_id,
                "team_id": supabase.table("teams")
                .select("id")
                .eq("name", payload.name)
                .eq("owner_id", owner_id)
                .execute()
                .data[0]["id"],
                "can_create_key": True,
            }
        ).execute()
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": f"Team created but failed to link user to team: {str(e)}"}

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
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"message": f"Failed to delete user-team mapping: {str(e)}"}

    return {"status": "ok", "message": "User-team mapping deleted successfully"}


@router.get("/team/members", status_code=status.HTTP_200_OK)
def get_team_members(
    payload: TeamMembersRequest,
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Get a list of members for a given team. Returns a list of user IDs.
    """
    user_id = current_user.id
    role = current_user.role
    if role != "admin":
        is_member = (
            supabase.table("user_team_mappings")
            .select("user_id")
            .eq("team_id", payload.team_id)
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
        .select("user_id")
        .eq("team_id", payload.team_id)
        .execute()
        .data
    )
    print(payload.team_id)
    ids = [entry["user_id"] for entry in mappings]
    res = {}
    for id in ids:
        user = supabase.auth.admin.get_user_by_id(id).user
        res[user.id] = user.email

    return res
