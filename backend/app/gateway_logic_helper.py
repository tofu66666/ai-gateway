# # H18IALMOND 17-Helper for the gateway (does not use database, nor network)
# H18IALMOND 21-streaming extract_text, extract_req_text, extract_res_text and SSE chunk management helper function
# In case that the client want to request models by their real model names.
# Refactor pick_model to support real model name and avoid ambiguity errors 
# At the moment I will suppose that we know alias=real model name + master prompt description
import json

def pick_model(name:str, candidates: list[dict])->dict | None:
    for m in candidates:
        if m.get("alias")==name:
            return m
    return None

# Master prompt
# I will suppose that the master prompt is in the form {"role": "system", "content"}
def apply_master_prompt(body:dict, prompt:str | None)->dict:
    # Put the model's master prompt in front of the conversation as a system message.
    # Gemini's OpenAI-compatible API keeps only the last system message, so a caller's
    # own system text joins the master prompt in that one message instead of replacing it.
    if not prompt or not prompt.strip():
        return body
    messages=body.get("messages")
    if not isinstance(messages, list):
        return body
    own=[]
    rest=[]
    for m in messages:
        if isinstance(m, dict) and m.get("role")=="system" and isinstance(m.get("content"), str):
            own.append(m["content"])
        else:
            rest.append(m)
    return {**body, "messages":[{"role": "system","content": "\n\n".join([prompt, *own])}, *rest]}

# Error management: Hide provider auth error
# 401: Unauthorized / 403: Forbidden
# replace 401 and 403 with 502 to avoid the API information leak.

def hide_provider_auth_errors(status_code: int, payload: object)->tuple[int, object]:
    if status_code in (401, 403):
        return 502, {"error": {"message": "The gateway could not authenticate with the provider."}}
    return status_code, payload

# Help function to extract text from content(string or list)

# Non-streaming: {"choices":[{"index":0,"message":{"role":"assistant","content":"hi"},"finish_reason":"stop"}],
#                 "usage":{"prompt_tokens":10,"completion_tokens":5}}
# Non-streaming -> message
# Streaming chunk {"choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}
# Streaming-> delta

def extract_text(content: object)->str|None:
    # text of a message = content as string or a list
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts=[]
        for p in content:
            if isinstance(p, dict) and p.get("type")=="text":
                value=p.get("text","")
                texts.append(str(value))
        if texts:
            return "".join(texts)
        else:
            return None 
    return None

def extract_req_text(endpoint:str, body: dict)->str|None:
    # Pick message of this request (not the master prompt or older messages)
    # Endpoint to consider: chat and completions / embeddings(the vectors/inputs) are not conversation 
    if endpoint=="chat":
        messages=body.get("messages")
        if not isinstance(messages, list):
            return None
        for m in reversed(messages):
            if isinstance(m, dict) and m.get("role")=="user":
                return extract_text(m.get("content"))
        return None
    if endpoint=="completions":
        prompt=body.get("prompt")
        if isinstance(prompt, str):
            return prompt
        else:
            return None
    return None 

def extract_res_text(payload: object)->str|None:
    # Answer text: Non-streaming chat of completion
    if not isinstance(payload, dict):
        return None
    choices=payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0],dict):
        return None
    choice=choices[0]
    message=choice.get("message")
    if isinstance(message, dict):
        return extract_text(message.get("content"))
    text=choice.get("text")
    if isinstance(text, str):
        return text
    else:
        return None

# Helper functions for SSE(Sever-sent-events) for streaming

def sse_data(line:str)->str|None:
    # Extract text after `data`
    if line.startswith("data:"):
        return line[len("data:"):].strip()
    return None

def parse_chunk(data:str)->dict|None:
    # Change JSON to dict
    try:
        chunk=json.loads(data)
    except ValueError:
        return None
    if isinstance(chunk, dict):
        return chunk
    else:
        return None

def chunk_delta(chunk:dict)->dict:
    choices=chunk.get("choices") or []
    if choices and isinstance(choices[0], dict):
        return choices[0].get("delta") or {}
    return {}

def chunk_with_content(chunk:dict)->bool:
    # The model produces content: True (for time_to_first_token)
    for choice in chunk.get("choices") or []:
        delta=(choice or {}).get("delta") or {}
        if delta.get("content") or delta.get("tool_calls") or delta.get("reasoning_content"):
             return True
    return False

def chunk_text(chunk:dict)->str:
    # text of this chunk
    text=chunk_delta(chunk).get("content")
    if isinstance(text, str):
        return text
    else:
        return ""

def is_usage_only(chunk: dict)->bool:
    # The last chunk of a stream that only contains token usage
    return bool(chunk.get("usage")) and not chunk.get("choices")

def error_event(message:str)->str:
    payload={"error":{"message":message, "type":"provider_error"}}
    return f"data: {json.dumps(payload)}\n\n"