# # H18IALMOND 17-Helper for the gateway (does not use database, nor network)

# In case that the client want to request models by their real model names.
# Refactor pick_model to support real model name and avoid ambiguity errors 
# At the moment I will suppose that we know alias=real model name + master prompt description

def pick_model(name:str, candidates: list[dict])->dict | None:
    for m in candidates:
        if m.get("alias")==name:
            return m
    return None

# Master prompt
# I will suppose that the master prompt is in the form {"role": "system", "content"}
def apply_master_prompt(body:dict, prompt:str | None)->dict:
    # Put the model's master prompt in front of the conversation as a system message
    if not prompt or not prompt.strip():
        return body
    messages=body.get("messages")
    if not isinstance(messages, list):
        return body
    return {**body, "messages":[{"role": "system","content": prompt}, *messages]}

# Error management: Hide provider auth error
# 401: Unauthorized / 403: Forbidden
# replace 401 and 403 with 502 to avoid the API information leak.

def hide_provider_auth_errors(status_code: int, payload: object)->tuple[int, object]:
    if status_code in (401, 403):
        return 502, {"error": {"message": "The gateway could not authenticate with the provider."}}
    return status_code, payload