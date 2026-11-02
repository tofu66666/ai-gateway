# Embeddings and completions through the gateway, and the model kind check (H18IALMOND-22)
# Supabase and the provider are fake, as in test_gateway.py

from unittest.mock import MagicMock

import httpx
import pytest

from app import guardrails, request_log
from app.routers import gateway
from tests.test_gateway import KEY, MODEL, client, fake_auth, fake_log

EMBEDDING={**MODEL, "kind": "embedding", "model": "text-embedding-x", 
                    "price_per_1m_input": 0.1, "price_per_1m_output": 0}
COMPLETION={**MODEL, "kind": "completion", "model": "completion-x"}
AUTH = {"Authorization": "Bearer vktest"}
EMB_REPLY={"object": "list", "data": [{"embedding": [0.1, 0.2], "index": 0}],
           "usage": {"prompt_tokens": 1000, "total_tokens": 1000}}
COMP_REPLY={"choices": [{"text": "done"}], "usage": {"prompt_tokens": 5, "completion_tokens": 2}}

def capture_prov(monkeypatch, reply):
    sent={}

    def fake_call(provider, endpoint, body):
        sent.update(provider=provider, endpoint=endpoint, body=body)
        return httpx.Response(200, json=reply)
    
    monkeypatch.setattr(gateway, "call_prov", fake_call)
    return sent

def post(path, body):
    return client.post(path, json=body, headers=AUTH)

def test_embeddings_goes_to_prov_with_real_name(monkeypatch):
    fake_auth(monkeypatch, model=EMBEDDING)
    logged=fake_log(monkeypatch)
    sent=capture_prov(monkeypatch, EMB_REPLY)

    r=post("/embeddings", {"model": "mq", "input": "hello"})

    assert r.status_code==200 and r.json()==EMB_REPLY
    assert sent["endpoint"]=="embeddings"
    assert sent["body"]=={"model": "text-embedding-x", "input": "hello"}
    assert logged[0]["status_code"]==200
    assert logged[0]["payload"]==EMB_REPLY

def test_embeddings_under_v1(monkeypatch):
    fake_auth(monkeypatch, model=EMBEDDING)
    fake_log(monkeypatch)
    capture_prov(monkeypatch, EMB_REPLY)
    assert post("/v1/embeddings", {"model": "mq", "input": "hello"}).status_code==200

def test_embeddings_cost_uses_input_tokens_only():
    record=request_log.build_record(
        key={"user_id": "u", "project_id": "p"},
        model=EMBEDDING,
        payload=EMB_REPLY,
        status_code=200,
        latency_ms=5,
    )
    
    assert record["input_tokens"]==1000
    assert record["output_tokens"]==0
    assert record["cost"]==pytest.approx(0.0001)

def test_embeddings_text_not_saved(monkeypatch):
    fake_auth(monkeypatch, model=EMBEDDING)
    logged=fake_log(monkeypatch)
    capture_prov(monkeypatch, EMB_REPLY)
    post("/embeddings", {"model": "mq", "input": "hello"})

    assert logged[0]["request_text"] is None
    assert logged[0]["response_text"] is None
    
def test_embeddings_no_master_prompt(monkeypatch):
    fake_auth(monkeypatch, model={**EMBEDDING, "prompt": "Be brief"})
    fake_log(monkeypatch)
    sent=capture_prov(monkeypatch, EMB_REPLY)
    post("/embeddings", {"model": "mq", "input": "hello"})

    assert "messages" not in sent["body"]

def test_chat_model_cannot_be_used_on_embeddings(monkeypatch):
    fake_auth(monkeypatch) # No kind->chat
    logged=fake_log(monkeypatch)
    provider=MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)

    r=post("/embeddings", {"model": "mq", "input": "hello"})

    assert r.status_code==400
    assert "chat model" in r.json()["detail"]
    provider.assert_not_called()
    assert logged==[]

