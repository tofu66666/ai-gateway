from fastapi import APIRouter, HTTPException
import math

from app import config, load_balancer
from app.routers.db import supabase

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    # Check if the database is reachable by executing a simple query.
    try:
        supabase.table("users").select("id").limit(1).execute()
        deployments = (supabase.table("model_deployments").select("id,model_id")
                       .eq("enabled", True).execute().data) or []
        cooling = []
        for deployment in deployments:
            remaining = math.ceil(load_balancer.balancer.cooldown_left(deployment["id"]))
            if remaining:
                cooling.append({
                    "deployment_id": deployment["id"], "model_id": deployment["model_id"],
                    "cooldown_seconds": remaining,
                })
    except Exception:
        raise HTTPException(
            status_code=500,
            detail={
                "status": "error - database not reachable",
                "env": config.APP_ENV,
                "database_configured": bool(
                    config.SUPABASE_URL and config.SUPABASE_KEY
                ),
            },
        )
    return {
        "status": "ok",
        "env": config.APP_ENV,
        "database_configured": bool(config.SUPABASE_URL and config.SUPABASE_KEY),
        "cooling_deployments": cooling,
    }
