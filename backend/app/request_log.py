# H18IALMOND 10-request logging
# H18IALMOND 17-request_id and key_id
# H18IALMOND 21-streaming (introduce TTFT, request_text, response_text)
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
    request_id: str | None=None,
    time_to_first_token_ms: int | None=None,
    request_text: str | None=None,
    response_text: str | None=None,
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
    
    record={
        "project_id":str(key["project_id"]),
        "model_id":str(model["id"]),
        "user_id":str(key["user_id"]),
        "input_tokens": tokens_in,
        "output_tokens": tokens_out,
        "cost": float(cost),
        "status":str(status_code),
        "latency": latency_ms,
    }
    if request_id is not None:
        record["id"]=request_id
    # Record the virtual key
    if key.get("key_id") is not None:
        record["key_id"]=str(key["key_id"])
    # Time to first token (for streaming only): Only when measured
    # Non-streaming rows are unchanged
    if time_to_first_token_ms is not None:
        record["time_to_first_token"]=time_to_first_token_ms
    # The conversation text: Only when there is something to store
    if request_text is not None:
        record["request_text"]=request_text
    if response_text is not None:
        record["response_text"]=response_text
    return record 


def log_request(
    *,
    key: dict,
    model: dict,
    payload: object,
    status_code: int,
    latency_ms: int,
    request_id: str | None=None,
    time_to_first_token_ms: int | None=None,
    request_text: str | None=None,
    response_text: str | None=None,
) -> str | None:
    # Request logging and accumulated cost calculation
    req_id=None
    try:
        record=build_record(
            key=key,
            model=model,
            payload=payload,
            status_code=status_code,
            latency_ms=latency_ms,
            request_id=request_id,
            time_to_first_token_ms=time_to_first_token_ms,
            request_text=request_text,
            response_text=response_text,
        )
        res=supabase.table("requests").insert(record).execute()
        
        if res.data:
            req_id=res.data[0]["id"]
        else:
            req_id=request_id
        
        # If there were a cost, update the spend_this_month
        cost=record["cost"]
        if cost>0:
            # Because race condition, SQL function add_spend is used here
            supabase.rpc(
                "add_spend",
                {"p_id": record["project_id"], "amount": cost},
            ).execute()
        
    except Exception:
        logger.exception("Failed to log request or update project spend")
    return req_id




