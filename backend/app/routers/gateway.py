import time
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import JSONResponse

from app import config, request_log
from app.routers.db import supabase
from app.routers.virtual_key import validate_virtual_key


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

# By using validate virtual key, it substitui find_key and verify_key
# find_key->find_project_model_ids

def get_proj_m_ids(project_id:str)->list:
    rows=(
        supabase.table("projects")
        .select("model_ids")
        .eq("id", project_id)
        .limit(1)
        .execute()
        .data
    )
    if rows:
        return rows[0]["model_ids"] or []
    else:
        return []

def get_key(credentials:HTTPAuthorizationCredentials=Depends(bearer)) -> dict:
    response=Response()
    vk=validate_virtual_key(response, credentials)
    if response.status_code !=200:
        raise HTTPException(response.status_code, vk["message"])
    return {
        "user_id": vk["user_id"],
        "project_id": vk["project_id"],
        "model_ids": get_proj_m_ids(vk["project_id"])
    }


@router.post("/chat/completions")
def chat_completions(body: dict, key: dict=Depends(get_key)):
    alias=body.get("model")
    if not alias:
        raise HTTPException(400, "'model' is required")
    
    row = get_model_by_alias(alias)
    if row is None:
        raise HTTPException(404, f"Unknown model '{alias}'")

    # Send using the real provider model name

    if str(row["id"]) not in {str(i) for i in key["model_ids"]}:
        raise HTTPException(403, f"Model '{alias}' is not usable for this project")

    
    # Round Trip Time Latency using high resolution performance counter time.perf_counter()
    started=time.perf_counter()
    # Log for requests row (key["user_id"], key["project_id"], row["id"], usage, latency, status)\
    try:
        upstream = call_prov(row["provider"], {**body, "model": row["model"]})
    
    # Timeouts(504) and network failures(502)
    except httpx.TimeoutException:
        status_code, payload=504, {"error":{"message": "Provider timed out"}}
    except httpx.HTTPError:
        status_code, payload=502, {"error":{"message": "Could not reach the provider"}}
    
    else:
        status_code=upstream.status_code
        try:
            payload=upstream.json()
        except ValueError:
            # If it is not a standard JSON
            payload={"error":{"message": "Provider returned a non-JSON response"}}
            # For the case that it returns 200 OK or 302 found with a non-JSON file.
            if status_code < 400:
                status_code = 502
    # perf_counter is second, to change to ms *1000
    latency_ms=int((time.perf_counter()-started)*1000)

    request_log.log_request(
        key=key,
        model=row,
        payload=payload,
        status_code=status_code,
        latency_ms=latency_ms,
    )
    
    return JSONResponse(payload, status_code=status_code)

