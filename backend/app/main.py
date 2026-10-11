from fastapi import FastAPI

from app.routers import db, health, project, team, auth, models, virtual_key, gateway

app = FastAPI(title="P127 AI Gateway")

app.include_router(health.router)
app.include_router(db.router)
app.include_router(team.router)
app.include_router(models.router)
app.include_router(project.router)
app.include_router(auth.router)
app.include_router(virtual_key.router)
app.include_router(gateway.router)