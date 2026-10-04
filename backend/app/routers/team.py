from fastapi import APIRouter, Depends, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.routers.db import get_user_id, get_user_role, supabase

router = APIRouter(tags=["team"])
security = HTTPBearer()


class TeamCreateRequest(BaseModel):
    name: str
    owner_id: str | None = None
    budget_per_month: float | None = None


@router.post("/team/create", status_code=status.HTTP_200_OK)
def create_team(
    payload: TeamCreateRequest,
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    '''
    Create a new team. Returns the team name, owner_id, creator_role, and budget_per_month.
    '''
    token = credentials.credentials if credentials else None

    if not token:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Missing or invalid bearer token"}

    user_id = get_user_id(token)
    if not user_id:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Invalid token"}

    role = get_user_role(user_id)
    if role not in {"team_lead", "admin"}:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Forbidden: requires team_lead or admin role"}

    owner_id = user_id
    if role == "admin" and payload.owner_id is not None:
        if supabase.table("users").select("id").eq("id", payload.owner_id).execute().data:
            owner_id = payload.owner_id
        else:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"message": "Invalid owner_id provided"}

    if supabase.table("teams").select("id").eq("name", payload.name).eq("owner_id", owner_id).execute().data:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"message": "Team with this name and owner already exists"}

    supabase.table("teams").insert(
        {
            "name": payload.name,
            "owner_id": owner_id,
            "budget_per_month": payload.budget_per_month,
        }
    ).execute()
    
    return {
        "status": "ok",
        "name": payload.name,
        "owner_id": owner_id,
        "creator_role": role,
        "budget_per_month": payload.budget_per_month,
    }


@router.get("/team", status_code=status.HTTP_200_OK)
def get_teams(
    response: Response,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    '''
    Get a list of teams the user has access to.
    Returns a list: ["team_name1", "team_name2", ...]
    '''
    token = credentials.credentials if credentials else None
    user_id = get_user_id(token)
    if not token or not user_id:
        response.status_code = status.HTTP_403_FORBIDDEN
        return {"message": "Invalid token"}

    role = get_user_role(user_id)
    res = []
    if role == "admin":
        mappings = supabase.table("teams").select("name").execute().data
        for entry in mappings:
            res.append(entry["name"])
    else:
        mappings = supabase.table("user_team_mappings").select("team_id").eq("user_id", user_id).execute().data
        for entry in mappings:
            team_id = entry["team_id"]
            team_entry = supabase.table("teams").select("name").eq("id", team_id).execute().data
            if team_entry:
                res.append(team_entry[0]["name"])
    return res