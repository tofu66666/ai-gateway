from fastapi import APIRouter
from supabase import create_client, Client
from app import config

router = APIRouter(tags=["db"])
supabase = create_client(
    config.SUPABASE_URL, config.SUPABASE_KEY
)

def controls_virtual_key(user_id, team_id):
    response = (
        supabase.table("user_team_mappings")
        .select("can_create_key")
        .eq("user_id", user_id)
        .eq("team_id", team_id)
        .execute()
    )
    if response.data:
        return response.data[0]["can_create_key"]

def get_user_id(token):
    try:
        response = supabase.auth.get_user(token)
        return response.user.id
    except Exception:
        return None

def get_user_role(user_id):
    response = supabase.table("users").select("role").eq("id", user_id).execute()
    if response.data:
        return response.data[0]["role"]
    return None

# TODO remove once we are done testing.
@router.get("/db_testing")
def db_testing():
    access_token = supabase.auth.sign_in_with_password(
        {
            "email": "test@test.com",
            "password": "testtest",
        }
    ).session.access_token
    user_id = get_user_id(access_token)
    return get_user_role(user_id), user_id, access_token
