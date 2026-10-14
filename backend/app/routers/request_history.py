from fastapi import APIRouter, Depends

from app.dependencies import CurrentUser, get_current_user
from app.routers.db import supabase

router=APIRouter(tags=["requests"])

# get /requests

REQUEST_COLUMNS=(
    "id, project_id, model_id, user_id, input_tokens, output_tokens, cost, status, latency, created_at"
)

@router.get("/requests")
def list_requests(user: CurrentUser=Depends(get_current_user)) -> list[dict]:
    # Order: newest first
    # User's own requests
    rows=(
        supabase.table("requests")
        .select(REQUEST_COLUMNS)
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return rows or []