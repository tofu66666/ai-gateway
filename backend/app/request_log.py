# H18IALMOND 10-request logging

import logging
from app.routers.db import supabase
from app.cost import calculate_cost

logger=logging.getLogger(__name__)

def _count(value:object) -> int:
    # Check the token is valid, then Convert token in int
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return 0
    return int(value)

def get_usage(payload: object) -> tuple[int, int]:
    # Get usage from response
    if isinstance(payload, dict):
        usage=payload.get("usage")
    else:
        usage=None
    if not isinstance(usage, dict):
        return 0, 0
    return _count(usage.get("prompt_tokens")), _count(usage.get("completion_tokens"))


def build_record(
    *,
    key: dict,
    model: dict,
    payload: object,
    status_code: int,
    latency_ms: int,
) -> dict:
    # Only in case of valid response: status_code<400
    vr=status_code<400
    if vr:
        tokens_in, tokens_out=get_usage(payload)
    else:
        tokens_in, tokens_out = 0,0
    if vr:
        cost_result=calculate_cost(
            input_tokens=tokens_in,
            output_tokens=tokens_out,
            price_per_1m_input=float(model.get("price_per_1m_input",0) or 0),
            price_per_1m_output=float(model.get("price_per_1m_output",0) or 0),
            # "or 0" for case that DB value is null        
        )
        cost=float(cost_result.total)
    else:
        cost=0.0
    
    return{
        "project_id":str(key["project_id"]),
        "model_id":str(model["id"]),
        "user_id":str(key["user_id"]),
        "input_tokens": tokens_in,
        "output_tokens": tokens_out,
        "cost": float(cost),
        "status":str(status_code),
        "latency": latency_ms,
    }


def log_request(
    *,
    key: dict,
    model: dict,
    payload: object,
    status_code: int,
    latency_ms: int,
) -> str | None:
    # Request logging and accumlated cost caclulation
    request_id=None
    try:
        record=build_record(
            key=key,
            model=model,
            payload=payload,
            status_code=status_code,
            latency_ms=latency_ms,
        )
        res=supabase.table("requests").insert(record).execute()
        if res.data:
            request_id=res.data[0]["id"]
        
        # If there were a cost, update the spend_this_month
        cost=record["cost"]
        if cost>0:
            # Becaus race condition, SQL function add_spend is used here
            supabase.rpc(
                "add_spend",
                {"p_id": record["project_id"], "amount": cost},
            ).execute()
        
    except Exception:
        logger.exception("Failed to log request or update project spend")
    return request_id




