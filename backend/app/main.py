from fastapi import FastAPI

from app.routers import (
    db,
    health,
    project,
    team,
    auth,
    models,
    virtual_key,
    gateway,
    request_history,
    stats,
    audit,
    guardrail_settings,
)

app = FastAPI(title="P127 AI Gateway")

app.include_router(health.router, prefix="/api")
app.include_router(db.router, prefix="/api")
app.include_router(team.router, prefix="/api")
app.include_router(models.router, prefix="/api")
app.include_router(project.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(virtual_key.router, prefix="/api")
app.include_router(gateway.router, prefix="/api")
app.include_router(request_history.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(guardrail_settings.router, prefix="/api")
