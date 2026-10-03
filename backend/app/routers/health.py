from fastapi import APIRouter, HTTPException

from app import config
from app.routers.db import supabase

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    # Check if the database is reachable by executing a simple query.
    try:
        supabase.table("users").select("id").limit(1).execute()
    except Exception:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error - database not reachable",
                "env": config.APP_ENV,
                "database_configured": bool(config.SUPABASE_URL and config.SUPABASE_KEY),
            },
        )
    return {
        "status": "ok",
        "env": config.APP_ENV,
        "database_configured": bool(config.SUPABASE_URL and config.SUPABASE_KEY),
    }
