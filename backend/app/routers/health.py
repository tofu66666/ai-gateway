from fastapi import APIRouter

from app import config

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    # Report whether the database URL is set, never the URL itself.
    return {
        "status": "ok",
        "env": config.APP_ENV,
        "database_configured": bool(config.DATABASE_URL),
    }
