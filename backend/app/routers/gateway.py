import time
import logging
from datetime import datetime, timezone
import uuid
import httpx
from fastapi import APIRouter, HTTPException, Depends, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import JSONResponse

from app import budget, config, request_log
from app import gateway_logic_helper as logic
from app.providers import call_prov
from app.routers.db import supabase
from app.routers.virtual_key import validate_virtual_key, hash_key

logger=logging.getLogger(__name__)
router=APIRouter(tags=["gateway"])
bearer=HTTPBearer()

# Find virtual_key
def lookup_key_id(raw_key:str)->str|None:
    # Finding the id of the virtual key by its hash
    rows=(
        supabase.table("virtual_keys")
        .select("id")
        .eq("hash", hash_key(raw_key))
        .limit(1)
        .execute()
        .data
    )
    if rows:
        return rows[0]["id"]
    else:
        return None

def get_allowed_models(model_ids: list) -> list[dict]:
    # Select the whole model rows this project uses. (include prompt)
    ids=[]
    for i in model_ids or []:
        ids.append(str(i))
    if not ids:
        return [] 
    rows=(
        supabase.table("models")
        .select("*")
        .in_("id", ids)
        .execute()
        .data 
    ) or []
    return rows

# Check if model exists
def model_exists(name:str)->bool:
    # Is there any model, with this alias? (allowed or not)
    rows=(
        supabase.table("models")
        .select("id")
        .eq("alias", name)
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)

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
    # Including the virtual key's own id
    key_id=vk.get("key_id")
    if key_id is None:
        try:
            key_id=lookup_key_id(credentials.credentials)
        except Exception:
            logger.exception("Could not look up the virtual key id")
    return {
        "user_id": vk["user_id"],
        "project_id": vk["project_id"],
        "key_id": key_id,
        "model_ids": get_proj_m_ids(vk["project_id"]),
        # Empty means the key may use all of the project's models
        "key_model_ids": vk.get("model_ids") or []
    }

def resolve_model(name:object, key:dict)->dict:
    # Find the model,
    # Refuse it, if it is not allowed to the project or the key (403)
    # If it is wrong kind for this endpoint, 400
    if not name or not isinstance(name, str):
        raise HTTPException(400, "'model' is required")
    row=logic.pick_model(name, get_allowed_models(key["model_ids"]))
    if row is None:
        if model_exists(name):
            raise HTTPException(403, f"Model '{name}' is not allowed for this project")
        raise HTTPException(404, f"Unknown model '{name}'")
    key_models={str(i) for i in key.get("key_model_ids") or []}
    if key_models and str(row["id"]) not in key_models:
        raise HTTPException(403, f"Model '{name}' is not allowed for this key")
    return row


def require_budget_available(key: dict = Depends(get_key)) -> dict:
    """Reject a new request before any provider call if its budget is exhausted."""
    try:
        exhausted = budget.get_exhausted_budget(str(key["project_id"]))
    except Exception as exc:
        raise HTTPException(503, "Could not verify monthly budget") from exc

    if exhausted is not None:
        scope = exhausted["scope"]
        name = exhausted["name"]
        raise HTTPException(429, f"Monthly {scope} budget '{name}' is exhausted")
    return key

def ms_since(started: float)->int:
    return int((time.perf_counter()-started)*1000)

# log_and_respond=Second part of chat_completions (declare first here because the first part=send_to_prov use is in the end)
def log_and_respond(status_code, payload, row, key, started, request_id):
    #Log the request and answer with JSON (use it for non-streaming answer)
    if status_code >= 400:
        new_status, payload=logic.hide_provider_auth_errors(status_code, payload)
        if new_status != status_code:
            logger.warning(
                "Provider '%s' rejected the gateway's credentials (HTTP %s)", row["provider"], status_code
            )
            status_code=new_status
    logged_id=request_log.log_request(
        key=key,
        model=row,
        payload=payload,
        status_code=status_code,
        latency_ms=ms_since(started),
        request_id=request_id,
    )
    if logged_id:
        headers={"X-Request-ID": str(logged_id)}
    else:
        headers={}
    return JSONResponse(payload, status_code=status_code, headers=headers)

# First part of chat_completions
def send_to_prov_json(call_endpoint, provider_body, row, key):
    # Call the provider and wait for the whole answer
    request_id=str(uuid.uuid4())
    started=time.perf_counter()
    try:
        upstream = call_prov(row["provider"], call_endpoint, provider_body)
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
    return log_and_respond(status_code, payload, row, key, started, request_id)    

def send_req(endpoint:str, body:dict, key:dict):
    # Chat, embeddings and completions: body goes to the provider with real model name here
    row=resolve_model(body.get("model"), key)

    provider_body={**body,"model":row["model"]}
    if endpoint=="chat":
        provider_body=logic.apply_master_prompt(provider_body, row.get("prompt"))
    return send_to_prov_json(endpoint, provider_body, row, key)



@router.post("/chat/completions")
@router.post("/v1/chat/completions", include_in_schema=False)
def chat_completions(body:dict, key:dict=Depends(require_budget_available)):
    return send_req("chat", body, key)

