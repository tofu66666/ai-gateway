from fastapi import FastAPI

from app.routers import db, health, project, team

app = FastAPI(title="P127 AI Gateway")

# One router per area (keys, chat, stats, ...), each in app/routers/.
app.include_router(health.router)
app.include_router(db.router)
app.include_router(team.router)
app.include_router(project.router)
