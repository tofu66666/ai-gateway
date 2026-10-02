from fastapi import FastAPI

from app.routers import health

app = FastAPI(title="P127 AI Gateway")

# One router per area (keys, chat, stats, ...), each in app/routers/.
app.include_router(health.router)
