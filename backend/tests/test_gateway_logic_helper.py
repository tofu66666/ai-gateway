import pytest
import httpx
from app import gateway_logic_helper as logic, providers, request_log, config

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

# Gemini keeps only the last system message: the caller's own joins the master prompt
def test_master_prompt_merges_own_system_message():
    body={"messages":[{"role": "system","content":"me"},{"role": "user","content":"hi"}]}
    assert logic.apply_master_prompt(body, "admin")["messages"]==[
        {"role": "system", "content": "admin\n\nme"},
        {"role": "user","content":"hi"}
    ]

# Every system text joins, in order, wherever it was in the conversation
def test_master_prompt_merges_every_system_message():
    body={"messages":[
        {"role": "system","content":"one"},
        {"role": "user","content":"hi"},
        {"role": "system","content":"two"},
    ]}
    assert logic.apply_master_prompt(body, "admin")["messages"]==[
        {"role": "system", "content": "admin\n\none\n\ntwo"},
        {"role": "user","content":"hi"}
    ]

# A system message that is not plain text stays where it is
def test_master_prompt_leaves_non_text_system_message():
    parts=[{"type": "text","text":"me"}]
    body={"messages":[{"role": "system","content":parts},{"role": "user","content":"hi"}]}
    assert logic.apply_master_prompt(body, "admin")["messages"]==[
        {"role": "system", "content": "admin"},
        {"role": "system","content":parts},
        {"role": "user","content":"hi"}
    ]

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

def test_extract_req_text():
    msg=[
        {"role": "system", "content": "s"},
        {"role": "user", "content": "a"},
        {"role": "assistant", "content": "b"},
        {"role": "user", "content": [{"type": "text", "text": "c"}, {"type": "image_url"}]},
    ]
    assert logic.extract_req_text("chat",{"messages":msg})=="c"
    assert logic.extract_req_text("chat",{"messages": [{"role": "system", "content": "s"}]}) is None
    assert logic.extract_req_text("chat",{}) is None
    assert logic.extract_req_text("completions",{"prompt":"p"})=="p"
    assert logic.extract_req_text("completions",{"prompt":["p"]}) is None 

def test_extract_res_text():
    assert logic.extract_res_text({"choices":[{"message":{"content":"hi"}}]})=="hi"
    assert logic.extract_res_text({"choices":[{"text": "ola"}]})=="ola"
    assert logic.extract_res_text({"choices":[]}) is None
    assert logic.extract_res_text({"error":{}}) is None
    assert logic.extract_res_text("no") is None

# test sse helpers

def test_sse_helpers():
    assert logic.sse_data("data:{\"a\":1}")=='{"a":1}'
    assert logic.sse_data(": comment") is None
    assert logic.parse_chunk("not json") is None
    assert logic.parse_chunk("[1]") is None
    assert logic.chunk_with_content({"choices": [{"delta": {"content": "x"}}]})
    assert not logic.chunk_with_content({"choices": [{"delta": {"role": "assistant"}}]})
    assert not logic.chunk_with_content({"choices": [{"delta": {"content": ""}}]})
    assert logic.chunk_text({"choices": [{"delta": {"content": "x"}}]}) == "x"
    assert logic.chunk_text({"choices": []}) == ""
    assert logic.is_usage_only({"usage": {"prompt_tokens": 1}, "choices": []})
    assert not logic.is_usage_only({"usage": {"prompt_tokens": 1}, "choices": [{}]})
    assert logic.error_event("m").startswith("data: ") and logic.error_event("m").endswith("\n\n")

KEY={"user_id": "u", "project_id": "p", "key_id": "k"}
MODEL={"id": "m", "price_per_1m_input": 1, "price_per_1m_output": 2}

def test_record_with_info_when_given():
    # not given
    base=request_log.build_record(key=KEY, model=MODEL, payload={}, status_code=200, latency_ms=5)
    for col in ("time_to_first_token", "request_text", "response_text"):
        assert col not in base
    # given
    full=request_log.build_record(key=KEY, model=MODEL, payload={}, status_code=200, latency_ms=5,
                                    time_to_first_token_ms=7, request_text="q", response_text="a")
    assert full["time_to_first_token"]==7 and full["request_text"]=="q" and full["response_text"]=="a"

# Stream 

def test_open_stream_send_req_and_closes(monkeypatch):
    monkeypatch.setattr(config, "OPENAI_API_KEY", "o-key")

    def sim(request):
        assert str(request.url)=="https://api.openai.com/v1/chat/completions"
        assert request.headers["authorization"]=="Bearer o-key"
        return httpx.Response(200, content=b"data: x\n\ndata: [DONE]\n\n")
    
    real=httpx.Client
    monkeypatch.setattr(providers.httpx, "Client", lambda timeout: real(timeout=timeout,transport=httpx.MockTransport(sim)))
    s=providers.open_stream("openai", "chat", {"stream": True})
    assert s.status_code==200
    assert [l for l in s.iter_lines() if l]==["data: x", "data: [DONE]"]
    s.close()

# Provider that does not support streaming

def test_open_stream_unsupported_provider():
    with pytest.raises(Exception) as e:
        providers.open_stream("no", "chat", {})
    assert e.value.status_code==501



    