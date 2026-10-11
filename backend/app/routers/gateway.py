
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import config
from app.routers.db import supabase
from app.routers.virtual_key import hash_key


router=APIRouter(tags=["gateway"])
bearer=HTTPBearer()

# provider name (`provider` column in the models table) -> how to call it.
# Add a provider with an openAI-compatible API here
# Decide later whether we create a separated PROVIDER file.
PROVIDERS={
    "google":{
        "url":"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        "api_key": lambda: config.GEMINI_API_KEY,
        # Use lambda to call at runtime, not import time
    }
}

def call_prov(provider: str, body: dict) -> httpx.Response:
    cfg=PROVIDERS.get(provider)
    if cfg is None:
        raise HTTPException(501, f"Provider '{provider}' is not supported")
    return httpx.post(
        cfg["url"],
        json=body,
        headers={"Authorization":f"Bearer {cfg['api_key']()}"},
        timeout=60,
    )    


def get_model_by_alias(alias: str) -> dict | None:
    # Return the models row for this alias
    rows=(
        supabase.table("models")
        .select("id, provider, model, price_per_1m_input, price_per_1m_output")
        .eq("alias",alias)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None
    # rows[0] is dictionary

def find_key(raw_key:str)->dict | None:
    # Return {user_id, project_id, model_ids}
    rows=(
        supabase.table("virtual_keys")
        .select("user_id, project_id, expires_at, projects(model_ids)")
        .eq("hash", hash_key(raw_key))
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        return None
    row=rows[0] 
    if datetime.fromisoformat(row["expires_at"]) <= datetime.now(timezone.utc):
        # Supabase use ISO8601 for date
        return None
    return{
        "user_id":row["user_id"],
        "project_id":row["project_id"],
        "model_ids":row["projects"]["model_ids"],
    }

def verify_key(credentials:HTTPAuthorizationCredentials=Depends(bearer)) -> dict:
    # Verify if the request carries a valid virtual key
    key=find_key(credentials.credentials)
    if key is None:
        raise HTTPException(401, "Invalid or expired virtual key")
        # What is better? virtual key or API key? user virtual key?
    return key


@router.post("/chat/completions")
def chat_completions(body: dict, key: dict=Depends(verify_key)):
    alias=body.get("model")
    if not alias:
        raise HTTPException(400, "'model' is required")
    
    row = get_model_by_alias(alias)
    if row is None:
        raise HTTPException(404, f"Unknown model '{alias}'")

    # Send using the real provider model name

    if str(row["id"]) not in {str(i) for i in key["model_ids"]}:
        raise HTTPException(403, f"Model '{alias}' is not usable for this project")

    upstream = call_prov(row["provider"], {**body, "model": row["model"]})
    
    # Put the log for requests row (key["user_id"], key["project_id"], row["id"], usage, latency, status)
    
    return upstream.json()

