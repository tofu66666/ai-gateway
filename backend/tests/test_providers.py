import httpx
import pytest
from fastapi import HTTPException

from app import config, providers

@pytest.fixture
def sent(monkeypatch):
    # Replace httpx.post and record
    record={}
    def fake_post(url, json, headers, timeout):
        record.update(url=url, json=json, headers=headers, timeout=timeout)
        return httpx.Response(200, json={"ok": True})

    monkeypatch.setattr(providers.httpx, "post", fake_post)
    return record

BODY={"model":"m", "messages":[]}

def test_googel_chat_url_and_key(monkeypatch, sent):
    monkeypatch.setattr(config, "GEMINI_API_KEY","g-key")

    providers.call_prov("google","chat",BODY)

    assert sent["url"]=="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer g-key"}
    assert sent["json"]==BODY
    assert sent["timeout"]==60

def test_openai_chat_url_and_key(monkeypatch, sent):
    monkeypatch.setattr(config, "OPENAI_API_KEY","o-key")

    providers.call_prov("openai","chat",BODY)

    assert sent["url"]=="https://api.openai.com/v1/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer o-key"}
    # We don't test body and timeout no key for openai and antropic

def test_anthropic_chat_url_and_key(monkeypatch, sent):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY","a-key")

    providers.call_prov("anthropic","chat",BODY)

    assert sent["url"]=="https://api.anthropic.com/v1/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer a-key"}
    # We don't test body and timeout no key for openai and antropic

@pytest.mark.parametrize("base", ["http://localhost:11434", "http://localhost:11434/"])
def test_ollama_url_ignore_slash_and_send_no_key(monkeypatch,sent,base):
    monkeypatch.setattr(config, "OLLAMA_BASE_URL", base)

    providers.call_prov("ollama","chat",BODY)
    assert sent["url"]=="http://localhost:11434/v1/chat/completions"
    assert sent["headers"]=={}
    assert sent["timeout"]==180 # Slow for the first request until model loads

def test_missing_key_sends_no_auth_header(monkeypatch,sent):
    monkeypatch.setattr(config, "OPENAI_API_KEY","")

    providers.call_prov("openai","chat",BODY)

    assert sent["headers"]=={}
    
def test_unsupported_prov_501(sent):
    with pytest.raises(HTTPException) as error:
        providers.call_prov("no","chat", BODY)
    
    assert error.value.status_code==501
    assert sent=={} # Nothing sent

def test_unknown_endpoint(sent):
    with pytest.raises(KeyError):
        providers.call_prov("google","tele",BODY)

# Endpoint path

@pytest.mark.parametrize(
    "endpoint, path",
    [
        ("chat", "/chat/completions"),
    ]
)

def test_chat_gateway_endpoint_maps_to_prov_path(monkeypatch,sent,endpoint,path):
    monkeypatch.setattr(config, "OPENAI_API_KEY","o-key")

    providers.call_prov("openai", endpoint, BODY)

    assert sent["url"]=="https://api.openai.com/v1"+path

