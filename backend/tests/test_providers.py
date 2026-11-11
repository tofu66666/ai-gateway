import httpx
import pytest
from fastapi import HTTPException

from app import config, providers
from unittest.mock import MagicMock

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


@pytest.mark.parametrize("provider", ["google", "ollama"])
def test_alias_timeout_overrides_provider_default(sent, provider):
    providers.call_prov({"provider": provider}, "chat", BODY, timeout=12.5)
    assert sent["timeout"] == 12.5


def test_stream_uses_alias_timeout(monkeypatch):
    factory = MagicMock()
    monkeypatch.setattr(providers.httpx, "Client", factory)
    stream = providers.open_stream({"provider": "ollama"}, "chat", BODY, timeout=30)
    factory.assert_called_once_with(timeout=30)
    stream.close()
    factory.return_value.close.assert_called_once()

def test_googel_chat_url_and_key(monkeypatch, sent):
    monkeypatch.setattr(config, "GEMINI_API_KEY","g-key")

    providers.call_prov({"provider":"google"},"chat",BODY)

    assert sent["url"]=="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer g-key"}
    assert sent["json"]==BODY
    assert sent["timeout"]==60

def test_openai_chat_url_and_key(monkeypatch, sent):
    monkeypatch.setattr(config, "OPENAI_API_KEY","o-key")

    providers.call_prov({"provider":"openai"},"chat",BODY)

    assert sent["url"]=="https://api.openai.com/v1/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer o-key"}
    # We don't test body and timeout no key for openai and antropic

def test_anthropic_chat_url_and_key(monkeypatch, sent):
    monkeypatch.setattr(config, "ANTHROPIC_API_KEY","a-key")

    providers.call_prov({"provider":"anthropic"},"chat",BODY)

    assert sent["url"]=="https://api.anthropic.com/v1/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer a-key"}
    # We don't test body and timeout no key for openai and antropic

@pytest.mark.parametrize("base", ["http://localhost:11434", "http://localhost:11434/"])
def test_ollama_url_ignore_slash_and_send_no_key(monkeypatch,sent,base):
    monkeypatch.setattr(config, "OLLAMA_BASE_URL", base)

    providers.call_prov({"provider":"ollama"},"chat",BODY)
    assert sent["url"]=="http://localhost:11434/v1/chat/completions"
    assert sent["headers"]=={}
    assert sent["timeout"]==180 # Slow for the first request until model loads

def test_missing_key_sends_no_auth_header(monkeypatch,sent):
    monkeypatch.setattr(config, "OPENAI_API_KEY","")

    providers.call_prov({"provider":"openai"},"chat",BODY)

    assert sent["headers"]=={}
    
def test_unsupported_prov_501(sent):
    with pytest.raises(HTTPException) as error:
        providers.call_prov({"provider":"no"},"chat", BODY)
    
    assert error.value.status_code==501
    assert sent=={} # Nothing sent

def test_unknown_endpoint(sent):
    with pytest.raises(KeyError):
        providers.call_prov({"provider":"google"},"tele",BODY)

# Endpoint path

@pytest.mark.parametrize(
    "endpoint, path",
    [
        ("chat", "/chat/completions"),
    ]
)

def test_chat_gateway_endpoint_maps_to_prov_path(monkeypatch,sent,endpoint,path):
    monkeypatch.setattr(config, "OPENAI_API_KEY","o-key")

    providers.call_prov({"provider":"openai"}, endpoint, BODY)

    assert sent["url"]=="https://api.openai.com/v1"+path

# Deployments (H18IALMOND-37)

def test_deployment_uses_its_own_key(monkeypatch, sent):
    monkeypatch.setattr(config, "OPENAI_API_KEY","shared-key")
    monkeypatch.setenv("LLM_KEY_EAST","east-key")

    providers.call_prov({"provider":"openai", "api_key_env":"LLM_KEY_EAST"},"chat",BODY)

    assert sent["url"]=="https://api.openai.com/v1/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer east-key"}

def test_deployment_own_url_with_own_key(monkeypatch, sent):
    monkeypatch.setenv("LLM_KEY_EAST","east-key")

    providers.call_prov(
        {"provider":"openai", "base_url":"https://east.test/v1/", "api_key_env":"LLM_KEY_EAST"},
        "chat", BODY,
    )

    assert sent["url"]=="https://east.test/v1/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer east-key"}

def test_shared_key_never_sent_to_a_custom_url(monkeypatch, sent):
    monkeypatch.setattr(config, "OPENAI_API_KEY","shared-key")

    providers.call_prov({"provider":"openai", "base_url":"https://east.test/v1"},"chat",BODY)

    assert sent["headers"]=={}

def test_missing_deployment_key_does_not_fall_back_to_shared_key(monkeypatch, sent):
    monkeypatch.setattr(config, "OPENAI_API_KEY","shared-key")
    monkeypatch.delenv("LLM_KEY_EAST", raising=False)

    providers.call_prov({"provider":"openai", "api_key_env":"LLM_KEY_EAST"},"chat",BODY)

    assert sent["headers"]=={}

def test_null_deployment_fields_use_provider_defaults(monkeypatch, sent):
    # Rows from the database carry nulls, not missing keys
    monkeypatch.setattr(config, "OPENAI_API_KEY","o-key")

    providers.call_prov({"provider":"openai", "base_url":None, "api_key_env":None},"chat",BODY)

    assert sent["url"]=="https://api.openai.com/v1/chat/completions"
    assert sent["headers"]=={"Authorization": "Bearer o-key"}