@pytest.mark.parametrize("model, path, body",[
    (EMBEDDING, "/chat/completions", {"model": "mq", "messages": [{"role": "user", "content": "hi"}]}),
    (COMPLETION, "/chat/completions", {"model": "mq", "messages": [{"role": "user", "content": "hi"}]}),
    (EMBEDDING, "/completions", {"model": "mq", "prompt": "hi"}),
])
def test_wrong_kind_is_refused(monkeypatch, model, path, body):
    fake_auth(monkeypatch, model=model)
    logged=fake_log(monkeypatch)
    provider=MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)

    r=post(path, body)

    assert r.status_code==400
    assert "cannot be used on this endpoint" in r.json()["detail"]
    provider.assert_not_called()
    assert logged==[]

def test_completions_works_with_completion_model(monkeypatch):
    fake_auth(monkeypatch, model=COMPLETION)
    logged=fake_log(monkeypatch)
    sent=capture_prov(monkeypatch, COMP_REPLY)

    r=post("/completions", {"model": "mq", "prompt": "brief"})

    assert r.status_code==200
    assert sent["endpoint"]=="completions"
    assert sent["body"]["model"]=="completion-x"
    assert logged[0]["request_text"]=="brief"
    assert logged[0]["response_text"]=="done"

def test_stream_is_refused_on_embeddings(monkeypatch):
    fake_auth(monkeypatch, model=EMBEDDING)
    provider=MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)
    
    r=post("/embeddings", {"model": "mq", "input": "hello", "stream": True})
    assert r.status_code==400
    provider.assert_not_called()

def test_model_row_without_kind_still_works_as_chat(monkeypatch):
    fake_auth(monkeypatch)
    fake_log(monkeypatch)
    capture_prov(monkeypatch, {"choices": [{"message": {"content": "ok"}}]})
    
    r=post("/chat/completions", {"model": "mq", "messages": [{"role": "user", "content": "hi"}]})

    assert r.status_code==200

# Test guardrails on embeddings and completions

def test_embeddings_doesnot_get_max_tokens(monkeypatch):
    fake_auth(monkeypatch, model=EMBEDDING, rules={"blocked_patterns": [], "max_tokens_cap": 100})
    logged=fake_log(monkeypatch)
    sent=capture_prov(monkeypatch, EMB_REPLY)
    
    post("/embeddings", {"model": "mq", "input": "hello"})
    
    assert "max_tokens" not in sent["body"]

def test_completions_gets_max_tokens(monkeypatch):
    fake_auth(monkeypatch, model=COMPLETION, rules={"blocked_patterns": [], "max_tokens_cap": 100})
    logged=fake_log(monkeypatch)
    sent=capture_prov(monkeypatch, COMP_REPLY)

    r=post("/completions", {"model": "mq", "prompt": "brief"})

    assert sent["body"]["max_tokens"]==100

@pytest.mark.parametrize("model, path, body",[
    (EMBEDDING, "/embeddings", {"model": "mq", "input":"secret1"}),
    (COMPLETION, "/completions", {"model": "mq", "prompt": "secret2"}),
])
def test_blocked_phrase_is_refused_on_embeddings_and_completions(monkeypatch, model, path, body):
    fake_auth(monkeypatch, model=model, rules={"blocked_patterns": ["secret"], "max_tokens_cap": None})
    logged=fake_log(monkeypatch)
    provider=MagicMock()
    monkeypatch.setattr(gateway, "call_prov", provider)

    r=post(path, body)
    
    assert r.status_code==400
    provider.assert_not_called()
    assert logged[0]["status_code"]==400 # blocked attempt => zero cost

# In case that reply no usage

EMB_REPLY_NO_USAGE = {"object": "list", "data": [{"embedding": [0.1, 0.2], "index": 0}]}

def test_embeddings_without_usage_logs_an_estimate(monkeypatch):
    fake_auth(monkeypatch, model=EMBEDDING)
    logged=fake_log(monkeypatch)
    capture_prov(monkeypatch, EMB_REPLY_NO_USAGE)

    r=post("/embeddings", {"model": "mq", "input": "x" * 40})

    assert r.status_code==200
    assert r.json()==EMB_REPLY_NO_USAGE #The reply is untouched
    assert logged[0]["payload"]["usage"]=={"prompt_tokens": 10, "total_tokens": 10}
    

    
