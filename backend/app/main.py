from fastapi import FastAPI

from app.routers import db, health, models, team

app = FastAPI(title="P127 AI Gateway")

app.include_router(health.router)
app.include_router(db.router)
app.include_router(team.router)
app.include_router(models.router)