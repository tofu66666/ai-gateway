import pytest

from app import gateway_logic_helper as logic

def entry(alias, model="gemini-x", **extras):
    return {"id": f"id-{alias}", "alias": alias, "model": model, **extras}

# Test pick model

# Only the alias identifies a model: a real name alone is not matched
def test_real_name_alone_is_not_matched():
    models=[entry("a", "gemini-x")]
    assert logic.pick_model("gemini-x", models) is None

# Find by alias then check real model name
def test_alias_fallback():
    models=[entry("a", "gemini-x")]
    assert logic.pick_model("a", models)["model"]=="gemini-x"

# If unknown model name->none / case empty list and not empty
def test_unknown_name_is_none():
    assert logic.pick_model("no", [entry("a")]) is None
    assert logic.pick_model("any", []) is None

# Master prompt

def test_master_prompt_as_a_system_message():
    body={"model":"m", "messages":[{"role": "user","content":"hi"}]}

    result=logic.apply_master_prompt(body, "Answer")

    assert result["messages"]==[
        {"role": "system", "content": "Answer"},
        {"role": "user","content":"hi"}
    ]
    assert body["messages"]==[{"role": "user","content":"hi"}] #Preseve input

@pytest.mark.parametrize("prompt",[None, "","  "])
# No master prompt => do nothing
def test_no_master_prompt(prompt):
    body={"messages":[{"role": "user","content":"hi"}]}
    assert logic.apply_master_prompt(body, prompt)==body

# A body without messages => Ignored
def test_master_prompt_ignore_body_without_messages():
    assert logic.apply_master_prompt({"input": "x"}, "p")=={"input": "x"}

def test_master_prompt_keeps_own_system_message():
    body={"messages":[{"role": "system","content":"me"},{"role": "user","content":"hi"}]}
    roles=[m["content"] for m in logic.apply_master_prompt(body, "admin")["messages"]]
    assert roles==["admin","me","hi"]

# Test provider_auth_errors

@pytest.mark.parametrize("status", [401, 403])
# Provider_auth_error become 502?
def test_provider_auth_errors_become_502(status):
    new_status, payload=logic.hide_provider_auth_errors(status,{"error":{"message":"bad key apik-abc"}})
    assert new_status==502
    assert "apik-abc" not in str(payload)

@pytest.mark.parametrize("status", [200,400,429,500])
def test_other_status_pass_through(status):
    payload={"error":{"message":"x"}}
    assert logic.hide_provider_auth_errors(status, payload)==(status, payload)
